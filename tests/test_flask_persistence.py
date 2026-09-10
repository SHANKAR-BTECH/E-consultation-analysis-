"""HTTP persistence boundary tests; the SQLite store is exercised directly here too."""
import io
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

from analysis_service import analyze_batch
from persistence.flask_service import PersistenceFailure, persist_analysis
from persistence.database import Database
from persistence.service import PersistenceService
from server import app
from pdf_fixture import pdf_bytes

POSITIVE = "The process was quick and very helpful."
ROWS = [{'id': 'same', 'text': 'Poor internet connectivity.'}, None,
        {'id': 'same', 'text': 'Poor internet connectivity.'}]


class FlaskPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.extensions = patch.dict(app.extensions, {'consultation_database': MagicMock()})
        self.extensions.start()
        self.addCleanup(self.extensions.stop)

    def test_json_preserves_result_and_original_occurrences(self):
        with patch('server.persist_analysis') as save:
            response = self.client.post('/analyze', json={'responses': ROWS})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, analyze_batch(ROWS))
        self.assertEqual(save.call_args.args[1], ROWS)
        self.assertEqual(save.call_args.args[2], response.json)
        self.assertIn('loaded_objects_joblib_sha1', save.call_args.args[3])
        self.assertEqual(save.call_args.kwargs['source_type'], 'json')

    def test_pdf_retains_bytes_extracted_lines_and_consistent_mapping(self):
        raw = pdf_bytes([POSITIVE, 'second response.'])
        with patch('server.persist_analysis') as save:
            response = self.client.post('/analyze-file', data={
                'file': (io.BytesIO(raw), 'evidence.pdf')})
        self.assertEqual(response.status_code, 200)
        provenance = save.call_args.kwargs
        self.assertEqual(provenance['raw_bytes'], raw)
        self.assertEqual(provenance['raw_records'], [POSITIVE, 'second response.'])
        self.assertEqual(provenance['mapping'], {})
        self.assertIsNone(response.json['responses'][0]['date'])

    def test_database_failure_is_explicit_on_both_routes(self):
        with patch('server.persist_analysis', side_effect=PersistenceFailure('Analysis could not be saved.')):
            responses = [self.client.post('/analyze', json={'responses': ROWS}),
                         self.client.post('/analyze-file', data={
                             'file': (io.BytesIO(pdf_bytes([POSITIVE])), 'test.pdf')})]
        for response in responses:
            self.assertEqual(response.status_code, 503)
            self.assertEqual(set(response.json), {'error', 'message'})
            self.assertTrue(response.json['error'])

    def test_health_predict_inspect_and_invalid_input_do_not_persist(self):
        with patch('server.persist_analysis', side_effect=AssertionError('unexpected persistence')):
            self.assertEqual(self.client.get('/health').status_code, 200)
            self.assertEqual(self.client.post('/predict', json={'feedback': ROWS[0]['text']}).status_code, 200)
            self.assertEqual(self.client.post('/analyze', json={'responses': []}).status_code, 400)
            self.assertEqual(self.client.post('/analyze-file', data={
                'file': (io.BytesIO(pdf_bytes([POSITIVE])), 'test.pdf'),
                'mode': 'inspect'}).status_code, 200)

    def test_completion_failure_rolls_back_then_records_failure_separately(self):
        database = MagicMock()
        context = database.transaction.return_value
        with patch('persistence.flask_service.PersistenceService') as service:
            service.return_value.create_consultation.return_value = 'consultation'
            service.return_value.create_import.return_value = 'import'
            service.return_value.create_run.return_value = 'run'
            service.return_value.complete_run.side_effect = RuntimeError('secret driver error')
            with self.assertRaises(PersistenceFailure) as caught:
                persist_analysis(database, ROWS, {}, {'version': 'test'})
            self.assertNotIn('secret', str(caught.exception))
            self.assertEqual(database.transaction.call_count, 3)
            service.return_value.fail_run.assert_called_once_with(
                'run', code='PERSISTENCE_FAILED',
                message='Result persistence did not complete successfully.')
            self.assertIs(context.__exit__.call_args_list[1].args[0], RuntimeError)

    def test_persist_analysis_commits_a_completed_run(self):
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        db = Database(str(Path(tmp.name) / 'history.sqlite3'))
        self.addCleanup(db.close)
        result = analyze_batch([{'text': 'Good and helpful service.'}])
        run_id = persist_analysis(db, [{'text': 'Good and helpful service.'}], result, {'version': 'test'})
        with db.transaction() as connection:
            consultations = PersistenceService(connection).list_consultations()
            fetched = PersistenceService(connection).get_run(consultations[0]['id'], run_id)
        self.assertEqual(len(consultations), 1)
        self.assertEqual(consultations[0]['latest_run']['status'], 'COMPLETED')
        self.assertEqual(consultations[0]['latest_run']['response_count'], 1)
        self.assertEqual(consultations[0]['latest_run']['accepted_count'], result['total_responses'])
        self.assertEqual(fetched['result'], result)


if __name__ == '__main__':
    unittest.main()
