"""Read projections over the existing immutable consultation/run records."""
import sqlalchemy as sa
from . import schema_v1 as s


def consultation(row):
    return {key: str(row[key]) if key == 'id' else row[key].isoformat()
            if key.endswith('_at') else row[key]
            for key in ('id', 'title', 'status', 'created_at', 'updated_at')}


def first_import(session, consultation_id):
    return session.execute(sa.select(s.imports).where(
        s.imports.c.consultation_id == consultation_id).order_by(
        s.imports.c.created_at, s.imports.c.id)).mappings().first()


def run(row):
    return {key: str(value) if key == 'id' else value.isoformat()
            if key.endswith('_at') and value is not None else value
            for key, value in row.items() if key != 'consultation_id'}


def run_query():
    r = s.analysis_runs.c
    return sa.select(r.id, r.consultation_id, r.status, r.created_at, r.started_at,
                     r.ended_at, r.failure, s.input_snapshots.c.member_count.label('response_count'),
                     r.result_json['total_responses'].as_integer().label('accepted_count')).join(
                         s.input_snapshots, r.snapshot_id == s.input_snapshots.c.id)


def list_consultations(session):
    # One query: only the latest run's small metadata projection, no result blobs.
    latest = run_query().where(s.analysis_runs.c.consultation_id == s.consultations.c.id).order_by(
        s.analysis_runs.c.created_at.desc(), s.analysis_runs.c.id.desc()).limit(1).lateral()
    columns = [latest.c[key].label('run_' + key) for key in latest.c.keys()]
    rows = session.execute(sa.select(s.consultations, *columns).outerjoin(latest, sa.true()).order_by(
        s.consultations.c.created_at.desc(), s.consultations.c.id.desc())).mappings()
    return [dict(consultation(row), latest_run=run({key: row['run_' + key] for key in latest.c.keys()})
                 if row['run_id'] is not None else None) for row in rows]


def get_consultation(session, consultation_id):
    row = session.execute(sa.select(s.consultations).where(
        s.consultations.c.id == consultation_id)).mappings().one_or_none()
    if row is None:
        return None
    runs = session.execute(run_query().where(s.analysis_runs.c.consultation_id == consultation_id).order_by(
        s.analysis_runs.c.created_at.desc(), s.analysis_runs.c.id.desc())).mappings()
    return dict(consultation(row), runs=[run(item) for item in runs])


def get_run(session, consultation_id, run_id):
    row = session.execute(run_query().add_columns(s.analysis_runs.c.result_json).where(
        s.analysis_runs.c.id == run_id,
        s.analysis_runs.c.consultation_id == consultation_id)).mappings().one_or_none()
    if row is None:
        return None
    metadata = dict(row)
    result = metadata.pop('result_json')
    return {'run': run(metadata), 'result': result if row['status'] == 'COMPLETED' else None}
