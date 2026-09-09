# Phase 5A — Contract characterization and persistence semantics

## Phase 5D implementation update (9 September 2026)

This update supersedes the historical statements below that Flask never imports
or uses persistence. `DATABASE_URL` opts Flask into PostgreSQL persistence for
successful `/analyze` and `/analyze-file` requests. Without it, the original
stateless mode remains available. Set it before starting Flask; configuration is
read at process startup. No database is created automatically and migrations do
not run during application startup or requests.

Required local configuration:

```text
DATABASE_URL=postgresql+psycopg://<role>@localhost:5432/e_consultation
```

Replace `<role>` with the existing PostgreSQL login. If authentication requires a
password, supply it through
`%APPDATA%\postgresql\pgpass.conf` (entry format
`localhost:5432:e_consultation:<role>:<password>`), or use a URL-encoded password
in `DATABASE_URL`. `PGPASSFILE` is optional if the password file is elsewhere.
Do not paste credentials into chat, commit them, or print the URL. pgAdmin saved
passwords do not automatically configure Flask. A PowerShell `$env:` setting in
another terminal is not inherited by an already running Codex or Flask process.

From a shell with the variables configured:

```powershell
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m alembic current
.\venv\Scripts\python.exe -m unittest persistence.test_foundation persistence.test_service -v
$env:RUN_POSTGRES_INTEGRATION = '1'
.\venv\Scripts\python.exe -m unittest persistence.test_postgresql -v
.\venv\Scripts\python.exe server.py
```

Successful responses retain the exact schema-2.0 body, with no added IDs or
wrapper. `/health` remains model-only; `/predict` is unchanged. CSV inspection
does not persist. Existing validation and inference errors occur before storage
acceptance and create no records. Inference runs outside database transactions.
After computation succeeds, one short transaction creates the consultation,
sealed import and ordered snapshot, RUNNING analysis run, audit entries and
internal acceptance receipt. Another transaction completes all evaluations,
predictions, issue/topic findings, evidence memberships and result JSON together.
HTTP 200 is returned only after completion commits in persistence-enabled mode.

Each request creates a new consultation and a new internal operation key. Repeated
payloads and CSV uploads remain distinct deliberate analyses. These legacy
routes do not introduce client idempotency headers, retry APIs, authentication,
saved-result retrieval or background execution. Receipts are internal acceptance
records, not assertions that a run has completed. The run carries the final status.

JSON request bytes and exact logical response records are retained. CSV retains
original bytes, filename, parsed rows including unselected columns, header order,
encoding and explicit mapping options (including omitted versus empty options).
The sealed snapshot retains the effective mapped inputs. Every duplicate/invalid
occurrence receives its own response identity and original position. Manifests
record hashes of actual cached model/vectorizer objects, on-disk artifacts and
analysis/rule source files, plus runtime package versions; on-disk hashes are
separate from loaded-object hashes because the inference cache survives file changes.

Storage/manifest failures return 503 with the existing `{error,message}` envelope
and a safe message saying the analysis could not be saved. No driver exception,
SQL parameters or credentials are logged. After a failed completion transaction
rolls back, a separate transaction attempts to mark the accepted run FAILED.
If the database is unreachable or commit acknowledgement is lost, this status
update can also fail: inspect the durable run status before retrying. There is
no automatic retry/recovery worker; an interrupted request can leave a RUNNING
record with no result graph. Completed records cannot contain partial results.

In pgAdmin, select **e_consultation**, refresh **Schemas → public → Tables**, and
use Query Tool to inspect the migration and recent runs:

