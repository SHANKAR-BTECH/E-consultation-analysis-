"""Evaluate existing models on the hand-crafted realistic test set.

This provides an honest baseline: how do the current models perform on
text that was NOT generated from the same template pool they trained on?
"""
import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import (accuracy_score, classification_report,
                             confusion_matrix, precision_recall_fscore_support)

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))
from text_utils import preprocess_text

LABEL_ORDER = ["negative", "neutral", "positive"]
EVAL_DIR = PROJECT_DIR / "evaluation"
REALISTIC_CSV = EVAL_DIR / "realistic_test_set.csv"


def evaluate_on_realistic(model, vectorizer, df, label):
    """Run model on realistic test set and return metrics dict."""
    texts = df["feedback"].map(preprocess_text)
    y_true = df["sentiment"]

    X = vectorizer.transform(texts)
    y_pred = model.predict(X)

    acc = accuracy_score(y_true, y_pred)
    p_macro, r_macro, f1_macro, _ = precision_recall_fscore_support(
        y_true, y_pred, average="macro", labels=LABEL_ORDER, zero_division=0
    )
    p_weighted, r_weighted, f1_weighted, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", labels=LABEL_ORDER, zero_division=0
    )
    p_per, r_per, f1_per, sup = precision_recall_fscore_support(
        y_true, y_pred, labels=LABEL_ORDER, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=LABEL_ORDER)
    report = classification_report(y_true, y_pred, labels=LABEL_ORDER, zero_division=0)

    per_class = {}
    for i, lbl in enumerate(LABEL_ORDER):
        per_class[lbl] = {
            "precision": round(float(p_per[i]), 4),
            "recall": round(float(r_per[i]), 4),
            "f1": round(float(f1_per[i]), 4),
            "support": int(sup[i]),
        }

    result = {
        "model_label": label,
        "accuracy": round(float(acc), 4),
        "macro_precision": round(float(p_macro), 4),
        "macro_recall": round(float(r_macro), 4),
        "macro_f1": round(float(f1_macro), 4),
        "weighted_precision": round(float(p_weighted), 4),
        "weighted_recall": round(float(r_weighted), 4),
        "weighted_f1": round(float(f1_weighted), 4),
        "per_class": per_class,
        "confusion_matrix": cm.tolist(),
    }

    # Print per-example predictions for inspection
    print(f"\n{'='*80}")
    print(f"  {label} — Per-Example Predictions on Realistic Test Set")
    print(f"{'='*80}")
    mismatches = 0
    for idx, row in df.iterrows():
        pred = y_pred[idx]
        true = row["sentiment"]
        match = "OK" if pred == true else "XX"
        if pred != true:
            mismatches += 1
        text_preview = row["feedback"][:90] + ("..." if len(row["feedback"]) > 90 else "")
        print(f"  {match} True={true:<9} Pred={pred:<9}  {text_preview}")

    print(f"\n  Accuracy: {acc:.4f} ({len(df) - mismatches}/{len(df)} correct)")
    print(f"  Macro F1: {f1_macro:.4f}  |  Weighted F1: {f1_weighted:.4f}")
    print(f"\n  Classification Report:\n{report}")
    print(f"  Confusion Matrix (rows=true, cols=pred) {LABEL_ORDER}:")
    for row_vals in cm:
        print(f"    {row_vals.tolist()}")

    return result


def main():
    df = pd.read_csv(REALISTIC_CSV)
    print(f"Loaded {len(df)} realistic test examples")
    print(f"Class distribution: {df['sentiment'].value_counts().to_dict()}")

    results = {}

    # Model v1 (trained on 600-sample improved dataset)
    v1_model = joblib.load(PROJECT_DIR / "models" / "model_v1" / "final_sentiment_model.pkl")
    v1_vec = joblib.load(PROJECT_DIR / "models" / "model_v1" / "final_tfidf_vectorizer.pkl")
    results["v1_600"] = evaluate_on_realistic(v1_model, v1_vec, df, "Model v1 (600 samples)")

    # Model v2_10k (trained on 11k template-generated dataset)
    v2_model = joblib.load(PROJECT_DIR / "models" / "model_v2_10k" / "final_sentiment_model.pkl")
    v2_vec = joblib.load(PROJECT_DIR / "models" / "model_v2_10k" / "final_tfidf_vectorizer.pkl")
    results["v2_10k"] = evaluate_on_realistic(v2_model, v2_vec, df, "Model v2 (10k templates)")

    # Save results
    output_path = EVAL_DIR / "baseline_evaluation.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved baseline evaluation to {output_path}")

    # Summary comparison
    print(f"\n{'='*80}")
    print("  BASELINE COMPARISON SUMMARY")
    print(f"{'='*80}")
    print(f"{'Metric':<22} {'v1 (600)':<14} {'v2 (10k)':<14}")
    print("-" * 50)
    for metric in ["accuracy", "macro_f1", "weighted_f1"]:
        v1_val = results["v1_600"][metric]
        v2_val = results["v2_10k"][metric]
        print(f"{metric:<22} {v1_val:<14.4f} {v2_val:<14.4f}")


if __name__ == "__main__":
    main()
