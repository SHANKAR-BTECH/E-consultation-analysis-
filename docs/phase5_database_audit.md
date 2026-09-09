# Phase 5 — Persistent consultation and analysis backend: audit

Audit date: 8 September 2026. **Audit only: no database, migrations, dependencies, UI, model or API implementation changes.** Code at the checkpoint below is authoritative where older documentation differs. Proposed entities are conceptual requirements, not approved table definitions.

## Checkpoint, scope and verification

- Initial `git status --short --branch`: clean `main...origin/main`.
- Existing safe checkpoint: `6b42f398377f72235789907514e26dca79bc4eef` — `Improve ML training with government consultation dataset`. No additional checkpoint commit was necessary for a documentation-only addition; no reset, checkout, deletion, commit or push was performed.
- Read the Flask routes and service implementations; traced the active React entry point, API client, results composition and intelligence helpers. Inspected configuration, dependency manifests, tracked-file searches, model metadata/hashes, tests and relevant documentation.
- Ran `python -m unittest tests.test_analysis tests.test_foundation tests.test_frontend_source -q` using the existing venv: **47 tests passed**. Did not run `tests.test_runtime.test_training_in_temporary_directory` or any training/generation command. No retraining occurred.
- Used the Flask test client to enumerate routes, verify actual response keys, duplicate external IDs, rejected rows/date warnings, and the `/predict` input mismatch described below. Loaded the existing inference service for inspection only.
- This was a source/contract audit, not a new browser certification or production deployment audit. Existing React decision-support logic has no dedicated test suite in the inspected manifests/tests; `tests/frontend.test.mjs` exercises the older `static/js/` modules, not React.

### Files inspected

Core: `server.py`, `analysis_service.py`, `model_service.py`, `csv_ingestion.py`, `text_insights.py`, `config.py`, `text_utils.py`, `evaluation_info.py`; the inference/session/export portions of `app.py` and `predict.py`; relevant training/promotion sections of `train_v3.py` (not executed).

React: `frontend/src/main.jsx`, `App.jsx`, `lib/api.js`, `lib/utils.js`, `lib/consultationIntelligence.js`, `components/ResultsSection.jsx`, `RequestsSection.jsx`, `NegativeFeedbackSection.jsx`, `RecommendationsSection.jsx`, `IssueDialog.jsx`, `TrendGraph.jsx`, and field-use inspection of `CitizenExplorer.jsx` and `QualitySection.jsx`. Traced component imports rather than treating every unused component as an active feature.

Configuration/inventory: `requirements.txt`, `.gitignore`, `frontend/package.json`, `frontend/package-lock.json` inventory/search, `frontend/vite.config.js`, `frontend/README.md`, `templates/`, `static/`, `frontend/dist/` inventory, model directories/metadata and active artifact hashes. Searched tracked source/configuration for database drivers, ORM/migrations, environment access, fetch calls, routes and browser storage. No project `.env` files or database-related environment variable names were found in the inspected shell; secret values were not printed. This does not assert that PostgreSQL is absent from the machine, only that this application has no database integration.

Tests/docs: `tests/test_analysis.py`, `test_foundation.py`, `test_frontend_source.py`, `test_runtime.py`, `frontend.test.mjs`, `frontend_fault_server.py`, fixture inventory; `README.md`, `docs/analysis-api.md`, `frontend-verification.md`, `server-frontend-resolution.md`, `ml_documentation.md`, `ml_training_progress.md`.

## A. Current architecture

### Application boundaries

```text
React (Vite development server :5173)
  -> relative fetch -> Vite proxy -> Flask :5000
       -> JSON normalization / CSV parsing and mapping
       -> analysis_service.analyze_batch
       -> cached model_service -> preprocessing -> TF-IDF -> MultinomialNB
       -> text_insights -> schema 2.0 JSON
  <- React useState result
       -> browser-side consultationIntelligence synthesis
       -> decision-support components + limited localStorage history

Flask / -> templates/index.html + static/css + static/js (also still present)
Streamlit app.py / CLI predict.py -> shared model_service directly
```

