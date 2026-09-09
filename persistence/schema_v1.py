"""Frozen v1 schema shared by the initial migration and Core repositories.

Never edit an applied version: future schema changes require a new migration.
No metadata.create_all call occurs at application import/startup.
"""
import uuid
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

metadata = sa.MetaData(naming_convention={
    'pk': 'pk_%(table_name)s', 'fk': 'fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s',
    'uq': 'uq_%(table_name)s_%(column_0_name)s', 'ix': 'ix_%(table_name)s_%(column_0_name)s',
    'ck': 'ck_%(table_name)s_%(constraint_name)s'})


def col(name, type_, **kw):
    return sa.Column(name, type_, nullable=False, **kw)


def uid(name='id', **kw):
    return col(name, UUID(as_uuid=True), **kw)


def identity():
    return uid(primary_key=True, default=uuid.uuid4)


def stamp(name='created_at'):
    return col(name, sa.DateTime(timezone=True), server_default=sa.func.now())


def check(sql, name):
    return sa.CheckConstraint(sql, name=name)


def fk(local, remote):
    return sa.ForeignKeyConstraint(local, remote, ondelete='RESTRICT')


consultations = sa.Table('consultations', metadata,
    identity(), col('title', sa.String(256)), col('status', sa.String(16), server_default='ACTIVE'),
    stamp(), stamp('updated_at'), check("length(btrim(title)) > 0", 'title'),
    check("status IN ('ACTIVE','ARCHIVED')", 'status'), sa.Index('ix_consultations_history', 'status', 'created_at', 'id'))

imports = sa.Table('imports', metadata,
    identity(), uid('consultation_id'), col('source_type', sa.String(16)),
    sa.Column('original_filename', sa.Text), sa.Column('raw_bytes', sa.LargeBinary),
    sa.Column('raw_checksum', sa.String(64)), col('source_metadata', JSONB),
    col('mapping', JSONB), col('parser_version', sa.String(80)), col('record_count', sa.Integer),
    stamp(), sa.Column('sealed_at', sa.DateTime(timezone=True)),
    fk(['consultation_id'], ['consultations.id']), sa.UniqueConstraint('id', 'consultation_id'),
    check("source_type IN ('json','paste','csv','excel')", 'source_type'), check('record_count > 0', 'record_count'),
    check("raw_checksum IS NULL OR raw_checksum ~ '^[0-9a-f]{64}$'", 'checksum'),
    sa.Index('ix_imports_history', 'consultation_id', 'created_at', 'id'))

responses = sa.Table('responses', metadata,
    identity(), uid('consultation_id'), uid('import_id'), col('record_ordinal', sa.Integer),
    col('raw_record', JSONB(none_as_null=False)), col('logical_record', JSONB(none_as_null=False)),
    sa.Column('original_text', sa.Text), sa.Column('external_id', JSONB), stamp(),
    fk(['import_id', 'consultation_id'], ['imports.id', 'imports.consultation_id']),
    sa.UniqueConstraint('import_id', 'record_ordinal'), sa.UniqueConstraint('id', 'consultation_id'),
    check('record_ordinal > 0', 'ordinal'))

input_snapshots = sa.Table('input_snapshots', metadata,
    identity(), uid('consultation_id'), col('member_count', sa.Integer),
    col('logical_payload', JSONB), col('content_hash', sa.String(64)),
    col('schema_version', sa.String(32)), stamp(), sa.Column('sealed_at', sa.DateTime(timezone=True)),
    fk(['consultation_id'], ['consultations.id']), sa.UniqueConstraint('id', 'consultation_id'),
    check('member_count > 0', 'count'), check("content_hash ~ '^[0-9a-f]{64}$'", 'hash'),
    check("jsonb_typeof(logical_payload) = 'array' AND jsonb_array_length(logical_payload) = member_count", 'payload'),
    sa.Index('ix_snapshots_history', 'consultation_id', 'created_at', 'id'))

