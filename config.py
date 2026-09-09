"""Project-relative paths and shared inference limits."""
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
MODEL_DIR = PROJECT_DIR / "models"
OUTPUT_DIR = PROJECT_DIR / "outputs"
MODEL_PATH = MODEL_DIR / "final_sentiment_model.pkl"
VECTORIZER_PATH = MODEL_DIR / "final_tfidf_vectorizer.pkl"
METADATA_PATH = MODEL_DIR / "model_metadata.json"
DATASET_PATH = PROJECT_DIR / "sentiment_dataset_improved.csv"
MAX_INPUT_CHARACTERS = 5_000
# Allows JSON escaping of a maximum-length input; bounds HTTP request parsing.
MAX_REQUEST_BYTES = MAX_INPUT_CHARACTERS * 12 + 1024
# Phase 2: bounded, synchronous analysis; these are limits, not scale claims.
MAX_BATCH_RESPONSES = 2000
MAX_BATCH_CHARACTERS = 1_000_000
MAX_ANALYSIS_REQUEST_BYTES = 6_500_000
MAX_CSV_BYTES = 5_000_000
MAX_CSV_COLUMNS = 50
MAX_EXCEL_BYTES = 10_000_000
MAX_EXCEL_COLUMNS = 50
MAX_METADATA_CHARACTERS = 2000
INFERENCE_BATCH_SIZE = 128
MAX_DISCOVERED_TERMS = 50_000
MAX_KEYWORDS = 25
MAX_TOPICS = 12
MAX_ISSUES = 10
MAX_REPRESENTATIVES = 3
MIN_ISSUE_MENTIONS = 2
MIN_ISSUE_NEGATIVE_RATIO = 0.5
PRIORITY_FREQUENCY_WEIGHT = 0.4
PRIORITY_NEGATIVE_WEIGHT = 0.6
PRIORITY_HIGH_THRESHOLD = 75
PRIORITY_MEDIUM_THRESHOLD = 50
PROJECT_TITLE = "E-CONSULTATION FEEDBACK SENTIMENT ANALYSIS USING NLP & MACHINE LEARNING"
# Supported classes come from model.classes_, never a fallback label list.
