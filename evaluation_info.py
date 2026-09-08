"""Read display values from existing reports without retraining."""
import csv
import json
import logging

from config import METADATA_PATH, OUTPUT_DIR


def load_evaluation():
    """Missing reports display as unavailable, never invented values."""
    info = {}
    try:
        info.update(json.loads(METADATA_PATH.read_text(encoding="utf-8")))
        with (OUTPUT_DIR / "model_comparison.csv").open(encoding="utf-8", newline="") as source:
            row = next(r for r in csv.DictReader(source) if r["Model"] == info["model"])
        info["accuracy"] = float(row["Accuracy"])
        info["weighted_f1"] = float(row["F1-score"])
        if "dataset_size" not in info:
            statistics = dict(line.split(": ", 1) for line in
                              (OUTPUT_DIR / "dataset_statistics.txt").read_text(encoding="utf-8").splitlines()
                              if ": " in line)
            info["dataset_size"] = int(statistics["Total Samples"])
        info["train_size"] = int(info["dataset_size"]) - int(info["test_size"])
    except (OSError, ValueError, KeyError, TypeError, StopIteration):
        logging.getLogger(__name__).warning("Some evaluation reports are unavailable")
    return info
