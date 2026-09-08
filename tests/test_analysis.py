"""Deterministic source fixtures and independent count/evidence checks."""
from collections import Counter
import copy
import io
import json
import unittest
from unittest.mock import patch

from analysis_service import analyze_text, analyze_batch, AnalysisError, normalize_date
from config import MAX_BATCH_RESPONSES, MAX_BATCH_CHARACTERS, MAX_CSV_BYTES, MAX_ANALYSIS_REQUEST_BYTES
from csv_ingestion import parse_csv
from model_service import get_service, ModelUnavailable
from server import app
from text_insights import extract_terms, priority_score

NEGATIVE = "The portal keeps failing and nobody answers my complaint. Poor internet connectivity."
POSITIVE = "The process was quick and very helpful."
NEUTRAL = "Applications will open on Monday according to the official notice."
ROWS = [
    {"id": "a", "text": "  " + NEGATIVE + " Poor internet connectivity.  ", "date": "2026-01-02", "category": "Rural"},
    {"id": "b", "text": NEGATIVE, "date": "03/01/2026", "category": "Rural", "metadata": {"region": "south"}},
    {"text": POSITIVE, "category": "Urban"}, {"text": NEUTRAL},
]


class AnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analysis = analyze_batch(ROWS)

    def setUp(self):
        self.client = app.test_client()

    def upload(self, content, **fields):
        return self.client.post("/analyze-file", data={"file": (io.BytesIO(content), "responses.csv"), **fields}, content_type="multipart/form-data")

    def test_single_analysis(self):
        result = analyze_text(POSITIVE)
        self.assertEqual(result["total_responses"], 1)
        self.assertEqual(result["responses"][0]["sentiment"], "positive")
        self.assertEqual(result["issues"], [])
        self.assertTrue(result["topics"])

    def test_aggregate_counts_and_model_parity(self):
        result = self.analysis
        expected = Counter(get_service().predict(row["text"])["sentiment"].lower() for row in ROWS)
        self.assertEqual(result["sentiment"]["counts"], dict(expected))
        self.assertEqual(expected, {"negative": 2, "positive": 1, "neutral": 1})
        self.assertEqual(sum(result["sentiment"]["counts"].values()), result["total_responses"])
        self.assertEqual(result["sentiment"]["percentages"], {"negative": 50, "positive": 25, "neutral": 25})
        for row in result["responses"]:
            expected_prediction = get_service().predict(row["text"])
            self.assertEqual(row["confidence"], expected_prediction["confidence"])

    def test_source_preservation_and_duplicate_ids(self):
        original = copy.deepcopy(ROWS)
        result = analyze_batch(ROWS)
        self.assertEqual(ROWS, original)
        self.assertEqual(result["responses"][0]["text"], ROWS[0]["text"])
        self.assertEqual(result["responses"][1]["metadata"], {"region": "south"})
        result = analyze_batch([{**ROWS[0], "id": "same"}, {**ROWS[0], "id": "same"}])
        self.assertEqual(result["total_responses"], 2)
        self.assertEqual([row["row_index"] for row in result["responses"]], [1, 2])

    def test_phrase_boundaries_and_no_stopword_bridging(self):
        terms = extract_terms("poor internet connectivity; rural and urban. NOT helpful")
        self.assertIn("poor internet connectivity", terms)
        self.assertNotIn("connectivity rural", terms)
        self.assertNotIn("rural urban", terms)
        self.assertNotIn("and", terms)
        self.assertIn("not helpful", terms)
        self.assertNotIn("caf", extract_terms("café"))

    def test_keywords_are_actual_document_counts(self):
        keywords = {item["keyword"]: item["count"] for item in self.analysis["keywords"]}
        self.assertEqual(keywords["poor internet connectivity"], 2)
        for term, count in keywords.items():
            self.assertEqual(count, sum(term in extract_terms(row["text"]) for row in ROWS))

    def test_topic_evidence_and_counts(self):
        for topic in self.analysis["topics"]:
            indices = [i for i, row in enumerate(ROWS, 1) if topic["topic"] in extract_terms(row["text"])]
            self.assertEqual(topic["response_indices"], indices)
            self.assertEqual(topic["count"], len(indices))
            self.assertEqual(sum(topic["sentiment"].values()), len(indices))

    def test_recurring_issue_and_priority(self):
        issue = next(item for item in self.analysis["issues"] if item["issue"] == "poor internet connectivity")
        self.assertEqual(issue["mentions"], 2)  # phrase repeats inside row 1, counted once
        self.assertEqual(issue["negative_mentions"], 2)
        self.assertEqual(issue["negative_ratio"], 1)
        self.assertEqual(issue["priority"]["score"], 80)
        self.assertEqual(issue["priority"]["level"], "HIGH")
        self.assertEqual(issue["priority"]["signals"]["coverage"], .5)
        for item in self.analysis["issues"]:
            self.assertEqual(len(set(item["response_indices"])), item["mentions"])

    def test_priority_formula_independently(self):
        self.assertEqual(priority_score(2, 1, 10)["score"], 38)
        self.assertEqual(priority_score(2, 1, 10)["level"], "LOW")
        self.assertEqual(priority_score(2, 2, 10)["level"], "MEDIUM")
        self.assertEqual(priority_score(2, 2, 2)["score"], 100)

    def test_positive_recurrence_is_not_an_issue(self):
        result = analyze_batch([{"text": POSITIVE}, {"text": POSITIVE}])
        self.assertTrue(result["topics"])
        self.assertEqual(result["issues"], [])

    def test_representatives_are_original_quotes(self):
        for issue in self.analysis["issues"]:
            for representative in issue["representative_feedback"]:
                row = ROWS[representative["row_index"] - 1]
                self.assertEqual(representative["text"], row["text"])
                self.assertIn(issue["issue"], extract_terms(row["text"]))

    def test_summary_is_deterministic_and_tied_to_counts(self):
        self.assertEqual(self.analysis, analyze_batch(ROWS))
        self.assertIn("4 valid responses", self.analysis["summary"])
        self.assertIn("negative (2 responses, 50.00%)", self.analysis["summary"])
        tied = analyze_batch([{"text": POSITIVE}, {"text": NEUTRAL}])
        self.assertIn("tied", tied["summary"])

    def test_dates_and_trends(self):
        trends = self.analysis["trends"]
        self.assertTrue(trends["available"])
        self.assertEqual(trends["dated_responses"], 2)
        self.assertEqual(trends["undated_responses"], 2)
        self.assertEqual([p["date"] for p in trends["points"]], ["2026-01-02", "2026-01-03"])
        self.assertEqual(trends["points"][0]["issue_mentions"]["poor internet connectivity"], 1)
        for point in trends["points"]:
            self.assertEqual(sum(point["sentiment"]["counts"].values()), point["total_responses"])

    def test_invalid_dates_are_not_lost_responses(self):
        result = analyze_batch([{"text": POSITIVE, "date": "2026-02-30"}])
        self.assertEqual(result["total_responses"], 1)
        self.assertFalse(result["trends"]["available"])
        self.assertEqual(result["responses"][0]["date_input"], "2026-02-30")
        self.assertEqual(len(result["warnings"]), 1)
        self.assertEqual(normalize_date("2026-01-02T23:00:00-05:00"), "2026-01-02")
        self.assertEqual(normalize_date("03/04/2026"), "2026-04-03")
        self.assertEqual(normalize_date("2 Jan 2026"), "2026-01-02")

    def test_category_analysis(self):
        categories = self.analysis["categories"]
        self.assertTrue(categories["available"])
        self.assertEqual(categories["categorized_responses"], 3)
        self.assertEqual(categories["uncategorized_responses"], 1)
        rural = next(group for group in categories["groups"] if group["category"] == "Rural")
        self.assertEqual(rural["total_responses"], 2)
        self.assertEqual(rural["sentiment"]["counts"]["negative"], 2)
        issue = next(item for item in rural["issues"] if item["issue"] == "poor internet connectivity")
        self.assertEqual(issue["priority"]["score"], 100)

    def test_missing_dates_and_categories(self):
        result = analyze_text(POSITIVE)
        self.assertFalse(result["trends"]["available"])
        self.assertEqual(result["trends"]["points"], [])
        self.assertFalse(result["categories"]["available"])
        self.assertEqual(result["categories"]["groups"], [])

    def test_rejected_rows_and_denominator(self):
        result = analyze_batch([{"text": "!!!"}, {}, {"text": POSITIVE}, {"text": "अच्छा"}, {"text": "zzzxxyyqqq"}])
        self.assertEqual(result["total_received"], 5)
        self.assertEqual(result["total_responses"], 1)
        self.assertEqual(result["rejected_count"], 4)
        self.assertEqual(result["sentiment"]["percentages"]["positive"], 100)
        self.assertEqual(result["responses"][0]["row_index"], 3)
        self.assertEqual([row["row_index"] for row in result["rejected"]], [1, 2, 4, 5])

    def test_batch_limits_and_empty(self):
        for rows in ([], None, {}, ["text"], [{"text": "!!!"}], [{"text": POSITIVE}] * (MAX_BATCH_RESPONSES + 1),
                     [{"text": "x" * (MAX_BATCH_CHARACTERS + 1)}]):
            with self.subTest(kind=type(rows).__name__), self.assertRaises(AnalysisError):
                analyze_batch(rows)

    def test_invalid_metadata(self):
        for extra in ({"metadata": []}, {"metadata": {"nested": {}}}, {"metadata": {"bad": float("nan")}},
                      {"date": 42}, {"category": []}, {"id": True}):
            with self.subTest(extra=extra), self.assertRaises(AnalysisError):
                analyze_batch([{"text": POSITIVE, **extra}])

    def test_api_json_contract(self):
        response = self.client.post("/analyze", json={"responses": ROWS})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, self.analysis)
        for raw in ("{", "[]", "{}", "null", '{"responses":[]}'):
            response = self.client.post("/analyze", data=raw, content_type="application/json")
            self.assertEqual(response.status_code, 400)
            self.assertIs(response.json["error"], True)
        self.assertEqual(self.client.post("/analyze").status_code, 400)
        response = self.client.post("/analyze", json={"responses": [{"text": "!!!"}]})
        self.assertEqual(response.json["details"]["total_received"], 1)

    def test_api_unavailable_and_failure(self):
        with patch("analysis_service.get_service", side_effect=ModelUnavailable("Model unavailable.")):
            self.assertEqual(self.client.post("/analyze", json={"responses": ROWS}).status_code, 503)
        with patch("server.analyze_batch", side_effect=RuntimeError("private")), self.assertLogs(app.logger, level="ERROR"):
            response = self.client.post("/analyze", json={"responses": ROWS})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private", response.json["message"])

    def test_csv_matches_json(self):
        content = f'text,date,category\n"{NEGATIVE}",2026-01-02,Rural\n"{POSITIVE}",,Urban\n'.encode()
        response = self.upload(content)
        self.assertEqual(response.status_code, 200)
        expected = analyze_batch([{"text": NEGATIVE, "date": "2026-01-02", "category": "Rural"}, {"text": POSITIVE, "category": "Urban"}])
        self.assertEqual(response.json, expected)

    def test_csv_inspection_and_selection(self):
        content = f'citizen_opinion,submitted,dept,region\n{POSITIVE},2026-01-02,Water,South\n'.encode()
        response = self.upload(content, mode="inspect")
        self.assertTrue(response.json["requires_selection"])
        self.assertEqual(response.json["row_count"], 1)
        response = self.upload(content)
        self.assertEqual(response.status_code, 400)
        self.assertIn("columns", response.json["details"])
        response = self.upload(content, text_column="citizen_opinion", date_column="submitted", category_column="dept", metadata_columns='["region"]')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["responses"][0]["metadata"], {"region": "South"})
        self.assertEqual(response.json["responses"][0]["date"], "2026-01-02")
        self.assertEqual(self.upload(content, text_column="missing").status_code, 400)

    def test_csv_ambiguous_columns(self):
        response = self.upload(f'text,feedback\n{POSITIVE},{NEGATIVE}\n'.encode())
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.json["details"]["requires_selection"])

    def test_csv_empty_and_malformed(self):
        for content in (b"", b"text\n", b'text\n"unterminated', b"text,date\nwrong\n", b"text,Text\na,b\n", b"text\n\xff", b"text\n\x00"):
            with self.subTest(content=content):
                self.assertEqual(self.upload(content).status_code, 400)

    def test_csv_optional_mapping_and_invalid_selections(self):
        content = f'text,date,category\n{POSITIVE},2026-01-02,Water\n'.encode()
        response = self.upload(content, date_column="", category_column="")
        self.assertFalse(response.json["trends"]["available"])
        self.assertFalse(response.json["categories"]["available"])
        for fields in ({"text_column": "date", "date_column": "date"}, {"metadata_columns": "{}"},
                       {"metadata_columns": '["missing"]'}, {"mode": "unknown"}):
            with self.subTest(fields=fields):
                self.assertEqual(self.upload(content, **fields).status_code, 400)

    def test_term_cap_is_reported(self):
        with patch("text_insights.MAX_DISCOVERED_TERMS", 1):
            result = analyze_batch(ROWS)
        self.assertTrue(result["analysis_notes"]["term_limit_reached"])
        self.assertEqual(result["total_responses"], len(ROWS))

    def test_csv_empty_row_is_reported(self):
        response = self.upload(f'text\n\n{POSITIVE}\n'.encode())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["rejected_count"], 1)
        self.assertEqual(response.json["responses"][0]["row_index"], 2)

    def test_csv_multiline_quotes_and_original_text(self):
        text = "  " + POSITIVE + "\nPublic feedback.  "
        response = self.upload(('\ufefftext\n"' + text + '"\n').encode())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["responses"][0]["text"], text)

    def test_csv_and_http_limits(self):
        with self.assertRaises(AnalysisError):
            parse_csv(io.BytesIO(b"x" * (MAX_CSV_BYTES + 1)))
        response = self.client.post("/analyze", data=b" " * (MAX_ANALYSIS_REQUEST_BYTES + 1), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post("/analyze-file", json={}).status_code, 400)
        self.assertEqual(self.client.post("/analyze-file", data={}, content_type="multipart/form-data").status_code, 400)

    def test_batch_inference_chunk_parity(self):
        texts = [POSITIVE, "!!!", NEGATIVE, NEUTRAL] * 35
        result = get_service().predict_batch(texts)
        self.assertEqual(len(result), len(texts))
        for text, prediction in zip(texts, result):
            if text == "!!!":
                self.assertIn("message", prediction)
            else:
                self.assertEqual(prediction, get_service().predict(text))


if __name__ == "__main__":
    unittest.main()
