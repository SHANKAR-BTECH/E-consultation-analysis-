# Consultation intelligence API — schema 2.0

The existing Flask server is the only backend. Start it from the project root with `venv\Scripts\python.exe server.py` (port 5000). The consultation frontend now consumes this contract; see [frontend verification](frontend-verification.md). No extension or URL extraction is implemented.

## JSON analysis

`POST /analyze`, `Content-Type: application/json`:

```json
{
  "responses": [
    {
      "id": "citizen-1",
      "text": "The portal keeps failing and nobody answers my complaint. Poor internet connectivity.",
      "date": "2026-01-02",
      "category": "Rural",
      "source": "consultation survey",
      "metadata": {"region": "South"}
    },
    {
      "text": "The portal keeps failing and nobody answers my complaint. Poor internet connectivity.",
      "date": "03/01/2026",
      "category": "Rural"
    },
    {"text": "The process was quick and very helpful."},
    {"text": "Applications will open on Monday according to the official notice."}
  ]
}
```

Only `responses` at the top level and `text` on each row are required. Unknown fields are ignored. Optional fields:

| Field | Accepted value |
|---|---|
| `id` | String or integer, at most 256 characters when stringified; defaults to 1-based input position; null/bool invalid |
| `date` | String up to 256 characters, or null; see date policy below |
| `category`, `source` | String up to 256 characters, or null; whitespace stripped, blank becomes null |
| `metadata` | Null or flat JSON object of string keys and scalar values (string, finite number, bool or null); serialized size <=2,000 characters |

Each row is counted independently. Duplicate IDs/text are allowed and do not trigger deduplication. The unique `row_index` is the 1-based position in this request and is used for evidence references. There are no persistent analysis IDs, server sessions or stored results.

Row text passes the existing Phase 1 validation: English prototype, <=5,000 characters including surrounding whitespace, usable letters, no non-Latin alphabetic characters, and at least one recognized TF-IDF feature. Unsupported rows are excluded with an explanation. Model/vectorizer/preprocessing and model classes are unchanged.

## CSV analysis and column selection

`POST /analyze-file`, `multipart/form-data`, exactly one file part named `file` with a `.csv` filename. Content must be UTF-8 (optional BOM), comma-delimited, with a unique, non-empty header. Quoted commas/newlines are supported. Header names are trimmed and must be unique ignoring case. Wrong field counts, malformed quoting, invalid UTF-8, null bytes, empty files and header-only files return 400. Blank data records count as invalid response rows rather than silently disappearing.

No file is saved. Blank lines count as records, but line breaks inside a quoted field do not create extra records. `row_index=1` means the first data record after the header, not necessarily physical line 2.

### Inspect before selecting columns

Send multipart `mode=inspect` plus `file`. The server validates the CSV structure without running ML and returns HTTP 200:

```json
{
  "columns": ["citizen_opinion", "submitted", "dept"],
  "row_count": 4,
  "suggested_mapping": {
    "text_column": null,
    "date_column": null,
    "category_column": null
  },
  "candidates": {"text_column": [], "date_column": [], "category_column": []},
  "requires_selection": true
}
```

This illustrates inspection of a four-record CSV with those headers. Row count is always parsed from the file. No response text is exposed in inspection output.

Automatic suggestions only use exact, case-insensitive header aliases:

| Mapping | Recognized aliases |
|---|---|
| `text_column` | feedback, comment, review, response, text |
| `date_column` | date, timestamp, submitted_at |
| `category_column` | category, department, service, type |

Exactly one matching header is required to auto-select a role. No arbitrary text-column guessing is performed. Multiple text candidates or no recognized text header require explicit selection. Header detection does not establish row validity; analysis still validates every mapped text value.

### Submit the selected mapping

Send the file again with `mode=analyze` (default) and optional string form fields:

| Form field | Meaning |
|---|---|
| `text_column` | Exact header name for feedback; mandatory when no unique suggestion exists |
| `date_column`, `category_column` | Selected header; omit to use unique suggestion, send empty string to disable |
| `id_column`, `source_column` | Optional explicit mapping; never guessed |
| `metadata_columns` | JSON-encoded array of unique existing header names, e.g. `["region","department"]` |

Mapped roles must use different columns. Unselected unrelated columns are ignored. Empty optional CSV cells become absent/null fields. Original text—including surrounding whitespace—is retained. An absent `source` remains null; the engine does not invent source provenance from filenames.