Flask remains the only REST backend. `server.py` does **not** currently mount `frontend/dist` or serve a React SPA: `/` renders Jinja `index.html`. React's `main.jsx` mounts `App.jsx`, which mounts `ResultsSection`. Vite's development proxy maps `/health`, `/predict`, `/analyze` and `/analyze-file` to `127.0.0.1:5000`. The `preview` command has no explicit API proxy configuration. Deployment/routing must therefore be documented separately from persistence; this audit does not modify either UI or server routing.

There is no repository layer, database session, SQL schema, ORM, migration configuration, user authentication, consultation CRUD, saved-analysis endpoint, job queue or server-side analysis session. The requested future boundary is **React → Flask REST API → service layer → PostgreSQL**. Database credentials, connections, SQL and authorization enforcement must remain server-side. React must never connect directly to PostgreSQL.

### Runtime, environment and model provenance

- Python requirements: pandas, numpy, scikit-learn, joblib, streamlit, matplotlib, seaborn and `flask>=3.1`. No declared PostgreSQL driver, SQLAlchemy or Alembic. Most Python versions are unpinned.
- React 19, React DOM, Chart.js; Vite/React plugin/Oxlint tooling. Package scripts are dev/build/lint/preview, not database or React tests. No application database URL or frontend API-base environment setting exists in the inspected configuration.
- `config.py` uses paths relative to the repository, not the shell working directory. Flask debug is off, template auto-reload is enabled, frontend cache handling is explicit. `/health` currently reports model readiness only.
- Actual active files are **only** `models/final_sentiment_model.pkl` and `models/final_tfidf_vectorizer.pkl`. `get_service()` loads once per process via `lru_cache(maxsize=1)`; predictions currently contain no model-version field.
- Inspection: `MultinomialNB`, 1,311 features, TF-IDF n-gram range `(1,1)`, classes `negative`, `neutral`, `positive`. Active files match the archived `models/model_v3/` pair by SHA-256:
  - Model: `497888DCC4801A5D1DE5F48FC2B5160C05E38DB6AA95D4261CF42963AB911927`
  - Vectorizer: `7E4F15FED3E6A3A104CB8D42E7BF73AC8F45EF7859F4436288ECD4988377FEE4`
- Active metadata identifies v3, 10,200 synthetic civic records, final training size 9,180 and test size 1,020. The training script refits on train+validation, explaining why final training size differs from the original 8,160 training split. Archived v1/v2/v3 and other convenience/root artifacts exist; do not infer active identity from a directory name alone.
- Documentation drift matters for provenance: `docs/ml_documentation.md` describes contraction/Unicode normalization and a backend aspect extractor that the inspected `text_utils.py`/`analysis_service.py` do not implement. Actual preprocessing lowercases, collapses whitespace and removes non-ASCII alphanumeric punctuation except apostrophes; decision-support extraction is in JavaScript. `config.DATASET_PATH` still names the older improved dataset, not v3. Do not use that path or prose alone as the future analysis model manifest.

## B. Current data flow

1. **Consultation entry:** there is no consultation resource, title, owner, stable identifier or period. A user submits an ad-hoc batch. React paste parsing splits lines/paragraphs, trims each response and removes empty entries before sending `{responses:[{text}]}`. Thus backend verbatim preservation starts at the text actually submitted, not the untrimmed textarea. The local source label/sample label is not sent as consultation metadata.
2. **CSV:** React retains a browser `File`, uploads it for `mode=inspect`, then uploads it again with `mode=analyze` and selected columns. Flask parses the bounded stream and maps selected fields. File bytes, original columns, filename and mapping are not saved. Unselected columns are discarded. CSV record position is not necessarily the physical line number because quoted multiline fields are supported.
3. **Normalize:** `analyze_batch` assigns 1-based `row_index`, preserves the provided text, accepts a caller ID or defaults it to the row position, trims optional strings, preserves a trimmed `date_input` and derives the source calendar date. Invalid normalized rows generate rejection records.
4. **Predict:** shared validation screens English/non-Latin/length/vocabulary; sparse inference runs in chunks of 128. Invalid rows receive a message, not a fallback prediction. Valid rows gain the predicted class, confidence and lengths. Batch classes are lowercased.
5. **Derive backend findings:** `build_insights` builds exact-phrase memberships, aggregate sentiment, topics, recurring negative-associated issues, priority signals, representative original responses, source-date trends, categories, summary and method notes. All of this is local to the request.
6. **Return/display:** Flask returns the full schema-2.0 object. React stores it in `analysisResult`, derives additional requests/problems/recommendations in `useMemo`, and filters/paginates the full in-memory response list. No filter or evidence action fetches a persisted entity.
7. **Limited history:** React saves a small summary record to origin-specific localStorage. It does not send that history to Flask. This history is different from backend source-date trends and cannot restore original evidence.

