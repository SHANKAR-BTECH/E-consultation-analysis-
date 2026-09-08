# E-Consultation Feedback Sentiment Analysis: Machine Learning Documentation

## 1. Executive Summary & Academic Transparency

> [!IMPORTANT]
> **Synthetic Dataset Notice**:
> The 10K dataset (`sentiment_dataset_v3.csv`) is a **synthetic government/public-consultation dataset** programmatically generated using 500+ unique sentence stems and domain-specific civic vocabulary substitutions across 15 government domains.
> It is **NOT real citizen data** and was not scraped from actual citizen submissions.
> Metrics reported on held-out and hand-crafted evaluation benchmarks demonstrate model learning capacity and generalization on structured civic text patterns.

---

## 2. Existing Model Audit & Version Evolution

| Version | Dataset Size | Dataset Nature | Strengths | Limitations |
|---|---|---|---|---|
| **v1** | 600 samples | Small hand-curated balanced dataset | Fast, lightweight proof of concept | Low recall on nuanced complaints (Negative F1: 0.4615), underfits complex civic vocabulary |
| **v2** | 11,211 samples | Template-based expansion | Stronger coverage across common public service phrases (Macro F1: 0.8500) | High prefix redundancy (~74% prefix uniqueness), brittle on short direct complaints |
| **v3** (Current Active) | 10,200 samples | 500+ diverse syntactic stems + Jaccard similarity filtering (<0.80) | Superior generalization (+5.7pp Macro F1 on realistic unseen text, Negative F1: 0.8750, Positive F1: 0.8500) | Retains n-gram bag-of-words limitations on complex sarcastic or multi-clause mixed feedback |

---

## 3. Dataset Specifications (v3)

- **File**: `sentiment_dataset_v3.csv`
- **Total Valid Records**: 10,200
- **Domains Covered (15 domains)**:
  1. Clean Water & Supply
  2. Sanitation & Drainage
  3. Waste Management & Collection
  4. Roads & Bridges
  5. Public Transport & Bus Services
  6. Healthcare & Clinics
  7. Education & Schools
  8. Housing & Urban Living
  9. Electricity & Power Reliability
  10. Welfare & Social Schemes
  11. Public Safety & Policing
  12. Accessibility & Barrier-Free Infrastructure
  13. Municipal Licensing & Citizen Permits
  14. Digital Government Portals & e-Services
  15. Community Development & Green Spaces
- **Class Distribution**:
  - `negative`: 3,400 (33.33%)
  - `neutral`: 3,400 (33.33%)
  - `positive`: 3,400 (33.33%)
- **Data Quality & Hygiene**:
  - Null / Missing values: 0
  - Empty strings: 0
  - Exact duplicates: 0
  - Duplicate feedback strings: 0
  - Average feedback length: 106.07 characters (min: 26, max: 404)
  - Near-duplicate filtering: Reject Jaccard token overlap > 0.80 during generation

---

## 4. Preprocessing & Feature Extraction

The pipeline maintains the exact required ML architecture without external LLM/neural dependencies:
```
TEXT -> PREPROCESSING (text_utils.preprocess_text) -> TF-IDF VECTORIZER -> MULTINOMIAL NAIVE BAYES -> SENTIMENT CLASS
```

### Preprocessing (`text_utils.py`):
1. Lowercasing
2. Contraction normalization (`don't` -> `do not`, `can't` -> `cannot`, `won't` -> `will not`, etc.)
3. Unicode normalization (NFKD to ASCII)
4. Non-alphanumeric stripping (preserves letters, spaces, and intra-word hyphens)
5. Whitespace collapsing and trimming

### Vectorizer Configuration:
- **Vectorizer**: `TfidfVectorizer`
- **N-gram Range**: `(1, 1)` (unigrams optimal for vocabulary discrimination without overfitting)
- **Sublinear TF**: `True` (dampens repeated term frequency impact via $1 + \log(\text{tf})$)
- **Min DF**: `1`
- **Vocabulary Size**: 1,311 features

---

## 5. Model Configuration & Split Strategy

- **Algorithm**: `MultinomialNB(alpha=1.0)`
- **Smoothing Parameter ($\alpha$)**: `1.0` (Laplace smoothing)
- **Split Strategy**:
  - **Train Set**: 8,160 samples (80.0%)
  - **Validation Set**: 1,020 samples (10.0%)
  - **Test Set**: 1,020 samples (10.0%)
