# E-CONSULTATION FEEDBACK SENTIMENT ANALYSIS USING NLP & MACHINE LEARNING

Consultation intelligence engine with an integrated analysis frontend. The primary domain is government/public-policy e-consultation: analyzing citizen responses about public services and policies. Product, service, and student feedback are possible secondary demonstrations; their accuracy has not been established.

## Current capabilities and architecture

The Flask website provides **batch consultation analysis from pasted responses, CSV or Excel workbooks**: aggregate sentiment, exact-phrase keywords/topics, recurring negative-associated candidate issues, priority scores, source quotes, deterministic summaries, and conditional date/category breakdowns. Streamlit and the CLI retain their single-response interfaces.

`Flask website / Streamlit / CLI → model_service.py → text_utils.py → saved TF-IDF → saved Multinomial Naive Bayes`

All three existing interfaces use the same inference service. New batch endpoints call `analysis_service.py`, which normalizes response records, calls that same service in sparse chunks, and delegates derived statistics to `text_insights.py`. CSV and Excel ingestion map columns into the same records. Artifacts are loaded once per process; restart a running interface after changing them. Flask remains the existing backend.

| File or directory | Responsibility |
|---|---|
| `config.py` | Project-relative paths, project title, input/transport limits |
| `model_service.py` | Artifact loading, actual model classes, input validation, preprocessing, prediction and confidence |
| `analysis_service.py` | Shared single/batch analysis, record normalization, exclusions and date normalization |
| `text_insights.py` | Phrase counts, topics, candidate issues, priority, evidence, summaries and breakdowns |
| `csv_ingestion.py` | Bounded CSV parsing, column inspection and explicit mappings |
| `excel_ingestion.py` | Bounded .xlsx workbook parsing, sheet selection, column inspection and explicit mappings |
| `text_utils.py` | Existing shared light preprocessing, unchanged |
| `evaluation_info.py` | Reads evaluation display values from existing reports |
| `server.py` | Flask homepage, prediction and readiness endpoints |
| `templates/index.html`, `static/` | Responsive consultation workspace and API-driven results; native JavaScript modules, no build step |
| `app.py` | Existing Streamlit interface |
| `predict.py` | CLI with session prediction CSV export |
| `train_model.py` | Training, three-model comparison, evaluation and persistence |
| `generate_improved_dataset.py`, `analyze_dataset.py` | Existing dataset generation and quality reports |
| `tests/` | Standard-library unittest suite, Streamlit interaction tests and real HTTP startup checks |
| `models/`, `outputs/`, `backup/` | Saved artifacts, actual reports and preserved originals |

The frontend includes CSV/Excel column inspection and sheet selection, a searchable and paginated response explorer, sentiment/category/topic filters, issue evidence, data-quality details, and accessible HTML sentiment/trend charts. All analytical results come from the existing API. See [frontend implementation and verification](docs/frontend-verification.md).

## Phase 2 API and methodology

See [the complete frontend/API contract](docs/analysis-api.md) for all request/response fields, error details, CSV mappings, limits, integration examples, and an evidence-based response excerpt.

- `POST /analyze`: JSON `{ "responses": [{ "text": "...", "date": "2026-01-02", "category": "Water" }] }`. Only `text` is required per row. Optional `id`, `source`, and flat `metadata` are preserved. Invalid rows are explicitly reported; statistics use valid rows only.
- `POST /analyze-file`: multipart `file` upload of a `.csv` or `.xlsx` file. `mode=inspect` returns columns and suggestions (Excel responses also list `sheets`; provide `sheet` for a specific worksheet). `mode=analyze` (default) accepts `text_column` and optional date/category/id/source/metadata column selections, then returns exactly the same analysis structure as `/analyze`.
- Existing `/predict`, `/health`, and `/` contracts remain intact.

**Sentiment is the existing ML output.** Keywords/topics are deterministic NLP output: exact contiguous 1–3-word phrases, lowercased, with stopwords omitted (negation retained). Counts are response mentions, not raw token counts. Phrases cannot bridge removed stopwords or punctuation. Candidate labels rank by `mention_count * (1 + 0.5 * (word_count - 1))`; overlapping labels sharing words and at least 80% Jaccard overlap in matching responses are suppressed, without merging counts. Topic names always come from the input. This is exact-phrase discovery, not semantic clustering.

