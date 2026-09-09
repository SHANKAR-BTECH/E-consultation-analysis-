# Refresh History integration audit — 9 September 2026

## Trace and reproduced defect

- `frontend/src/components/ConsultationHistory.jsx`: `HistoryPanel` renders the
  Refresh History button with `onClick={onRetry}`. `ConsultationHistory` supplies
  `handleRetry`.
- List path: `handleRetry` -> `fetchList` -> `listConsultations` in
  `frontend/src/lib/api.js` -> shared `request` -> HTTP GET `/consultations`.
- Vite's existing proxy forwards `/consultations` to Flask on port 5000.
- `persistence/history_routes.py:list_consultations` returns
  `{consultations: [ConsultationSummary, ...]}` through `read`, which creates a
  transaction and sets `SET TRANSACTION READ ONLY`.
- `PersistenceService.list_consultations` delegates to
  `persistence/history.py:list_consultations`. Its SQLAlchemy query selects all
  consultations, left joins a lateral subquery for each latest run, and orders
  consultations by `created_at DESC, id DESC`. Only the per-consultation latest
  run subquery has `LIMIT 1`; the consultation list is unbounded.
- The API client validates the envelope and returns `data.consultations`.
  `fetchList` calls `setList({status: 'success', data})`. `HistoryPanel` renders
  `list.data.map` using consultation IDs as keys.
- Before the fix, `handleRetry` branched on `selectedId`: an open consultation
  caused only `fetchDetailAndRun`, with no list request or list state update.
  Returning to the list reused stale state. The real Chrome regression failed
  waiting for `/consultations` after refreshing an open saved consultation.
- Ordinary list-view refresh succeeded before the fix. No wrong URL, envelope,
  HTTP method, database query, or response caching defect was reproduced.

## Fix

Refresh always invokes the existing list loader, plus the existing detail/run
loader when a consultation is selected. The handler owns the loading lifetime
and awaits both operations. A synchronous ref prevents duplicate refreshes.
Existing list errors are also visible while detail is selected. No API, schema,
identity, snapshot, analysis, persistence, ML, or styling changes were made.

## Verification and limits

- Initially neither Flask nor Vite was running. Started both using the existing
  environment configuration; PostgreSQL initially contained 125 consultations.
  Direct Flask and Vite proxy GETs both returned all 125.
- Existing backend suite: 83 passed, 1 live database test skipped. The initial
  sandbox run failed Streamlit process cleanup; the permitted rerun passed.
- Persistence foundation/service: 24 passed. History endpoint suite with real
  PostgreSQL enabled: 7 passed, including exact ordered database IDs, persisted
  result equality, scoped lookup, and unchanged table counts after reads.
- Existing JavaScript suites: 31 passed, including live proxy/saved-result
  rendering. Build passed. Lint passed with existing warnings.
- `tests/phase5_history_browser.test.mjs` passed in headless Chrome against the
  actual app. It checks all returned consultation IDs in rendered cards, both
  refresh paths, loading through delayed real requests, duplicate-click disabled
  state, network failure/retry in both views, Open, Home, and New Analysis.
  Failure injection aborts requests; successful history data is never mocked.
- The existing `tests/frontend.test.mjs` posts sample input to its default live
  Flask URL. Running it inadvertently persisted one fixture consultation,
  `b770d164-3bfb-4940-94cf-5ec2c468c5cf`. It was left intact; no records were
  deleted or overwritten. Final observed count was 126. Future runs of that
  fixture-based test must use `BASE_URL` pointing to a stateless Flask process.
- No real feedback was supplied for an additional persistence action. A real
  new submission appearing in an already-open history list remains unverified;
  this task's full definition of done is therefore not yet satisfied.
- Active model SHA-256:
  `497888DCC4801A5D1DE5F48FC2B5160C05E38DB6AA95D4261CF42963AB911927`.
  Active vectorizer SHA-256:
  `7E4F15FED3E6A3A104CB8D42E7BF73AC8F45EF7859F4436288ECD4988377FEE4`.

Read-only browser regression (PowerShell):

```powershell
$env:HISTORY_BASE_URL = 'http://127.0.0.1:5173'
$env:PLAYWRIGHT_MODULE = '<absolute path to installed playwright module>'
node --test tests/phase5_history_browser.test.mjs
```

Requires a local Chrome installation. The optional test skips when either
environment variable is missing. Checkpoint: `checkpoint-history-refresh-20260909`
at `0caf56c58ab0f4c437c505ef5818853853f9d89c`.
