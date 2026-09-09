"""Synchronous Flask adapter; successful HTTP results require a committed graph."""
import hashlib
import logging
import platform
import uuid
from importlib.metadata import version

import joblib

from config import PROJECT_DIR, MODEL_PATH, VECTORIZER_PATH
from .service import PersistenceService

logger = logging.getLogger(__name__)


class PersistenceFailure(RuntimeError):
    """Safe public failure, with no connection details or source records."""


def model_manifest(service):
    """Identify actual cached inference objects as well as on-disk artifacts/rules."""
    files = [MODEL_PATH, VECTORIZER_PATH] + [PROJECT_DIR / name for name in (
        'model_service.py', 'analysis_service.py', 'text_utils.py',
        'text_insights.py', 'config.py', 'csv_ingestion.py')]
    return {
        'version': 'flask-analysis-v1', 'schema_version': '2.0',
        'python': platform.python_version(),
        'packages': {name: version(name) for name in ('scikit-learn', 'numpy', 'joblib')},
        'classes': list(service.classes),
        'loaded_objects_joblib_sha1': {
            'model': joblib.hash(service.model, hash_name='sha1'),
            'vectorizer': joblib.hash(service.vectorizer, hash_name='sha1')},
        'files_sha256': {path.relative_to(PROJECT_DIR).as_posix():
                         hashlib.sha256(path.read_bytes()).hexdigest() for path in files},
    }


def persist_analysis(database, records, result, manifest, **provenance):
    """Accept computed analysis, then commit its complete result in a short unit.

    Validation/inference already succeeded outside database transactions. Each
    legacy HTTP delivery is deliberate and receives a fresh internal receipt;
    no new client idempotency or identity fields are implied by these routes.
    """
    run_id = None
    try:
        with database.transaction() as session:
            service = PersistenceService(session)

            def accept(command):
                consultation_id = command.create_consultation('Flask consultation analysis')
                import_id, ids = command.create_import(consultation_id, records, **provenance)
                snapshot_id = command.create_snapshot(consultation_id, ids)
                identity = command.create_run(snapshot_id, manifest)
                command.start_run(identity)
                return dict(consultation_id=consultation_id, import_id=import_id,
                            run_id=identity, receipt={'run_id': str(identity)})

            fingerprint_provenance = dict(provenance)
            raw = fingerprint_provenance.pop('raw_bytes', None)
            fingerprint_provenance['raw_sha256'] = hashlib.sha256(raw).hexdigest() if raw is not None else None
            receipt = service.execute_operation(
                scope='local-flask', kind='analyze', key=str(uuid.uuid4()),
                request={'records': records, 'manifest': manifest,
                         'provenance': fingerprint_provenance}, command=accept)
        run_id = receipt['run_id']  # acceptance commit has succeeded
        with database.transaction() as session:
            PersistenceService(session).complete_run(run_id, result)
        return run_id
    except Exception:
        # Never log driver exceptions: connection errors can contain credentials.
        logger.error('Analysis persistence failed; completion was not confirmed.')
        if run_id is not None:
            try:
                with database.transaction() as session:
                    PersistenceService(session).fail_run(
                        run_id, code='PERSISTENCE_FAILED',
                        message='Result persistence did not complete successfully.')
            except Exception:
                logger.error('Could not record run failure; inspect database run status before retrying.')
        raise PersistenceFailure('Analysis could not be saved. Check the database and retry.') from None
