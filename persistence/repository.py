"""Core persistence operations; never call inference or commit a caller's transaction.

Use Database.transaction() around each acceptance/start/finalization operation.
The existing HTTP endpoints do not call any of these functions.
"""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import uuid
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from . import schema_v1 as s


def checksum(value):
    """Version 1 Python JSON canonical encoding; retain types/order/whitespace.

    Floats use Python's finite round-trip encoding. This is not RFC 8785.
    The same pinned Python/encoder version is required when rechecking a hash.
    """
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()


def now():
    return datetime.now(timezone.utc)


def audit(session, action, consultation_id, run_id=None):
    session.execute(s.audit_logs.insert().values(actor_kind='system', action=action,
                    consultation_id=consultation_id, run_id=run_id, details={}))


def create_consultation(session, title):
    identity = uuid.uuid4()
    session.execute(s.consultations.insert().values(id=identity, title=title))
    audit(session, 'consultation_created', identity)
    return identity


def create_import(session, consultation_id, records, *, source_type='json', filename=None,
                  mapping=None, source_metadata=None, raw_bytes=None, raw_records=None):
    """Records are the exact mapped inputs, not normalized/filtered model outputs."""
    if not isinstance(records, list) or not records:
        raise ValueError('Import requires nonempty records.')
    checksum(records)  # Reject non-JSON/non-finite values before accepting input.
    raw_records = records if raw_records is None else raw_records
    if len(raw_records) != len(records):
        raise ValueError('Raw and mapped records must retain one-to-one order.')
    identity = uuid.uuid4()
    session.execute(s.imports.insert().values(id=identity, consultation_id=consultation_id,
        source_type=source_type, original_filename=filename, raw_bytes=raw_bytes,
        raw_checksum=hashlib.sha256(raw_bytes).hexdigest() if raw_bytes is not None else None,
        mapping=deepcopy(mapping or {}), source_metadata=deepcopy(source_metadata or {}),
        parser_version='mapped-input-v1', record_count=len(records)))
    identities = []
    for ordinal, (raw, logical) in enumerate(zip(raw_records, records), 1):
        row_id = uuid.uuid4()
        session.execute(s.responses.insert().values(id=row_id, consultation_id=consultation_id,
            import_id=identity, record_ordinal=ordinal, raw_record=deepcopy(raw), logical_record=deepcopy(logical),
            original_text=logical.get('text') if isinstance(logical, dict) and isinstance(logical.get('text'), str) else None,
            external_id=logical.get('id') if isinstance(logical, dict) else None))
        identities.append(row_id)
    session.execute(s.imports.update().where(s.imports.c.id == identity).values(sealed_at=now()))
    audit(session, 'import_sealed', consultation_id)
    return identity, identities


def create_snapshot(session, consultation_id, response_ids):
    if not response_ids or len(set(response_ids)) != len(response_ids):
        raise ValueError('Select each response occurrence once in explicit order.')
    rows = session.execute(sa.select(s.responses).where(s.responses.c.id.in_(response_ids))).mappings().all()
    by_id = {row['id']: row for row in rows}
    if len(rows) != len(response_ids) or any(row['consultation_id'] != consultation_id for row in rows):
        raise ValueError('Snapshot responses must exist in this consultation.')
    payload = [by_id[row_id]['logical_record'] for row_id in response_ids]
    identity = uuid.uuid4()
    session.execute(s.input_snapshots.insert().values(id=identity, consultation_id=consultation_id,
        member_count=len(payload), logical_payload=payload, content_hash=checksum(payload), schema_version='input-v1'))
    session.execute(s.snapshot_members.insert(), [dict(snapshot_id=identity, consultation_id=consultation_id,
        response_id=row_id, row_index=i) for i, row_id in enumerate(response_ids, 1)])
    session.execute(s.input_snapshots.update().where(s.input_snapshots.c.id == identity).values(sealed_at=now()))
    audit(session, 'snapshot_sealed', consultation_id)
    return identity


def create_run(session, snapshot_id, model_manifest, *, retry_of=None):
    """Model manifest is caller supplied/pinned; no model is loaded here."""
    snapshot = session.execute(sa.select(s.input_snapshots).where(s.input_snapshots.c.id == snapshot_id)).mappings().one()
    identity = uuid.uuid4()
    session.execute(s.analysis_runs.insert().values(id=identity, snapshot_id=snapshot_id,
        consultation_id=snapshot['consultation_id'], model_manifest=deepcopy(model_manifest), retry_of_run_id=retry_of))
    audit(session, 'run_created', snapshot['consultation_id'], identity)
    return identity


def locked_run(session, run_id):
    return session.execute(sa.select(s.analysis_runs).where(s.analysis_runs.c.id == run_id).with_for_update()).mappings().one()