```sql
SELECT version_num FROM alembic_version;
SELECT id, consultation_id, status, created_at,
       result_json->>'total_received' AS total_received,
       result_json->>'total_responses' AS accepted
FROM analysis_runs ORDER BY created_at DESC LIMIT 10;
SELECT r.id AS run_id, p.row_index, p.sentiment, p.confidence
FROM analysis_runs r JOIN sentiment_predictions p ON p.run_id = r.id
ORDER BY r.created_at DESC, p.row_index LIMIT 30;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

The real PostgreSQL suite requires `RUN_POSTGRES_INTEGRATION=1`, refuses any
database other than local `e_consultation`, and retains its labeled fixtures for
pgAdmin inspection. It never creates/drops databases or deletes existing records.
It verifies real JSON/CSV requests, result replay, duplicate identity and ordering,
rejections, provenance, predictions, findings, evidence and operation receipts,
and rollback of an intentionally incomplete result graph.

Verification completed on PostgreSQL **18.6**, existing local database
**e_consultation**, using the operator-supplied passwordless URL with role
`postgres`. `DATABASE_URL` was saved and verified in the Windows user environment;
restart the terminal/application to inherit it, or set `$env:DATABASE_URL` in the
current PowerShell session. No password was printed or committed.

- Existing migration `0001` applied successfully without schema changes. All 12
  expected persistence tables plus `alembic_version` were verified from PostgreSQL.
- All **24 focused persistence tests**, **77 backend tests** (including 5 new
  Flask boundary tests), and **2 real PostgreSQL integration tests** passed.
  The complete backend suite also passed with `DATABASE_URL` enabled and includes
  real Flask/Streamlit startup and isolated temporary training regression checks.
- `/health`, `/predict`, `/analyze` and `/analyze-file` passed. Stored schema-2.0
  results matched the existing analysis service. CSV provenance and ordered
  duplicate response identities were verified from database queries.
- An intentionally incomplete completion failed the deferred database checks;
  no partial evaluations, predictions, findings or evidence survived rollback,
  and a separate transaction recorded the fixture run as FAILED.
- Retained completed JSON run: `1da655ba-ca0c-4a52-8b40-e0047a1bb075`
  (3 evaluations, 2 predictions, 8 findings, 16 evidence memberships, 1 receipt).
- Retained completed CSV run: `9f23b4d6-bc66-42d4-b5b4-d1336b441d75`
  (2 evaluations, 2 predictions, 8 findings, 16 evidence memberships, 1 receipt).
  These rows remain available for pgAdmin inspection. Backend contract tests
  with persistence enabled also leave their valid analysis fixtures in this database.
- Active model SHA-256 remains
  `497888DCC4801A5D1DE5F48FC2B5160C05E38DB6AA95D4261CF42963AB911927`;
  active vectorizer SHA-256 remains
  `7E4F15FED3E6A3A104CB8D42E7BF73AC8F45EF7859F4436288ECD4988377FEE4`.
  No ML artifacts/pipeline, React, authentication, workers or schema were changed.

Date: 8 September 2026. Baseline: `6b42f398377f72235789907514e26dca79bc4eef`.

**Status:** existing behavior characterized; future persistence semantics specified, not implemented. No PostgreSQL, SQL, migration, authentication, production-code, frontend or active-model changes. Sections A–B describe current behavior; C–J specify the proposed future design, not existing API fields or capabilities.

The preceding audit (`docs/phase5_database_audit.md`, available locally) was reviewed against `server.py`, `analysis_service.py`, `model_service.py`, `csv_ingestion.py`, `text_insights.py`, `config.py`, Streamlit session handling, React `App.jsx`, `ResultsSection.jsx`, `lib/api.js`, `lib/utils.js`, `lib/consultationIntelligence.js`, and existing tests. Characterization confirmed the audit findings; no contradictory audit correction was needed.

## A. Current API contracts

### Shared transport and identity rules

Flask is synchronous and stateless for analysis. There are no consultation/import/run IDs, save flags, status polling, idempotency behavior, authentication requirements or persistent records on the following routes. A returned result is not a saved government record.

Controlled errors are JSON `{error:true,message:string}`, with `details` only for analysis errors that provide it. Generic 500 messages do not expose the underlying exception. Ordinary unmatched-route/unsupported-method 404/405 responses remain Flask defaults; do not assume all HTTP errors have this custom envelope. No API carries a schema version except successful batch analysis (`"2.0"`).

Limits remain: 5,000 characters per feedback; 2,000 records; 1,000,000 combined text characters; 5,000,000 CSV bytes; 50 columns; 2,000 serialized metadata characters. Analysis transport limit is 6,500,000 bytes; single prediction transport is 61,024 bytes. Transport-limit errors deliberately return **400**, not 413. React separately imposes 500,000 text characters and 1,048,576 CSV bytes. These differences are unchanged.

### GET /health

- No input/body or row/duplicate/CSV semantics.
- Ready: 200 JSON `{status:"ok",model_loaded:true,classes:[...actual model classes]}`.
- Model unavailable: 503 JSON `{status:"unavailable",model_loaded:false,classes:[]}`; notably not the `error/message` envelope.
- Reports model readiness only, not database readiness. Unexpected exceptions outside the handled `ModelUnavailable` condition follow Flask's default error handling.
- React `checkHealth()` calls the relative `/health` URL on mount and relies on `model_loaded`. No schema version.

### POST /predict

Request: JSON object `{feedback:string}`. Extra fields are ignored. Requires the `feedback` key, not `text`. Malformed JSON/wrong content type, non-object body, missing key, invalid value, unsupported script, over-limit text or zero recognized vocabulary produce 400 JSON error/message.

Success: 200 JSON, exactly these current fields:

```text
sentiment: string, title-cased actual class (e.g. Positive)
confidence: number in [0,1], rounded to 6 decimal places
input_length: integer, length after surrounding whitespace is stripped
word_count: integer, whitespace-separated words after stripping
```

No returned raw text, row/index, persistent identity, timestamp or schema version. Repeated calls classify independently. Validation precedes loading the service; invalid basic input remains 400 even when model loading is unavailable. Model unavailable returns 503 error/message; unexpected inference failure returns 500 with `Prediction failed. Please try again or contact the application operator.`

React's exported, unused `predictFeedback(text)` currently posts `{text}` and therefore would receive 400 `The feedback field is required.` Active React batch analysis does not use it. Tests capture both sides without changing either.

### POST /analyze

Request: JSON object `{responses:[ResponseInput,...]}`; unknown top-level/row fields are ignored. The array must be nonempty and bounded. Each input should be:

```text
text: required string
id: optional string or integer, non-bool/non-null, stringified length <=256
date, category, source: optional string <=256 or null
metadata: optional flat JSON object with string keys and finite scalar values, or null
```

Each input gets its **1-based original position** as `row_index`. Omitted `id` defaults to that position, even after other rows are rejected. Caller IDs/text may repeat; string `"1"` and integer `1` retain their types. There is no deduplication. Evidence/topic memberships use row indices, not caller IDs or filtered array offsets.

Success: 200 complete schema-2.0 object. Invalid rows may coexist with valid rows. `total_received = total_responses + rejected_count`; all aggregate denominators use valid rows. Rejected rows are ordered by original position; valid rows remain in input order with gaps. `warnings` currently contains unparseable-date warnings on valid rows. Invalid dates exclude only those dates from trends.

All-invalid input: 400, `No valid responses could be analyzed.`, with `details:{total_received,rejected:[{row_index,message}]}`. Empty/wrong-type array: 400, `responses must be a non-empty array of response objects.`, without details. Malformed body/missing responses: 400. Model unavailable: 503 error/message. Unexpected failure: 500 `Analysis failed. Please try again or contact the application operator.` No partial success payload is returned on computational failure.

### POST /analyze-file

Request: multipart/form-data, exactly one file under `file` with a case-insensitive `.csv` extension. No file is saved. UTF-8 with optional BOM, comma delimiter, unique nonempty trimmed case-insensitive headers, proper quoting and field counts. Quoted newlines are retained inside a single CSV record; row indices refer to data records after the header, not physical file lines. Empty data records become invalid rows, not silently removed entries.

`mode=inspect` returns 200:

```text
columns: string[]
row_count: integer
suggested_mapping: {text_column: string|null, date_column: string|null, category_column: string|null}
candidates: {text_column:string[], date_column:string[], category_column:string[]}
requires_selection: boolean
```

Inspection parses structure but does not invoke ML or validate text suitability. Alias suggestions require exactly one matching header. Text aliases: feedback/comment/review/response/text; date aliases: date/timestamp/submitted_at; category aliases: category/department/service/type. No match or ambiguous text match requires explicit selection in analysis.

`mode=analyze` is default. Mapping fields: `text_column`, `date_column`, `category_column`, `id_column`, `source_column`, and `metadata_columns` (JSON-encoded unique string array). Optional omitted date/category mappings may auto-detect; **explicit empty strings disable detection**. Each mapped role must use a different column. Metadata columns can also preserve selected role columns. Unselected columns disappear from the normalized result. Blank optional cells are absent/null; filename is not invented as response `source`.

200 analysis is **identical in shape to `/analyze`**, not a CSV wrapper. Missing/ambiguous/unknown selected text column produces 400 with inspection details; malformed CSV, missing/duplicate files, invalid mode or incompatible mappings produce 400 error/message. All-invalid/partially valid rows and 503/500 analysis failures follow the JSON route's semantics. Inspection can succeed even if the model is unavailable. Unknown form fields are ignored by the current mapping layer.

### Successful batch schema (current keys, not proposed fields)

```text
schema_version: "2.0"
total_received, total_responses, rejected_count: integers
rejected, warnings: [{row_index:integer, message:string}]
responses: [{
  row_index:integer, id:string|integer, text:string,
  sentiment:lowercase-class, confidence:number, input_length:integer, word_count:integer,
  date:ISO-calendar-date|null, date_input:string|null,
  category:string|null, source:string|null, metadata:flat-object|null
}]
sentiment: Distribution
keywords: [{keyword:string,count:integer}]
topics: [{topic:string,count:integer,sentiment:ClassCounts,response_indices:integer[]}]
issues: [{
  issue:string, mentions:integer, negative_mentions:integer, negative_ratio:number,
  sentiment:ClassCounts, priority:Priority, response_indices:integer[],
  representative_feedback:[{row_index,id,text,sentiment,confidence}]
}]
trends: {
  available:boolean, reason:string|null, dated_responses:integer, undated_responses:integer,
  points:[{date:string,total_responses:integer,sentiment:Distribution,issue_mentions:{phrase:integer}}]
}
categories: {
  available:boolean, reason:string|null, categorized_responses:integer, uncategorized_responses:integer,
  groups:[{category:string,total_responses:integer,sentiment:Distribution,
           issues:[{issue:string,mentions:integer,negative_mentions:integer,priority:Priority}]}]
}
summary: string
analysis_notes: {
  summary_method:string, topic_method:string, issue_method:string,
  term_limit_reached:boolean, unique_terms_considered:integer,
  issue_thresholds:{minimum_mentions,minimum_negative_mentions,minimum_negative_ratio},
  priority_thresholds:{high,medium}, confidence:string, priority_formula:string
}

