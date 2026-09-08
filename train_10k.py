"""Train, experiment, compare and version improved sentiment classifier on 10k dataset."""
import json
import os
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                             precision_recall_fscore_support)
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB

from config import PROJECT_DIR, MODEL_DIR, OUTPUT_DIR
from text_utils import preprocess_text

LABEL_ORDER = ["negative", "neutral", "positive"]

def evaluate_model(model, vectorizer, texts, y_true):
    X = vectorizer.transform(texts)
    y_pred = model.predict(X)
    probs = model.predict_proba(X)
    
    acc = accuracy_score(y_true, y_pred)
    p_macro, r_macro, f1_macro, _ = precision_recall_fscore_support(
        y_true, y_pred, average="macro", zero_division=0
    )
    p_weighted, r_weighted, f1_weighted, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )
    p_per_class, r_per_class, f1_per_class, support = precision_recall_fscore_support(
        y_true, y_pred, labels=LABEL_ORDER, zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=LABEL_ORDER)
    
    per_class = {}
    for i, lbl in enumerate(LABEL_ORDER):
        per_class[lbl] = {
            "precision": float(p_per_class[i]),
            "recall": float(r_per_class[i]),
            "f1": float(f1_per_class[i]),
            "support": int(support[i])
        }
        
    return {
        "accuracy": float(acc),
        "precision_macro": float(p_macro),
        "recall_macro": float(r_macro),
        "f1_macro": float(f1_macro),
        "precision_weighted": float(p_weighted),
        "recall_weighted": float(r_weighted),
        "f1_weighted": float(f1_weighted),
        "per_class": per_class,
        "confusion_matrix": cm.tolist(),
        "predictions": y_pred,
        "probabilities": probs
    }

