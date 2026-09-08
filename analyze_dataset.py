"""Validate and report statistics for the improved prototype dataset."""
import os
from pathlib import Path

# Keep Matplotlib's cache in the project, where it is writable in restricted environments.
os.environ.setdefault("MPLCONFIGDIR", str((Path("outputs") / ".matplotlib").resolve()))

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt


DATASET_PATH = Path("sentiment_dataset_improved.csv")
OUTPUT_DIR = Path("outputs")
VALID_LABELS = {"positive", "negative", "neutral"}


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    data = pd.read_csv(DATASET_PATH)
    required = {"feedback", "sentiment"}
    if set(data.columns) != required:
        raise ValueError(f"Expected columns {sorted(required)}, found {list(data.columns)}")
    invalid = sorted(set(data["sentiment"].dropna().str.lower()) - VALID_LABELS)
    if invalid:
        raise ValueError(f"Invalid sentiment labels: {invalid}")

    lengths = data["feedback"].fillna("").astype(str).str.len()
    counts = data["sentiment"].value_counts().reindex(["positive", "negative", "neutral"], fill_value=0)
    report = "\n".join([
        "DATASET QUALITY REPORT", "-" * 40,
        f"Total Samples: {len(data)}",
        f"Positive Samples: {counts['positive']}",
        f"Negative Samples: {counts['negative']}",
        f"Neutral Samples: {counts['neutral']}",
        f"Missing Values: {int(data.isna().sum().sum())}",
        f"Duplicate Rows: {int(data.duplicated().sum())}",
        f"Duplicate Feedback: {int(data['feedback'].duplicated().sum())}",
        "Valid Labels: Yes",
        f"Average Feedback Length: {lengths.mean():.2f}",
        f"Minimum Feedback Length: {lengths.min()}",
        f"Maximum Feedback Length: {lengths.max()}",
    ])
    print(report)
    (OUTPUT_DIR / "dataset_statistics.txt").write_text(report + "\n", encoding="utf-8")

    ax = counts.plot(kind="bar", color=["#2e8b57", "#c0392b", "#4a90e2"], rot=0)
    ax.set_title("Class Distribution in Prototype Dataset")
    ax.set_xlabel("Sentiment")
    ax.set_ylabel("Number of Samples")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "class_distribution.png", dpi=150)
    plt.close()


if __name__ == "__main__":
    main()
