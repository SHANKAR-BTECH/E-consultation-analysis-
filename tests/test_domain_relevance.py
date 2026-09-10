"""Comprehensive tests for domain relevance validation, domain-aware analysis, and persistence."""
import unittest
import json
import io
from server import app
from domain_validation import evaluate_domain_relevance, DOMAIN_PROFILES
from tests.pdf_fixture import pdf_bytes


class TestDomainValidation(unittest.TestCase):
    """Unit tests for deterministic domain relevance evaluator."""

    def test_transport_relevance(self):
        feedback = [
            "Bus routes are frequently overcrowded during peak hours.",
            "The metro frequency should be increased on line 2.",
            "Public transport fares are relatively reasonable.",
            "Traffic congestion near the central bus stop is terrible."
        ]
        res = evaluate_domain_relevance(feedback, "Transport")
        self.assertFalse(res["is_clearly_unrelated"])
        self.assertEqual(res["status"], "relevant")
        self.assertEqual(res["selected_domain"], "Transport")

    def test_education_relevance(self):
        feedback = [
            "The school curriculum needs more practical laboratory work.",
            "Teachers are very supportive of student learning.",
            "College scholarship disbursement has been delayed this term.",
            "Classroom infrastructure and textbooks need upgrading."
        ]
        res = evaluate_domain_relevance(feedback, "Education")
        self.assertFalse(res["is_clearly_unrelated"])
        self.assertEqual(res["status"], "relevant")
        self.assertEqual(res["selected_domain"], "Education")

    def test_education_with_transport_data_clearly_unrelated(self):
        """Selected domain: Education, but feedback is exclusively about transit/buses/trains."""
        feedback = [
            "Bus routes are frequently overcrowded during peak hours.",
            "The metro frequency should be increased on line 2.",
            "Public transport fares are relatively reasonable.",
            "Traffic congestion near the central bus stop is terrible.",
            "Train schedules need urgent review due to delay at stations."
        ]
        res = evaluate_domain_relevance(feedback, "Education")
        self.assertTrue(res["is_clearly_unrelated"])
        self.assertEqual(res["status"], "unrelated")
        self.assertEqual(res["selected_domain"], "Education")
        self.assertEqual(res["suggested_domain"], "Transport")

    def test_transport_with_education_data_clearly_unrelated(self):
        """Selected domain: Transport, but feedback is exclusively about schools/teachers."""
        feedback = [
            "The school curriculum needs more practical laboratory work.",
            "Teachers are very supportive of student learning.",
            "College scholarship disbursement has been delayed this term.",
            "Classroom infrastructure and textbooks need upgrading.",
            "University exams were scheduled without sufficient notice."
        ]
        res = evaluate_domain_relevance(feedback, "Transport")
        self.assertTrue(res["is_clearly_unrelated"])
        self.assertEqual(res["status"], "unrelated")
        self.assertEqual(res["selected_domain"], "Transport")
        self.assertEqual(res["suggested_domain"], "Education")

    def test_ambiguous_feedback_not_aggressively_rejected(self):
        """Generic civic feedback without domain markers should NEVER be aggressively rejected."""
        ambiguous = [
            "The service has improved significantly over the past year.",
            "Staff at the front desk were courteous and helpful.",
            "Processing time was much faster than expected.",
            "Overall satisfactory experience with the team."
        ]
        res = evaluate_domain_relevance(ambiguous, "Education")
        self.assertFalse(res["is_clearly_unrelated"])
        self.assertEqual(res["status"], "ambiguous")

    def test_mixed_domain_dataset(self):
        """Mostly transport with some other comments."""
        mixed = [
            "Bus routes are frequently overcrowded during peak hours.",
            "The metro frequency should be increased on line 2.",
            "Public transport fares are relatively reasonable.",
            "Traffic congestion near the central bus stop is terrible.",
            "Train station parking is insufficient.",
            "Food ration supply at the shop was delayed."
        ]
        res = evaluate_domain_relevance(mixed, "Transport")
        self.assertFalse(res["is_clearly_unrelated"])
        self.assertIn(res["status"], ("relevant", "mixed"))