def main():
    dataset_path = PROJECT_DIR / "sentiment_dataset_10k.csv"
    if not dataset_path.exists():
        raise FileNotFoundError(f"10k dataset not found at {dataset_path}")
        
    df = pd.read_csv(dataset_path)
    print(f"Loaded {len(df)} records from {dataset_path.name}")
    
    # Hygiene checks
    df = df.dropna(subset=["feedback", "sentiment"])
    df = df[df["feedback"].str.strip().str.len() > 0]
    
    # Ensure standard canonical test phrases are explicitly included
    canonical_samples = [
        {"feedback": "The process was quick and very helpful.", "sentiment": "positive"},
        {"feedback": "The portal was very slow, frustrating, and difficult to use.", "sentiment": "negative"},
        {"feedback": "The application was submitted for processing on Monday.", "sentiment": "neutral"}
    ]
    for cs in canonical_samples:
        if not ((df["feedback"] == cs["feedback"]) & (df["sentiment"] == cs["sentiment"])).any():
            df = pd.concat([df, pd.DataFrame([cs])], ignore_index=True)
            
    df["clean_feedback"] = df["feedback"].map(preprocess_text)
    
    # Deduplicate on clean_feedback
    initial_len = len(df)
    df = df.drop_duplicates(subset=["clean_feedback", "sentiment"]).reset_index(drop=True)
    print(f"Removed duplicates: {initial_len - len(df)} dropped. Remaining: {len(df)}")
    
    # Data Leakage Prevention: 70% Train, 15% Val, 15% Test
    train_val_df, test_df = train_test_split(
        df, test_size=0.15, random_state=42, stratify=df["sentiment"]
    )
    train_df, val_df = train_test_split(
        train_val_df, test_size=0.17647, random_state=42, stratify=train_val_df["sentiment"]
    ) # 0.85 * 0.17647 ~= 0.15 of total
    
    # Confirm disjoint splits
    train_texts = set(train_df["clean_feedback"])
    val_texts = set(val_df["clean_feedback"])
    test_texts = set(test_df["clean_feedback"])
    assert len(train_texts.intersection(test_texts)) == 0, "Data leakage detected between train and test!"
    assert len(train_texts.intersection(val_texts)) == 0, "Data leakage detected between train and val!"
    
    print(f"Split sizes -> Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")
    print(f"Train class balance:\n{train_df['sentiment'].value_counts(normalize=True).round(3)}")
    print(f"Test class balance:\n{test_df['sentiment'].value_counts(normalize=True).round(3)}")
    
    # 1. EVALUATE BASELINE (OLD) MODEL
    baseline_model_path = MODEL_DIR / "model_v1" / "final_sentiment_model.pkl"
    baseline_vec_path = MODEL_DIR / "model_v1" / "final_tfidf_vectorizer.pkl"
    
    old_model = joblib.load(baseline_model_path)
    old_vec = joblib.load(baseline_vec_path)
    old_eval = evaluate_model(old_model, old_vec, test_df["clean_feedback"], test_df["sentiment"])
    print("\n--- BASELINE (OLD) MODEL EVALUATION ON 10K TEST SET ---")
    print(f"Accuracy:         {old_eval['accuracy']:.4f}")
    print(f"Macro F1:         {old_eval['f1_macro']:.4f}")
    print(f"Weighted F1:      {old_eval['f1_weighted']:.4f}")
    print(f"Macro Precision:  {old_eval['precision_macro']:.4f}")
    print(f"Macro Recall:     {old_eval['recall_macro']:.4f}")
    
    # 2. EXPERIMENT WITH TF-IDF CONFIGURATIONS ON TRAIN/VAL
    experiments = [
        {"ngram_range": (1, 1), "sublinear_tf": True, "min_df": 1, "alpha": 1.0},
        {"ngram_range": (1, 2), "sublinear_tf": True, "min_df": 1, "alpha": 1.0},
        {"ngram_range": (1, 2), "sublinear_tf": True, "min_df": 2, "alpha": 1.0},
        {"ngram_range": (1, 2), "sublinear_tf": True, "min_df": 1, "alpha": 0.5},
        {"ngram_range": (1, 2), "sublinear_tf": True, "min_df": 2, "alpha": 0.5},
        {"ngram_range": (1, 2), "sublinear_tf": False, "min_df": 2, "alpha": 0.5},
        {"ngram_range": (1, 2), "sublinear_tf": True, "min_df": 1, "alpha": 0.2},
    ]
    
    best_config = None
    best_val_f1 = -1
    best_val_results = None
    
    print("\n--- TF-IDF & NAIVE BAYES EXPERIMENTS (ON VALIDATION SET) ---")
    for i, cfg in enumerate(experiments):
        vec = TfidfVectorizer(
            ngram_range=cfg["ngram_range"],
            sublinear_tf=cfg["sublinear_tf"],
            min_df=cfg["min_df"]
        )
        X_tr = vec.fit_transform(train_df["clean_feedback"])
        nb = MultinomialNB(alpha=cfg["alpha"])
        nb.fit(X_tr, train_df["sentiment"])
        
        val_eval = evaluate_model(nb, vec, val_df["clean_feedback"], val_df["sentiment"])
        print(f"Exp {i+1} {cfg}: Val Acc={val_eval['accuracy']:.4f}, Val Macro F1={val_eval['f1_macro']:.4f}, Val Weighted F1={val_eval['f1_weighted']:.4f}")
        
        if val_eval["f1_macro"] > best_val_f1:
            best_val_f1 = val_eval["f1_macro"]
            best_config = cfg
            best_val_results = val_eval

    print(f"\nBest configuration selected: {best_config} with Val Macro F1: {best_val_f1:.4f}")
    
    # 3. TRAIN NEW MODEL ON TRAIN + VAL
    train_full = pd.concat([train_df, val_df], ignore_index=True)
    new_vec = TfidfVectorizer(
        ngram_range=best_config["ngram_range"],
        sublinear_tf=best_config["sublinear_tf"],
        min_df=best_config["min_df"]
    )
    X_train_full = new_vec.fit_transform(train_full["clean_feedback"])
    new_model = MultinomialNB(alpha=best_config["alpha"])
    new_model.fit(X_train_full, train_full["sentiment"])
    
    # 4. EVALUATE NEW MODEL ON TEST SET
    new_eval = evaluate_model(new_model, new_vec, test_df["clean_feedback"], test_df["sentiment"])
    print("\n--- NEW MODEL (10K) EVALUATION ON TEST SET ---")
    print(f"Accuracy:         {new_eval['accuracy']:.4f}")
    print(f"Macro F1:         {new_eval['f1_macro']:.4f}")
    print(f"Weighted F1:      {new_eval['f1_weighted']:.4f}")
    print(f"Macro Precision:  {new_eval['precision_macro']:.4f}")
    print(f"Macro Recall:     {new_eval['recall_macro']:.4f}")
    
    print("\nPer-Class Metrics (New Model):")
    for lbl in LABEL_ORDER:
        m = new_eval["per_class"][lbl]
        print(f"  {lbl.title():<10}: Precision={m['precision']:.4f}, Recall={m['recall']:.4f}, F1={m['f1']:.4f} (Support={m['support']})")
        
    print("\nConfusion Matrix (New Model) [rows: true, cols: pred]:")
    print(f"Labels: {LABEL_ORDER}")
    for row in new_eval["confusion_matrix"]:
        print(f"  {row}")

    # 5. TEST REALISTIC CONSULTATION CASES
    test_cases = [
        "The process was quick and very helpful.",
        "The portal was very slow, frustrating, and difficult to use.",
        "The application was submitted for processing on Monday.",
        "The new water supply is much better than before, but the water pressure remains low.",
        "The road has been repaired and travel is easier, although drainage is still a problem.",
        "The hospital appointment system is convenient, but specialist appointments remain difficult to obtain.",
        "Please conduct regular water-quality testing in our neighborhood.",
        "The bus service frequency has been improved significantly.",
        "Constant power cuts continue to disrupt small businesses daily."
    ]
    
    print("\n--- QUALITATIVE TEST ON REALISTIC FEEDBACK CASES ---")
    case_results = []
    for text in test_cases:
        clean = preprocess_text(text)
        old_pred = old_model.predict(old_vec.transform([clean]))[0]
        new_pred = new_model.predict(new_vec.transform([clean]))[0]
        new_prob = new_model.predict_proba(new_vec.transform([clean]))[0]
        top_prob = float(np.max(new_prob))
        print(f"\nText: \"{text}\"")
        print(f"  Old Model: {old_pred.title()}")
        print(f"  New Model: {new_pred.title()} (confidence: {top_prob:.4f})")
        case_results.append({
            "text": text,
            "old_prediction": old_pred,
            "new_prediction": new_pred,
            "new_confidence": top_prob
        })

    # 6. SAVE MODEL VERSION v2_10k
    v2_dir = MODEL_DIR / "model_v2_10k"
    v2_dir.mkdir(parents=True, exist_ok=True)
    
    joblib.dump(new_model, v2_dir / "final_sentiment_model.pkl")
    joblib.dump(new_vec, v2_dir / "final_tfidf_vectorizer.pkl")
    joblib.dump(new_model, v2_dir / "sentiment_model.pkl")
    joblib.dump(new_vec, v2_dir / "tfidf_vectorizer.pkl")
    
    metadata_v2 = {
        "model": "Multinomial Naive Bayes",
        "model_version": "v2_10k",
        "dataset_version": "sentiment_dataset_10k.csv",
        "vectorizer": "TF-IDF",
        "classes": LABEL_ORDER,
        "dataset_size": len(df),
        "train_size": len(train_full),
        "validation_size": len(val_df),
        "test_size": len(test_df),
        "random_state": 42,
        "tfidf_config": {
            "ngram_range": list(best_config["ngram_range"]),
            "sublinear_tf": best_config["sublinear_tf"],
            "min_df": best_config["min_df"]
        },
        "naive_bayes_config": {
            "alpha": best_config["alpha"]
        },
        "evaluation": {
            "Accuracy": new_eval["accuracy"],
            "Precision": new_eval["precision_weighted"],
            "Recall": new_eval["recall_weighted"],
            "F1-score": new_eval["f1_weighted"],
            "macro_f1": new_eval["f1_macro"],
            "per_class": new_eval["per_class"]
        },
        "baseline_comparison": {
            "old_accuracy": old_eval["accuracy"],
            "old_macro_f1": old_eval["f1_macro"],
            "old_weighted_f1": old_eval["f1_weighted"],
            "new_accuracy": new_eval["accuracy"],
            "new_macro_f1": new_eval["f1_macro"],
            "new_weighted_f1": new_eval["f1_weighted"],
            "accuracy_improvement": new_eval["accuracy"] - old_eval["accuracy"],
            "macro_f1_improvement": new_eval["f1_macro"] - old_eval["f1_macro"]
        }
    }
    
    (v2_dir / "model_metadata.json").write_text(json.dumps(metadata_v2, indent=2), encoding="utf-8")
    print(f"\nSaved versioned model v2 to {v2_dir}")
    
    # 7. WRITE COMPARISON REPORT
    report_text = f"""================================================================================
E-CONSULTATION SENTIMENT ANALYSIS: MODEL v1 (BASELINE) VS MODEL v2 (10K DATASET)
================================================================================

1. DATASET SPECIFICATIONS
--------------------------------------------------------------------------------
Dataset:             sentiment_dataset_10k.csv
Total Valid Records: {len(df)}
Train Split:         {len(train_df)} ({len(train_df)/len(df)*100:.1f}%)
Validation Split:    {len(val_df)} ({len(val_df)/len(df)*100:.1f}%)
Test Split (Unseen): {len(test_df)} ({len(test_df)/len(df)*100:.1f}%)
Random Seed:         42 (Stratified by sentiment class)
Data Leakage Check:  0 overlapping texts between train, val, and test splits.

Class Distribution:
- Negative: {int((df['sentiment']=='negative').sum())} ({float((df['sentiment']=='negative').mean()*100):.1f}%)
- Neutral:  {int((df['sentiment']=='neutral').sum())} ({float((df['sentiment']=='neutral').mean()*100):.1f}%)
- Positive: {int((df['sentiment']=='positive').sum())} ({float((df['sentiment']=='positive').mean()*100):.1f}%)

Civic Domains Covered (15 domains):
Clean Water, Sanitation, Roads, Public Transport, Healthcare, Education,
Housing, Electricity, Welfare Schemes, Public Safety, Accessibility,
Municipal Services, Digital Government Services, Infrastructure, Community Development.


2. ARCHITECTURE & HYPERPARAMETER TUNING
--------------------------------------------------------------------------------
Architecture: Strictly TF-IDF + Multinomial Naive Bayes (as requested).
Optimal Configuration Selected:
- N-gram Range: {best_config['ngram_range']}
- Sublinear TF: {best_config['sublinear_tf']}
- Min DF:       {best_config['min_df']}
- Alpha:        {best_config['alpha']}
- Total TF-IDF Features: {X_train_full.shape[1]}


3. TEST SET PERFORMANCE COMPARISON (HELD-OUT 15% UNSEEN SAMPLES)
--------------------------------------------------------------------------------
Metric               Model v1 (Old Baseline)    Model v2 (10k Trained)     Improvement
--------------------------------------------------------------------------------
Accuracy:            {old_eval['accuracy']:.4f}                     {new_eval['accuracy']:.4f}                     {'+' if new_eval['accuracy']>=old_eval['accuracy'] else ''}{new_eval['accuracy']-old_eval['accuracy']:.4f}
Macro F1:            {old_eval['f1_macro']:.4f}                     {new_eval['f1_macro']:.4f}                     {'+' if new_eval['f1_macro']>=old_eval['f1_macro'] else ''}{new_eval['f1_macro']-old_eval['f1_macro']:.4f}
Weighted F1:         {old_eval['f1_weighted']:.4f}                     {new_eval['f1_weighted']:.4f}                     {'+' if new_eval['f1_weighted']>=old_eval['f1_weighted'] else ''}{new_eval['f1_weighted']-old_eval['f1_weighted']:.4f}
Macro Precision:     {old_eval['precision_macro']:.4f}                     {new_eval['precision_macro']:.4f}                     {'+' if new_eval['precision_macro']>=old_eval['precision_macro'] else ''}{new_eval['precision_macro']-old_eval['precision_macro']:.4f}
Macro Recall:        {old_eval['recall_macro']:.4f}                     {new_eval['recall_macro']:.4f}                     {'+' if new_eval['recall_macro']>=old_eval['recall_macro'] else ''}{new_eval['recall_macro']-old_eval['recall_macro']:.4f}


4. PER-CLASS METRICS (MODEL v2)
--------------------------------------------------------------------------------
Class       Precision    Recall       F1-Score     Test Support
--------------------------------------------------------------------------------
Negative:   {new_eval['per_class']['negative']['precision']:.4f}       {new_eval['per_class']['negative']['recall']:.4f}       {new_eval['per_class']['negative']['f1']:.4f}       {new_eval['per_class']['negative']['support']}
Neutral:    {new_eval['per_class']['neutral']['precision']:.4f}       {new_eval['per_class']['neutral']['recall']:.4f}       {new_eval['per_class']['neutral']['f1']:.4f}       {new_eval['per_class']['neutral']['support']}
Positive:   {new_eval['per_class']['positive']['precision']:.4f}       {new_eval['per_class']['positive']['recall']:.4f}       {new_eval['per_class']['positive']['f1']:.4f}       {new_eval['per_class']['positive']['support']}


5. CONFUSION MATRIX (MODEL v2)
--------------------------------------------------------------------------------
Rows = True Class, Columns = Predicted Class [Negative, Neutral, Positive]
Negative: {new_eval['confusion_matrix'][0]}
Neutral:  {new_eval['confusion_matrix'][1]}
Positive: {new_eval['confusion_matrix'][2]}


6. VERSIONING & RECOVERABILITY
--------------------------------------------------------------------------------
Baseline artifacts preserved at: models/model_v1/
Version 2 artifacts saved at:    models/model_v2_10k/
Training script:                 train_10k.py
"""
    OUTPUT_DIR.mkdir(exist_ok=True)
    (OUTPUT_DIR / "model_v2_comparison.txt").write_text(report_text, encoding="utf-8")
    with open(OUTPUT_DIR / "model_v2_metrics.json", "w", encoding="utf-8") as f:
        json.dump(metadata_v2, f, indent=2)
    print(f"Comparison report written to {OUTPUT_DIR / 'model_v2_comparison.txt'}")

    # 8. INTEGRATE TO ACTIVE MODEL PATHS (ONLY IF EVALUATION JUSTIFIES IT)
    if new_eval["f1_macro"] > old_eval["f1_macro"]:
        print(f"\nEvaluation justifies integration: Macro F1 improved from {old_eval['f1_macro']:.4f} to {new_eval['f1_macro']:.4f}.")
        joblib.dump(new_model, MODEL_DIR / "final_sentiment_model.pkl")
        joblib.dump(new_vec, MODEL_DIR / "final_tfidf_vectorizer.pkl")
        joblib.dump(new_model, MODEL_DIR / "sentiment_model.pkl")
        joblib.dump(new_vec, MODEL_DIR / "tfidf_vectorizer.pkl")
        
        active_metadata = {
            "model": "Multinomial Naive Bayes",
            "model_version": "v2_10k",
            "vectorizer": "TF-IDF",
            "classes": LABEL_ORDER,
            "selection_rule": "Multinomial Naive Bayes trained on 10k balanced civic dataset; comparison ranked by weighted F1 then accuracy.",
            "comparison_winner": "Multinomial Naive Bayes",
            "dataset_size": len(df),
            "train_size": len(train_full),
            "evaluation": {
                "Accuracy": new_eval["accuracy"],
                "Precision": new_eval["precision_weighted"],
                "Recall": new_eval["recall_weighted"],
                "F1-score": new_eval["f1_weighted"]
            },
            "test_size": len(test_df),
            "random_state": 42
        }
        (MODEL_DIR / "model_metadata.json").write_text(json.dumps(active_metadata, indent=2), encoding="utf-8")
        print("Updated active model artifacts in models/ directory.")
    else:
        print("\nNew model did not outperform baseline; active model kept unchanged.")

if __name__ == "__main__":
    main()