## C. Existing entities/data structures

### Authoritative backend structures

| Concept | Actual representation and identity |
|---|---|
| Consultation | Implicit input batch only; no record or durable identity |
| Submitted response | JSON object with required `text`, optional `id`, `date`, `category`, `source`, `metadata` |
| Normalized valid response | `row_index:int`, `id:string|int`, `text:string`, `date_input:string|null`, `date:ISO-date|null`, `category/source:string|null`, `metadata:flat-object|null`, plus prediction fields |
| Prediction | `sentiment:string`, `confidence:number 0–1`, `input_length:int`, `word_count:int`; confidence rounded to six places. No separate prediction ID, all-class probabilities, model fingerprint, timestamp or human label |
| Rejection / warning | `{row_index:int,message:string}`; rejected text/metadata are absent from output; date warnings apply to valid rows |
| Analysis | Complete result object, no analysis ID, creation time, consultation reference, input manifest or persisted lifecycle |
| Distribution | `{counts:{class:int}, percentages:{class:number}, average_confidence:number|null}`; percentages 0–100 rounded to four places |
| Keyword | `{keyword:string,count:int}`; response mention counts, up to 25 |
| Topic | `{topic,count,sentiment:{class:int},response_indices:int[]}`; up to 12 overlapping exact phrases |
| Issue | `{issue,mentions,negative_mentions,negative_ratio,sentiment,priority,response_indices,representative_feedback}`; up to 10 per run, not operational tickets |
| Priority | `{score,level,signals:{coverage,negative_ratio,frequency_weight,negative_weight,frequency_contribution,negative_contribution}}`; heuristic, not verified severity |
| Representative evidence | `{row_index,id,text,sentiment,confidence}`; at most three selected whole responses per issue, not every supporting response and no span offsets |
| Backend trends | `{available,reason,dated_responses,undated_responses,points:[{date,total_responses,sentiment,issue_mentions:{phrase:count}}]}` |
| Categories | `{available,reason,categorized_responses,uncategorized_responses,groups:[{category,total_responses,sentiment,issues:[{issue,mentions,negative_mentions,priority}]}]}` |

`row_index` is unique **only within a request**. Caller `id` may be duplicated; both string and integer values are accepted. Duplicate text also counts independently. Array position is not a durable ID: rejected rows leave gaps, and issue/topic selection and ordering can change with inputs or algorithms.

Issues require at least two mentions, at least two negative responses and negative ratio ≥0.5. Score is `100*(0.4*mentions/valid_responses + 0.6*negative_mentions/mentions)`; HIGH ≥75, MEDIUM ≥50, otherwise LOW. Membership is deduplicated within a response, not across duplicate response records. Evidence ranking is negative first, then descending confidence, shorter text and input order. Preserve complete membership **and** representative rank, not just three quotes or a count.

### Browser-side decision support: not current Flask entities