**Issues are negative-associated recurring patterns.** A phrase requires at least two mentions, at least two model-negative responses, and a negative ratio of at least 50%. Each response counts once per phrase, even if it repeats that phrase. Different issues may overlap. These are candidate issues: sentiment applies to the full response, not necessarily to each aspect.

**Priority is transparent:** `100 * (0.4 * mentions / valid_responses + 0.6 * negative_mentions / mentions)`. The 60% negative-association weight favors concerns; the 40% coverage weight distinguishes broad patterns from isolated ones. These are documented heuristic weights, not fitted or validated severity measures. HIGH is >=75, MEDIUM >=50, otherwise LOW. No severity or emergency claim is made. Each issue includes its signals and score contributions.

Representatives are up to three unchanged source responses, sorted by negative sentiment first, then descending model confidence, shorter text, then input order. Summaries are deterministic templates populated from measured counts and selected labels; they are not source quotations or policy recommendations.

Dates are aggregated by source calendar day when parseable. Invalid dates generate row warnings and exclude only that row's date from trends. With no usable dates/categories, the corresponding result has `available=false` and an explanation. Category issues are intersections of the selected global issues, with local counts, eligibility and scores.

The synchronous request limits are 2,000 records, 5,000 characters per response, 1,000,000 combined text characters, 5,000,000 CSV bytes, 10,000,000 Excel bytes, 50 CSV/Excel columns and 6,500,000 analysis HTTP body bytes. Inference uses chunks of 128. A 50,000-term discovery cap is explicitly reported if reached. Bounds reside in `config.py`; memory usage is bounded, not an unlimited streaming architecture.

## Installation and run commands

Python 3.10 or newer is required by the existing type syntax. From the project root in PowerShell:

~~~powershell
# Only if a virtual environment does not already exist:
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt

# Flask website: http://localhost:5000
.\venv\Scripts\python.exe server.py

# Alternative Streamlit interface: http://localhost:8501
.\venv\Scripts\python.exe -m streamlit run app.py

# Interactive CLI; type exit to finish
.\venv\Scripts\python.exe predict.py

# All automated tests
.\venv\Scripts\python.exe -m unittest discover -s tests -v
~~~

Run each application command in its own terminal, or stop the current one with Ctrl+C. Tests stop the temporary servers they start.

The canonical redesigned website is **http://localhost:5000**, served by `server.py` from `templates/index.html` and `static/`. Do not start a separate preview on 5050. If an old application process is still running, stop that process before starting the command above. Templates now reload when changed and frontend responses require fresh retrieval/revalidation, preventing stale HTML from mixing with updated assets. Python code changes still require restarting Flask. See [the server mismatch resolution](docs/server-frontend-resolution.md).

For launch from a different working directory, use absolute paths:

~~~powershell
& "C:\Users\Shank\E-Consultation-Sentiment-Analysis\venv\Scripts\python.exe" "C:\Users\Shank\E-Consultation-Sentiment-Analysis\server.py"
~~~

Use the same approach for `predict.py`, or `-m streamlit run` followed by the absolute `app.py` path. Inference, Flask templates, reports and CLI output resolve relative to the project, not the caller's directory. No `backend/` directory is required.

The CLI exports valid inputs from the current session to `outputs/predictions.csv` when exiting or reaching EOF. As before, this replaces that export if it exists. Invalid inputs are explained and omitted. Tests use a temporary export file.

## Supported input and limits

- One **English** consultation response per prediction.
- `MAX_INPUT_CHARACTERS = 5000` in `config.py` is the single source of the character limit.
- The limit counts Python Unicode characters **before trimming**, including surrounding whitespace. No document chunking is performed.
- After validation, surrounding whitespace is stripped; returned character/word counts describe that trimmed text.
- Reject missing values, null, booleans, numbers, arrays, objects, empty/whitespace strings, and strings without usable English words.
- Reject input containing non-Latin alphabetic characters, including mixed English/non-Latin responses, rather than silently dropping meaningful portions.
- Reject responses whose TF-IDF representation contains **zero recognized features**.
- HTTP request bodies have a separate derived ceiling, `MAX_REQUEST_BYTES`, allowing JSON escapes while bounding request parsing. Exceeding it also returns HTTP 400.

