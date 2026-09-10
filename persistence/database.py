"""Self-contained SQLite persistence; no external database server required.

Every request opens its own connection so the local file is safe across the
dev server's worker threads. The schema is created automatically on startup.
"""
import os
import sqlite3

from config import PROJECT_DIR

CONSULTATION_DB_PATH = os.environ.get('CONSULTATION_DB_PATH') or str(PROJECT_DIR / 'consultation_history.sqlite3')

SCHEMA = """
CREATE TABLE IF NOT EXISTS consultations (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
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
    failure TEXT, result_json TEXT, result_hash TEXT
);
CREATE INDEX IF NOT EXISTS ix_imports_consultation ON imports(consultation_id, created_at, id);
CREATE INDEX IF NOT EXISTS ix_runs_consultation ON analysis_runs(consultation_id, created_at, id);
"""


class Database:
    def __init__(self, path=None):
        self.path = path or CONSULTATION_DB_PATH
        connection = self.connection()
        try:
            connection.executescript(SCHEMA)
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