| Concept | Current JavaScript fields / behavior |
|---|---|
| Raw citizen request | `extractRawRequests`: `{responseIndex,id,text,originalSentence,fullText,sentiment,confidence}`. Regex sentence detection and cleaned actionable text; not an HTTP request |
| Grouped request | `extractRequests`: `{title,targetDomain,count,priority,representativeQuote,supportingResponses,evidenceCount,suggestedFollowUp,stage}`. Grouping matches issue words against full response text and deduplicates titles |
| Issue/request link | `linkIssueToRequests` returns up to three matching **text strings**, or a fallback message. No issue/request IDs or separate relationship object |
| Enriched negative issue | `{issue,displayTitle,negativeCount,percentage,priority,explanation,representativeFeedback,supportingResponses,linkedRequests,suggestedFollowUp,recurrenceNote,workflow}`. Either enriched backend issue or browser-generated water/supply/pipeline fallback |
| Improvement | `{title,evidence,responseIndex,confidence,remainingConcerns,stage}`; regex-derived, maximum six |
| Mixed feedback | `{responseIndex,fullText,reportedImprovement,remainingConcern,publicRequest,interpretation,suggestedFollowUp,confidence}`; maximum five |
| Recommendation | `{actionVerb,title,problem,evidence,relatedRequest,guidance}` from `synthesizeRecommendations`; templated follow-up, no recommendation ID, approval, author or durable evidence FK |
| Priority action / key finding | Derived ranked/display records including supporting row indices, counts and explanatory text; no administrative task persistence |
| Executive/overall narrative | Browser-generated prose, separate from Flask's `summary`; not source testimony or verified human decisions |

Important evidence-quality distinctions to resolve before persisting these as authoritative facts:

- Grouped request counts count extracted sentence records, and `supportingResponses` can repeat a row index. They are not guaranteed unique response counts. Similar titles do not establish stable request identity.
- Substring-based issue/request matching is heuristic, not a reviewed relationship. Store match method and provenance; never turn a fallback message into a request row.
- `extractNegativeIssues` uses `issue.mentions` as `negativeCount`, not `negative_mentions`; these can differ. Browser fallback problems hardcode `percentage:100` for individual matches, even for larger batches. Preserve original backend numbers separately.
- Backend representative evidence is an object array; browser fallback evidence is a string array. `NegativeFeedbackSection` directly renders each quote, so backend objects are a potential rendering incompatibility. This is a source finding, not a browser reproduction in this audit.
- `ResultsSection` invokes `synthesizeRecommendations(data.issues, requests, mixed)` without its fourth `negativeIssues` argument. Therefore recommendations do not necessarily use the enriched/fallback problems shown elsewhere. The recommendation helper may choose the first unrelated request or construct a non-quotation fallback as `evidence`. Such text must not become an original-evidence row.
- Water-specific rules and phrases such as “verified” in the UI are not proof of civic truth or human verification. Keep derivation type, algorithm version and review status explicit; no UI changes are made here.

## D. Existing API contracts

### Routes and active React dependencies

| Route | Input | Success | React dependency |
|---|---|---|---|
| `GET /` | None | HTML, Jinja frontend | Not the Vite React entry point |
| `GET /static/<path>` | Asset path | Static response | Existing non-React frontend |
| `GET /health` | None | 200 `{status:"ok",model_loaded:true,classes:string[]}` | `checkHealth()` on mount; `model_loaded` gates readiness |
| `POST /predict` | JSON `{feedback:string}` | 200 `{sentiment:TitleCase,confidence,input_length,word_count}` | Exported helper exists but is not used by active `App` |
| `POST /analyze` | JSON `{responses:ResponseInput[]}` | 200 complete analysis object below | `analyzeResponses(strings)` maps strings to `{text}` |
| `POST /analyze-file` | Multipart exactly one `.csv` file plus `mode`/mapping | 200 inspection or same complete analysis object | `inspectFile`, then `analyzeCsv` |

Flask also supplies automatic OPTIONS and GET-route HEAD handling. No users/consultations/history/requests/recommendations/evidence CRUD routes, auth headers, pagination parameters, streaming response or job-status endpoint exist.

**Confirmed dormant mismatch:** React `predictFeedback(text)` sends JSON `{text}`, but Flask requires `{feedback}`. Test-client `{text:...}` returns 400. Do not redefine the server contract to match the unused helper; capture it as an existing client issue for separately authorized correction.

### Input validation and CSV inspection