If text mapping is missing/ambiguous, HTTP 400 includes inspection information in `details`. If some text rows are invalid, HTTP 200 reports their exclusions. All-invalid mapped rows return HTTP 400. Successful CSV and JSON requests return the **same analysis object**, with no CSV-specific wrapper.

## Successful analysis object

HTTP 200, JSON. All fields below are present unless stated otherwise. Sentiment keys are dynamically taken from the actual model (currently `negative`, `neutral`, `positive`). Batch labels use lowercase; existing `/predict` labels remain title-cased.

| Top-level field | Type and semantics |
|---|---|
| `schema_version` | String `"2.0"` |
| `total_received` | Integer input record count, including invalid rows |
| `total_responses` | Integer valid/analyzed record count; denominator for aggregate percentages and global priority |
| `rejected_count` | Integer; `total_received - total_responses` |
| `rejected` | Ordered array of `{row_index: integer, message: string}` |
| `warnings` | Array of `{row_index: integer, message: string}`; currently unparseable dates on valid rows |
| `responses` | Valid normalized records in input order; schema below |
| `sentiment` | Distribution object, defined below |
| `keywords` | Array of `{keyword: string, count: integer}`; up to 25 labels |
| `topics` | Array of topic objects; up to 12 labels |
| `issues` | Array of candidate-issue objects; up to 10 labels, descending priority |
| `trends` | Availability/coverage object with daily points |
| `categories` | Availability/coverage object with category groups |
| `summary` | Deterministic textual summary of measured findings |
| `analysis_notes` | Method labels, limits/thresholds and confidence caveat |

### Response record

Every valid record contains:

```text
row_index: integer (unique within this request)
id: string | integer (supplied ID, otherwise row_index)
text: string (original text, never rewritten)
sentiment: string (lowercase model class)
confidence: number (0–1, six decimal places)
input_length: integer (length after surrounding whitespace is stripped)
word_count: integer (whitespace-separated words after stripping)
date: YYYY-MM-DD string | null
date_input: string | null (trimmed supplied date, including unparseable values)
category: string | null
source: string | null
metadata: object | null
```

Original `text` can therefore be longer than `input_length`. Metadata is pass-through data, not a model feature. Only date and category have additional analytics in this phase.

### Distribution object

```text
counts: {actual_model_class: integer, ...}
percentages: {actual_model_class: number, ...}
average_confidence: number | null
```

Counts sum to the population represented by this object. Percentages are counts/population * 100, rounded to four decimal places; rounding may prevent an exact 100 sum. Average confidence is the arithmetic mean of returned model probabilities, rounded to six places. It is not calibrated accuracy. At the top level the population is all valid rows; each date/category uses only its own rows.

### Topic object

```text
topic: string (exact normalized phrase)
count: integer (matching response count)
sentiment: {actual_model_class: integer, ...}
response_indices: integer[] (sorted row_index references)
```

Topics overlap and are not an exclusive partition. Their counts must not be added to estimate total responses. Matching a topic does not assert that the entire response is about that topic.

### Candidate issue object

```text
issue: string
mentions: integer
negative_mentions: integer
negative_ratio: number (six places)
sentiment: {actual_model_class: integer, ...}
priority: PriorityObject
response_indices: integer[]
representative_feedback: RepresentativeObject[] (up to 3)
```

`PriorityObject`:

```text
score: number (0–100, four places)
level: "HIGH" | "MEDIUM" | "LOW"
signals:
  coverage: number (mentions / population, six places)
  negative_ratio: number (six places)
  frequency_weight: number
  negative_weight: number
  frequency_contribution: number (four places)
  negative_contribution: number (four places)
```

`RepresentativeObject`: `row_index`, `id`, `text`, `sentiment`, `confidence`, with the same types as the response record. These are source quotations, not generated summaries. Rank: negative rows first, descending model confidence, shorter original text, input order. Confidence is a selection heuristic, not evidence that the quoted opinion is true. Identical original quotes can occur when duplicate input records exist.

An observed result excerpt from the four-response test fixture (two negative rows containing the phrase, one positive, one neutral) is:

```json
{
  "total_responses": 4,
  "sentiment": {
    "counts": {"negative": 2, "neutral": 1, "positive": 1},
    "percentages": {"negative": 50.0, "neutral": 25.0, "positive": 25.0},
    "average_confidence": 0.858896
  },
  "issues": [{
    "issue": "poor internet connectivity",
    "mentions": 2,
    "negative_mentions": 2,
    "negative_ratio": 1.0,
    "priority": {
      "score": 80.0,
      "level": "HIGH",
      "signals": {
        "coverage": 0.5,
        "negative_ratio": 1.0,
        "frequency_weight": 0.4,
        "negative_weight": 0.6,
        "frequency_contribution": 20.0,
        "negative_contribution": 60.0
      }
    }
  }]
}
```