ClassCounts = {actual_model_class:integer,...}
Distribution = {counts:ClassCounts, percentages:{class:number,...}, average_confidence:number|null}
Priority = {score:number, level:"HIGH"|"MEDIUM"|"LOW", signals:{
  coverage:number,negative_ratio:number,frequency_weight:number,negative_weight:number,
  frequency_contribution:number,negative_contribution:number
}}
```

Text is retained verbatim **as submitted to Flask**. Optional strings are trimmed, blanks become null; `date_input` is the trimmed original date. Parsing preserves source calendar day (including ISO timestamps with offsets), accepts day-first slash/dash formats, and does not convert the date to UTC. Raw input can be longer than `input_length`. Batch labels are lowercase; confidence is an uncalibrated probability, not accuracy. Percentages use scale 0–100 and four decimals; mean confidence uses six. Priority score/contributions use four decimals; ratio/coverage six. JSON number formatting is not a fixed-width decimal string.

Topics are overlapping exact 1–3-word phrases, not exclusive semantic groups. Issues require two mentions, two negatives, negative ratio ≥0.5; priority is `100*(0.4*coverage+0.6*negative_ratio)`, HIGH ≥75, MEDIUM ≥50. Up to 25 keywords, 12 topics, 10 issues, three representative responses per issue. Complete memberships are sorted indices; representative ranking is negative first, descending confidence, shorter text, original index. Empty issues are valid. Unavailable trends/categories have `available:false`, explanatory reason and empty arrays. No fabricated neutral prediction or absent-date trend.

### React dependencies and current imperfections

`App` stores the entire result in memory, retains inputs on errors and checks `/health`. It parses paste rows with trimming/removal of empty entries, submits JSON strings as `{text}`, and uploads a CSV twice for inspection/analysis. React posts blank optional mapping strings. A local source label and browser history are not submitted to Flask.

`validateAnalysis` requires exact version string `"2.0"`, integer totals, a sentiment object, a summary string, six arrays and typed response row_index/text/sentiment/confidence. It does not validate every nested component dependency. Components require distributions, category groups, topic/issue memberships and evidence; all valid responses must remain available for local search/filter/pagination. There is no persistence API call. The request helper parses JSON errors and times out after 90 seconds; browser abort does not cancel server inference.

Requests, recommendations and some problem interpretations remain browser heuristics. Current request counts may count multiple sentences from one row; enriched `negativeCount` uses mentions rather than negative_mentions; evidence may be objects or strings; a recommendation can contain fallback text or the first unrelated request. These are characterized, **not corrected or promoted to evidence facts**. Existing localStorage history contains at most 20 summaries without underlying response evidence. It is not a server-side consultation archive.

## B. Characterization-test coverage

New backend file: `tests/test_phase5_contracts.py` — **23 tests**, with additional cases inside subtests. Success paths use saved active artifacts. Only failure/inspection boundaries are mocked; no production behavior is patched to pass a test.

| Coverage | Test methods (prefix `test_`) |
|---|---|
| Health 200/503 exact bodies | `health_ready_contract`, `health_unavailable_contract` |
| Prediction success, field types/rounding | `predict_success_contract` |
| Prediction JSON/content/text validation and dormant helper mismatch | `predict_shape_errors_and_unused_react_helper_mismatch`, `predict_text_validation_contract` |
| Prediction 503/500 and validation precedence | `predict_unavailable_and_generic_failure` |
| Complete analysis envelope/version, nested distributions/evidence | `analyze_full_schema_and_numeric_contract`, `analyze_nested_trends_categories_and_evidence` |
| Empty/invalid arrays and all-invalid error details | `analyze_invalid_envelopes`, `analyze_all_invalid_details` |
| Partial rows, indices/default IDs/date warnings | `analyze_partial_rows_keep_original_indices_and_date_warning` |
| Duplicate text/IDs, numeric-vs-string IDs, repeat call | `analyze_duplicate_text_and_typed_external_ids` |
| Original text, normalization and ignored fields | `analyze_raw_text_normalization_and_unknown_fields` |
| Nulls, valid empty issues, unavailable breakdowns | `analyze_absent_optional_fields_and_unavailable_breakdowns` |
| CSV inspection without ML; full JSON/CSV parity | `csv_inspection_does_not_infer_or_analyze_rows`, `csv_mapped_success_is_same_envelope_as_json` |
| Malformed CSV; absent/ambiguous/unknown text mappings | `csv_malformed_contract`, `csv_missing_ambiguous_and_unknown_mapping` |
| Omitted vs empty optional mappings | `csv_blank_mapping_disables_detection` |
| BOM/multiline/blank record/duplicate uploads | `csv_multiline_bom_blank_record_and_duplicate_upload` |
| One file and allowed modes | `csv_requires_one_file_and_valid_mode` |
| Both analysis routes: 503/500 | `analysis_routes_unavailable_and_generic_failure` |
| Body limit is 400, not 413 | `transport_limit_remains_400_not_413` |

New `tests/phase5_react_contracts.test.mjs` — **9 tests** against actual React helpers using Node's built-in test runner and mocked fetch. Characterizes health, the unused predict helper, analysis payload, multipart mapping, shallow schema validation, paste trimming, per-sentence request counts, negativeCount/object evidence, and generated recommendation fallbacks. No React source edits or extra dependencies.

Run from the project root:

```powershell
.\venv\Scripts\python.exe -m unittest tests.test_phase5_contracts -v
.\venv\Scripts\python.exe -m unittest discover -s tests -v
node --test tests/phase5_react_contracts.test.mjs
```

The full backend suite includes an existing temporary-directory training regression test. It trains isolated test artifacts only, not the active v3 model; the test checks protected artifacts remain unchanged. Phase 5A does not invoke model generation/promotion commands. Final results are recorded after verification below.

## C. Consultation ownership semantics (proposed)

**Consultation:** a durable administrative collection of submissions on a named public consultation, not one HTTP request, upload, issue phrase or model run.

- Internal server-generated UUID, independent of caller response ID; human-supplied nonempty title (proposed limit 256 characters), editable with audit. Titles need not be unique and filenames must not silently become identity.
- Initial persistence is **single-operator/local deployment scope**. There are no user accounts or owner relationships today; do not add users/login or fake owner IDs in Phase 5A. Record `actor_kind=local_operator|system` for audit without implying authenticated human identity. Multi-user access and user ownership require a later explicit design before network exposure.
- Lifecycle: `ACTIVE → ARCHIVED`; explicit audited reopen can return to ACTIVE. Archived consultations allow reads but no new import/run commands. Already accepted runs may finish. No hard delete is defined here; deletion/retention require policy approval.
- One consultation has many imports, immutable input snapshots and runs. Responses have a single consultation membership, established through their import, never inferred from title/text.
- Another import appends new response identities; it does not replace prior imports. A run analyzes an explicitly selected ordered snapshot. The default for a new import command is **that import only**, not every response ever uploaded. Combining imports requires an explicit ordered selection; newly added imports cannot retroactively change old runs.

## D. Immutable input snapshot semantics (proposed)

**Invariant:** a run's exact logical input and derivation environment must be recoverable. Snapshot creation commits before inference. No response edits, reordering, remapping or external-ID rewriting are permitted in a sealed snapshot; correction creates a new import/snapshot.

Separate these concepts:

1. **Import:** one deliberate ingestion event, source type, receipt time, original filename when supplied, raw payload/checksum, CSV headers and mapping including omitted-vs-explicit-empty selections, parser/encoding version, metadata and declared sample/source context. JSON/paste does not invent a filename or provenance. Retain typed original row values and ignored fields within bounds; raw invalid rows can be nonobjects or lack text.
2. **Immutable response:** one occurrence/record from an import with durable response UUID and import-local record ordinal; original text/raw record is immutable, including whitespace/newlines and external ID type. Duplicate occurrences remain separate records. Do not confuse CSV physical line numbers with logical records.
3. **Input snapshot:** ordered selection of response UUIDs plus the exact mapped logical response array to be analyzed. It can combine imports from the same consultation. Snapshot-local row_index starts at one across that selection. Store manifest version, count, checksums and creation time. The selection is sealed atomically; no mutable DRAFT snapshot table is needed in the minimal design.

The original raw text is not replaced by preprocessed text. Store run-specific normalization (`date_input`, normalized date/category/source/metadata, validation outcome and processed text if retained) in run-response records, versioned with the preprocessing function. A rejected record must remain traceable even when it receives no prediction. Do not copy UI-cleaned request titles into raw evidence columns.

For CSV, retain byte-exact payload or an immutable blob reference plus SHA-256 if raw-file retention is authorized; otherwise preserve parsed raw records, exact mapped logical input, mapping/encoding/parser version and byte hash, and explicitly state that byte-for-byte file reconstruction is unavailable. Browser paste trimming occurs before Flask; never claim recovery of characters never received. Invalid transport/malformed files are rejected before a run is created; retain bounded diagnostic/audit metadata, not arbitrary malformed bodies. Row-level invalid feedback in an otherwise structurally valid import is retained and evaluated by a run.

Checksums: byte-level SHA-256 for files; a versioned canonical logical-input checksum preserving array order, string contents, nulls and ID types. Hash includes resolved mapping semantics and selected response content; transport formatting and logical content hashes are distinct. Specify canonical serialization/test vectors before implementation (especially JSON number representation). **Hashes are integrity indicators, not unique entity keys or permission checks.** They never deduplicate citizen responses automatically.

Reproducibility also requires retained model/vectorizer artifact hashes and retrievable artifacts, preprocessing/insight code revision, configuration/thresholds, dependency versions and selection algorithm version. Capture the identity of the **loaded** model, not merely a mutable path on disk. Replaying saved schema-2.0 JSON is guaranteed by immutable result storage; bitwise recomputation across unspecified library versions is not promised. If artifacts/environment cannot be restored, report that replay exists but recomputation is unavailable.

## E. Analysis-run lifecycle (proposed)

```text
                    validation / scheduling failure