- JSON top-level `responses` must be a nonempty array. Unknown top-level and row fields are ignored. `text` must be a string; caller ID must be string/int, non-bool/non-null, stringified length ≤256. Optional date/category/source are strings ≤256 or null. Metadata is flat JSON with finite scalar values, serialized length ≤2,000 characters.
- Limits: 2,000 responses; 5,000 characters per response; 1,000,000 combined text characters; 5,000,000 CSV bytes; 50 columns; analysis transport 6,500,000 bytes. `/predict` transport is `MAX_INPUT_CHARACTERS*12+1024` bytes. These limits are not database capacity targets.
- React currently imposes **stricter** 500,000 characters and 1,048,576 CSV bytes in `App.jsx`; do not silently synchronize them in a database change.
- CSV must be comma-delimited UTF-8 (BOM accepted), nonempty unique case-insensitive headers, valid field counts/quoting. Inspection returns `{columns:string[],row_count:int,suggested_mapping:{text_column,date_column,category_column},candidates:{text_column:string[],date_column:string[],category_column:string[]},requires_selection:bool}`. Suggestions may be null.
- Analysis mode accepts `text_column`, `date_column`, `category_column`, `id_column`, `source_column`, plus `metadata_columns` JSON string array. Omitted optional fields may auto-detect; **explicit empty disables auto-detection**. Distinct mapped roles are required. React explicitly submits blank values and, when inspection lacks a text suggestion, currently selects the first column locally. Preserve this transport behavior; inspection itself does not guess the first column.
- Dates: ISO dates/timestamps, year-first slash and listed day-first formats; retain calendar day from source without UTC shifting. Invalid date does not reject otherwise valid text; it generates a warning and excludes only that date from trends.

### Exact schema-2.0 analysis envelope

```text
schema_version: "2.0"
total_received: integer
total_responses: integer
rejected_count: integer
rejected: [{row_index, message}]
warnings: [{row_index, message}]
responses: [normalized valid response + prediction fields from section C]
sentiment: Distribution
keywords: [{keyword, count}]
topics: [Topic]
issues: [Issue]
trends: TrendCoverageAndPoints
categories: CategoryCoverageAndGroups
summary: string
analysis_notes: {
  summary_method, topic_method, issue_method,
  term_limit_reached: boolean, unique_terms_considered: integer,
  issue_thresholds: {minimum_mentions, minimum_negative_mentions, minimum_negative_ratio},
  priority_thresholds: {high, medium}, confidence, priority_formula
}
```

See section C for nested fields and `docs/analysis-api.md` for the existing contract. `requests`, `recommendations`, `analysis_id`, `consultation_id`, model version and analysis timestamps are **not** currently returned. An empty issues list is valid. Arrays are present even when unavailable; trend/category unavailable state uses `available:false` and explanatory `reason`, not invented points.

React `validateAnalysis` requires exact string version `"2.0"`, nonnegative integer totals, sentiment object, summary string, six array fields (`responses/rejected/warnings/keywords/topics/issues`) and typed response `row_index/text/sentiment/confidence`. Components additionally depend on nested sentiment distributions, category groups, topic membership, priority signals and representative fields. Do not confuse the relatively shallow validator with the complete UI contract. All valid rows must still be returned: client-side filters and ten-row pagination require the full array. Batch sentiment is lowercase; `/predict` remains title-cased. Preserve nullability, numeric JSON types, roundings and stable ordering on replay.

### Errors and lifecycle

- Controlled errors: `{error:true,message:string}`, optional `details` for `AnalysisError`.
- 400: malformed/type-invalid/oversized input, invalid CSV mapping, all-invalid batch. All-invalid details include `total_received` and ordered `rejected`; no synthetic empty successful analysis.
- Partial validity: 200 with rejected list and valid-only totals. `total_received = total_responses + rejected_count`.
- 503: model unavailable; health returns `{status:"unavailable",model_loaded:false,classes:[]}`. 500: unexpected inference/analysis failure with generic message.
- React uses a 90-second AbortController, parses JSON, checks status/`error`, and preserves inputs on errors. Aborting does not prove the server stopped. A future persisted retry must not duplicate a run accidentally, but identical intentionally submitted citizen rows must remain distinct.

## E. What is currently lost after analysis/session