This is a **partial excerpt**, omitting other returned fields/issues. The test fixture repeats the phrase within its first response to verify it still contributes just one mention. These values are test observations, never application constants.

### Trends

```text
available: boolean
reason: string | null
dated_responses: integer
undated_responses: integer
points: [
  {date: YYYY-MM-DD, total_responses: integer,
   sentiment: DistributionObject,
   issue_mentions: {selected_global_issue_phrase: integer, ...}}
]
```

Points are sorted by date. Only actual dates with responses are emitted; gaps are not filled with invented observations. Dates accept ISO dates/timestamps, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY, and `2 Jan 2026`/`2 January 2026`. Slash/hyphen day-first formats are **always day-first**: `03/04/2026` is April 3. No locale guessing, epoch timestamp parsing, relative dates or fuzzy parsing. Timestamp offsets do not shift the source calendar day to UTC.

Unparseable dates remain in `date_input`, normalize to null, and create a warning. Those responses still count in all non-temporal analytics. No valid dates means `available=false`, an explanatory reason, `points=[]`, and `dated_responses=0`.

### Categories

```text
available: boolean
reason: string | null
categorized_responses: integer
uncategorized_responses: integer
groups: [
  {category: string, total_responses: integer, sentiment: DistributionObject,
   issues: [{issue: string, mentions: integer, negative_mentions: integer, priority: PriorityObject}]}
]
```

Category labels preserve case and are sorted lexically. A row belongs to at most one category. Groups only contain existing non-blank categories. Group issues intersect the **selected global issues** with that group, then apply the same recurrence/negative thresholds and local-population priority. Topics unique to a small category may be absent from global top issues and therefore absent here; no separate local topic model is implied. No categories means `available=false`, an explanatory reason and `groups=[]`.

### Analysis notes

`analysis_notes` contains string fields `summary_method`, `topic_method`, `issue_method`, `confidence`, and `priority_formula`; boolean `term_limit_reached`; integer `unique_terms_considered`; `issue_thresholds` with `minimum_mentions`, `minimum_negative_mentions`, `minimum_negative_ratio`; and `priority_thresholds` with `high` and `medium`.

If term discovery reaches its cap, sentiment/record counts remain complete but phrase insights are limited to the retained vocabulary. Show this limitation. Terms already retained continue accumulating full counts across later records. New terms beyond the cap are not admitted; this introduces input-order bias at the cap.

## Explainable methods

1. **Sentiment:** original shared English preprocessing, saved TF-IDF feature transform and Multinomial Naive Bayes probabilities. Single and batch use the same prediction code. Sparse transforms/model calls are chunked at 128 rows. No retraining occurs during analysis.
2. **Keywords:** collect exact contiguous 1–3-word English phrases from each response. Lowercase, exclude scikit-learn's English stopwords except `not`, `no`, `never`, and omit tokens shorter than two letters. Do not join across punctuation, line breaks, numbers or omitted stopwords. Each response uses a term set, preventing repeated occurrences from inflating mention counts.
3. **Topics:** rank phrase candidates by `document_mentions * (1 + 0.5 * (phrase_word_count - 1))`. Lexical order breaks ties. Retain labels with matching response indices and sentiment counts. To reduce redundant labels, suppress a candidate if it shares words with an already selected label and matching-response sets have Jaccard overlap >=0.8. Suppression never merges or changes counts. No predetermined topic names, stemming, synonym grouping, embedding model or semantic reasoning is used.
4. **Issues:** candidate phrases require >=2 matching responses, >=2 model-negative matches, and negative ratio >=0.5. Rank by priority, then longer phrase, then lexical order; apply the same redundant-label suppression. A response may match multiple issues, but once per issue. Negative association is based on whole-response sentiment and can misattribute an aspect in mixed feedback.
5. **Priority:** `100 * (0.4 * coverage + 0.6 * negative_ratio)`. Coverage = mentions/valid population. Weights explicitly favor negative association while also accounting for prevalence; they are heuristic, not learned severity estimates. HIGH >=75, MEDIUM >=50, LOW otherwise (levels use the unrounded score). No emergency or critical-issue classification exists. Two negative mentions in a two-response dataset can score 100; consumers should show the absolute counts and sample size beside the level.
6. **Summary:** fixed templates populated with valid response count, model sentiment leader (or tie), up to three leading topic labels and up to three ranked issues/levels. The summary never adds policy recommendations, causal explanations or invented quotations. Absence of eligible recurring issues is explicitly stated.