class TestDomainApiIntegration(unittest.TestCase):
    """Integration tests verifying domain reaches API, blocks unrelated data, and persists."""

    def setUp(self):
        self.client = app.test_client()

    def test_analyze_unrelated_domain_returns_400(self):
        """Submitting Transport feedback under Education domain returns 400 Bad Request."""
        payload = {
            "responses": [
                {"text": "Bus routes are overcrowded during peak morning hours."},
                {"text": "Train frequency on the metro rail line should be increased."},
                {"text": "Public transit fares have increased beyond acceptable levels."},
                {"text": "Traffic congestion near the bus stop causes major delays."},
                {"text": "Commuter parking at the railway station is completely full."}
            ],
            "domain": "Education"
        }
        res = self.client.post("/analyze", json=payload)
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertTrue(data.get("error"))
        self.assertIn("Education", data.get("message", ""))
        self.assertEqual(data.get("details", {}).get("suggested_domain"), "Transport")

    def test_analyze_matching_domain_succeeds_and_persists(self):
        """Submitting Transport feedback under Transport domain returns 200 and domain in envelope."""
        payload = {
            "responses": [
                {"text": "Bus routes are overcrowded during peak morning hours."},
                {"text": "Train frequency on the metro rail line should be increased."},
                {"text": "Public transit fares have increased beyond acceptable levels."},
                {"text": "Traffic congestion near the bus stop causes major delays."}
            ],
            "domain": "Transport"
        }
        res = self.client.post("/analyze", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("domain"), "Transport")
        self.assertIn("domain_relevance", data)
        self.assertEqual(data["domain_relevance"]["status"], "relevant")

        # Verify consultation was persisted with domain
        c_res = self.client.get("/consultations")
        self.assertEqual(c_res.status_code, 200)
        c_data = c_res.get_json()
        consultations = c_data.get("consultations", [])
        self.assertTrue(len(consultations) > 0)
        latest = consultations[0]
        self.assertEqual(latest.get("domain"), "Transport")

    def test_analyze_ambiguous_feedback_succeeds(self):
        """Generic responses without domain markers succeed under any chosen domain."""
        payload = {
            "responses": [
                {"text": "The overall service has improved noticeably this quarter."},
                {"text": "Staff members were attentive and resolved our issues promptly."},
                {"text": "Process transparency is appreciated by all participants."}
            ],
            "domain": "Healthcare"
        }
        res = self.client.post("/analyze", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("domain"), "Healthcare")
        self.assertEqual(data.get("domain_relevance", {}).get("status"), "ambiguous")

    def test_pdf_inspect_returns_domain_relevance(self):
        """PDF inspect endpoint returns domain_relevance."""
        pdf_bytes_data = pdf_bytes([
            "Bus route 42 frequency has decreased significantly.",
            "Public transit ticketing machines at the station are broken.",
            "Commuter traffic around the depot is very heavy.",
            "The metro train schedule needs revision."
        ])
        data = {
            "file": (io.BytesIO(pdf_bytes_data), "test_transport.pdf"),
            "mode": "inspect",
            "domain": "Education"
        }
        res = self.client.post("/analyze-file", data=data, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertIn("domain_relevance", body)
        self.assertTrue(body["domain_relevance"]["is_clearly_unrelated"])
        self.assertEqual(body["domain_relevance"]["suggested_domain"], "Transport")

    def test_pdf_analyze_unrelated_domain_returns_400(self):
        """PDF analyze endpoint rejects clearly unrelated feedback."""
        pdf_bytes_data = pdf_bytes([
            "Bus route 42 frequency has decreased significantly.",
            "Public transit ticketing machines at the station are broken.",
            "Commuter traffic around the depot is very heavy.",
            "The metro train schedule needs revision."
        ])
        data = {
            "file": (io.BytesIO(pdf_bytes_data), "test_transport.pdf"),
            "domain": "Education"
        }
        res = self.client.post("/analyze-file", data=data, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 400)
        body = res.get_json()
        self.assertIn("Education", body.get("message", ""))


if __name__ == "__main__":
    unittest.main()