snapshot_members = sa.Table('snapshot_members', metadata,
    uid('snapshot_id', primary_key=True), col('row_index', sa.Integer, primary_key=True),
    uid('consultation_id'), uid('response_id'),
    fk(['snapshot_id', 'consultation_id'], ['input_snapshots.id', 'input_snapshots.consultation_id']),
    fk(['response_id', 'consultation_id'], ['responses.id', 'responses.consultation_id']),
    sa.UniqueConstraint('snapshot_id', 'response_id'), check('row_index > 0', 'row_index'),
    sa.Index('ix_snapshot_members_response', 'response_id'))

analysis_runs = sa.Table('analysis_runs', metadata,
    identity(), uid('consultation_id'), uid('snapshot_id'),
    col('status', sa.String(16), server_default='PENDING'), col('model_manifest', JSONB),
    stamp(), sa.Column('started_at', sa.DateTime(timezone=True)), sa.Column('ended_at', sa.DateTime(timezone=True)),
    sa.Column('retry_of_run_id', UUID(as_uuid=True)), sa.Column('failure', JSONB(none_as_null=True)),
    sa.Column('result_json', JSONB(none_as_null=True)), sa.Column('result_hash', sa.String(64)),
    fk(['snapshot_id', 'consultation_id'], ['input_snapshots.id', 'input_snapshots.consultation_id']),
    sa.UniqueConstraint('id', 'snapshot_id', name='uq_runs_id_snapshot'),
    sa.UniqueConstraint('id', 'consultation_id', name='uq_runs_id_consultation'),
    fk(['retry_of_run_id', 'snapshot_id'], ['analysis_runs.id', 'analysis_runs.snapshot_id']),
    check("jsonb_typeof(model_manifest) = 'object' AND model_manifest <> '{}'::jsonb", 'manifest'),
    check("status IN ('PENDING','RUNNING','COMPLETED','FAILED')", 'status'),
    check("(status='PENDING' AND started_at IS NULL AND ended_at IS NULL AND failure IS NULL AND result_json IS NULL AND result_hash IS NULL) OR "
          "(status='RUNNING' AND started_at IS NOT NULL AND ended_at IS NULL AND failure IS NULL AND result_json IS NULL AND result_hash IS NULL) OR "
          "(status='COMPLETED' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND failure IS NULL AND result_json IS NOT NULL AND result_hash IS NOT NULL) OR "
          "(status='FAILED' AND ended_at IS NOT NULL AND failure IS NOT NULL AND result_json IS NULL AND result_hash IS NULL)", 'state_fields'),
    check('started_at IS NULL OR started_at >= created_at', 'start_time'),
    check('ended_at IS NULL OR ended_at >= coalesce(started_at,created_at)', 'end_time'),
    check("result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$'", 'hash'),
    sa.Index('ix_runs_history', 'consultation_id', 'created_at', 'id'),
    sa.Index('ix_runs_state', 'status', 'created_at'), sa.Index('ix_runs_retry', 'retry_of_run_id'))

run_responses = sa.Table('run_responses', metadata,
    uid('run_id', primary_key=True), col('row_index', sa.Integer, primary_key=True), uid('snapshot_id'),
    col('validation_status', sa.String(16)), sa.Column('rejection_message', sa.Text),
    col('warnings', JSONB), sa.Column('normalized', JSONB(none_as_null=True)), sa.Column('processed_text', sa.Text),
    fk(['run_id', 'snapshot_id'], ['analysis_runs.id', 'analysis_runs.snapshot_id']),
    fk(['snapshot_id', 'row_index'], ['snapshot_members.snapshot_id', 'snapshot_members.row_index']),
    sa.UniqueConstraint('run_id', 'row_index', 'validation_status'),
    check("(validation_status='ACCEPTED' AND normalized IS NOT NULL AND rejection_message IS NULL) OR "
          "(validation_status='REJECTED' AND rejection_message IS NOT NULL AND normalized IS NULL)", 'validation'),
    sa.Index('ix_run_responses_snapshot', 'snapshot_id', 'row_index'))