Script screening and zero-vocabulary checks are **not language identification or accuracy guarantees**. Latin-script foreign languages, transliterated languages, gibberish containing known terms, mixed opinions, sarcasm and low vocabulary coverage may still receive unreliable predictions. English feedback outside the small learned vocabulary can be rejected. There is no invented Neutral fallback, confidence threshold, or hardcoded sentiment rule.

## Existing single-response Flask API contract

### GET /

HTTP 200: consultation analysis interface. Readiness is checked through `/health`; an unavailable service is explained visibly. Missing evaluation values display as unavailable.

### GET /health

Ready, HTTP 200:

~~~json
{"status":"ok","model_loaded":true,"classes":["negative","neutral","positive"]}
~~~

Class values and ordering come from the saved model's `classes_`, not a configured fallback.

Unavailable, HTTP 503:

~~~json
{"status":"unavailable","model_loaded":false,"classes":[]}
~~~

### POST /predict

Send `Content-Type: application/json` with a JSON **object** containing a string `feedback`. Additional fields are ignored. No batch input is accepted.

~~~json
{"feedback":"The process was quick and very helpful."}
~~~

HTTP 200 response fields:

| Field | Type | Meaning |
|---|---|---|
| `sentiment` | string | Actual predicted model class, title-cased; currently Positive, Negative or Neutral |
| `confidence` | number | Predicted class's Naive Bayes probability, rounded to six decimal places, between 0 and 1 |
| `input_length` | integer | Character count after stripping surrounding whitespace |
| `word_count` | integer | Whitespace-separated word count after stripping |

These successful fields preserve the existing API. Confidence is **not calibrated real-world accuracy**.

All controlled prediction errors use:

~~~json
{"error":true,"message":"Feedback must be a non-empty text value."}
~~~

| HTTP status | Meaning |
|---|---|
| 400 | Invalid/missing JSON, wrong body/value type, unusable/unsupported text, zero vocabulary, or size limit |
| 503 | Model/vectorizer unavailable or incompatible |
| 500 | Unexpected inference failure; generic public message, diagnostic details in server logs |

Frontends should test HTTP status, display `message` for errors, and render successful fields only on HTTP 200. The existing JavaScript has been updated for this error structure. Old clients that expected the error text directly in `error` must use `message` instead. Message wording is descriptive, not a stable machine error code. Syntax/type/content checks run before loading the service; vocabulary screening requires a usable model.

## ML pipeline and artifacts

The active academic core remains **TF-IDF + Multinomial Naive Bayes**.

Preprocessing lowercases, normalizes whitespace, and removes punctuation while retaining apostrophes and negation words. TF-IDF uses word unigrams/bigrams with sublinear term frequency. The original preprocessing and datasets were not modified.

Training still fits and evaluates Naive Bayes, Logistic Regression and Linear SVM. Future training runs retain Naive Bayes as the active model; the comparison winner is reported separately in metadata, ranked by weighted F1 then accuracy. This makes the requested academic core explicit. Existing metadata records the historical selection rule that produced the current Naive Bayes artifact.

Only these files are loaded for inference:

- `models/final_sentiment_model.pkl`
- `models/final_tfidf_vectorizer.pkl`

The service verifies the classifier is MultinomialNB and that model/vectorizer feature dimensions agree. Classes come directly from the classifier. Only trusted project artifacts should be loaded because pickle/joblib files can execute code.

Preserved, unused legacy/convenience artifacts:

- Root `sentiment_model.pkl` and `tfidf_vectorizer.pkl`: older baseline artifacts, not used by current interfaces.
- `models/sentiment_model.pkl` and `models/tfidf_vectorizer.pkl`: convenience copies produced by training, not used for inference.
- `backup/original_train_model.py` and `backup/original_dataset.csv`: historical baseline.

No artifacts were deleted or moved during stabilization.

