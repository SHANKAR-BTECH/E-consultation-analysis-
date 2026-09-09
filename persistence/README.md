# Phase 5B persistence foundation

Opt-in PostgreSQL storage using SQLAlchemy Core 2, psycopg 3 and Alembic.
Existing Flask routes, health checks, analysis, ML and React do not import or
initialize this package. Installing dependencies does not enable persistence.
There are no database APIs, users/auth, authoritative requests/recommendations,
workers or automatic retries. Phase 5C adds only `service.py`, a transaction-scoped
service for future trusted backend callers; no Flask integration is enabled.

## Schema and integrity

`schema_v1.py` and `guards_v1.py` are the frozen inputs to migration `0001`.
Future applied-schema changes need a new migration, not edits to these files.

| Tables | Purpose |
| --- | --- |
| consultations | Local deployment collection, ACTIVE/ARCHIVED |
| imports, responses | Sealed source event and distinct ordered record occurrences |
| input_snapshots, snapshot_members | Sealed ordered selection and exact mapped logical JSON |
| analysis_runs, run_responses | Pinned manifest, lifecycle and each input's validation outcome |
| sentiment_predictions | One prediction per accepted run row |
| findings, finding_evidence | Issue/topic payloads, all memberships and representative quotes |
| operation_receipts | Immutable delivery key, fingerprint and typed resource receipt |
| audit_logs | Append-only system/local-operator history |

Composite foreign keys enforce consultation/snapshot/run boundaries; deletes are
restricted. History, pending-run and reverse-provenance indexes support expected
lookups. Content, hashes, titles and caller IDs are **not unique**. JSONB retains
integer versus string IDs and invalid/null source records. Import ordinals and
snapshot positions identify occurrences, including legitimate duplicate text.
CSV headers, encoding and declared source context belong in `source_metadata`;
`mapping` retains omitted versus explicitly empty selections. Raw bytes are
optional. Callers must supply this provenance; the repository cannot recover
information already discarded by a parser.

Imports and snapshots must be fully populated and sealed within their creation
transaction. PostgreSQL triggers reject later mutation, changed membership and
unsealed commits. Runs transition PENDING -> RUNNING -> COMPLETED/FAILED, or
PENDING -> FAILED. Terminal runs and result rows are immutable. A deliberate
retry creates a new run using the failed run's snapshot and pinned manifest.
Deferred checks require a complete result graph at commit, accepted-row
predictions, matching totals, complete memberships and source-matching quotes.
No partially successful graph may commit. Stored JSON preserves schema 2.0 replay;
these tables do not change the existing response envelope.

`repository.py` provides transaction-scoped primitives, not command orchestration.
Use `Database.transaction()` for each short acceptance/start/finalization unit;
it commits on success and rolls back on exceptions. Inference must occur outside
the write transaction. `complete_run` uses a savepoint; if outer commit fails,
record failure only in a separate transaction after rollback. Callers provide
the manifest for the actually loaded artifacts/rules and safe failure messages.
Artifact availability/manifest identity verification, scheduling and persistent
API access are future work. The service validates manifest JSON shape only.

Operation receipts use `(scope, operation_kind, operation_key)` uniqueness.
Identical delivery fingerprints return the original receipt; a different
fingerprint raises `IdempotencyConflict`. Use service `execute_operation` to
serialize each key with a transaction-scoped PostgreSQL advisory lock **before**
checking the receipt or creating resources. It requires READ COMMITTED so the
receipt lookup sees the winner's commit after waiting. Hash collisions only
serialize unrelated commands; full keys/fingerprints still determine identity.
All command callers must use this protocol; low-level `record_operation` alone
does not prevent speculative duplicate resources. Scope must include the
consultation where already known. No lock timeout or automatic retry is added.

## Phase 5C service usage

`PersistenceService(session)` requires an explicit active transaction and never
commits it. Use one acceptance command per transaction. Return a successful
receipt to a future caller only **after** outer commit succeeds.

```python
from persistence.database import Database
from persistence.service import PersistenceService

db = Database()  # explicit opt-in; requires DATABASE_URL
with db.transaction() as session:
    service = PersistenceService(session)
    title = 'Public transport consultation'
    def create(service):
        identity = service.create_consultation(title)
        return {'consultation_id': identity, 'receipt': {'id': str(identity)}}
    receipt = service.execute_operation(
        scope='local', kind='create_consultation', key='caller-delivery-key',
        request={'title': title}, command=create)
# receipt is now committed
```

Available operations:

- `create_consultation(title)` returns a UUID.
- `create_import(consultation_id, records, **provenance)` returns import UUID and
  ordered response UUIDs. It preserves duplicate and invalid occurrences, raw
  records, mapped inputs, typed IDs and supplied provenance, then seals the import.
- `create_snapshot(consultation_id, response_ids)` seals that exact ordered
  selection and returns a UUID. No response/snapshot editing operation exists.
