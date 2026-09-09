# Phase 6A — URL ingestion feasibility audit

Date: 9 September 2026. Repository baseline: `195de41`.

**Audit only.** This document proposes a design; no URL endpoint, dependency,
parser, frontend change, migration, or database write was implemented. No tests
that submit analysis fixtures were run. Existing untracked
`docs/phase5_database_audit.md` was left untouched.

**Recommendation:** add one bounded input-acquisition adapter before the existing
Flask analysis orchestration. Initially accept explicitly supported public
consultation sources with published response records: approved CSV/JSON exports
and a narrowly tested server-rendered HTML adapter. Reject uncertain extraction
and incomplete collections. Preserve TF-IDF + Multinomial Naive Bayes, insights,
schema-2.0 results, and the existing PostgreSQL service boundary.

## 1. Current architecture

| Area | Existing implementation and implications |
| --- | --- |
| Flask JSON | `server.py:analyze`, `POST /analyze`, accepts `{responses:[...]}` and calls `run_analysis`. It is not a remote JSON-file downloader. |
| Flask CSV | `server.py:analyze_file`, `POST /analyze-file`, accepts multipart CSV. `mode=inspect` parses without analysis/persistence; analysis maps rows and calls `run_analysis`. |
| Orchestration | `server.py:run_analysis` calls `analysis_service.analyze_batch`, then `model_manifest` and `persist_analysis` when PostgreSQL is configured. |
| Normalization | `analysis_service.py:normalize_response` preserves input text, assigns 1-based `row_index`, validates typed IDs and bounded metadata, and calls `normalize_date`. |
| Inference | `model_service.py:get_service` caches `InferenceService`; `predict_batch` validates each row, applies the existing TF-IDF vectorizer and MultinomialNB, and rejects unsupported rows. |
| Preprocessing | `text_utils.py:preprocess_text` is already invoked by model validation. It is not an HTML extractor and must not replace source evidence. |
| Insights | `analyze_batch` calls `text_insights.build_insights`; URL input must take this same path. No new sentiment, summary, recommendation, or topic algorithms. |
| Persistence | `persistence/flask_service.py:persist_analysis` creates a consultation, import, ordered snapshot, run and receipt in one short transaction, then commits completed results in another. Network acquisition and inference must remain outside these transactions. |
| History | Existing `/consultations`, consultation detail and saved-run GETs read PostgreSQL. Results are replayed from stored JSON; opening history must never refetch the source URL. |

Current hard analysis limits from `config.py`: 2,000 response occurrences,
1,000,000 combined text characters, 5,000 characters per feedback, 2,000
serialized metadata characters per row, 5,000,000 CSV bytes and 50 CSV columns.
CSV is comma-delimited UTF-8 with an optional BOM. Optional `date`, `category`
and `source` strings and stringified IDs are limited to 256 characters.

Consultation IDs are internally generated UUIDs. The current Flask adapter uses
the title `Flask consultation analysis`; it does not accept caller titles or
return consultation/run IDs in successful analysis JSON. Each deliberate
analysis request creates a new consultation, including repeated identical input.
There is no public idempotency/retry command.

The Phase 5D/5E updates at the top of `docs/phase5_contracts.md` take precedence
over historical statements farther down that describe Flask as stateless.
`docs/analysis-api.md`, the repository module docstring and parts of
`persistence/README.md` also retain older stateless descriptions. Do not use
those statements to design a second persistence path.

## 2. Recommended integration point

Add `POST /analyze-url` to `server.py` as a thin acquisition route:
validate a supported URL, acquire and extract records, construct provenance,
then invoke the existing `run_analysis(records, **provenance)` exactly once.
Do not make Flask call its own `/analyze` or `/analyze-file` over HTTP.

Proposed pure acquisition entry point: `url_ingestion.acquire_consultation(url)`.
Its internal return value contains mapped records and persistence keyword
arguments. It performs no ML, database writes or response rendering. A dedicated
fetch module owns all network access; adapters cannot bypass it.

Require configured persistence for this new route and return 503 before remote
acquisition when it is absent. Leave existing routes' optional stateless behavior
unchanged. An actual save failure must retain the existing 503 semantics.

There is no reason to modify the inference or persistence service implementation
for the recommended version. The new endpoint and provenance convention require
an approved additive contract before implementation; this audit is not approval
to silently change existing contracts.

## 3. Reusable existing components

| Component | Reuse |
| --- | --- |
| `csv_ingestion.parse_csv` | Parse downloaded CSV bytes through a bounded in-memory stream. Retain all parsed rows and original header order. |
| `inspect_columns` | Suggest exact aliases; absence or ambiguity must not become a guess. |
| `map_csv` | Use the adapter's reviewed mapping. Preserve omitted versus explicitly empty optional mappings and the existing JSON-string encoding of `metadata_columns`. |
| `normalize_response`, `normalize_date` | Reuse indirectly through `analyze_batch`, once, with existing original-text, date and rejection behavior. |
| `validate_feedback`, `predict_batch`, `get_service` | Reuse through analysis. Do not pre-filter non-English or zero-vocabulary rows in the scraper. Their rejections must remain counted and traceable. |
| `run_analysis`, `model_manifest`, `persist_analysis` | Preserve the inference, provenance, receipt, commit and failure sequence. |
| `PersistenceService.create_import/create_snapshot/create_run/complete_run` | Reuse behind `persist_analysis`; no duplicate consultation creation logic. |
| Existing React API client/results/history | A future URL helper should use the same `request` and `validateAnalysis` functions. Successful results should enter the existing results state. No second client or results screen. |