PENDING -------------------------------------------------> FAILED
   |
   | atomic worker claim; input already sealed
   v
RUNNING -- atomic completed-result commit ----------------> COMPLETED
   |
   +------ inference / findings / persistence / crash ----> FAILED

FAILED -- explicit retry command --> NEW PENDING run
COMPLETED -- deliberate reanalysis --> NEW PENDING run
```

- **PENDING:** run identity, consultation, snapshot and requested model/rule manifest are durably accepted. Snapshot membership is frozen in the same transaction as acceptance. No success result exists yet.
- **RUNNING:** one worker claims the run through a guarded transition, records start/lease token and verifies model manifest. Normalize/validate, infer, then build findings using existing services. No long-lived DB transaction should span inference.
- **COMPLETED:** one transaction durably commits the full successful result, prediction/validation records, findings and complete evidence memberships, result hash, end time and completion event. This is the only time it is declared complete. A network response alone is not proof of saving.
- **FAILED:** terminal, sanitized error category/message and timing. Record known row-validation diagnostics, but do not publish partially computed predictions/findings as a completed analysis. All-invalid input is FAILED in the future persistent workflow, while legacy `/analyze` still returns its original 400. A structurally valid batch with some rejected rows and some valid results is COMPLETED with quality counts, not FAILED or a new PARTIAL state.
- On DB failure before acceptance: no accepted run; return storage failure from the future endpoint, never false success. On uncertain completion commit: query durable state before declaring failure/retrying. A committed COMPLETED run remains complete even when its HTTP reply was lost.
- On worker crash: use lease/heartbeat plus fencing. After expiry a recovery action marks the run FAILED with interruption reason; no in-place return to PENDING. A stale worker must be unable to commit after recovery. Timer and worker deployment details remain open, but terminal-state and fencing requirements are fixed.

Run identity/input/model lineage are immutable from acceptance. Lifecycle timestamps/status are guarded transitions, not general editing. Terminal runs and results are immutable. Failure diagnostics can be recorded atomically during terminalization; later human notes belong in separate audit events. Retry creates a new record, never erases failure history.

## F. Save semantics (proposed cases A–I)

These semantics apply only to future **explicit persistent commands**, not existing stateless POSTs. Persistence happens in Flask services/repositories, never React-to-PostgreSQL. No background save of today's anonymous calls is authorized.

| Case | Persisted identities / data | Immutability, duplication and reproducibility |
|---|---|---|
| **A. New consultation + import + analysis** | After structural validation, atomically accept consultation, import/responses, sealed snapshot, PENDING run and operation receipt. Publish/compute after acceptance | All resource identities new; source/input frozen. Result graph commits only on success. If acceptance transaction fails, none of these resources are accepted |
| **B. Same consultation + another import** | New import, response occurrences, snapshot and optional requested run; same consultation UUID | Earlier imports/runs untouched. Default snapshot selects new import only; explicit combination produces another snapshot |
| **C. Same input analyzed again** | New run on the same sealed snapshot with new command key | Existing result remains immutable. Same model/rules may yield identical numbers; a new model version is a reanalysis with a recorded new manifest, not an overwrite |
| **D. Analysis fails** | Accepted input/run retained; run terminal FAILED with safe error and known validation diagnostics | Do not persist/publish a partial successful result graph. Retry eligibility does not change the failed record |
| **E. Retry failed analysis** | New run ID, `retry_of_run_id`, same snapshot and pinned manifest by default; new deliberate command key | Failed run remains FAILED. No duplicated input/import needed. If input or model changes, use reanalysis/corrected import, not same-attempt retry |
| **F. Same CSV uploaded twice** | Distinct deliberate command keys create two import/response identities, even if byte hashes match | Optional duplicate warning only; no automatic merge. Same delivery key returns original receipt rather than a second import |
| **G. Same response text in different rows** | Every occurrence gets a new response identity and position | All count separately exactly as now, including repeated external IDs. Never use text/hash/external ID as a unique constraint |
| **H. Browser refresh during run** | Accepted run continues independent of browser; future client recovers via receipt/run ID and status retrieval | Refresh is neither cancel nor retry. Local UI state loss cannot erase durable input. If run ID was not received, resolve using the original operation key |
| **I. Two requests for same input** | Same operation scope/key and same fingerprint: one accepted run. Different keys: two intentional runs referencing same snapshot | Concurrent claims enforce unique operation key; repeated delivery does not schedule twice. Same key/different fingerprint is conflict; no result overwrite |

“Save” does not mean accepting client-computed result JSON as trusted analysis. The initial design accepts source inputs and lets Flask compute and commit the authoritative result. Saving an old unsaved browser result, if later needed, must be a separately labeled client snapshot or a new server run; do not assert that client JSON was generated by the pinned backend model. LocalStorage summaries cannot restore lost citizen evidence.

## G. Retry and command-delivery semantics (proposed)

Two different actions must remain distinct:

- **Transport retry:** resending the same persistent command after timeout/refresh uses the same client operation key. Key scope is local deployment/operator scope + operation kind (and consultation where already known); for new-consultation creation no preexisting consultation ID is required. Store a server-computed request fingerprint and durable response/target receipt. Same key/same fingerprint returns that receipt/current run, not a new analysis. Same key/different fingerprint returns a future **409 conflict**, only on new endpoints. Unique-key reservation and resource acceptance share a transaction.
- **Analysis retry:** user explicitly retries a FAILED run with a new operation key; new run references `retry_of_run_id`, the same snapshot and originally pinned model/rules. If old artifacts are unavailable, refuse or record failure clearly; do not silently use current active artifacts. Deliberate reanalysis can select a new manifest and is labeled reanalysis, not equivalent retry.

Persist operation receipts long enough to cover resource lifetime in the minimal design; no silent short TTL that turns a delayed replay into duplicate creation. Any later retention policy must retain key tombstones or explicitly define expired-key behavior. Concurrent identical commands wait for/resolve the original transaction; a rolled-back acceptance has no accepted resource. Failure before a run exists can have a bounded failed-operation receipt without fake consultation/run FKs.

No automatic retry loop is proposed. Read/check durable status before retry after ambiguous network/storage failure. Store lineage so retry chains are visible. Future jobs/outbox/lease implementations are not introduced here; scheduling must claim durable PENDING records rather than rely on an uncommitted fire-and-forget event.

## H. Duplicate semantics (proposed)

- No unique constraints on consultation title, response text, caller external ID, import checksum, snapshot content checksum or `(snapshot,model)` run pair.
- Unique identities protect structure: import record ordinal; snapshot member position; run row index; one prediction per accepted run row; one evidence membership per finding/row.
- A snapshot includes a response UUID at most once. If the same source content is intended to appear twice, it must have two response occurrence UUIDs (as duplicate input records do today). This distinguishes accidental repeated selection from legitimate duplicate citizen rows.
- Same file with different mappings is a distinct interpretation and needs a new import/snapshot or a separately versioned remapping event; the minimal design chooses a new import referencing the same retained blob when appropriate.
- Repeated analyses are not new citizen submissions. Trend calculations must select a defined run/cohort/model policy, never add run totals blindly. Cross-consultation copies remain separate occurrences with their own provenance.

## I. Proposed minimal PostgreSQL model — no SQL or tables created

All identifiers below are **internal future fields**, not replacements for schema-2.0 JSON. UUID keys are server-generated. “Immutable” means application/service writes cannot update sealed source/result data; controlled retention/redaction is a separate future policy. All timestamps are server timestamps with timezone; caller-supplied date remains separate.

The minimal normalized model below stores core data plus exact result JSON. It does not need a table per dashboard panel. Composite keys/FKs must enforce same-consultation/snapshot/run boundaries, not trust a generic `target_type/target_id` string. Supporting uniqueness for composite FKs is intentional, not deduplication.

| Table | Purpose, primary key and important columns | Foreign keys / uniqueness | Immutability, lifecycle and justified indexes |
|---|---|---|---|
| `consultations` | PK `id`; title, created_at, updated_at, status | No owner FK yet; titles not unique | Title/status editable through audit; identity immutable. ACTIVE/ARCHIVED. Index `(status,created_at,id)` for consultation lists |
| `imports` | PK `id`; consultation_id, source_type, original_filename nullable, raw payload/blob reference, raw checksum, headers, mapping, metadata, parser_version, received_at | FK consultation; unique `(id,consultation_id)` for scoped children; no checksum uniqueness | Accepted imports sealed; malformed structural imports not accepted. Index `(consultation_id,received_at,id)` for import history |
| `responses` | PK `id`; consultation_id, import_id, record_ordinal, raw_record (typed JSON), original_text nullable, external_id_value/type, supplied metadata | Composite FK `(import_id,consultation_id)`; unique `(import_id,record_ordinal)` and `(id,consultation_id)` | All payload/identity immutable. Nullable text accommodates invalid submissions. Index import ordinal via unique key; no text/dedup index initially |
| `input_snapshots` | PK `id`; consultation_id, created_at, member_count, exact logical payload, manifest_version, content_hash | FK consultation; unique `(id,consultation_id)`; hash not unique | Sealed on creation, no mutable status. Index `(consultation_id,created_at,id)` for snapshot history |
| `snapshot_members` | PK `(snapshot_id,row_index)`; consultation_id, response_id | Composite FKs to snapshot/consultation and response/consultation; unique `(snapshot_id,response_id)` | Immutable ordered membership; row_index positive. PK supports replay order; index response_id for provenance lookup |
| `analysis_runs` | PK `id`; consultation_id, snapshot_id, status, requested/loaded model-rule manifest, created/start/end times, lease_token/expiry, retry_of_run_id nullable, result_json/hash nullable, safe failure info | Composite snapshot/consultation FK; retry FK with same consultation/snapshot and compatible manifest; unique `(id,snapshot_id)` | Input/requested manifest frozen on acceptance; loaded manifest recorded once and verified. Guarded PENDING/RUNNING/COMPLETED/FAILED transitions; terminal immutable. Index `(consultation_id,created_at,id)`, `(status,created_at)` for claim/recovery and retry_of for lineage |
| `run_responses` | PK `(run_id,row_index)`; snapshot_id, validation_status, rejection message, date warnings, normalized fields and optional processed_text | Composite FK `(run_id,snapshot_id)` to runs and `(snapshot_id,row_index)` to snapshot_members | One evaluation per run row; ACCEPTED/REJECTED, final once committed. PK supports result replay/evidence; snapshot/row index supports provenance join |
| `sentiment_predictions` | PK `(run_id,row_index)`; label, confidence, input_length, word_count | FK run_responses; service/constraint boundary requires ACCEPTED status | Immutable; label/confidence/lengths from actual inference. No predictions for rejected rows. PK sufficient initially; no speculative vector/full-text indexes |
| `findings` | PK `id`; run_id, kind (`issue` or `topic` initially), rank, source_label, typed payload containing counts/priority/signals/method version | FK run; unique `(run_id,kind,rank)` and `(id,run_id)` | Immutable per run. Exact keywords/summary/trends/categories remain in result_json initially. Index `(run_id,kind,rank)` supports display/read ordering |
| `finding_evidence` | PK `(finding_id,run_id,row_index)`; selection_method, representative_rank nullable, quote_text nullable | Composite FK `(finding_id,run_id)` and FK `(run_id,row_index)` to accepted run_responses; unique non-null `(finding_id,representative_rank)` | All supporting rows stored, representative rank marks the selected subset. Quote must equal source text for current whole-response evidence. Reverse index `(run_id,row_index)` supports source-to-finding lookup |
| `operation_receipts` | PK `(scope,operation_kind,operation_key)`; fingerprint, accepted_at, receipt_status, consultation_id/import_id/run_id nullable, bounded response receipt | Real nullable FKs to resource targets; resource references required for ACCEPTED, can be absent for REJECTED; no polymorphic unchecked target FK | Fingerprint/key immutable; accepted/rejected receipt finalized once, current run state read via run FK. Unique PK arbitrates concurrent delivery; no TTL deletion initially |
| `audit_logs` | PK event ID; occurred_at, actor_kind, action, consultation_id/import_id/run_id nullable, correlation key, outcome, bounded details | Typed nullable FKs to relevant resources; unknown target failures may have none | Append-only. Index `(consultation_id,occurred_at,id)` and `(run_id,occurred_at,id)` for history. No raw citizen text or secrets in details |

Additional integrity rules: statuses and timestamps must agree; COMPLETED requires result/hash and no failure, FAILED cannot expose a successful result; accepted-row count and serialized totals must agree; representative rank is unique and points to a supporting row; response/prediction joins cannot cross snapshots. Parent deletions default to restricted, not cascading away evidence. Composite constraint syntax, migrations and query plans belong to the next authorized implementation, not this document.

### Deferred entities — not part of the first storage slice

The current requests/recommendations are browser-generated. Do **not** create their authoritative tables until service-side extraction semantics and versioned output are approved. If/when required, use:

| Deferred table | Proposed PK / columns / foreign keys / constraints | Immutability, lifecycle and indexes |
|---|---|---|
| `request_occurrences` | UUID PK; run_id, row_index, sentence_ordinal, verbatim sentence, cleaned action, offsets if known, extractor_version; FK run_responses; unique `(run_id,row_index,sentence_ordinal)` and `(id,run_id)` | Immutable derived occurrence. No human approval implied; index run/row via unique key. Offsets must resolve to exact source, not inferred after cleaning |
| `requests` | UUID PK; run_id, rank, derived title/domain/priority and method_version; FK run; unique `(run_id,rank)`, `(id,run_id)` | Immutable grouped request output, not a service ticket. Index run/rank. Do not use cleaned title as unique identity |
| `request_memberships` | Composite PK `(request_id,occurrence_id)` with run_id; scoped FKs to grouped request and occurrence | Immutable many-to-many occurrence membership; reverse occurrence index. Unique-response count computed separately from occurrence count |
| `issue_request_links` | Composite PK `(finding_id,request_id)` with run_id, match_method/version and evidence basis; scoped FKs; finding must be kind issue | Immutable heuristic link; reverse request index. No fallback-text links. Reviewed revisions later require distinct events/versions |
| `recommendations` | UUID PK; run_id, rank, guidance, method_version, kind=`system_suggestion`; FK run; unique `(run_id,rank)`, `(id,run_id)` | Immutable generated suggestion, never government decision. Index run/rank; human decision lifecycle out of scope |
| `recommendation_basis` | PK `(recommendation_id,finding_id)` with run_id; scoped FKs, optional related_request_id that must have a same-run issue_request_link | Immutable basis; finding must be issue; index finding and related request for reverse provenance. Supporting source follows finding_evidence |

Standalone free-form recommendations without linked evidence must be marked generic guidance, not evidence-grounded actions. Users/auth tables, human decision/work-item tables, standalone trend_snapshots, separate model tables and full-text search indexes are deferred. The run manifest/result snapshot holds versioned model metadata and derived summaries initially. Immutable model files remain in trusted artifact storage, not executable database blobs.

## J. Provenance model

```text
Issue finding -> finding_evidence -> run_responses -> snapshot_members
              -> immutable response -> original import / source record

