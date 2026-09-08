# ML Training Progress Tracker

CURRENT STAGE: 10K Candidate Model Promotion & Verification Completed
COMPLETED:
- Audited existing ML pipeline (v1 600 samples, v2 10k templates)
- Established baseline metrics on held-out and realistic hand-crafted external benchmark
- Generated high-diversity 10,200 row synthetic government/public consultation dataset (v3) across 15 domains
- Performed strict data hygiene (0 empty, 0 null, 0 duplicates, Jaccard near-duplicate screening)
- Split into 80% train (8,160), 10% validation (1,020), 10% test (1,020) with stratified sampling and zero data leakage verified
- Trained TF-IDF + Multinomial Naive Bayes candidate model with validation hyperparameter tuning
- Evaluated candidate against v1 and v2 on both held-out test set and realistic 54-example external test set
- Verified qualitative predictions on key civic consultation phrases
- Promoted v3 model to active `models/` directory based on evidence (Macro F1: 0.8898 vs v2 0.8500, Negative F1: 0.8750 vs v2 0.7500, Positive F1: 0.8500 vs v2 0.8000)
- Verified all 49 backend unittest test suite passes
- Verified live Flask API endpoints (/health, /predict, /analyze, /analyze-file)

IN PROGRESS: Documentation and Git Checkpoint
NEXT STEP: Git commit and push to origin main
DATASET ROW COUNT: 10,200
BASELINE STATUS: Completed (v1: Acc 0.7222, Macro F1 0.6940; v2: Acc 0.8519, Macro F1 0.8500 on realistic external test set)
CANDIDATE STATUS: Trained and Promoted (v3: Acc 0.8889, Macro F1 0.8898 on realistic external test set; 1.0000 on held-out test set)
EVALUATION STATUS: Completed (Detailed metrics, per-class F1, confusion matrices, and qualitative case evaluations logged)
INTEGRATION STATUS: Completed (Active models in `models/` updated with model_v3 artifacts, metadata synced, Flask server verified)
TEST STATUS: 49/49 Unittests Passed (100%), live API verified
LAST UPDATED: 2026-09-08T21:07:00+05:30
