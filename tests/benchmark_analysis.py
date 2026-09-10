"""Bounded local checks, not a production throughput benchmark.

Run from project root: python -m tests.benchmark_analysis
"""
import csv
import io
import json
import time

from config import DATASET_PATH, MAX_BATCH_RESPONSES, MAX_BATCH_CHARACTERS
from server import app


def main():
    with DATASET_PATH.open(encoding="utf-8", newline="") as source:
        dataset = [{"text": row["feedback"]} for row in csv.DictReader(source)]
    client = app.test_client()
    client.get("/health")  # Load model before timing requests.
    base = "The portal keeps failing and nobody answers my complaint. Poor internet connectivity. "
    per_row = MAX_BATCH_CHARACTERS // MAX_BATCH_RESPONSES
    long_text = (base * (per_row // len(base) + 1))[:per_row]
    cases = [("original_generated_dataset", dataset),
             ("repeated_fixture_at_row_limit", [dataset[i % len(dataset)] for i in range(MAX_BATCH_RESPONSES)]),
             ("repeated_fixture_at_character_limit", [{"text": long_text}] * MAX_BATCH_RESPONSES)]
    for name, rows in cases:
        started = time.perf_counter()
        response = client.post("/analyze", json={"responses": rows})
        elapsed = time.perf_counter() - started
        assert response.status_code == 200, response.json
        result = response.json
        assert result["total_responses"] == len(rows)
        assert sum(result["sentiment"]["counts"].values()) == len(rows)
        assert all(item["mentions"] <= len(rows) for item in result["issues"])
        print(json.dumps({"case": name, "rows": len(rows), "input_characters": sum(len(row["text"]) for row in rows),
                          "elapsed_seconds": round(elapsed, 3), "response_bytes": len(response.data)}))
    from pdf_fixture import make_pdf
    pdf = make_pdf([[dataset[i % len(dataset)]["text"] for i in range(MAX_BATCH_RESPONSES)]])
    started = time.perf_counter()
    response = client.post("/analyze-file", data={"file": (io.BytesIO(pdf), "benchmark.pdf")}, content_type="multipart/form-data")
    assert response.status_code == 200, response.json
    assert response.json["total_responses"] == MAX_BATCH_RESPONSES
    print(json.dumps({"case": "pdf_at_row_limit", "rows": MAX_BATCH_RESPONSES,
                      "elapsed_seconds": round(time.perf_counter() - started, 3), "response_bytes": len(response.data)}))


if __name__ == "__main__":
    main()
