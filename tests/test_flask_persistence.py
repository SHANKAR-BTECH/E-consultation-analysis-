"""HTTP persistence boundary tests; real PostgreSQL checks live in persistence/."""
import io
import unittest
from unittest.mock import MagicMock, patch

from analysis_service import analyze_batch
from persistence.flask_service import PersistenceFailure, persist_analysis
from server import app

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

    def test_csv_retains_bytes_unselected_columns_and_mapping(self):
        raw = b'comment,date,extra\r\nPoor internet connectivity.,2026-01-01,retained\r\n'
        with patch('server.persist_analysis') as save:
            response = self.client.post('/analyze-file', data={
                'file': (io.BytesIO(raw), 'evidence.csv'), 'date_column': ''})
        self.assertEqual(response.status_code, 200)
        provenance = save.call_args.kwargs
        self.assertEqual(provenance['raw_bytes'], raw)
        self.assertEqual(provenance['raw_records'][0]['extra'], 'retained')
        self.assertEqual(provenance['mapping'], {'date_column': ''})
        self.assertIsNone(response.json['responses'][0]['date'])

    def test_database_failure_is_explicit_on_both_routes(self):
        with patch('server.persist_analysis', side_effect=PersistenceFailure('Analysis could not be saved.')):
            responses = [self.client.post('/analyze', json={'responses': ROWS}),
                         self.client.post('/analyze-file', data={
                             'file': (io.BytesIO(b'text\nPoor internet connectivity.\n'), 'test.csv')})]
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
                'file': (io.BytesIO(b'text\nPoor internet connectivity.\n'), 'test.csv'),
                'mode': 'inspect'}).status_code, 200)

    def test_completion_failure_rolls_back_then_records_failure_separately(self):
        database = MagicMock()
        context = database.transaction.return_value
        with patch('persistence.flask_service.PersistenceService') as service:
            service.return_value.execute_operation.return_value = {'run_id': 'run'}
            service.return_value.complete_run.side_effect = RuntimeError('secret driver error')
            with self.assertRaises(PersistenceFailure) as caught:
                persist_analysis(database, ROWS, {}, {'version': 'test'})
            self.assertNotIn('secret', str(caught.exception))
            self.assertEqual(database.transaction.call_count, 3)
            service.return_value.fail_run.assert_called_once()
            self.assertIs(context.__exit__.call_args_list[1].args[0], RuntimeError)


if __name__ == '__main__':
    unittest.main()
