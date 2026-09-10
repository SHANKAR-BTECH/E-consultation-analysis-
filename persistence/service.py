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

    def create_consultation(self, title, domain=None, input_format=None):
        if not isinstance(title, str) or not title.strip() or len(title) > 256:
            raise ValueError('Title must be nonempty text of at most 256 characters.')
        consultation_id = str(uuid.uuid4())
        now = utc_now_iso()
        self.connection.execute(
            'INSERT INTO consultations (id, title, status, created_at, updated_at, domain, input_format) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (consultation_id, title.strip(), 'ACTIVE', now, now, domain, input_format))
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

    def create_run(self, consultation_id, records, manifest, target_file=None):
        run_id = str(uuid.uuid4())
        self.connection.execute(
            'INSERT INTO analysis_runs (id, consultation_id, status, response_count, accepted_count,'
            ' model_manifest, created_at, started_at, ended_at, failure, result_json, result_hash, target_file)'
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (run_id, consultation_id, 'PENDING', len(records), None, _manifest(manifest),
             utc_now_iso(), None, None, None, None, None, target_file))
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

    def clear_all_consultations(self):
        """Atomically delete all consultations, analysis runs, and imports."""
        cursor = self.connection.execute('SELECT count(*) FROM consultations')
        count = cursor.fetchone()[0]
        # Delete dependent child tables first to respect foreign keys
        self.connection.execute('DELETE FROM imports')
        self.connection.execute('DELETE FROM analysis_runs')
        self.connection.execute('DELETE FROM consultations')
        return count

    def list_consultations(self):
        rows = self.connection.execute("""
            SELECT c.id, c.title, c.status, c.created_at, c.updated_at, c.domain, c.input_format,
                   COUNT(DISTINCT i.id) AS file_count,
                   GROUP_CONCAT(DISTINCT i.original_filename) AS file_names,
                   r.id AS run_id, r.status AS run_status, r.created_at AS run_created_at,
                   r.started_at AS run_started_at, r.ended_at AS run_ended_at,
                   r.failure AS run_failure, r.response_count AS run_response_count,
                   r.accepted_count AS run_accepted_count, r.target_file AS run_target_file
            FROM consultations c
            LEFT JOIN imports i ON i.consultation_id = c.id
            LEFT JOIN analysis_runs r ON r.id = (
                SELECT r2.id FROM analysis_runs r2 WHERE r2.consultation_id = c.id
                ORDER BY r2.created_at DESC, r2.id DESC LIMIT 1)
            GROUP BY c.id
            ORDER BY c.created_at DESC, c.id DESC""").fetchall()
        return [self._consultation_row(row) for row in rows]

    def get_consultation(self, consultation_id):
        row = self.connection.execute(
            'SELECT id, title, status, created_at, updated_at, domain, input_format FROM consultations WHERE id = ?',
            (consultation_id,)).fetchone()
        if row is None:
            return None
        imports = self.connection.execute(
            'SELECT id, source_type, original_filename, record_count, created_at'
            ' FROM imports WHERE consultation_id = ? ORDER BY created_at ASC, id ASC',
            (consultation_id,)).fetchall()
        runs = self.connection.execute(
            'SELECT id, status, created_at, started_at, ended_at, failure, response_count, accepted_count, target_file'
            ' FROM analysis_runs WHERE consultation_id = ? ORDER BY created_at DESC, id DESC',
            (consultation_id,)).fetchall()
        files = [{
            'id': imp['id'],
            'filename': imp['original_filename'],
            'source_type': imp['source_type'],
            'record_count': imp['record_count'],
            'created_at': imp['created_at']
        } for imp in imports]
        return {
            **dict(row),
            'files': files,
            'file_count': len(files),
            'runs': [self._run_row(run) for run in runs]
        }

    def get_run(self, consultation_id, run_id):
        row = self.connection.execute(
            'SELECT id, status, created_at, started_at, ended_at, failure, response_count,'
            ' accepted_count, result_json, target_file FROM analysis_runs WHERE id = ? AND consultation_id = ?',
            (run_id, consultation_id)).fetchone()
        if row is None:
            return None
        run = self._run_row(row)
        result = json.loads(row['result_json']) if row['result_json'] else None
        return {'run': run, 'result': result if run['status'] == 'COMPLETED' else None}

    def _consultation_row(self, row):
        d = dict(row)
        file_names_str = d.get('file_names')
        file_names = file_names_str.split(',') if file_names_str else []
        file_count = d.get('file_count', len(file_names))
        return {
            'id': d['id'], 'title': d['title'], 'status': d['status'],
            'created_at': d['created_at'], 'updated_at': d['updated_at'],
            'domain': d.get('domain'),
            'input_format': d.get('input_format'),
            'file_count': file_count,
            'files': file_names,
            'latest_run': self._run_row(row, prefix='run_') if d.get('run_id') is not None else None,
        }

    def _run_row(self, row, prefix=''):
        d = dict(row)
        failure = d.get(prefix + 'failure')
        target_file = d.get(prefix + 'target_file')
        return {
            'id': d[prefix + 'id'], 'status': d[prefix + 'status'],
            'created_at': d[prefix + 'created_at'], 'started_at': d.get(prefix + 'started_at'),
            'ended_at': d.get(prefix + 'ended_at'),
            'failure': json.loads(failure) if failure else None,
            'response_count': d[prefix + 'response_count'],
            'accepted_count': d.get(prefix + 'accepted_count'),
            'target_file': target_file,
        }