- `create_run(snapshot_id, model_manifest)` creates PENDING; `retry_run(failed_id)`
  creates a distinct run with the same snapshot and pinned manifest.
- `start_run`, `fail_run(code=..., message=...)`, and `complete_run(run_id, result)`
  enforce the existing lifecycle. Completion persists accepted/rejected rows,
  predictions, findings, all evidence memberships, representative ranks/quotes
  and exact result JSON together. There are no separately committed partial results.
- `check_operation(scope=..., kind=..., key=..., request=...)` returns a receipt or
  None and detects fingerprint conflicts. Absence is not a reservation.
- `execute_operation(..., command=...)` checks, creates and records in one unit.
  The callback receives this service and returns typed receipt targets and JSON
  receipt. Include **all** semantic inputs in `request`; UUIDs/bytes must have an
  explicit stable JSON representation (e.g. UUID string and raw-byte checksum).
  Callbacks must use the same session and perform no inference/external effects.

Import/snapshot creation and command execution use savepoints to discard staged
writes if an exception is caught. Completion retains its existing savepoint.
Deferred constraints still execute at outer commit, so commit failures must roll
back the whole transaction. Record run failure in a fresh transaction afterward.
Inference stays outside transactions; callers must load and verify pinned artifacts
before supplying trusted results. This service does not compute or alter analysis.

Hashes use SHA-256 of UTF-8 Python JSON with sorted object keys, compact separators,
unescaped Unicode and finite numbers. Array order, text whitespace and ID types
are preserved. This is version-1 Python encoding, not RFC 8785; pin the encoder
environment. Hashes are repository-produced, not recomputed by database triggers.

## Setup when PostgreSQL is available

Dependencies are listed in root `requirements.txt`. No PostgreSQL server or
infrastructure is provisioned by this change. Use an explicitly created, empty
database and a migration role allowed to create tables/functions/triggers.
Keep credentials out of source control and use a restricted runtime role.

From the repository root in PowerShell:

```powershell
# Example only: replace with credentials for your local database.
$env:DATABASE_URL = 'postgresql+psycopg://operator:password@localhost:5432/consultations'
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m alembic current
```

`DATABASE_URL` has no fallback and must name a PostgreSQL database. A plain
`postgresql://` URL is normalized to psycopg. Engine construction is lazy, uses
connection pre-ping, a five-second connection timeout and hidden SQL parameters.
Only an explicit `Database(...)`/`init_app(...)` caller initializes storage.
Migration downgrade deletes the new tables and their data; use only on disposable
test databases. Retention/redaction, backup/restore and multi-user access policy
must be designed before storing production citizen records.

## Verification and exact limitation

```powershell
.\venv\Scripts\python.exe -m unittest persistence.test_foundation -v
.\venv\Scripts\python.exe -m unittest persistence.test_service -v
.\venv\Scripts\python.exe -m alembic upgrade head --sql
.\venv\Scripts\python.exe -m alembic downgrade 0001:base --sql
.\venv\Scripts\python.exe -m unittest discover -s tests -v
# The static-frontend suite requires the existing Flask app on localhost:5000.
node --test tests/frontend.test.mjs tests/phase5_react_contracts.test.mjs
```

The 10 focused tests cover configuration, lazy sessions/rollback events, scoped
FK structure, duplicate occurrence creation, accepted-only joins, PostgreSQL DDL
compilation, indexes, typed hashes, retry arguments and receipt conflict behavior.
Repository unit tests use mocks and are **not PostgreSQL integration tests**.
The 14 service tests exercise validation, transaction requirements, generated
write graphs, provenance, duplicate occurrences, retry lineage, lifecycle guards,
savepoint exception propagation and idempotency orchestration with mocked SQL
execution. They do not prove database rollback or concurrent behavior.
Offline Alembic output compiles table/index DDL and emits trigger SQL; it does not
parse or execute PL/pgSQL on a server. SQLite is not used as a substitute.

PostgreSQL is unavailable locally. Live upgrade/downgrade, trigger execution,
deferred constraints, actual rollback, concurrent sealing/completion and
idempotency, and persisted JSON round-trip checks remain unverified and require
a disposable PostgreSQL database. No PostgreSQL integration pass is claimed.
For Phase 5C specifically, verify competing identical keys create only one
resource, differing fingerprints conflict, and rollback releases the advisory lock
without an accepted receipt. Also verify terminal guards and full result graph
commit/rollback against migrated PostgreSQL. SQLite is not a substitute.

Phase 5C local verification on 9 September 2026: 72 backend tests, 21 JavaScript
tests (12 static-frontend and 9 React-helper), and 24 focused persistence tests
(10 foundation + 14 service) passed. The static suite initially lacked its local
Flask test prerequisite; all 21 passed after starting the unchanged Flask app.
Active model/vectorizer SHA-256 hashes match the Phase 5A verification record;
the final Git diff contains no ML, analysis, API or frontend source changes.
