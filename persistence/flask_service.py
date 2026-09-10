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
    domain = provenance.get('domain')
    input_format = provenance.get('source_type')
    title = provenance.get('consultation_title') or (f"{domain} Consultation" if domain else 'Flask consultation analysis')
    run_id = None
    try:
        with database.transaction() as connection:
            service = PersistenceService(connection)
            consultation_id = service.create_consultation(title, domain=domain, input_format=input_format)
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


def persist_multi_file_consultation(database, file_deliveries, combined_records, result_or_results, manifest, domain, input_format, analysis_mode='together'):
    """Persist a multi-file consultation with multiple imports and one or multiple runs."""
    title = f"{domain} Consultation" if domain else "Multi-file Consultation"
    run_entries = []
    try:
        with database.transaction() as connection:
            service = PersistenceService(connection)
            consultation_id = service.create_consultation(title, domain=domain, input_format=input_format)
            for delivery in file_deliveries:
                service.create_import(
                    consultation_id,
                    delivery['records'],
                    source_type=input_format,
                    filename=delivery['filename'],
                    raw_bytes=delivery.get('raw_bytes'),
                    source_metadata=delivery.get('source_metadata'),
                    mapping=delivery.get('mapping')
                )
            if analysis_mode == 'together':
                run_id = service.create_run(consultation_id, combined_records, manifest)
                run_entries.append((run_id, result_or_results))
            else:
                for delivery in file_deliveries:
                    fname = delivery['filename']
                    file_res = result_or_results.get(fname)
                    run_id = service.create_run(consultation_id, delivery['records'], manifest, target_file=fname)
                    run_entries.append((run_id, file_res))

        for run_id, res in run_entries:
            with database.transaction() as connection:
                PersistenceService(connection).complete_run(run_id, res)
        return [r[0] for r in run_entries]
    except Exception:
        logger.error('Multi-file analysis persistence failed; completion was not confirmed.')
        for run_id, _ in run_entries:
            try:
                with database.transaction() as connection:
                    PersistenceService(connection).fail_run(
                        run_id, code='PERSISTENCE_FAILED',
                        message='Result persistence did not complete successfully.')
            except Exception:
                pass
        raise PersistenceFailure('Analysis could not be saved. Check the database and retry.') from None