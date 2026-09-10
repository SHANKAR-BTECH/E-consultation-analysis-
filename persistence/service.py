"""Persistence commands over one SQLite connection.

Construct inside ``with database.transaction() as connection``. History reads
and analysis commits keep the same public record shapes as the earlier
PostgreSQL implementation so the HTTP contract does not change.
"""
import hashlib
import json
import uuid
from datetime import datetime, timezone


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _manifest(value):
    if not isinstance(value, dict) or not value:
        raise ValueError('A nonempty pinned model/rules manifest is required.')
    return json.dumps(value)


class PersistenceService:
    def __init__(self, connection):
        self.connection = connection

    def create_consultation(self, title):
        if not isinstance(title, str) or not title.strip() or len(title) > 256:
            raise ValueError('Title must be nonempty text of at most 256 characters.')
        consultation_id = str(uuid.uuid4())
        now = utc_now_iso()
        self.connection.execute(
            'INSERT INTO consultations (id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            (consultation_id, title.strip(), 'ACTIVE', now, now))
        return consultation_id

    def create_import(self, consultation_id, records, **provenance):
        """Persist a delivery's raw records and document metadata."""
        source_type = provenance.get('source_type', 'json')
        if source_type not in ('json', 'paste', 'excel', 'pdf'):
            raise ValueError('Unknown import source type.')
        import_id = str(uuid.uuid4())
        raw_bytes = provenance.get('raw_bytes')
        checksum = hashlib.sha256(raw_bytes).hexdigest() if raw_bytes is not None else None
        source_metadata = provenance.get('source_metadata')
        mapping = provenance.get('mapping')
        self.connection.execute(
            'INSERT INTO imports (id, consultation_id, source_type, original_filename, raw_bytes,'
            ' raw_checksum, source_metadata, mapping, parser_version, record_count, created_at)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (import_id, consultation_id, source_type, provenance.get('filename'),
             raw_bytes, checksum,
             json.dumps(source_metadata) if source_metadata else None,
             json.dumps(mapping) if mapping else None,
             'mapped-input-v1', len(records), utc_now_iso()))
        return import_id

    def create_run(self, consultation_id, records, manifest):
        run_id = str(uuid.uuid4())
        self.connection.execute(
            'INSERT INTO analysis_runs (id, consultation_id, status, response_count, accepted_count,'
            ' model_manifest, created_at, started_at, ended_at, failure, result_json, result_hash)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (run_id, consultation_id, 'PENDING', len(records), None, _manifest(manifest),
             utc_now_iso(), None, None, None, None, None))
        return run_id

    def start_run(self, run_id):
        self.connection.execute(
            "UPDATE analysis_runs SET status='RUNNING', started_at=? WHERE id=? AND status='PENDING'",
            (utc_now_iso(), run_id))

    def complete_run(self, run_id, result):
        if not isinstance(result, dict):
            raise ValueError('A result object is required.')
        encoded = json.dumps(result)
        accepted = result.get('total_responses') if isinstance(result.get('total_responses'), int) else None
        self.connection.execute(
            "UPDATE analysis_runs SET status='COMPLETED', accepted_count=?, ended_at=?, result_json=?, result_hash=?"
            ' WHERE id=?',
            (accepted, utc_now_iso(), encoded, hashlib.sha256(encoded.encode()).hexdigest(), run_id))

    def fail_run(self, run_id, *, code, message):
        self.connection.execute(
            "UPDATE analysis_runs SET status='FAILED', ended_at=?, failure=? WHERE id=?",
            (utc_now_iso(), json.dumps({'code': code, 'message': message}), run_id))

    def list_consultations(self):
        rows = self.connection.execute("""
            SELECT c.id, c.title, c.status, c.created_at, c.updated_at,
                   r.id AS run_id, r.status AS run_status, r.created_at AS run_created_at,
                   r.started_at AS run_started_at, r.ended_at AS run_ended_at,
                   r.failure AS run_failure, r.response_count AS run_response_count,
                   r.accepted_count AS run_accepted_count
            FROM consultations c
            LEFT JOIN analysis_runs r ON r.id = (
                SELECT r2.id FROM analysis_runs r2 WHERE r2.consultation_id = c.id
                ORDER BY r2.created_at DESC, r2.id DESC LIMIT 1)
            ORDER BY c.created_at DESC, c.id DESC""").fetchall()
        return [self._consultation_row(row) for row in rows]

    def get_consultation(self, consultation_id):
        row = self.connection.execute(
            'SELECT id, title, status, created_at, updated_at FROM consultations WHERE id = ?',
            (consultation_id,)).fetchone()
        if row is None:
            return None
        runs = self.connection.execute(
            'SELECT id, status, created_at, started_at, ended_at, failure, response_count, accepted_count'
            ' FROM analysis_runs WHERE consultation_id = ? ORDER BY created_at DESC, id DESC',
            (consultation_id,)).fetchall()
        return {**dict(row), 'runs': [self._run_row(run) for run in runs]}

    def get_run(self, consultation_id, run_id):
        row = self.connection.execute(
            'SELECT id, status, created_at, started_at, ended_at, failure, response_count,'
            ' accepted_count, result_json FROM analysis_runs WHERE id = ? AND consultation_id = ?',
            (run_id, consultation_id)).fetchone()
        if row is None:
            return None
        run = self._run_row(row)
        result = json.loads(row['result_json']) if row['result_json'] else None
        return {'run': run, 'result': result if run['status'] == 'COMPLETED' else None}

    def _consultation_row(self, row):
        return {
            'id': row['id'], 'title': row['title'], 'status': row['status'],
            'created_at': row['created_at'], 'updated_at': row['updated_at'],
            'latest_run': self._run_row(row, prefix='run_') if row['run_id'] is not None else None,
        }

    def _run_row(self, row, prefix=''):
        failure = row[prefix + 'failure']
        return {
            'id': row[prefix + 'id'], 'status': row[prefix + 'status'],
            'created_at': row[prefix + 'created_at'], 'started_at': row[prefix + 'started_at'],
            'ended_at': row[prefix + 'ended_at'],
            'failure': json.loads(failure) if failure else None,
            'response_count': row[prefix + 'response_count'],
            'accepted_count': row[prefix + 'accepted_count'],
        }