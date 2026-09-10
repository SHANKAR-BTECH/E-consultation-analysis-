"""Self-contained SQLite persistence; no external database server required.

Every request opens its own connection so the local file is safe across the
dev server's worker threads. The schema is created automatically on startup.
"""
import os
import sqlite3

from config import PROJECT_DIR

def resolve_database_path():
    """Environment-aware SQLite path resolver.

    Uses /tmp/consultation_history.sqlite3 on Vercel's writable temporary filesystem.
    Preserves local consultation_history.sqlite3 for development and testing.
    Can be explicitly overridden via CONSULTATION_DB_PATH.
    """
    explicit = os.environ.get('CONSULTATION_DB_PATH')
    if explicit:
        return explicit
    if os.environ.get('VERCEL') or os.environ.get('VERCEL_ENV'):
        return '/tmp/consultation_history.sqlite3'
    return str(PROJECT_DIR / 'consultation_history.sqlite3')


CONSULTATION_DB_PATH = resolve_database_path()

SCHEMA = """
CREATE TABLE IF NOT EXISTS consultations (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    domain TEXT, input_format TEXT
);
CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id),
    source_type TEXT NOT NULL, original_filename TEXT, raw_bytes BLOB,
    raw_checksum TEXT, source_metadata TEXT, mapping TEXT,
    parser_version TEXT, record_count INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS analysis_runs (
    id TEXT PRIMARY KEY, consultation_id TEXT NOT NULL REFERENCES consultations(id),
    status TEXT NOT NULL, response_count INTEGER NOT NULL,
    accepted_count INTEGER, model_manifest TEXT NOT NULL,
    created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT,
    failure TEXT, result_json TEXT, result_hash TEXT,
    target_file TEXT
);
CREATE INDEX IF NOT EXISTS ix_imports_consultation ON imports(consultation_id, created_at, id);
CREATE INDEX IF NOT EXISTS ix_runs_consultation ON analysis_runs(consultation_id, created_at, id);
"""


class Database:
    def __init__(self, path=None):
        self.path = path or resolve_database_path()
        db_dir = os.path.dirname(self.path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
            except OSError:
                pass
        connection = self.connection()
        try:
            connection.executescript(SCHEMA)
            cols = [row['name'] for row in connection.execute("PRAGMA table_info(consultations)").fetchall()]
            if 'domain' not in cols:
                connection.execute("ALTER TABLE consultations ADD COLUMN domain TEXT")
            if 'input_format' not in cols:
                connection.execute("ALTER TABLE consultations ADD COLUMN input_format TEXT")
            run_cols = [row['name'] for row in connection.execute("PRAGMA table_info(analysis_runs)").fetchall()]
            if 'target_file' not in run_cols:
                connection.execute("ALTER TABLE analysis_runs ADD COLUMN target_file TEXT")
        finally:
            connection.close()

    def connection(self):
        connection = sqlite3.connect(self.path, timeout=15, isolation_level='IMMEDIATE')
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys = ON')
        return connection

    def transaction(self):
        """A committed unit of work; rolls back automatically on any exception."""
        return _Transaction(self.connection())

    def close(self):
        pass


class _Transaction:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        return self.connection

    def __exit__(self, exc_type, exc, traceback):
        try:
            if exc_type is None:
                self.connection.commit()
            else:
                self.connection.rollback()
        finally:
            self.connection.close()
        return False


def init_app(app):
    """Provide local consultation history for every Flask request."""
    database = Database()
    app.extensions['consultation_database'] = database
    return database