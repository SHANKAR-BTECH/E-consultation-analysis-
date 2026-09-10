# Local SQLite persistence

Consultation history is stored in a self-contained SQLite database file with no
external database server or configuration required. `persistence.database`
creates the schema on startup, and the Flask `history_api` blueprint exposes the
saved consultations through `/consultations`.

## Layout

| Table | Purpose |
| --- | --- |
| consultations | One saved consultation per analysis request |
| imports | Provenance of the submitted records (source type, filename, mapping, metadata) |
| analysis_runs | Each run's status, response counts, pinned model manifest and result JSON |

`analysis_runs.result_json` stores the complete schema-2.0 analysis result.
`response_count` is the number of submitted records and `accepted_count` the
number analyzed, matching the values already returned by the analysis contract.
Imports and completed runs are written once and then only transitioned by
`complete_run`/`fail_run`; the routes are read-only.

## Usage

```python
from persistence.database import Database
from persistence.service import PersistenceService

with Database().transaction() as connection:
    service = PersistenceService(connection)
    service.create_consultation('Public transport consultation')
```

`Database.transaction()` opens a short unit of work that commits on success and
rolls back on any exception. `init_app(app)` attaches an always-available local
database to `app.extensions['consultation_database']`; no `DATABASE_URL` is
needed. Set `CONSULTATION_DB_PATH` to relocate the database file for tests or
unusual deployments (default: `consultation_history.sqlite3` in the project root).

## Verification

```powershell
.\venv\Scripts\python.exe -m unittest discover -s tests -v
# The static-frontend suite requires the existing Flask app on localhost:5000.
node --test tests/frontend.test.mjs tests/phase5_react_contracts.test.mjs
```

The previous PostgreSQL/Alembic persistence (SQLAlchemy, psycopg, advisory locks,
triggers, JSONB and migrations) has been removed.