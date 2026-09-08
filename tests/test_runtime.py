"""Real local HTTP startup and isolated training checks; processes are cleaned up."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from config import PROJECT_DIR, MODEL_DIR, DATASET_PATH


def free_port():
    with socket.socket() as connection:
        connection.bind(("127.0.0.1", 0))
        return connection.getsockname()[1]


class RuntimeTests(unittest.TestCase):
    def test_real_servers(self):
        for kind in ("flask", "streamlit"):
            with self.subTest(server=kind), tempfile.TemporaryDirectory() as directory:
                port = free_port()
                if kind == "flask":
                    command = [sys.executable, "-c",
                               "from server import app; from werkzeug.serving import make_server; import threading; "
                               f"http=make_server('127.0.0.1',{port},app); "
                               "worker=threading.Thread(target=http.serve_forever); worker.start(); "
                               "input(); http.shutdown(); worker.join(); http.server_close()"]
                    health_path = "/health"
                else:
                    command = [sys.executable, "-m", "streamlit", "run", str(PROJECT_DIR / "app.py"),
                               "--server.headless=true", "--server.address=127.0.0.1", f"--server.port={port}",
                               "--browser.gatherUsageStats=false"]
                    health_path = "/_stcore/health"
                env = dict(os.environ, PYTHONPATH=str(PROJECT_DIR))
                with tempfile.TemporaryFile(mode="w+b") as log:
                    process = subprocess.Popen(command, cwd=directory, env=env, stdin=subprocess.PIPE, stdout=log, stderr=log,
                                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    try:
                        base = f"http://127.0.0.1:{port}"
                        deadline = time.monotonic() + 25
                        while time.monotonic() < deadline:
                            if process.poll() is not None:
                                log.seek(0)
                                self.fail(log.read().decode(errors="replace"))
                            try:
                                with urlopen(base + health_path, timeout=1) as response:
                                    self.assertEqual(response.status, 200)
                                break
                            except (URLError, TimeoutError):
                                time.sleep(.15)
                        else:
                            self.fail(f"{kind} did not become ready")
                        with urlopen(base + "/", timeout=5) as response:
                            self.assertEqual(response.status, 200)
                        if kind == "flask":
                            request = Request(base + "/predict", data=json.dumps({"feedback": "The process was quick and very helpful."}).encode(),
                                              headers={"Content-Type": "application/json"})
                            with urlopen(request, timeout=5) as response:
                                self.assertEqual(json.load(response)["sentiment"], "Positive")
                            request = Request(base + "/predict", data=b'[]', headers={"Content-Type": "application/json"})
                            with self.assertRaises(HTTPError) as caught:
                                urlopen(request, timeout=5)
                            self.assertEqual(caught.exception.code, 400)
                            self.assertIs(json.load(caught.exception)["error"], True)
                            caught.exception.close()
                            request = Request(base + "/analyze", data=json.dumps({"responses": [{"text": "The process was quick and very helpful."}]}).encode(),
                                              headers={"Content-Type": "application/json"})
                            with urlopen(request, timeout=5) as response:
                                analysis = json.load(response)
                                self.assertEqual(analysis["total_responses"], 1)
                                self.assertEqual(analysis["sentiment"]["counts"]["positive"], 1)
                            boundary = "phase2-test-boundary"
                            body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.csv\"\r\n"
                                    "Content-Type: text/csv\r\n\r\ntext\nThe process was quick and very helpful.\n"
                                    f"\r\n--{boundary}--\r\n").encode()
                            request = Request(base + "/analyze-file", data=body,
                                              headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
                            with urlopen(request, timeout=5) as response:
                                self.assertEqual(json.load(response), analysis)
                    finally:
                        if kind == "flask" and process.poll() is None:
                            # Gracefully release the socket and cwd before the
                            # venv launcher's child exits (Windows file locking).
                            try:
                                process.communicate(input=b"\n", timeout=5)
                            except subprocess.TimeoutExpired:
                                process.terminate()
                        elif os.name == "nt" and process.poll() is None:
                            # The Windows venv launcher can own a Python child.
                            # Terminate only this test-owned process tree.
                            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                           capture_output=True, timeout=5)
                        else:
                            process.terminate()
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait(timeout=5)
                        if process.stdin and not process.stdin.closed:
                            process.stdin.close()

    def test_training_in_temporary_directory(self):
        import joblib
        import train_model
        protected = [DATASET_PATH, PROJECT_DIR / "Sentiment_dataset.csv", *MODEL_DIR.glob("*.pkl")]
        before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
        with tempfile.TemporaryDirectory() as directory:
            model_dir, output_dir = Path(directory) / "models", Path(directory) / "outputs"
            with patch.object(train_model, "MODEL_DIR", model_dir), patch.object(train_model, "OUTPUT_DIR", output_dir), contextlib.redirect_stdout(io.StringIO()):
                train_model.main()
            metadata = json.loads((model_dir / "model_metadata.json").read_text())
            self.assertEqual(metadata["model"], "Multinomial Naive Bayes")
            self.assertEqual(type(joblib.load(model_dir / "final_sentiment_model.pkl")).__name__, "MultinomialNB")
            # Exact agreement with preserved evaluation, without replacing it.
            self.assertEqual((output_dir / "model_comparison.csv").read_bytes(),
                             (PROJECT_DIR / "outputs/model_comparison.csv").read_bytes())
            self.assertEqual(metadata["train_size"] + metadata["test_size"], metadata["dataset_size"])
        self.assertEqual(before, {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in protected})


if __name__ == "__main__":
    unittest.main()