## Dataset and actual evaluation

`Sentiment_dataset.csv` contains the original 60 responses. `sentiment_dataset_improved.csv` contains 600 generated responses, balanced across three classes, from the existing deterministic generator. Neither is an official government consultation dataset.

The existing protocol uses a stratified 80/20 split, random seed 42, fits TF-IDF on the training partition, and evaluates on 120 held-out rows. Existing accuracy and weighted F1 are both 1.0. These values are actual recorded results, **not evidence of general real-world accuracy**. Templates and vocabulary recur across partitions, and the historical test split was also used for model selection.

The applications read evaluation information from:

- `models/model_metadata.json`: model identity and split information.
- `outputs/model_comparison.csv`: actual evaluated metrics.
- `outputs/dataset_statistics.txt`: historical dataset size when absent from metadata.

New training runs additionally write dataset size, training size, evaluation metrics and comparison winner to metadata. Reports must belong to the same training run/artifacts; historical files have no checksum linkage. The applications do not silently recompute missing reports or substitute fabricated numbers.

Accuracy, precision, recall, weighted F1, classification report, comparison chart and confusion matrix remain in the training workflow. If intentionally regenerating reports/artifacts, run from the project root:

~~~powershell
.\venv\Scripts\python.exe analyze_dataset.py
.\venv\Scripts\python.exe train_model.py
~~~

Training overwrites trained artifacts and evaluation outputs. The generator is not required to run the existing app; explicitly running `generate_improved_dataset.py` overwrites the generated dataset.

## Verification and remaining limitations

The suite tests valid supported classes, malformed/type-invalid/empty/unsupported/oversized requests, request limits, shared inference, readiness, unavailable artifacts, generic failures, dynamic metrics, launch from another directory, CLI validation/export, and Streamlit prediction/Clear/example behavior. Runtime checks start Flask and Streamlit on temporary loopback ports, make actual HTTP requests, and stop both processes. Training is exercised into temporary output/model directories, with hashes checking that the real datasets and active model artifacts remain unchanged.

Dependencies remain the existing stack; Flask now has a minimum version of 3.1 for per-request transport limits. There is no additional runtime framework or large model. Other versions remain unpinned, so the environment is not fully reproducible across machines. A joblib/NumPy deprecation warning can appear with the installed versions; it does not prevent current tests or predictions.

This is a local, bounded analysis prototype. It has no multilingual model, calibrated confidence, independent real consultation benchmark, semantic aspect analysis, bulk-processing guarantees or million-response scalability claim. Duplicate input records are preserved and counted individually; no spam/deduplication system is claimed. Phrase discovery misses synonyms and may return generic or fragmentary labels. The frontend redesign does not change these model limitations.

## Phase 2 verification and measured scale

Run the full suite with `python -m unittest discover -s tests -v`. It includes JSON/CSV parity, no double-counting, evidence preservation, priority arithmetic, invalid rows, dates/categories, limits, backward compatibility, and real HTTP requests to `/health`, `/predict`, `/analyze`, and `/analyze-file`.

Run `python -m tests.benchmark_analysis` for reproducible bounded scale checks. One local warm-model run (including Flask test-client JSON serialization) measured:

| Dataset | Rows | Text characters | Elapsed |
|---|---:|---:|---:|
| Existing generated dataset | 600 | 78,272 | 0.132 s |
| Repeated generated fixture | 2,000 | 258,616 | 0.402 s |
| Repeated long fixture | 2,000 | 1,000,000 | 1.223 s |
| CSV repeated generated fixture | 2,000 | 258,616 | 0.495 s |

These are local measurements of generated/repeated fixtures, not an accuracy benchmark, concurrency test or production latency guarantee. Network overhead and cold model loading are excluded. The full JSON response at the character limit was approximately 1.49 MB. Different vocabulary/date/category diversity can change time and memory use.

Excel workbooks use a bounded openpyxl read (macros are not executed), read the first worksheet by default or an explicit `sheet`, coerce every cell to text, and require unique non-empty column headers. Excel analysis flows through the same `analyze_batch` records as paste and CSV, so the response envelope and model behavior are identical across all three input modes.