| Data | Current lifetime / loss |
|---|---|
| Submitted JSON, CSV bytes, headers/mapping, unused fields | Request/parser/browser file only; no durable import manifest. Multipart may use temporary framework spooling, not application persistence |
| Full analysis and source evidence | React component state / request locals; lost on refresh, closing state or replacement by another analysis |
| Rejected original records | Not returned in analysis; only positions/messages survive in the current response. Cannot reconstruct from result JSON alone |
| Citizen requests, enriched issues, recommendations | Derived in browser memory; cannot be recovered exactly after changing helper rules without a versioned snapshot |
| User/consultation ownership, run actor, input/model version | Not collected or attached at all; cannot reconstruct retrospectively |
| React history | localStorage key `consultation_analytics_history_v1`; survives refresh on that browser origin, not cross-device/server-backed; manually clearable and storage failures return empty history |
| Streamlit input/result | `st.session_state`, not a persistent database |
| CLI history | In-memory list, then optional replacement of `outputs/predictions.csv` on exit; not shared web history |
| Artifacts, datasets, evaluation outputs | Persist as local files; not operational consultation records |

Local history fields: `timestamp` (browser run time), `label`, `source`, `total_responses`, one-decimal `positive_pct/neutral_pct/negative_pct`, `top_issue`, `top_request`. Maximum 20 records. Deduplication compares same source and count within five seconds, not content or consultation ID. Reopening results later can create another history point. `interpretation` is assigned after `saveRecord` writes storage and is not written back. No raw responses, IDs, complete findings, model version or source-date coverage survive in history.

Consequently these points are **analysis-run summaries**, not established comparable consultation periods. They may mix samples, different sources and different models. They must not be silently imported as complete consultations, verified trends or recoverable evidence.

## F. Proposed persistence requirements

### Minimum evidence-preserving design

Use durable internal IDs separate from API `id` and `row_index`. Preserve immutable input snapshots and analysis versions; a reanalysis creates a new run rather than overwriting earlier predictions/evidence. A result snapshot can preserve schema-2.0 replay, but dashboard JSON alone is insufficient for rejected inputs, provenance, authorization or relational integrity.

| Candidate entity | Recommendation derived from current flow |
|---|---|
| `consultations` | Core new aggregate: stable ID, title/source context and optional defined period, lifecycle and ownership. None of these should be fabricated from an issue label or CSV filename |
| `responses` | Core: durable ID, consultation/import membership, source record position, raw submitted record/text, external ID with original type, optional provenance/metadata. Preserve duplicates and rejected submissions; invalid records may lack valid text, so retain raw payload separately from normalized valid-text columns |
| `analyses` | Core immutable run: consultation, selected input manifest/version, start/completion times, state/error summary, schema version, model/preprocessing/insight rule fingerprints, configured thresholds/limits, full replay snapshot and content hash |
| `analysis_responses` (additional) | Necessary run/input junction: analysis ID, response snapshot ID, request-local row index, acceptance/rejection reason, date warnings, normalization snapshot. Allows the same response to participate in multiple runs with different outcomes and row order |
| `sentiment_predictions` | Core per accepted analysis-response, with label/confidence/lengths and reference to the run's model identity. No prediction for rejected records. Do not add invented probabilities not returned by today's service |
| `issues` | Per-analysis derived issue, original phrase, counts, priority/signals, method/version and rank. Separate backend recurring issues from browser fallback interpretations. Operational issue tracking/cross-run identity should be a later, explicit domain concept |
| `evidence` | Response-backed quote/span references with analysis, immutable response snapshot, source type, optional span offsets, exact excerpt, selection method and rank. Whole-response evidence needs no fabricated offsets. Distinguish verbatim text from cleaned request text or generated guidance |
| `issue_response_links` / `topic_response_links` (additional) | Preserve **all** supporting memberships, not only representatives. Use same-run foreign-key constraints; quote selection is a subset, not the full relationship |
| `requests` | Deferred authoritative entity until request extraction is defined/versioned in the service layer. Model a raw request occurrence separately from its grouped presentation; one response can contain several requests. Do not use HTTP request logs or cleaned title as the identity |
| `issue_request_links` | Deferred many-to-many derived/reviewed associations, same analysis scope, linking method/version and supporting evidence. No link when only a fallback sentence exists |
| `trend_snapshots` | Optional later materialization, keyed to analysis + source date/category or explicitly defined period/cohort. Keep source-submission day and analysis time separate; never count repeat analyses as fresh citizen feedback |
| `users` | Needed once authenticated ownership/review is in scope, but no current user model exists. Define actor/tenant/roles before creating credentials or requiring login. Anonymous legacy requests must not be silently assigned a fake human owner |
| `audit_logs` | Append-only service events: actor/service identity, action, target/run IDs, timestamp, correlation and outcome. Avoid duplicating sensitive response text/secrets in logs. Retention/redaction and access are policy decisions, not default unlimited retention |
| Import/source manifest (additional) | Required to preserve CSV filename, content hash, selected columns/metadata mappings, encoding/parser version, source type, receipt time and optional retained file reference. Preserve paste separator/sample provenance only when actually supplied |
| Model manifest (additional) | Immutable fingerprints for model, vectorizer, preprocessing/insight code, config and metadata snapshot; artifact storage can remain file/object-based. No need to store executable pickles in PostgreSQL |
| Recommendations / decision-support snapshot (additional) | Preserve as explicitly derived output with version, source issue/request/evidence links and optional future reviewer status. A versioned run snapshot is sufficient initially; add normalized entities only when review/edit/history requirements justify them |

