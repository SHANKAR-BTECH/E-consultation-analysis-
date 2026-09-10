"""History contracts and read-only verification against the local SQLite store."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch
from uuid import uuid4

from persistence.database import Database
from persistence.service import PersistenceService
from server import app


class HistoryAPITests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.db = MagicMock()
        extensions = patch.dict(app.extensions, {'consultation_database': self.db})
        extensions.start()
        self.addCleanup(extensions.stop)
        service_patch = patch('persistence.history_routes.PersistenceService')
        self.service_table = service_patch.start()
        self.service = self.service_table.return_value
        self.addCleanup(service_patch.stop)
        self.cid, self.rid = str(uuid4()), str(uuid4())

    def test_empty_list_and_read_only_no_cache(self):
        self.service.list_consultations.return_value = []
        response = self.client.get('/consultations')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {'consultations': []})
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        connection = self.db.transaction.return_value.__enter__.return_value
        self.service_table.assert_called_once_with(connection)

    def test_detail_and_completed_run_pass_through(self):
        detail = {'id': self.cid, 'title': 'Stored consultation', 'runs': []}
        saved = {'run': {'id': self.rid, 'status': 'COMPLETED'}, 'result': {'schema_version': '2.0'}}
        self.service.get_consultation.return_value = detail
        self.service.get_run.return_value = saved
        self.assertEqual(self.client.get('/consultations/' + self.cid).json, detail)
        response = self.client.get(f'/consultations/{self.cid}/runs/{self.rid}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, saved)
        self.assertEqual([str(value) for value in self.service.get_run.call_args.args], [self.cid, self.rid])

    def test_unknown_and_invalid_identifiers(self):
        self.service.get_consultation.return_value = None
        self.service.get_run.return_value = None
        for path, status in [(f'/consultations/{self.cid}', 404),
                             (f'/consultations/{self.cid}/runs/{self.rid}', 404),
                             ('/consultations/not-a-uuid', 400),
                             (f'/consultations/{self.cid}/runs/invalid', 400)]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, status)
                self.assertEqual(set(response.json), {'error', 'message'})

    def test_missing_database_and_failures_are_not_empty_history(self):
        with patch.dict(app.extensions, {'consultation_database': None}):
            self.assertEqual(self.client.get('/consultations').status_code, 503)
        self.service.list_consultations.side_effect = RuntimeError('private connection details')
        with self.assertLogs(app.logger, 'ERROR') as logs:
            response = self.client.get('/consultations')
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', response.get_data(as_text=True) + str(logs.output))

    def test_failed_status_is_not_a_successful_analysis(self):
        self.service.get_run.return_value = {'run': {'id': self.rid, 'status': 'FAILED',
            'failure': {'message': 'Result persistence did not complete successfully.'}}, 'result': None}
        response = self.client.get(f'/consultations/{self.cid}/runs/{self.rid}')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json['result'])
        self.assertEqual(response.json['run']['status'], 'FAILED')

    def test_history_has_no_write_methods(self):
        for path in ['/consultations', f'/consultations/{self.cid}', f'/consultations/{self.cid}/runs/{self.rid}']:
            self.assertEqual(self.client.post(path, json={}).status_code, 405)
        self.db.transaction.assert_not_called()


class SQLiteHistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Database(str(Path(self.tmp.name) / 'history.sqlite3'))
        self.addCleanup(self.db.close)

    def seed(self):
        with self.db.transaction() as connection:
            service = PersistenceService(connection)
            cid = service.create_consultation('Stored SQLite consultation')
            aid = service.create_consultation('Another consultation')
            rid = service.create_run(cid, [{'text': 'Good and helpful service.'}], {'version': 'test'})
            service.complete_run(rid, {'total_responses': 1})
            fid = service.create_run(aid, [{'text': 'Dropped.'}], {'version': 'test'})
            service.fail_run(fid, code='PERSISTENCE_FAILED', message='Result persistence did not complete successfully.')
        return cid, rid, aid, fid

    def test_existing_history_is_scoped_exact_and_read_only(self):
        cid, rid, aid, fid = self.seed()
        with patch.dict(app.extensions, {'consultation_database': self.db}), \
                patch('server.get_service', side_effect=AssertionError('History must not load ML')), \
                patch('server.analyze_batch', side_effect=AssertionError('History must not analyze')):
            client = app.test_client()
            items = client.get('/consultations').json['consultations']
            self.assertEqual(len(items), 2)
            self.assertTrue(all('result_json' not in item for item in items))
            latest = {item['id']: item['latest_run'] for item in items}
            self.assertEqual(latest[cid]['status'], 'COMPLETED')
            self.assertEqual(latest[aid]['status'], 'FAILED')
            detail = client.get(f'/consultations/{cid}')
            self.assertEqual(detail.status_code, 200, detail.json)
            self.assertIn(rid, [run['id'] for run in detail.json['runs']])
            saved = client.get(f'/consultations/{cid}/runs/{rid}')
            self.assertEqual(saved.status_code, 200, saved.json)
            self.assertEqual(saved.json['result']['total_responses'], 1)
            self.assertEqual(saved.json['run']['response_count'], 1)
            self.assertEqual(saved.json['run']['accepted_count'], 1)
            failed = client.get(f'/consultations/{aid}/runs/{fid}')
            self.assertEqual(failed.status_code, 200, failed.json)
            self.assertEqual(failed.json['run']['status'], 'FAILED')
            self.assertIsNone(failed.json['result'])
            self.assertEqual(client.get(f'/consultations/{uuid4()}/runs/{rid}').status_code, 404)
            self.assertEqual(client.get(f'/consultations/{uuid4()}').status_code, 404)
        with self.db.transaction() as connection:
            remaining = len(PersistenceService(connection).list_consultations())
        self.assertEqual(remaining, 2)


if __name__ == '__main__':
    unittest.main()