Do not call preprocessing on extracted evidence before passing it to analysis.
Decode HTML entities and convert the selected answer DOM to deterministic plain
text, but retain case, punctuation, negation and meaningful paragraph boundaries.
This extracted text is the analysis input; the original HTML remains separate
provenance. It is not byte-for-byte HTML presented as a quotation.

## 4. Proposed URL flow

```text
React submits one URL
  -> Flask validates request, enabled source and persistence configuration
  -> fetcher validates destination, DNS, connection and bounded response
  -> registered source adapter recognizes consultation and published records
  -> approved export OR bounded HTML response pages
  -> completeness/structure checks and deterministic field mapping
  -> evidence bundle plus ordered ResponseInput records
  -> existing run_analysis -> analyze_batch -> existing model and insights
  -> existing persist_analysis -> committed PostgreSQL graph
  -> unchanged Analysis2_0 JSON -> existing React results
  -> existing history refresh/open reads saved results
```

No automatic polling, crawling the whole domain, browser rendering, background
job, or intermediate database import is needed for this bounded synchronous
version. Acquisition failure creates no consultation. Analysis row failures keep
the existing partial-row rejection semantics; extraction failure is different
and must not masquerade as a partial successful scrape.

## 5. Proposed API contract

**New route:** `POST /analyze-url`, `Content-Type: application/json`.

```json
{"url":"https://<approved-host>/<approved-consultation-path>"}
```

This is a contract illustration, not a supported real URL. Require a JSON object
with exactly one nonempty string field `url`, at most 2,048 characters; bound the
request body to 16,384 bytes. Reject unknown options. Do not accept arbitrary
headers, cookies, methods, credentials, proxy addresses, CSS selectors, JSONPath,
page counts, redirect limits or TLS bypasses. Source mapping is server-owned.
Do not accept URL input via GET, which could trigger costly analysis through
link previews and ordinary navigation.

**Success:** HTTP 200 with the exact existing schema-2.0 analysis object:
`schema_version`, totals, `responses`, `rejected`, `warnings`, sentiment and all
existing insight fields. No URL-specific result wrapper, run ID, invented
warning shape or new analysis schema. Send `Cache-Control: no-store`. A 200 means
analysis completion has committed. Match existing error behavior for analysis
400, model/storage 503 and unexpected internal 500.

**Acquisition errors:** use the existing `{error:true,message:string}` envelope
with optional `details`, already supported by analysis errors and the API client.
For this new route, define bounded machine-readable details:

```json
{
  "error": true,
  "message": "This page does not expose a supported collection of published responses. Upload a CSV instead.",
  "details": {
    "code": "UNSUPPORTED_SOURCE",
    "stage": "extraction",
    "retryable": false,
    "suggested_action": "upload_csv"
  }
}
```

| HTTP | Proposed cases/codes | React action |
| --- | --- | --- |
| 400 | `INVALID_URL`, `URL_NOT_ALLOWED`, request too large | Retain URL; correct it or choose a supported source. Do not expose resolved IPs. |
| 422 | `UNSUPPORTED_SOURCE`, `NO_PUBLIC_RESPONSES`, `UNSUPPORTED_FORMAT`, `AMBIGUOUS_MAPPING`, `EXTRACTION_CHANGED`, `INCOMPLETE_COLLECTION`, `CONTENT_LIMIT`, `JS_REQUIRED` | Show the safe message and CSV/text fallback. No successful empty analysis. |
| 422 | `SOURCE_ACCESS_RESTRICTED` for login/CAPTCHA/anti-bot/robots-policy refusal | Explain unsupported access; do not offer bypass or automatic retry. |
| 502 | `SOURCE_UNAVAILABLE` for upstream failure, invalid upstream response or unusable TLS | Safe error; operator may retry later. Do not relay remote HTML. |
| 504 | `SOURCE_TIMEOUT` | Restore controls; allow manual retry. |
| 429 | `URL_INGESTION_BUSY` for local acquisition capacity | Restore controls; show bounded retry advice. No implicit resubmission. |
| 503 | Persistence not configured or existing model/save failure | Reuse existing service-unavailable presentation. |

An upstream 404 describes a missing source, not a missing local consultation;
map it to 422 `SOURCE_NOT_FOUND`. An upstream 429 maps to 502
`SOURCE_RATE_LIMITED` with manual retry advice, not automatic crawling retries.
Use the same error envelope for unexpected exceptions, without driver messages,
TLS internals, raw upstream text, response contents or full sensitive URLs.

React should disable duplicate submissions and restore the button in `finally`;
retain the URL on failure and clear stale results through existing state rules.
The shared client's 90-second timeout is an upper client bound, not cancellation
of Flask work. A lost success response can hide a committed result: tell the
operator to check history before resubmitting. Do not change retry semantics.