sentiment_predictions = sa.Table('sentiment_predictions', metadata,
    uid('run_id', primary_key=True), col('row_index', sa.Integer, primary_key=True),
    col('validation_status', sa.String(16), server_default='ACCEPTED'), col('sentiment', sa.String(16)),
    col('confidence', sa.Float), col('input_length', sa.Integer), col('word_count', sa.Integer),
    fk(['run_id', 'row_index', 'validation_status'], ['run_responses.run_id', 'run_responses.row_index', 'run_responses.validation_status']),
    check("validation_status='ACCEPTED'", 'accepted'),
    check("sentiment IN ('negative','neutral','positive')", 'sentiment'),
    check('confidence >= 0 AND confidence <= 1', 'confidence'),
    check('input_length >= 0 AND word_count >= 0', 'lengths'))

findings = sa.Table('findings', metadata,
    identity(), uid('run_id'), col('kind', sa.String(16)), col('rank', sa.Integer),
    col('source_label', sa.Text), col('payload', JSONB),
    fk(['run_id'], ['analysis_runs.id']), sa.UniqueConstraint('run_id', 'kind', 'rank'),
    sa.UniqueConstraint('id', 'run_id'), check("kind IN ('issue','topic')", 'kind'),
    check("rank > 0 AND length(source_label) > 0 AND jsonb_typeof(payload) = 'object'", 'payload'))

finding_evidence = sa.Table('finding_evidence', metadata,
    uid('finding_id', primary_key=True), uid('run_id', primary_key=True), col('row_index', sa.Integer, primary_key=True),
    col('validation_status', sa.String(16), server_default='ACCEPTED'), col('selection_method', sa.String(80)),
    sa.Column('representative_rank', sa.Integer), sa.Column('quote_text', sa.Text),
    fk(['finding_id', 'run_id'], ['findings.id', 'findings.run_id']),
    fk(['run_id', 'row_index', 'validation_status'], ['run_responses.run_id', 'run_responses.row_index', 'run_responses.validation_status']),
    sa.UniqueConstraint('finding_id', 'representative_rank'), check("validation_status='ACCEPTED'", 'accepted'),
    check('representative_rank IS NULL OR (representative_rank > 0 AND quote_text IS NOT NULL)', 'rank'),
    sa.Index('ix_evidence_response', 'run_id', 'row_index'))

operation_receipts = sa.Table('operation_receipts', metadata,
    col('scope', sa.String(128), primary_key=True), col('operation_kind', sa.String(80), primary_key=True),
    col('operation_key', sa.String(128), primary_key=True), col('fingerprint', sa.String(64)),
    col('receipt_status', sa.String(16)), stamp('accepted_at'),
    sa.Column('consultation_id', UUID(as_uuid=True)), sa.Column('import_id', UUID(as_uuid=True)),
    sa.Column('run_id', UUID(as_uuid=True)), col('receipt', JSONB),
    fk(['consultation_id'], ['consultations.id']), fk(['import_id', 'consultation_id'], ['imports.id', 'imports.consultation_id']),
    fk(['run_id', 'consultation_id'], ['analysis_runs.id', 'analysis_runs.consultation_id']),
    check("length(scope)>0 AND length(operation_kind)>0 AND length(operation_key)>0", 'keys'),
    check("fingerprint ~ '^[0-9a-f]{64}$'", 'fingerprint'),
    check("receipt_status IN ('ACCEPTED','REJECTED')", 'status'),
    check("receipt_status <> 'ACCEPTED' OR consultation_id IS NOT NULL", 'target'),
    check('(import_id IS NULL AND run_id IS NULL) OR consultation_id IS NOT NULL', 'scope'))

# Phase 5A explicitly requires append-only acceptance/completion/failure history.
audit_logs = sa.Table('audit_logs', metadata,
    identity(), stamp('occurred_at'), col('actor_kind', sa.String(24)), col('action', sa.String(80)),
    sa.Column('consultation_id', UUID(as_uuid=True)), sa.Column('run_id', UUID(as_uuid=True)),
    col('details', JSONB), fk(['consultation_id'], ['consultations.id']),
    fk(['run_id', 'consultation_id'], ['analysis_runs.id', 'analysis_runs.consultation_id']),
    check("actor_kind IN ('local_operator','system')", 'actor'),
    check('run_id IS NULL OR consultation_id IS NOT NULL', 'scope'),
    sa.Index('ix_audit_consultation', 'consultation_id', 'occurred_at', 'id'),
    sa.Index('ix_audit_run', 'run_id', 'occurred_at', 'id'))