### Relationships and integrity

```text
consultation 1 -> many source imports -> many immutable responses
consultation 1 -> many analyses
analysis many <-> many responses via analysis_responses (order + validation)
accepted analysis_response 1 -> 1 sentiment_prediction
analysis 1 -> many issues/topics
issue/topic many <-> many analysis_responses via membership links
evidence -> immutable response + analysis context
request occurrences -> evidence; grouped requests -> occurrence memberships
issue many <-> many grouped requests via issue_request_links
analysis -> model/rule manifest + replay snapshot + optional trend snapshots
actor -> authorized consultations / audit events (once auth is defined)
```

Enforce `(analysis_id,row_index)` uniqueness, not global row index/external ID/text uniqueness. Enforce cross-consultation and cross-analysis consistency for predictions, evidence and memberships with actual FK/unique constraints, not only application conventions. Preserve external ID type so string `"1"` and integer `1` are not silently rewritten. Distinguish response creation/ingestion from caller-supplied source date; normalized date must not replace original date text.

### Transaction, access and retention requirements

- Service layer owns persistence orchestration and transactions; keep `analyze_batch`'s computation reusable and Flask serialization stable. PostgreSQL access belongs in server-side repositories, not React or raw route SQL.
- Define a durable run lifecycle (pending/running/succeeded/failed) and crash/retry behavior. Do not hold a write transaction open across model inference unnecessarily. Commit each completed result, predictions, validation outcomes and memberships atomically; an incomplete run must not look succeeded.
- Introduce idempotency only on explicit persistent commands, scoped to actor/consultation plus input identity. Do not globally deduplicate genuine response records. Define conflicting retry payloads and concurrent-run behavior before implementation.
- Legacy analysis must remain usable when persistence is disabled. Define whether new persistent endpoints fail when storage fails; never silently claim a save succeeded. Do not broaden existing model-only `/health` readiness semantics without a separate readiness contract.
- Require ownership/access policy before exposing saved citizen text across users. Decide whether this begins as explicitly single-operator local storage or an authenticated service. Document deletion, retention, backups/restore, redaction, sensitive metadata handling and audit access before production use. Full raw CSV retention is optional and policy-controlled; evidence text and import provenance are essential.
- Retain original inputs only within explicit bounds; malformed transport bodies should not be stored indiscriminately. Successful/partially valid imports and row-validation errors need an agreed retention policy. If no input was accepted, preserving a failed run should be an explicit persistent-workflow behavior, not a hidden change to legacy `/analyze`.
- Store exact snapshot JSON for legacy replay alongside relational provenance. Test JSON numeric/null types and precision when reading database decimals/dates back through the serializer. Avoid storing derived count columns as independently editable truth.

## G. Risks to backward compatibility