No preview endpoint or extraction-token cache is recommended initially. A future
inspect/confirm workflow must bind confirmation to an immutable acquisition
digest; refetching between preview and analysis cannot promise identical input.

## 6. Extraction strategy

### Evidence from government sources

On the audit date, one direct Python HTTP GET to the public MyGov discussion
below returned HTTP 200, `text/html; charset=UTF-8`, 118,548 bytes, without login
or JavaScript execution. A read-only standard-library HTML inspection found
`#comment-list`, ten `.comments-row` containers, ten
`.field--name-comment-body` elements, stable-looking `comment-<number>` IDs, and
pagination. This proves initial response markup exists, not that all pages or
future layouts have been certified.
[MyGov discussion inspected](https://www.mygov.in/group-issue/inviting-ideas-ai-and-semiconductors).

The browser-readable page also displayed 82 comments, nine numbered pages,
mixed-language text and attachments. That count is a dated observation, not a
constant. This open discussion is an adapter-development example, **not an
approved production fixture or a promised supported URL**. Capture approved
fixtures and verify exact nested selectors before enabling its family.

Two other observations constrain the design: GOV.UK explicitly distinguishes
public feedback from the government's response, so a consultation landing page
is not inherently a citizen-response dataset.
[GOV.UK publishing guidance](https://guidance.publishing.service.gov.uk/publish-update-retire-content/standard-content-types/consultations/).
Defra documents optional published responses and their pagination; this is a
possible later Citizen Space adapter, not proof of a generic export API.
[Defra accessibility statement](https://consult.defra.gov.uk/accessibility_policy/).

### Positive identification, not boilerplate subtraction

Register an adapter by exact hostname and reviewed path/query rules. Each
adapter specifies a consultation marker, collection container, individual-record
boundary, answer-body selector or structured field, source ID, optional absolute
timestamp, pagination rule and completeness rule. A governmental hostname alone
does not qualify every page on it.

For the MyGov candidate, locate the verified comment-list subtree and extract
only answer-body descendants of individual comment containers. Do not extract
whole `.comments-row` text: it can include usernames, relative timestamps,
Like/Dislike controls and attachment labels. Distinguish reply-form IDs from
actual comment IDs. Nested replies need explicit fixture-backed boundaries;
unsupported nesting must fail rather than double-count parent/child text.

Never use `body.get_text()`, article-readability extraction, paragraph length,
sentiment, or an LLM as evidence that text was submitted by a citizen. Excluding
`nav`, `header`, `footer`, `script`, `style`, ads and hidden controls is a
secondary safeguard inside the positively identified structure. Do not include
question headings, consultation descriptions, author biographies, government
answers, vote counts or unrelated linked articles in analysis text.

Parse HTML with Beautiful Soup using an explicitly selected parser. Convert only
answer text, decoding entities once and mapping block boundaries deterministically.
Reject structurally changed templates rather than silently returning zero or
falling back to page text. Preserve a raw record for every identified response
occurrence, including blank/invalid bodies; let existing analysis reject those
rows. Do not drop duplicate text or source IDs based on content.

One input record must correspond to one published free-text submission/comment.
Do not split sentences into respondents or concatenate unrelated questionnaire
answers. Multi-question surveys require a separately reviewed question mapping;
they are outside the initial HTML adapter. Use absolute dates when present;
retain relative timestamps as raw metadata, not invented calendar dates. Author
names are unnecessary for sentiment; do not map them as citizen identity.

### Structured downloads

Inspect links only in the adapter's recognized response-export area. A `.csv`
suffix or label containing “responses” is insufficient: it might be a template,
aggregate count table, government report or attachment to one comment. Match
expected collection identity, schema and response field. Fetch only the one
approved export; ambiguous candidates fail with upload guidance.

- CSV: reuse `parse_csv`, `inspect_columns`, `map_csv`. An adapter supplies the
  reviewed mapping; ambiguous/unrecognized columns require local CSV upload and
  the existing mapping UI. Do not add a second CSV parser.
- JSON: bounded standard-library decoding, then accept an explicitly registered
  schema such as `{responses:[ResponseInput,...]}` or an adapter-mapped array.
  Reject excessive nesting, duplicate object keys, non-finite numbers, JSONP
  and arbitrary metadata documents. Preserve raw types and input order.
- XLSX/XLS/ODS, TSV, XML, NDJSON, ZIP and PDFs may be recognized as unsupported
  links, but must not be downloaded and interpreted automatically in v1. The
  current pipeline does not parse these formats. A CSV/JSON link is supported
  only after a real source fixture proves its meaning and permissions.

No anonymous downloadable response export was verified during this audit.
Structured-first is a design priority, not a claim that MyGov or Citizen Space
offers an unrestricted public CSV/JSON endpoint. The MyGov developer portal's
listing is not enough to establish anonymous access or a stable response schema.
[MyGov developer portal](https://developers.mygov.in/).

## 7. Supported URL types

The first release should enable **one reviewed source family**, not all `.gov`
or `.gov.in` sites:

1. Exact approved HTTPS URLs for public CSV/JSON response exports with a
   registered schema/mapping, directly or through one recognized landing page.
2. A MyGov-style server-rendered published-comment adapter, initially enabled
   only for explicitly approved, closed/stable discussion paths that pass the
   acceptance fixtures. Small collections with ordinary numbered pagination
   can be supported within the shared budget in section 10.

The pilot's source list starts empty until at least one real URL passes source
review, raw-HTTP extraction and completeness tests. The observed MyGov markup
makes this a realistic implementation target without browser automation; it does
not remove that release gate. If no suitable government collection meets the
criteria, ship no advertised HTML support and retain CSV upload.

The scope is **publicly published text responses**, not every submission received
by the authority, every citizen, or a representative population. Closed status
reduces movement but does not prove immutability. Non-Latin responses remain in
the input count and receive existing model rejection reasons; no translation or
language-model replacement is proposed.

## 8. Unsupported URL types

- Arbitrary websites, unregistered government paths, search results, policy
  documents, consultation forms and official summaries without response records.
- Authenticated data, signed/tokenized downloads, intranets, IP-literal hosts,
  nonstandard ports, and credential-bearing URLs.
- JavaScript-only collections without an approved public structured endpoint;
  browser interaction, infinite scroll, form submissions and multi-step sessions.
- Open/live paginated discussions without a stable export or consistency token.
- Records whose actual answer requires an attachment, hidden expansion request,
  PDF/OCR, image, spreadsheet or other unsupported content. For v1, a response
  collection with such required content fails completeness; do not analyze
  “see attachment” as if it were the complete response.
- Unreviewed nested threads, multi-question surveys, ambiguous exports,
  inaccessible later pages and collections beyond configured budgets.
- Automatic translation, text deduplication, participant identification,
  identity verification, cross-site merging, ongoing synchronization or retries.

## 9. JS-rendered page strategy

Use the server HTML first. A script tag alone does not make a page unsupported:
the direct MyGov observation shows comments can already be available. A reviewed,
bounded embedded JSON data object can be read as data, never evaluated as code.
Likewise a documented public GET API can become an explicit adapter if its
access and schema are established independently.

If the response collection is absent and no approved data source exists, return
422 with CSV/text fallback. Report `JS_REQUIRED` only when adapter-specific
markers establish that condition; otherwise report unsupported/changed extraction.
An empty login or challenge shell is not an empty consultation.

Do not add Selenium, Playwright, Puppeteer or a browser worker to the product.
The audit found no need for them for the proposed pilot. Reconsider separately
only if an essential approved source cannot provide HTML or a permitted export;
that would introduce a materially larger network, execution and resource surface.

## 10. Pagination strategy

Prefer one complete response export. For HTML, follow only the adapter's explicit
next-page link within the same consultation and approved host/path/query scope.
Start at its canonical first page; reject user-supplied partial-page/filter URLs
unless the adapter can safely canonicalize them to the complete collection.

Proposed pilot ceilings, enforced together: ten content pages; twenty total HTTP
requests including redirects, robots-policy checks and one final consistency
check; no concurrent page fan-out; 5,000,000 aggregate downloaded body bytes;
2,000 response occurrences; twenty seconds total acquisition time. Do not raise
existing analysis limits. Sites needing slower polite access should use exports
or be unsupported rather than evading these bounds.

Maintain visited normalized URLs and source-record identities. Repeated pages,
cycles, duplicate source IDs across pages, changing advertised counts, missing
next pages or budget exhaustion cause `INCOMPLETE_COLLECTION`; never silently
drop duplicated records or claim the first page is the full dataset. Identical
text in distinct actual submissions remains separate. Unknown total count is
acceptable only if a reviewed terminal-page rule proves traversal completion;
otherwise fail. Verify advertised published count against extracted occurrences
before analysis rejection, not against accepted model rows or total participants.

Recheck collection count/version when supported; retain fetch start/end times.
Without an upstream snapshot mechanism, even a closed site's traversal is an
observation over a time interval, not an atomic source-database snapshot. Do not
promise stronger completeness. Infinite scrolling and reverse-engineered POST
pagination are outside v1. Any explicit partial-scope mode would require a later
contract/UI decision so results cannot be mistaken for the whole consultation.

## 11. Security/SSRF protections

The following are proposed release requirements, not defenses already present
in the project. Fail closed if destination safety or extraction is uncertain.

**Destination policy.** An exact source allowlist plus address validation is
required. Disable automatic redirects and apply the same checks to every
redirect, discovered export, pagination URL and policy request. Never treat a
previously approved hostname as permanently safe. These choices follow OWASP's
allowlist and redirect guidance.
[OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

**URL parsing.** Schemes outside HTTP/HTTPS must always fail; v1 should be stricter
and accept HTTPS on port 443 only, rejecting plain HTTP with an HTTPS-source
message. Reject userinfo, control characters, CR/LF, backslashes, malformed
escapes, ambiguous host/port syntax, fragments and unapproved query keys before
network access. Compare normalized ASCII hostnames exactly; no suffix/substring
matching. Reject numeric alternate IP forms, zone IDs and unapproved Unicode
hostnames. Resolve relative links against the verified response URL, then
validate the complete result; ignore HTML `<base>` overrides. Parsing/joining
is not validation, as Python's documentation emphasizes.
[Python URL parsing](https://docs.python.org/3/library/urllib.parse.html#url-parsing-security).

**Address policy.** Check all A and AAAA answers, including CNAME resolution;
reject the destination if any answer is prohibited. Require globally reachable
unicast addresses and explicitly deny loopback, private, link-local, unspecified,
multicast, reserved/documentation ranges, CGNAT, cloud metadata destinations and
IPv4-mapped/transition forms that could bypass IPv4 rules. Reject `localhost`,
local name suffixes and IP-literal input. `not is_private` alone is insufficient;
address classifications differ, including shared address space. Test the actual
Python runtime's behavior against explicit edge cases.
[Python ipaddress documentation](https://docs.python.org/3/library/ipaddress.html).

**DNS rebinding and transport.** Connect to a validated numeric address, not a
hostname that the HTTP client resolves again after validation. Preserve the
approved hostname for HTTP Host, TLS SNI and certificate verification. Each
connection/reconnect must stay within the validated address set; disable automatic
retries and unsafe cross-host connection reuse. Never disable certificate checks.
urllib3 documents numeric-address HTTPS connections with custom SNI/Host and
certificate-host verification, making it a suitable transport foundation, not a
complete SSRF solution by itself.
[urllib3 advanced usage](https://urllib3.readthedocs.io/en/stable/advanced-usage.html#custom-sni-hostname).

**Defense in depth.** Deployment egress rules should also block private services
and metadata destinations. Keep URL acquisition under the existing local-operator
scope; it must not become an unauthenticated public fetch proxy. Reject foreign
browser origins for its write-like API, retain restrictive CORS, and apply
bounded admission/rate controls. Application URL checks do not replace network
isolation or access control.
[OWASP SSRF risks and network controls](https://owasp.org/Top10/2021/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/).

**Proposed acquisition limits and handling:**

| Control | Pilot policy |
| --- | --- |
| Redirects | At most three per resource and twenty requests overall; validate before connecting; reject loops, HTTPS downgrades and unapproved cross-host destinations. |
| Time | DNS at most 3 seconds; connect 3 seconds; read inactivity 5 seconds; all clipped to a monotonic 20-second acquisition deadline. Slow drip reads must not extend that deadline. |
| DNS deadline | Use a resolver with an explicit bounded lifetime. A socket read timeout does not necessarily bound system DNS lookup. No abandoned unbounded resolver threads. |
| Body bytes | HTML at most 2,000,000 per resource; CSV/JSON at most 5,000,000; aggregate 5,000,000. Enforce while streaming even with missing or false Content-Length. |
| Compression | Request identity encoding and reject non-identity Content-Encoding in v1; reject archives. If compression is later needed, independently bound compressed and expanded bytes. |
| Media types | Registered `text/html`, `text/csv` or `application/json`, matched to adapter expectations and parse structure. Reject HTML login pages masquerading as CSV/JSON, binary content and unapproved MIME aliases. |
| Encoding/parser work | UTF-8/BOM CSV rules unchanged; HTML/JSON UTF-8 for pilot. Bound JSON nesting, headers, links and DOM work; parse no XML external entities; fetch no subresources. |
| Headers/credentials | Fixed User-Agent, Accept and encoding headers only. No caller headers, cookies, Authorization, cloud credentials, environment proxies or ambient `.netrc` credentials. Never reuse login sessions. |
| Capacity | Admit at most one URL acquisition at a time in this local pilot; a second receives a controlled busy response. A multi-worker deployment needs a shared enforcement point, not independent per-process claims. |
| Policy/access | Review site terms and published reuse conditions before enabling a source; honor robots policy as an operational rule, not permission to access data. Policy fetches use the same safeguards. Stop on access controls/challenges. |
| Output/logging | Return plain text through React's normal escaped rendering; never render upstream HTML. Sanitize diagnostic fields, omit personal feedback/full URLs from ordinary logs, and never expose raw captures through static paths. |

DNS resolver lifetime support is available in dnspython; its documented resolver
configuration also covers Windows. Query absolute names without search suffixes
and keep retries within the shared deadline.
[dnspython resolver documentation](https://dnspython.readthedocs.io/en/stable/resolver-class.html).

These concrete ceilings are design proposals to benchmark before release. The
90-second client timeout must accommodate bounded acquisition plus existing
inference and persistence; no audit evidence yet establishes worst-case latency.

## 12. Persistence/provenance plan

**Preserve the original submitted URL.** Store it, the canonical acquisition URL
and final resource URLs with the import, associated through the existing
consultation/response/snapshot relationships. Do not turn a URL or its hash into
consultation identity, invent a filename, overwrite a prior consultation or
refetch the page when reopening/retrying saved analysis.

There is a hard compatibility constraint: both `PersistenceService.create_import`
and `schema_v1.py` restrict source types to `json`, `paste`, `csv`. Passing
`source_type='url'` or `'html'` is invalid. Do not edit the frozen migration/schema
or mislabel downloaded HTML as raw JSON.

**Recommended no-schema-change representation:** URL acquisition produces an
explicit versioned JSON evidence bundle, persisted as `source_type='json'`.
The bundle really is JSON: it contains resource descriptors, original downloaded
bytes encoded as base64, per-resource SHA-256 and extraction records. Distinguish
this acquisition format from original media types in metadata. This is an
additive source-metadata convention to review before implementation, not a new
persistence layer or a redefinition of ordinary JSON/CSV uploads.

| Existing field | Proposed content |
| --- | --- |
| `imports.raw_bytes` | UTF-8 bytes of the versioned JSON evidence bundle; no request credentials or cookies. |
| `imports.raw_checksum` | Existing repository-computed SHA-256 of those bundle bytes. It is **not** the hash of an individual HTML/CSV resource. |
| `imports.source_metadata` | `acquisition_kind:'url'`, bundle version, original/canonical URL, resource URL table, media type/encoding, timestamps, safe redirect chain, resource hashes, adapter/version/source-code hash, parser/package versions, publication scope and completeness evidence. |
| `imports.mapping` | Effective field/selector mapping, sort/pagination policy and adapter ID. Preserve omitted-versus-empty CSV options. |
| `imports.parser_version` | Keep current `mapped-input-v1`; it describes the existing repository boundary. Record actual URL extractor version separately rather than pretending this field identifies it. |
| `responses.raw_record` | One source comment object or original structured row per mapped occurrence, including bounded source ID/location and required unselected fields. |
| `responses.logical_record` / `original_text` | Exact mapped `ResponseInput` and extracted answer text before existing analysis normalization. |
| `input_snapshots.logical_payload` | Existing ordered logical inputs unchanged; small per-row metadata references identify the source resource and record. |
| `analysis_runs.model_manifest` / result graph | Existing loaded-model manifest and saved schema-2.0 results. URL extraction version/hashes live in import provenance; no change to ML manifest construction needed. |

Repository `create_import` requires `len(raw_records) == len(records)` and
preserves their one-to-one ordering. A page bundle is not `raw_records`: it is
the separate `raw_bytes` evidence. Do not insert one raw record per page against
one mapped record per citizen.

Store each resource once in the bundle; cap its serialized size at 8,000,000
bytes, including base64 and metadata, and reject overflow before analysis or
writes. Do not silently omit oversized evidence. Record byte-decoding and
DOM-to-text rules so the original capture and mapped text can be distinguished.
Reject unsupported encodings instead of silently repairing them. HTML captures
can contain public names or personal material even if analysis omits them;
enable sources only after reviewing appropriate local retention/access. Do not
collect profiles, avatars or linked personal documents.

Use short per-row `source` labels, e.g. `Published comments: www.mygov.in`.
Full URLs can exceed the 256-character source limit or the 2,000-character row
metadata budget: store full URLs once in import metadata and put a bounded
resource key and source-record ID in each row. A sealed snapshot thus retains
source references and can reach the original URL through its immutable imports,
without altering its schema. Reject URL credentials and token-like query keys
before acquisition so preserving the original URL does not preserve secrets.

Keep existing receipt, failure and retry semantics. Reanalysis of the same URL
is a new deliberate acquisition with new identities; it is not a retry of a
saved snapshot. A future persisted-run retry must reuse the captured input and
pinned manifest without network access. Failed acquisition creates no rows;
failed completion follows existing rollback and separate FAILED recording.

If explicit `source_type='url'` becomes a product requirement, stop and propose a
new migration plus contract change separately. It is unnecessary for this plan.

## 13. Testing strategy

1. **Fetcher security:** reject unsafe schemes, encoded/decimal/hex IPs,
   localhost variants, userinfo, CRLF/backslashes, misleading suffix domains,
   invalid ports, IPv6 scopes/mapped addresses, mixed public/private DNS answers,
   metadata addresses, rebinding, private redirect targets and relative-link
   host changes. Assert the blocked address is never connected to. Verify Host,
   SNI and certificate hostname with controlled transport tests; no live probing
   of internal services.
2. **Resource control:** redirect cycles, late redirects, missing/false lengths,
   chunked overflows, slow-drip reads, DNS deadlines, TLS failures, forbidden
   compression, MIME mismatch, invalid encoding, deep JSON, duplicate JSON keys,
   parser limits and admission limits. Assert all resources close on failure.
3. **Adapter fixtures:** reviewed representative public-source captures, complete
   small collections, empty published lists, attachment-only responses, nested
   replies, changed selectors, boilerplate containing “response”, government
   summaries and login/challenge HTML. Expected answer text and source locations
   must be hand-checked. No boilerplate must become a citizen response.
4. **CSV/JSON parity:** downloaded structured data must map identically to the
   equivalent existing input path. Cover ambiguous headers, BOM, quoted commas
   and multiline records, blank rows, duplicate text/IDs, integer versus string
   IDs and omitted/empty mappings. Never use content deduplication.
5. **Pagination:** full ordered collection, cycles, repeated IDs, moving counts,
   missing pages and each budget boundary. Partial acquisition must fail before
   calling ML or persistence. Verify published count versus extracted count and
   accepted/rejected analysis totals separately.
6. **Flask contracts:** exact schema-2.0 success and safe error envelope/status;
   new route accepts only POST JSON; requires configured persistence; no save on
   acquisition/all-invalid failure. Assert `run_analysis` is used once, model
   behavior is unchanged, and legacy routes retain their existing contracts.
7. **Persistence:** evidence bundle hash and byte recovery, original URL and
   final URLs, source-record order, row-level provenance links, extractor version,
   immutable snapshot, result equality, separate failed-completion behavior and
   saved replay without network. Use existing service/foundation tests as the
   contract baseline rather than reimplementing their logic.
8. **React integration:** actual submit through the existing client, disabled
   duplicate submission, restored controls and retained URL on errors, successful
   result render, and new persisted consultation appearing after history refresh.
   Open it, compare stored results, return and refresh again without refetching
   the public source. Preserve Home/New Analysis and existing CSV/text flows.
9. **Regression:** run existing backend, persistence and relevant JavaScript
   suites; frontend build/lint; compare all active model/vectorizer hashes.
   Use stateless Flask for fixture-posting suites such as
   `tests/frontend.test.mjs` with explicit `BASE_URL`. The existing PostgreSQL
   write integration suite retains fixtures: do not point it at the working
   database without explicit authorization. Prefer isolated test storage and
   read-only checks of existing local records.
10. **Release smoke:** after permission/source review, exercise at least one
    real approved government URL end-to-end using the production fetch policy.
    Network-free fixtures establish deterministic behavior; they do not prove
    live reachability, permissions or selectors. Live tests remain opt-in and
    must not fabricate submissions on the source site.

This audit ran no product regression or ingestion tests because no implementation
was changed. The single raw-HTML structural probe and official-source browsing
are feasibility evidence only.

## 14. Required files

These are proposed implementation touchpoints, not changes made in this audit.
Frontend names are limited to the existing URL/client/orchestration integration
identified in this session; no unrelated frontend files were scanned.

| Existing file | Necessary future change |
| --- | --- |
| `server.py` | Thin `/analyze-url` route, route-specific request limit and safe acquisition error mapping; call existing orchestration. |
| `config.py` | URL feature flag, limits and explicit source-policy configuration; no ML threshold changes. |
| `requirements.txt` | Declare reviewed direct acquisition dependencies. |
| `docs/phase5_contracts.md` | Add approved URL acquisition/provenance compatibility note without rewriting historical guarantees. |
| `docs/analysis-api.md` | Document new route, exact limits/errors and current persistence semantics. |
| `persistence/README.md` | Document evidence-bundle/source-metadata convention, not a new persistence implementation. |
| `frontend/src/lib/api.js` | One helper using existing request/validation functions. |
| `frontend/src/components/UrlPane.jsx` | Wire the existing URL input pane to submit/loading/error behavior; retain styling. Reinspect this relevant file when implementing. |
| `frontend/src/components/AnalysisWorkspace.jsx` | Pass URL value/submit props to the existing pane. |
| `frontend/src/App.jsx` | URL state/handler entering existing result/error/busy flow. |
| `frontend/vite.config.js` | Verify development/preview forwarding of `/analyze-url`; the existing `/analyze` prefix proxy may already cover it, so edit only if needed. Production routing needs the same verification. |
| `tests/test_flask_persistence.py` | URL boundary/provenance assertions using existing persistence test patterns. |
| `tests/phase5_react_contracts.test.mjs` | Add URL helper contract coverage without changing legacy expectations. |

Proposed new files:

- `url_fetcher.py`: bounded resolution, destination policy, pinned transport and
  safe response acquisition; no parsing/ML/SQL.
- `url_ingestion.py`: adapter selection, completeness orchestration and evidence
  bundle construction; no database writes.
- `url_sources.py`: small explicit source registry and first reviewed extraction
  adapter/mappings. No generic plugin framework is needed for one source.
- `tests/test_url_fetcher.py`, `tests/test_url_ingestion.py`,
  `tests/test_url_api.py`: security, extraction and Flask contracts.
- `tests/fixtures/url_ingestion/`: reviewed bounded captures/expected record
  mappings and source notes, excluding unnecessary personal information.
- `tests/phase6_url_browser.test.mjs`: opt-in real React integration smoke using
  approved source input and existing history APIs.

No expected changes to `analysis_service.py`, `model_service.py`,
`text_utils.py`, `text_insights.py`, `csv_ingestion.py`, persistence service/
repository/database/history implementation, migration files, ML artifacts,
ResultsSection, consultation history logic or CSS. Do not add a second Flask
app, API client, database, persistence service or localStorage history.

## 15. Dependencies

Recommended direct dependencies for the proposed Windows-compatible fetch path:

| Dependency | Reason |
| --- | --- |
| `urllib3` | Streamed HTTP, explicit connection/read controls and numeric-address TLS with original hostname verification. Implement policy around it; default client configuration is insufficient. |
| `dnspython` | Explicit DNS lifetime and A/AAAA resolution without an unbounded system-resolver call. The HTTP client must use those validated addresses. |
| `beautifulsoup4` | Maintainable, scoped HTML parsing/selectors. Use the standard-library `html.parser` backend initially; pin/test parser behavior. |

The repository does not currently declare these as direct dependencies; do not
depend on their incidental installation through another package. Select and pin
compatible reviewed versions during implementation, not speculative version
numbers in this audit. Beautiful Soup documents multiple parsers and differing
parse trees, which is why the backend choice must be explicit.
[Beautiful Soup documentation](https://www.crummy.com/software/BeautifulSoup/bs4/doc/).

Use standard-library `json`, `io`, `hashlib`, `base64`, `ipaddress`, URL parsing
and time utilities. No new pandas ingestion path, Requests-plus-second-client,
Scrapy, lxml, trafilatura, browser engine, OCR, LLM, vector database or ML package
is needed. A managed egress gateway could replace parts of transport/DNS policy
later, but adding infrastructure is not required for the local pilot.

## 16. Implementation phases

1. **Approve scope and contract:** choose one real public collection, establish
   allowed use, completeness rules and evidence retention, review the JSON
   bundle convention, and identify exact host/path/export rules. Do not enable
   a hostname-wide wildcard merely to get a demo working.
2. **Secure acquisition first:** implement URL policy, bounded DNS and pinned
   HTTP transport behind a disabled feature flag. Pass network-policy and
   timeout/resource tests before connecting extraction or analysis.
3. **Build one fixture-backed adapter:** use CSV/JSON if an actual public export
   exists; otherwise the observed server-rendered MyGov family is the concrete
   HTML candidate. Validate source boundaries and record-level fidelity offline.
4. **Completeness and provenance:** add bounded pagination only where necessary,
   evidence serialization/hashes, source references and strict failure behavior.
   Prove compatibility with existing service invariants without migrations.
5. **Thin Flask integration:** add the proposed route and exact error contract,
   reuse `run_analysis`, and test success commits and all pre-save failures.
6. **Existing React integration:** wire the URL pane/client and reuse current
   results/history. Verify routing, duplicate-click handling and saved replay.
7. **Controlled release verification:** run regression/build/hash checks, one
   approved live acquisition, PostgreSQL equality and real history refresh/open.
   Enable only the tested source entry. Unsupported sources fail clearly.

If live sources cannot meet bounds or extraction fidelity, narrow/disable the
adapter. Do not respond by changing ML, bypassing access controls, silently
truncating responses, or adding browser automation to the same phase.

## 17. Risks and mitigations

| Risk | Mitigation / honest limitation |
| --- | --- |
| Wrong material analyzed | Positive record/answer selectors and hand-checked fixtures; no whole-page fallback. |
| Source changes | Versioned adapters, structural/completeness assertions, disable failing entry. One observed page is not site-wide certification. |
| Partial or shifting collection | Prefer exports/closed sources; bounded traversal and consistency checks; fail incomplete acquisition. No claim of upstream atomicity. |
| Language/participation bias | Existing rejection counts remain visible; describe published comments, not all citizens or all submissions. No silent translation/filtering. |
| Attachments and multiple questions | Explicitly unsupported until a separate mapping is designed; do not miscount answers or captions as people. |
| SSRF or DNS rebinding | Exact allowlist, IP validation, pinned connection, redirect checks and deployment egress restrictions. |
| Resource exhaustion | Shared byte/time/page/request limits, bounded DNS/parsing and acquisition admission; no automatic retries. |
| Duplicate records after uncertain success | Preserve deliberate-request semantics; check existing history before manual retry. No implicit URL deduplication or false idempotency promise. |
| Personal data in captures | Review source/retention, retain only required bounded capture scope, keep captures out of static serving/logs, do not scrape profiles. |
| Provenance confused with transport | Explicit JSON bundle version and original media types; bundle hash distinct from resource hashes; original URL and extraction mapping retained. |
| Outdated documentation | Use Phase 5D/5E and current code as authority; update only relevant additive documentation when implementing. |
| API listings mistaken for availability | Verify anonymous raw HTTP access and real response schema before registering an export/API adapter. |

## 18. Definition of Done

The future URL implementation is complete only when all of the following hold:

- At least one explicitly documented real government consultation source passes
  the allowlist, access-policy, raw-fetch, completeness and extraction criteria.
- Every network destination, including redirects and discovered links, passes
  the same SSRF controls; blocked targets receive no connection. All resource
  budgets are enforced and security tests pass.
- Extracted records are actual published answers with deterministic boundaries,
  order and provenance. No navigation, question prompts, ads, footer text,
  attachment captions or unrelated content become fabricated responses.
- Unsupported pages, JS-only data, access controls, schema changes, missing
  pages and exhausted limits yield safe actionable errors without fake success.
- The existing analysis pipeline alone performs normalization, TF-IDF +
  Multinomial Naive Bayes inference and insights. Original evidence, duplicate
  occurrences and row rejections remain traceable.
- Successful acquisition flows through existing consultation/import/snapshot/
  run persistence and returns exact schema-2.0 results only after completion
  commits. No schema or identity change is required by the chosen convention.
- Original URLs, bounded source bytes, resource hashes, parser/adapter versions
  and mappings are recoverable through immutable saved inputs. History replay
  makes no source-network request.
- Real React URL submit, loading/error handling, results rendering, PostgreSQL
  result equality, history refresh/new-record appearance, Open, Home and New
  Analysis pass end-to-end.
- Existing relevant tests and frontend build pass; ML file hashes and unrelated
  analysis/persistence contracts remain unchanged.

**Audit conclusion:** feasible as a controlled acquisition feature. The initial
MyGov HTML response structure is observable without a browser engine. Broad
government-site support, anonymous exports, full pagination correctness and
production-safe fetching are not yet verified and must not be advertised as
implemented. This audit authorizes no code, schema, dependency or data changes.
