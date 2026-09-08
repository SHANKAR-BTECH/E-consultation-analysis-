"""Train, compare, evaluate, and save sentiment classifiers from actual data."""
import json
import os
from config import DATASET_PATH, OUTPUT_DIR, MODEL_DIR

# Keep Matplotlib's cache in the project, where it is writable in restricted environments.
os.environ.setdefault("MPLCONFIGDIR", str(OUTPUT_DIR / ".matplotlib"))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import joblib
import pandas as pd
import seaborn as sns
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                             precision_recall_fscore_support)
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import LinearSVC

from text_utils import preprocess_text


LABEL_ORDER = ["negative", "neutral", "positive"]


def evaluate(model, X_test, y_test) -> tuple[dict[str, float], object]:
    prediction = model.predict(X_test)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, prediction, average="weighted", zero_division=0
    )
    return {
        "Accuracy": accuracy_score(y_test, prediction),
        "Precision": precision,
        "Recall": recall,
        "F1-score": f1,
    }, prediction


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    MODEL_DIR.mkdir(exist_ok=True)
    data = pd.read_csv(DATASET_PATH)
    if data[["feedback", "sentiment"]].isna().any().any():
        raise ValueError("Dataset contains missing feedback or sentiment values.")
    data["clean_feedback"] = data["feedback"].map(preprocess_text)

    X_train, X_test, y_train, y_test = train_test_split(
        data["clean_feedback"], data["sentiment"], test_size=0.2,
        random_state=42, stratify=data["sentiment"]
    )
    print("E-CONSULTATION FEEDBACK SENTIMENT ANALYSIS")
    print(f"Total Samples: {len(data)}")
    print(f"Training Samples: {len(X_train)}")
    print(f"Testing Samples: {len(X_test)}")

    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True)
    X_train_tfidf = vectorizer.fit_transform(X_train)
    X_test_tfidf = vectorizer.transform(X_test)
    print(f"TF-IDF features: {X_train_tfidf.shape[1]}")

    models = {
        "Multinomial Naive Bayes": MultinomialNB(),
        "Logistic Regression": LogisticRegression(max_iter=2000, random_state=42),
        "Linear SVM": LinearSVC(random_state=42),
    }
    results, fitted_models = [], {}
    for name, model in models.items():
        model.fit(X_train_tfidf, y_train)
        metrics, _ = evaluate(model, X_test_tfidf, y_test)
        fitted_models[name] = model
        results.append({"Model": name, **metrics})
        print(f"{name}: accuracy={metrics['Accuracy']:.4f}, f1={metrics['F1-score']:.4f}")

    comparison = pd.DataFrame(results)
    comparison.to_csv(OUTPUT_DIR / "model_comparison.csv", index=False, float_format="%.6f")
    baseline = comparison.loc[comparison["Model"] == "Multinomial Naive Bayes"].iloc[0]
    (OUTPUT_DIR / "baseline_results.txt").write_text(
        "BASELINE RESULTS (improved dataset)\n" + "-" * 40 + "\n" +
        "TF-IDF + Multinomial Naive Bayes\n" +
        f"Accuracy: {baseline['Accuracy']:.4f}\nPrecision: {baseline['Precision']:.4f}\n"
        f"Recall: {baseline['Recall']:.4f}\nF1-score: {baseline['F1-score']:.4f}\n",
        encoding="utf-8"
    )

    ax = comparison.plot(x="Model", y="Accuracy", kind="bar", legend=False, color="#4a90e2", rot=0)
    ax.set_title("Model Accuracy Comparison")
    ax.set_xlabel("Model")
    ax.set_ylabel("Accuracy")
    ax.set_ylim(0, 1.05)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "model_accuracy_comparison.png", dpi=150)
    plt.close()

    # F1-score is the primary rule; accuracy breaks an exact F1 tie.
    best_row = comparison.sort_values(["F1-score", "Accuracy"], ascending=False).iloc[0]
    best_name = "Multinomial Naive Bayes"  # Fixed academic core; comparison remains available.
    final_model = fitted_models[best_name]
    final_predictions = final_model.predict(X_test_tfidf)
    report = classification_report(y_test, final_predictions, labels=LABEL_ORDER, zero_division=0)
    metrics, _ = evaluate(final_model, X_test_tfidf, y_test)
    final_text = (
        f"FINAL MODEL: {best_name}\n" + "-" * 40 + "\n" +
        f"Accuracy: {metrics['Accuracy']:.4f}\nPrecision: {metrics['Precision']:.4f}\n"
        f"Recall: {metrics['Recall']:.4f}\nF1-score: {metrics['F1-score']:.4f}\n\n"
        "Classification Report:\n" + report
    )
    print("\n" + final_text)
    (OUTPUT_DIR / "final_metrics.txt").write_text(final_text, encoding="utf-8")

    matrix = confusion_matrix(y_test, final_predictions, labels=LABEL_ORDER)
    sns.heatmap(matrix, annot=True, fmt="d", cmap="Blues", xticklabels=LABEL_ORDER, yticklabels=LABEL_ORDER)
    plt.title(f"Confusion Matrix: {best_name}")
    plt.xlabel("Predicted label")
    plt.ylabel("True label")
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "confusion_matrix.png", dpi=150)
    plt.close()

    joblib.dump(final_model, MODEL_DIR / "final_sentiment_model.pkl")
    joblib.dump(vectorizer, MODEL_DIR / "final_tfidf_vectorizer.pkl")
    # Convenience copies follow the requested final project architecture.
    joblib.dump(final_model, MODEL_DIR / "sentiment_model.pkl")
    joblib.dump(vectorizer, MODEL_DIR / "tfidf_vectorizer.pkl")
    metadata = {
        "model": best_name, "vectorizer": "TF-IDF", "classes": LABEL_ORDER,
        "selection_rule": "Multinomial Naive Bayes retained as the academic core; comparison ranked by weighted F1 then accuracy.",
        "comparison_winner": best_row["Model"],
        "dataset_size": len(data), "train_size": len(X_train),
        "evaluation": metrics,
        "test_size": len(X_test), "random_state": 42,
    }
    (MODEL_DIR / "model_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Saved final model: {best_name}")


if __name__ == "__main__":
    main()