## Errors and limits

The existing `/predict` success/error contract is unchanged. Both analysis endpoints use:

```json
{"error": true, "message": "Description", "details": {}}
```

`details` is optional and omitted when unused. Missing column selection includes the inspection object there. All-invalid rows include `{total_received, rejected}` there.

- 400: invalid request shape, empty/oversized batch, invalid CSV/mapping, body/file limits, or no valid rows.
- 200: at least one valid row; inspect `rejected_count`, `rejected` and `warnings` before presenting results.
- 503: saved model/vectorizer unavailable.
- 500: unexpected processing failure, with a generic public message and internal logs.

Limits are configured in `config.py`:

| Limit | Value |
|---|---:|
| Input records (including invalid) | 2,000 |
| Characters in one response (before trim) | 5,000 |
| Combined response text characters | 1,000,000 |
| Analysis HTTP request bytes, including multipart overhead | 6,500,000 |
| CSV bytes | 5,000,000 |
| CSV columns | 50 |
| Metadata serialized characters per row | 2,000 |
| Distinct phrase candidates retained | 50,000 |
| Inference chunk size | 128 |

Limits reject the request rather than silently truncating records/text. The explicit phrase-candidate cap is the exception and reports truncation. The standard CSV parser also rejects unusually large individual fields with a controlled malformed-CSV error. Requests/results are bounded in memory, synchronous and not streamed to the client. There is no cancellation, pagination, persistent storage, progress polling, concurrency guarantee or million-record claim.

## Frontend integration

Use the server's returned analytics directly. For JSON:

```javascript
const response = await fetch('/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ responses: sourceRows })
});
const result = await response.json();
if (!response.ok) throw new Error(result.message);
// Keep the entire result, including excluded-row and availability information.
```

For CSV inspection:

```javascript
const body = new FormData();
body.append('file', selectedFile);
body.append('mode', 'inspect');
const response = await fetch('/analyze-file', { method: 'POST', body });
const inspection = await response.json();
```

After selection, create a new FormData with the same file, `mode=analyze`, `text_column`, and selected optional mappings. **Do not set the multipart Content-Type yourself**; the browser supplies its boundary.

Integration rules:

- Show an indeterminate processing state until the synchronous request completes. There is no real stage-progress endpoint.
- Label the analysis population using `total_responses`; expose `total_received` and rejected rows so users can see coverage.
- Display percentage numbers as already-percent values, but multiply `confidence` by 100 for a confidence percentage.
- Use `row_index` for evidence lookup; source IDs may repeat. Display returned original quotes using text rendering, not unsafe HTML.
- Show `priority.level` together with mentions, negative ratio, sample size, and score contributions. Do not call it model confidence or verified severity.
- Render trends/categories only when their `available` fields are true. Do not interpret missing observations as zero sentiment.
- Do not sum overlapping topic/issue counts into a total population.
- Handle HTTP/network errors separately from valid partial results. There is no automatic URL fallback endpoint yet.
- Calls are intended for the same origin. A separately hosted frontend requires a deliberately configured proxy/CORS policy later; broad CORS and extension permissions were not added here.

The future URL adapter must return identifiable public feedback records into `analyze_batch`, with bounded extraction and provenance. No URL is fetched in this phase; consultation document bodies, menus and page navigation must not be treated as citizen responses.

## Verification and academic limits

Run `python -m unittest discover -s tests -v` and `python -m tests.benchmark_analysis` using the project virtual environment. Tests cover exact source evidence, count identities, API parity and failures, CSV mapping/structure, date/category coverage, input bounds, and actual HTTP requests against the Flask application. README records measured local sizes/timings.

TF-IDF is an explainable representation weighting informative terms; Naive Bayes supplies a lightweight probabilistic classifier using learned class/feature statistics. Those academic components remain unchanged. The generated dataset's accuracy does not establish real consultation accuracy, and batch aggregation cannot repair model errors. Phrase labels may be generic or incomplete; exact matching misses paraphrases and synonyms. Duplicate/spam detection, language identification, calibrated confidence and semantic aspect sentiment remain future work.
