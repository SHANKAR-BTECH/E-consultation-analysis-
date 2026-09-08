"""Run with python -m unittest discover -s tests -v. Uses real saved artifacts."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from config import PROJECT_DIR, MAX_INPUT_CHARACTERS, MAX_REQUEST_BYTES
from evaluation_info import load_evaluation
from model_service import get_service, InferenceService, InvalidFeedback, ModelUnavailable
from server import app

EXAMPLES = {
    "positive": "The process was quick and very helpful.",
    "negative": "The portal keeps failing and nobody answers my complaint.",
    "neutral": "Applications will open on Monday according to the official notice.",
}


class FoundationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def assert_invalid(self, response):
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json), {"error", "message"})
        self.assertIs(response.json["error"], True)
        self.assertIsInstance(response.json["message"], str)
        self.assertTrue(response.json["message"])

    def test_saved_model_and_cache(self):
        service = get_service()
        self.assertEqual(type(service.model).__name__, "MultinomialNB")
        self.assertEqual(service.classes, tuple(str(c) for c in service.model.classes_))
        self.assertIs(service, get_service())

    def test_valid_predictions_and_shared_service(self):
        for label, text in EXAMPLES.items():
            if label not in get_service().classes:
                continue
            with self.subTest(label=label):
                response = self.client.post("/predict", json={"feedback": "  " + text + "  "})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json, get_service().predict(text))
                self.assertEqual(response.json["sentiment"], label.title())
                self.assertEqual(response.json["input_length"], len(text))
                self.assertEqual(response.json["word_count"], len(text.split()))
                self.assertGreaterEqual(response.json["confidence"], 0)
                self.assertLessEqual(response.json["confidence"], 1)

    def test_missing_or_malformed_json(self):
        self.assert_invalid(self.client.post("/predict"))
        for raw in ["{", "null", "true", "123", '"feedback"', "[]", '["text"]', '{"feedback":']:
            with self.subTest(raw=raw):
                self.assert_invalid(self.client.post("/predict", data=raw, content_type="application/json"))
        self.assert_invalid(self.client.post("/predict", data='{"feedback":"helpful"}', content_type="text/plain"))

    def test_missing_feedback(self):
        self.assert_invalid(self.client.post("/predict", json={}))

    def test_invalid_values(self):
        for value in [None, 123, True, [], {}, "", "   \t\n", "!!!", "12345", "a", "🙂", "यह सेवा अच्छी है", "service अच्छा", "zzzxxyyqqq"]:
            with self.subTest(value=value):
                self.assert_invalid(self.client.post("/predict", json={"feedback": value}))
                with self.assertRaises(InvalidFeedback):
                    get_service().predict(value)

    def test_length_boundaries(self):
        text = "helpful " * (MAX_INPUT_CHARACTERS // 8)
        self.assertEqual(len(text), MAX_INPUT_CHARACTERS)
        self.assertEqual(self.client.post("/predict", json={"feedback": text}).status_code, 200)
        self.assert_invalid(self.client.post("/predict", json={"feedback": text + "x"}))
        self.assert_invalid(self.client.post("/predict", json={"feedback": "poor service " * 10000}))

    def test_request_body_limit(self):
        self.assert_invalid(self.client.post("/predict", data=" " * (MAX_REQUEST_BYTES + 1), content_type="application/json"))

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["status"], "ok")
        self.assertTrue(response.json["model_loaded"])
        self.assertEqual(response.json["classes"], list(get_service().classes))

    def test_home_and_metrics(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"E-CONSULTATION FEEDBACK SENTIMENT ANALYSIS USING NLP", response.data)
        metadata = load_evaluation()
        self.assertIn(f"{metadata['accuracy'] * 100:.2f}%".encode(), response.data)
        with patch("server.load_evaluation", return_value={"accuracy": .42, "dataset_size": 7}):
            page = self.client.get("/").get_data(as_text=True)
            self.assertIn("42.00%", page)
            self.assertIn("7 samples", page)
        with patch("server.load_evaluation", return_value={}):
            self.assertIn("Prototype Test Accuracy: Unavailable", self.client.get("/").get_data(as_text=True))

    def test_missing_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertLogs("model_service", level="ERROR"):
                with self.assertRaises(ModelUnavailable):
                    InferenceService(Path(directory) / "missing.pkl")

    def test_unavailable_service(self):
        with patch("server.get_service", side_effect=ModelUnavailable("Model unavailable.")):
            self.assertEqual(self.client.get("/health").status_code, 503)
            self.assertEqual(self.client.get("/").status_code, 200)
            response = self.client.post("/predict", json={"feedback": "helpful service"})
            self.assertEqual(response.status_code, 503)
            self.assertIs(response.json["error"], True)
            self.assert_invalid(self.client.post("/predict", json={"feedback": None}))

    def test_internal_error_is_not_exposed(self):
        with patch("server.get_service", side_effect=RuntimeError("private internal path")):
            with self.assertLogs(app.logger, level="ERROR"):
                response = self.client.post("/predict", json={"feedback": "helpful service"})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("private", response.json["message"])

    def test_paths_from_another_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            env = dict(os.environ, PYTHONPATH=str(PROJECT_DIR))
            result = subprocess.run([sys.executable, "-c",
                "from server import app; c=app.test_client(); assert c.get('/').status_code==200; "
                "assert c.get('/health').json['model_loaded']; "
                "assert c.post('/predict',json={'feedback':'helpful service'}).status_code==200"],
                cwd=directory, env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([sys.executable, str(PROJECT_DIR / "predict.py")], input="exit\n",
                                    cwd=directory, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_cli_prediction_validation_and_export(self):
        import predict
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "predictions.csv"
            output = io.StringIO()
            with patch("predict.OUTPUT_PATH", target), patch("builtins.input", side_effect=["!!!", EXAMPLES["positive"], "exit"]), contextlib.redirect_stdout(output):
                self.assertEqual(predict.main(), 0)
            self.assertIn("usable English words", output.getvalue())
            self.assertIn("Predicted sentiment: Positive", output.getvalue())
            self.assertIn(EXAMPLES["positive"], target.read_text())

    def test_streamlit_state_and_prediction(self):
        from streamlit.testing.v1 import AppTest
        ui = AppTest.from_file(str(PROJECT_DIR / "app.py"), default_timeout=20).run()
        self.assertEqual(len(ui.exception), 0)
        ui.text_area[0].set_value(EXAMPLES["positive"]).run()
        ui.button(key="btn_analyze").click().run()
        self.assertEqual(ui.session_state["result"], get_service().predict(EXAMPLES["positive"]))
        ui.button(key="btn_clear").click().run()
        self.assertEqual(ui.text_area[0].value, "")
        self.assertIsNone(ui.session_state["result"])
        ui.button(key="use_ex_0").click().run()
        self.assertIn("public service staff", ui.text_area[0].value)
        ui.text_area[0].set_value("!!!").run()
        ui.button(key="btn_analyze").click().run()
        self.assertIsNone(ui.session_state["result"])
        self.assertGreater(len(ui.warning), 0)
        self.assertEqual(len(ui.exception), 0)


if __name__ == "__main__":
    unittest.main()