def start_run(session, run_id):
    run = locked_run(session, run_id)
    if run['status'] != 'PENDING':
        raise ValueError('Only PENDING runs can start.')
    session.execute(s.analysis_runs.update().where(s.analysis_runs.c.id == run_id).values(status='RUNNING', started_at=now()))
    audit(session, 'run_started', run['consultation_id'], run_id)


def fail_run(session, run_id, *, code, message):
    run = locked_run(session, run_id)
    if run['status'] not in ('PENDING', 'RUNNING'):
        raise ValueError('Terminal runs are immutable.')
    # Call only after the result-writing transaction has rolled back.
    session.execute(s.analysis_runs.update().where(s.analysis_runs.c.id == run_id).values(
        status='FAILED', ended_at=now(), failure={'code': code, 'message': message}))
    audit(session, 'run_failed', run['consultation_id'], run_id)


def retry_run(session, failed_run_id):
    run = locked_run(session, failed_run_id)
    if run['status'] != 'FAILED':
        raise ValueError('Only FAILED runs can be retried.')
    return create_run(session, run['snapshot_id'], run['model_manifest'], retry_of=failed_run_id)


def complete_run(session, run_id, result):
    """Atomically stage the entire result graph, then mark complete.

    Deferred PostgreSQL constraints verify completeness at outer commit. A savepoint
    prevents caught insertion errors from leaving a partially staged graph behind.
    This is a repository primitive, not an API accepting untrusted client results.
    """
    result = deepcopy(result)
    if result.get('schema_version') != '2.0':
        raise ValueError('Expected existing schema 2.0 result.')
    digest = checksum(result)
    with session.begin_nested():
        run = locked_run(session, run_id)
        if run['status'] != 'RUNNING':
            raise ValueError('Only RUNNING runs can complete.')
        for row in result['responses']:
            index = row['row_index']
            session.execute(s.run_responses.insert().values(run_id=run_id, snapshot_id=run['snapshot_id'],
                row_index=index, validation_status='ACCEPTED', normalized=row,
                warnings=[w for w in result['warnings'] if w['row_index'] == index]))
            session.execute(s.sentiment_predictions.insert().values(run_id=run_id, row_index=index,
                **{key: row[key] for key in ('sentiment', 'confidence', 'input_length', 'word_count')}))
        for row in result['rejected']:
            session.execute(s.run_responses.insert().values(run_id=run_id, snapshot_id=run['snapshot_id'],
                row_index=row['row_index'], validation_status='REJECTED', normalized=None,
                rejection_message=row['message'], warnings=[]))
        for kind in ('issue', 'topic'):
            for rank, item in enumerate(result[kind + 's'], 1):
                finding_id = uuid.uuid4()
                session.execute(s.findings.insert().values(id=finding_id, run_id=run_id, kind=kind,
                    rank=rank, source_label=item[kind], payload=item))
                representatives = {row['row_index']: (i, row['text'])
                    for i, row in enumerate(item.get('representative_feedback', []), 1)}
                for index in item['response_indices']:
                    representative_rank, quote = representatives.get(index, (None, None))
                    session.execute(s.finding_evidence.insert().values(finding_id=finding_id, run_id=run_id,
                        row_index=index, selection_method='exact-phrase-v1',
                        representative_rank=representative_rank, quote_text=quote))
        session.execute(s.analysis_runs.update().where(s.analysis_runs.c.id == run_id).values(
            status='COMPLETED', ended_at=now(), result_json=result, result_hash=digest))
        audit(session, 'run_completed', run['consultation_id'], run_id)


class IdempotencyConflict(ValueError):
    pass


def record_operation(session, *, scope, kind, key, fingerprint, consultation_id=None,
                     import_id=None, run_id=None, receipt=None, status='ACCEPTED'):
    """Insert/fetch a finalized receipt. Resource creation must share this transaction.

    A conflict returns the first receipt, never overwrites it. This low-level primitive
    does not schedule work; future command orchestration must reserve keys BEFORE
    producing side effects (or roll back speculative resources on replay).
    """
    values = dict(scope=scope, operation_kind=kind, operation_key=key, fingerprint=fingerprint,
        consultation_id=consultation_id, import_id=import_id, run_id=run_id,
        receipt=deepcopy(receipt or {}), receipt_status=status)
    session.execute(pg_insert(s.operation_receipts).values(**values).on_conflict_do_nothing(
        index_elements=['scope', 'operation_kind', 'operation_key']))
    row = session.execute(sa.select(s.operation_receipts).where(s.operation_receipts.c.scope == scope,
        s.operation_receipts.c.operation_kind == kind, s.operation_receipts.c.operation_key == key)).mappings().one()
    if row['fingerprint'] != fingerprint:
        raise IdempotencyConflict('Operation key already belongs to a different payload.')
    return dict(row)
