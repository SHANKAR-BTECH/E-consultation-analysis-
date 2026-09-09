"""Transaction-scoped persistence commands for trusted backend callers.

Construct inside ``with database.transaction() as session``. No inference, HTTP,
implicit commits, or database initialization happens here.
"""
from copy import deepcopy

import sqlalchemy as sa

from . import repository as repo, schema_v1 as s
from . import history


def _text(value, name, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f'{name} must be nonempty text of at most {limit} characters.')
    return value


class PersistenceService:
    def __init__(self, session):
        self.session = session

    def _transaction(self):
        if not self.session.in_transaction():
            raise RuntimeError('Use an explicit Database.transaction() context.')

    def list_consultations(self):
        self._transaction()
        return history.list_consultations(self.session)

    def get_consultation(self, consultation_id):
        self._transaction()
        return history.get_consultation(self.session, consultation_id)

    def get_run(self, consultation_id, run_id):
        self._transaction()
        return history.get_run(self.session, consultation_id, run_id)

    def create_consultation(self, title):
        self._transaction()
        return repo.create_consultation(self.session, _text(title, 'Title', 256))

    def create_import(self, consultation_id, records, **provenance):
        """Persist every response occurrence and seal its import atomically.

        Pass raw_records/raw_bytes, mapping, source_metadata, source_type and
        filename as available. Invalid analysis rows are legitimate source data.
        """
        self._transaction()
        records = deepcopy(records)
        provenance = deepcopy(provenance)
        if provenance.get('source_type', 'json') not in ('json', 'paste', 'csv'):
            raise ValueError('Unknown import source type.')
        for name in ('mapping', 'source_metadata'):
            value = provenance.get(name)
            if value is not None and not isinstance(value, dict):
                raise ValueError(f'{name} must be an object.')
            repo.checksum(value)
        raw = provenance.get('raw_records')
        if raw is not None and not isinstance(raw, list):
            raise ValueError('raw_records must be an ordered list.')
        repo.checksum(raw)
        with self.session.begin_nested():
            return repo.create_import(self.session, consultation_id, records, **provenance)

    def create_snapshot(self, consultation_id, response_ids):
        self._transaction()
        with self.session.begin_nested():
            return repo.create_snapshot(self.session, consultation_id, list(response_ids))

    def create_run(self, snapshot_id, model_manifest):
        self._transaction()
        if not isinstance(model_manifest, dict) or not model_manifest:
            raise ValueError('A nonempty pinned model/rules manifest is required.')
        repo.checksum(model_manifest)
        return repo.create_run(self.session, snapshot_id, model_manifest)

    def retry_run(self, failed_run_id):
        """New identity, same snapshot and pinned manifest; never reset a run."""
        self._transaction()
        return repo.retry_run(self.session, failed_run_id)

    def start_run(self, run_id):
        self._transaction()
        repo.start_run(self.session, run_id)

    def fail_run(self, run_id, *, code, message):
        """After result rollback, record a caller-sanitized failure separately."""
        self._transaction()
        repo.fail_run(self.session, run_id, code=_text(code, 'Failure code', 80),
                      message=_text(message, 'Safe failure message', 1000))

    def complete_run(self, run_id, result):
        """Persist evaluations, predictions, findings, evidence and result together.

        Only trusted server-computed schema-2.0 results belong here. PostgreSQL
        verifies the entire graph at outer commit. No partial result APIs exist.
        """
        self._transaction()
        repo.complete_run(self.session, run_id, result)

    def check_operation(self, *, scope, kind, key, request):
        """Read a receipt or None; absence alone is not a reservation."""
        self._transaction()
        _text(scope, 'Scope', 128)
        _text(kind, 'Operation kind', 80)
        _text(key, 'Operation key', 128)
        fingerprint = repo.checksum(request)
        row = self.session.execute(sa.select(s.operation_receipts).where(
            s.operation_receipts.c.scope == scope,
            s.operation_receipts.c.operation_kind == kind,
            s.operation_receipts.c.operation_key == key)).mappings().one_or_none()
        if row is not None and row['fingerprint'] != fingerprint:
            raise repo.IdempotencyConflict('Operation key already belongs to a different payload.')
        return dict(row) if row is not None else None

    def execute_operation(self, *, scope, kind, key, request, command):
        """Check, execute and record one delivery within the caller's transaction.

        command(service) returns record_operation keyword arguments: typed target
        IDs, receipt and optional status. It must only write through this session;
        no inference, network calls or other external side effects. request must
        include every semantic command input (including pinned manifest/provenance).
        One command per transaction; all cooperating callers use this entry point.
        """
        self._transaction()
        _text(scope, 'Scope', 128)
        _text(kind, 'Operation kind', 80)
        _text(key, 'Operation key', 128)
        request = deepcopy(request)
        fingerprint = repo.checksum(request)
        # Separate statements under READ COMMITTED see a winner's receipt after
        # waiting for its transaction lock. Higher isolation can retain stale reads.
        if self.session.connection().get_isolation_level() != 'READ COMMITTED':
            raise ValueError('Idempotent commands require READ COMMITTED isolation.')
        lock = int(repo.checksum(['phase5-operation-v1', scope, kind, key])[:16], 16)
        if lock >= 2 ** 63:
            lock -= 2 ** 64
        with self.session.begin_nested():
            self.session.execute(sa.select(sa.func.pg_advisory_xact_lock(
                sa.bindparam('operation_lock', lock, type_=sa.BigInteger))))
            saved = self.check_operation(scope=scope, kind=kind, key=key, request=request)
            if saved is not None:
                return saved
            targets = command(self)
            return repo.record_operation(self.session, scope=scope, kind=kind, key=key,
                                         fingerprint=fingerprint, **targets)