1. **Changing the envelope:** replacing schema 2.0, returning only an ID/202 job, nesting the result or paging `responses` would break current React. Prefer additive, explicitly named persistent routes and a serializer that can reproduce the existing analysis object unchanged.
2. **Changing identity:** replacing `id`/`row_index` with UUIDs or deduplicating text would break filters, evidence links, counts and duplicate-ID tests. Add internal identity without altering legacy fields.
3. **Confusing frontend synthesis with backend facts:** current requests/recommendations are not returned by Flask. Moving them server-side needs characterization fixtures and an explicit versioned contract; it must not silently change the active UI or claim old historical client summaries have missing evidence.
4. **Losing provenance:** saving only valid rows or only representative quotes loses rejected-source data and complete membership. Capture inputs at the service boundary, before normalization drops information, with retention constraints.
5. **Model/run drift:** a later model promotion or rule change must not recompute old displayed results under a new model. Bind both artifacts and preprocessing/insight versions to each run. Cached running processes may differ from files on disk; record the loaded artifact identity at service initialization, not merely a mutable filename at save time.
6. **Date/history ambiguity:** browser timestamps are run times, not source dates. Do not combine unrelated sources/models or count reruns as independent periods. Imported localStorage summaries must be labeled incomplete and cannot populate evidence tables.
7. **Storage side effects on existing POSTs:** automatically saving every anonymous `/analyze` call changes retention/privacy semantics and retry behavior. Use opt-in persistent workflow first; keep existing calls stateless until explicitly authorized otherwise.
8. **Auth/readiness changes:** adding mandatory auth or DB dependency to existing routes can break React, the older Flask frontend, CLI/Streamlit assumptions and tests. New storage routes can have separate access/readiness requirements.
9. **Normalization/serialization:** preserve explicit-empty CSV mapping behavior, response order, duplicate records, day-first parsing, case of sentiment, percentage scale, rejection/warning schema and null-vs-empty semantics. Keep size limits and 400/503/500 handling backward compatible.
10. **Current technical debt:** dormant `/predict` helper mismatch; React/backend limit differences; object-vs-string quote rendering; derived request counts and domain-specific fallbacks; outdated architecture/ML prose. Record these, do not bundle fixes into a persistence migration.

## H. Recommended Phase 5 implementation order

1. **Freeze contracts and resolve domain decisions first.** Add characterization fixtures/tests for current JSON/CSV responses, duplicate IDs, rejected rows, evidence membership, normalization, and the *React* intelligence helpers. Specify consultation ownership, input snapshot boundaries, save/retry semantics and what “request”/“recommendation” means. This is the exact next implementation step; it requires no UI changes or PostgreSQL yet.
2. **Approve a persistence contract and schema decision record.** Choose explicit new consultation/import/analysis endpoints and access policy; specify internal IDs, immutable run manifests, serializer compatibility, failed-run handling and retention. Proposed endpoint names are future design choices, not current contracts. Do not silently add persistence to existing anonymous analysis POSTs.
3. **Add backend-only database infrastructure in a later authorized step.** Choose/configure PostgreSQL driver/ORM and migrations; document server-only environment variables without secrets. Add isolated connection/readiness and migration tests, leaving legacy endpoints independent of database availability when persistence is off.
4. **Implement the minimal durable path.** Consultation → import/raw response snapshot → analysis input membership/validation → immutable run + predictions + full result snapshot + complete issue/topic memberships/evidence + audit events. Exercise transactional rollback, retry and reload behavior before expanding entities.
5. **Expose additive save/retrieve APIs through Flask services.** Prove replay equals the legacy result contract; verify cross-consultation access isolation, pagination on new history lists (not old analysis arrays), DB failures and process restart recovery. No React-to-database access.
6. **Version and relocate decision-support derivation only when separately authorized.** Characterize existing client behavior, resolve evidence/count/link ambiguities, then define authoritative requests, issue-request links and recommendation provenance. Do not silently persist generated prose as testimony or human-reviewed decisions.
7. **Add trustworthy trends/history.** Define comparable cohorts/periods, model-version policy and duplicate-run policy; persist/materialize only with source/run links. Optional import of browser history must remain summary-only, unverified provenance, with no invented responses.
8. **Integrate frontend persistence later, without redesign.** Only after contracts and explicit authorization, connect React to Flask persistence endpoints while preserving the current UI. Then run backend/React compatibility, restart/recovery, backup/restore and access/retention tests.

**Stop point:** this audit is the only new deliverable. No PostgreSQL provisioning, tables, migrations, dependency installation, model training, UI edits or API changes were performed for this request.