Citizen request -> request_memberships -> request_occurrences
                -> run response -> immutable original text

System recommendation -> recommendation_basis -> issue
                      -> related request ONLY through a supported same-run link
                      -> original citizen evidence through the paths above
```

Preserve these distinct layers:

1. **Submitted evidence:** original citizen-provided text, with declared source; not independently verified truth. Illustrative samples must retain their declared nature.
2. **ML prediction:** whole-response sentiment/confidence bound to model/preprocessing manifest, not aspect sentiment or an accuracy claim.
3. **Derived analysis:** exact-phrase membership, grouped requests, counts and interpretations with algorithm version.
4. **Heuristic priority:** score inputs, weights, denominator and thresholds retained; not severity or authority.
5. **System recommendation:** generated suggestion linked to basis, not a quotation or government decision. A later human decision must be a distinct authenticated/reviewed record, never inferred from a generated recommendation.

Verbatim quote hashes/offsets can verify source matching; original records and full memberships remain authoritative. Preserve representative selection order separately from complete support. Typed FKs prevent linking evidence from a different run/consultation. Unknown source provenance must remain unknown. Browser fallback strings and “no request identified” text do not become citizen evidence.

## K. Backward compatibility requirements

- Preserve `/health`, `/predict`, `/analyze`, `/analyze-file`, schema `"2.0"`, every existing field/type/null, class case, ordering, row identity, duplicate counting, CSV mapping semantics, limits and error behavior.
- New persistent commands/read endpoints must be additive and explicitly opted into. No implicit persistence dependency on legacy routes or model-only health. New run status/IDs/409 semantics belong to new contracts, not silent changes to current responses.
- Existing `/analyze` must not become paginated, async/202 or wrapped in `{run,result}`. Future saved-result retrieval can reproduce the original schema-2.0 object; metadata/status is separate.
- Do not trust incoming `consultation_id`, `save` or `run_id` on legacy routes: they are currently unknown/ignored fields, not authorization to persist. Future persistent command validation must be separate and explicit.
- Existing imperfect behaviors are documented, not repaired in Phase 5A: dormant React predict payload, client limits, shallow validator, browser-synthesized request counts and evidence types. Tests characterize these without claiming they are desirable.
- Exact-key characterization tests intentionally detect schema expansion too. Any later additive legacy field proposal needs deliberate contract review/test update; prefer new endpoints so existing exact envelopes remain stable.
- Database access stays **React → Flask REST API → service layer/repository → PostgreSQL**. No frontend credentials/SQL, no ML replacement/retraining, no frontend redesign and no route refactor in this phase.

## L. Open design questions and next step

Settled here: one local-operator consultation scope; immutable accepted inputs; explicit import selection; new run for deliberate retry/reanalysis; same-command idempotency; no content deduplication; atomic completed results; complete evidence traceability; no users/auth implementation yet.

Resolve before the relevant implementation:

1. Approve local-only operating scope and who may access stored citizen text; choose authenticated ownership before any multi-user deployment.
2. Approve exact additive endpoint names/DTOs and persistence-enabled configuration. No new endpoints have been implemented by this document.
3. Define canonical hashing serialization/test vectors, raw-file retention versus parsed-record retention, redaction/deletion policy and backup restoration guarantees.
4. Select PostgreSQL driver/ORM/migration tooling, artifact storage, worker claiming/lease durations, recovery operator and DB failure handling implementation.
5. Resolve and version browser-only request/recommendation ambiguities before implementing their deferred tables; do not silently change the UI.
6. Define comparable trend cohorts and model-change handling; never import browser summaries as complete evidence-backed history.

**Exact next step:** review/approve the proposed persistent command DTOs and local access/retention boundary, then implement the minimal database infrastructure and core snapshot/run repository in a separately authorized phase, with isolated database tests. No PostgreSQL implementation is included in Phase 5A.

### Verification record

Verification completed: **72/72 backend tests pass** (49 existing + 23 new); **21/21 JavaScript tests pass** (12 existing static-frontend tests + 9 new React-helper tests). The complete backend run includes its existing isolated temporary training regression; active model/vectorizer hashes remained identical before and after. No production training/promotion command was run.

- Active model SHA-256: `497888DCC4801A5D1DE5F48FC2B5160C05E38DB6AA95D4261CF42963AB911927`.
- Active vectorizer SHA-256: `7E4F15FED3E6A3A104CB8D42E7BF73AC8F45EF7859F4436288ECD4988377FEE4`.
- Git diff confirms no changes to frontend/static/templates, model artifacts, backend/services/configuration or requirements. Existing API behavior is exercised unchanged through the tests; no production patches were necessary.
- Existing joblib/NumPy deprecation and Streamlit bare-context warnings appeared but did not fail tests.
- The pre-existing Phase 5 audit remains unchanged and untracked locally; only the two new Phase 5A test files and this document are included in the Phase 5A commit.
