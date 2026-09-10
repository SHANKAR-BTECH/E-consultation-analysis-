"""Synchronous Flask adapter; successful HTTP results require a committed run."""
import hashlib
import logging
import platform
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
        'text_insights.py', 'config.py', 'pdf_ingestion.py', 'excel_ingestion.py')]
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
    """Accept computed analysis, then commit its complete result in short units.

    Validation/inference already succeeded outside database transactions. A
    failed completion is recorded as a separate FAILED run so history always
    shows an explicit status. No client idempotency is implied by these routes.
    """
    run_id = None
    try:
        with database.transaction() as connection:
            service = PersistenceService(connection)
            consultation_id = service.create_consultation('Flask consultation analysis')
            service.create_import(consultation_id, records, **provenance)
            run_id = service.create_run(consultation_id, records, manifest)
        with database.transaction() as connection:
            PersistenceService(connection).complete_run(run_id, result)
        return run_id
    except Exception:
        # Never log driver exceptions: connection errors can contain credentials.
        logger.error('Analysis persistence failed; completion was not confirmed.')
        if run_id is not None:
            try:
                with database.transaction() as connection:
                    PersistenceService(connection).fail_run(
                        run_id, code='PERSISTENCE_FAILED',
                        message='Result persistence did not complete successfully.')
            except Exception:
                logger.error('Could not record run failure; inspect database run status before retrying.')
        raise PersistenceFailure('Analysis could not be saved. Check the database and retry.') from None