"""Deterministic source fixtures and independent count/evidence checks."""
from collections import Counter
import copy
import io
import json
import unittest
from unittest.mock import patch

from analysis_service import analyze_text, analyze_batch, AnalysisError, normalize_date
from config import MAX_BATCH_RESPONSES, MAX_BATCH_CHARACTERS, MAX_PDF_BYTES, MAX_ANALYSIS_REQUEST_BYTES
from pdf_ingestion import parse_pdf, inspect_pdf, map_pdf
from model_service import get_service, ModelUnavailable
from server import app
from text_insights import extract_terms, priority_score
from pdf_fixture import pdf_bytes, make_pdf

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
        return self.client.post("/analyze-file", data={"file": (io.BytesIO(content), "responses.pdf"), **fields}, content_type="multipart/form-data")

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

    def test_pdf_matches_json(self):
        content = pdf_bytes([NEGATIVE, POSITIVE])
        response = self.upload(content)
        self.assertEqual(response.status_code, 200)
        expected = analyze_batch(map_pdf([NEGATIVE, POSITIVE]))
        self.assertEqual(response.json, expected)

    def test_pdf_inspection_is_read_only(self):
        content = pdf_bytes([POSITIVE, NEGATIVE])
        response = self.upload(content, mode="inspect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["page_count"], 1)
        self.assertEqual(response.json["row_count"], 2)
        self.assertEqual(response.json["preview"], [POSITIVE, NEGATIVE])
        self.assertEqual(inspect_pdf(2, ["a"]), {"page_count": 2, "row_count": 1, "preview": ["a"]})
        response = self.upload(content)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["total_responses"], 2)

    def test_pdf_multipage_counts_and_preview_cap(self):
        content = make_pdf([["first page only."], ["second page.", "third line."]])
        response = self.upload(content, mode="inspect")
        self.assertEqual(response.json["page_count"], 2)
        self.assertEqual(response.json["row_count"], 3)
        self.assertEqual(len(response.json["preview"]), 3)
        content = pdf_bytes(["one.", "two.", "three.", "four.", "five.", "six."])
        response = self.upload(content, mode="inspect")
        self.assertEqual(response.json["row_count"], 6)
        self.assertEqual(response.json["preview"], ["one.", "two.", "three.", "four.", "five."])
        response = self.upload(content)
        self.assertEqual(response.json["total_responses"], 6)

    def test_pdf_invalid_and_without_text(self):
        for content in (b"", b"not a pdf document at all", pdf_bytes(["   "]), pdf_bytes([""])):
            with self.subTest(kind=content[:12]):
                self.assertEqual(self.upload(content).status_code, 400)

    def test_pdf_lines_are_trimmed_and_preserved(self):
        content = pdf_bytes(["  " + POSITIVE + "  ", "Rural (dept) feedback \\ with parens"])
        response = self.upload(content)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["responses"][0]["text"], POSITIVE)
        self.assertEqual(response.json["responses"][1]["text"], "Rural (dept) feedback \\ with parens")

    def test_pdf_requires_supported_extension_and_mode(self):
        content = pdf_bytes([POSITIVE])
        response = self.client.post("/analyze-file", data={"file": (io.BytesIO(content), "responses.txt"), "mode": "analyze"}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 400)
        self.assertIn(".pdf or .xlsx", response.json["message"])
        self.assertEqual(self.upload(content, mode="unknown").status_code, 400)
        self.assertEqual(self.upload(content, mode="inspect").status_code, 200)

    def test_pdf_limits(self):
        with self.assertRaises(AnalysisError):
            parse_pdf(io.BytesIO(b"x" * (MAX_PDF_BYTES + 1)))
        with self.assertRaises(AnalysisError):
            parse_pdf(io.BytesIO(pdf_bytes([f"line {i}" for i in range(MAX_BATCH_RESPONSES + 1)])))
        response = self.client.post("/analyze", data=b" " * (MAX_ANALYSIS_REQUEST_BYTES + 1), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post("/analyze-file", json={}).status_code, 400)
        self.assertEqual(self.client.post("/analyze-file", data={}, content_type="multipart/form-data").status_code, 400)

    def test_term_cap_is_reported(self):
        with patch("text_insights.MAX_DISCOVERED_TERMS", 1):
            result = analyze_batch(ROWS)
        self.assertTrue(result["analysis_notes"]["term_limit_reached"])
        self.assertEqual(result["total_responses"], len(ROWS))

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