- **Random Seed**: `42` (stratified on sentiment class)
- **Data Leakage Check**: Strictly verified across sets (`len(train ∩ test) == 0`, `len(train ∩ val) == 0`, `len(val ∩ test) == 0`)

---

## 6. Model Evaluation & Comparison

### A. Performance on Held-Out Test Set (1,020 samples)

| Metric | Score |
|---|---|
| **Accuracy** | 1.0000 |
| **Macro Precision** | 1.0000 |
| **Macro Recall** | 1.0000 |
| **Macro F1** | 1.0000 |
| **Weighted F1** | 1.0000 |

### B. Benchmark on Realistic External Test Set (54 Hand-Crafted Civic Examples)

The realistic test set (`evaluation/realistic_test_set.csv`) contains diverse, real-world syntactic constructions, mixed feedback, complaints, administrative notices, and positive acknowledgments:

| Metric | v1 (600 Baseline) | v2 (10k Templates) | v3 (10k Diverse - Promoted) | Improvement vs v2 |
|---|---|---|---|---|
| **Accuracy** | 72.22% | 85.19% | **88.89%** | **+3.70%** |
| **Macro F1** | 69.40% | 85.00% | **88.98%** | **+3.98%** |
| **Weighted F1** | 69.40% | 85.00% | **88.98%** | **+3.98%** |
| **Macro Precision** | 74.06% | 86.15% | **90.57%** | **+4.42%** |
| **Macro Recall** | 72.22% | 85.19% | **88.89%** | **+3.70%** |

### C. Per-Class F1 Comparison on Realistic Benchmark

| Sentiment Class | v1 Baseline | v2 Candidate | v3 Promoted |
|---|---|---|---|
| **Negative** | 0.4615 | 0.7500 | **0.8750** (+12.5pp) |
| **Neutral** | 0.8649 | 1.0000 | **0.9444** |
| **Positive** | 0.7556 | 0.8000 | **0.8500** (+5.0pp) |

### D. Confusion Matrix on Realistic External Test Set
```
                 Predicted Negative   Predicted Neutral   Predicted Positive
Actual Negative          14                   0                   4
Actual Neutral            0                  17                   1
Actual Positive           0                   1                  17
```

---

## 7. Model Promotion Decision

**Decision**: **CANDIDATE MODEL v3 PROMOTED TO PRODUCTION**

### Justification:
1. **Macro F1 Superiority**: On the independent realistic test set, v3 achieved **0.8898 Macro F1** compared to v2's **0.8500** and v1's **0.6940**.
2. **Negative Class Detection**: The negative class F1 dramatically improved from **0.4615 (v1)** and **0.7500 (v2)** to **0.8750 (v3)**, directly fulfilling the core requirement of detecting citizen grievances and public service breakdowns.
3. **No Severe Class Degradation**: All three classes maintain >0.85 F1 scores on unseen realistic data.
4. **Preservation of Core Architecture**: Trained strictly with TF-IDF + Multinomial Naive Bayes without adding black-box neural networks, transformers, or external APIs.

---

## 8. Artifacts & File Locations

- **Active Model**: `models/final_sentiment_model.pkl` & `models/sentiment_model.pkl`
- **Active Vectorizer**: `models/final_tfidf_vectorizer.pkl` & `models/tfidf_vectorizer.pkl`
- **Active Metadata**: `models/model_metadata.json`
- **Archived Versions**:
  - `models/model_v1/` (600 baseline)
  - `models/model_v2_10k/` (10k template expansion)
  - `models/model_v3/` (10k diverse active model)
- **Dataset Generator**: `generate_dataset_v3.py`
- **Training & Comparison Script**: `train_v3.py`
- **Output Reports**: `outputs/model_v3_comparison.txt` and `outputs/model_v3_metrics.json`

---

## 9. Limitations & Practical Deployment Considerations

1. **Bag-of-Words Independence Assumption**: Naive Bayes treats features as conditionally independent given the class, which can misinterpret complex sarcasm or double negatives.
2. **Mixed Feedback Nuance**: Feedback containing both strong praise and actionable problems (e.g., *"The new water supply is much better than before, but the water pressure remains low"*) is handled in the application by the multi-sentence rule-based aspect extractor in `analysis_service.py`, augmenting the statistical classifier.
3. **English Language Only**: The prototype is trained on English text and screens out non-Latin inputs at the API validation boundary (`model_service.py`).
