"""History contracts and opt-in read-only verification of existing PostgreSQL data."""
import os
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import sqlalchemy as sa

from persistence.database import Database, database_url
from persistence import history, schema_v1 as s
from server import app


def import_row(**source_metadata):
    """Row shape as returned by a mappings() select of imports."""
    return dict(id=uuid4(), consultation_id=uuid4(), source_type='json',
                original_filename=None, raw_bytes=None, raw_checksum=None,
                source_metadata=source_metadata, mapping={}, parser_version='mapped-input-v1',
                record_count=2, sealed_at=None)


def consultation_row():
    return dict(id=uuid4(), title='Stored consultation', status='ACTIVE',
                created_at=datetime(2026, 9, 9), updated_at=datetime(2026, 9, 9))


class HistoryAPITests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.db = MagicMock()
        extensions = patch.dict(app.extensions, {'consultation_database': self.db})
        extensions.start()
        self.addCleanup(extensions.stop)
        service = patch('persistence.history_routes.PersistenceService')
        self.service = service.start().return_value
        self.addCleanup(service.stop)
        self.cid, self.rid = str(uuid4()), str(uuid4())

    def test_empty_list_and_read_only_no_cache(self):
        self.service.list_consultations.return_value = []
        response = self.client.get('/consultations')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {'consultations': []})
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        session = self.db.transaction.return_value.__enter__.return_value
        self.assertEqual(str(session.execute.call_args.args[0]), 'SET TRANSACTION READ ONLY')

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


@unittest.skipUnless(os.environ.get('RUN_POSTGRES_INTEGRATION') == '1', 'real PostgreSQL opt-in required')
class PostgreSQLHistoryTests(unittest.TestCase):
    def test_existing_history_is_scoped_exact_and_read_only(self):
        url = database_url()
        self.assertEqual(url.database, 'e_consultation')
        self.assertIn(url.host, ('localhost', '127.0.0.1', '::1'))
        db = Database()
        self.addCleanup(db.close)
        with db.transaction() as session:
            before = {name: session.scalar(sa.select(sa.func.count()).select_from(table))
                      for name, table in s.metadata.tables.items()}
            expected_ids = [str(identity) for identity in session.scalars(
                sa.select(s.consultations.c.id).order_by(
                    s.consultations.c.created_at.desc(), s.consultations.c.id.desc()))]
            completed = session.execute(sa.select(s.analysis_runs).where(
                s.analysis_runs.c.status == 'COMPLETED').order_by(s.analysis_runs.c.created_at).limit(1)).mappings().one()
            failed = session.execute(sa.select(s.analysis_runs).where(
                s.analysis_runs.c.status == 'FAILED').limit(1)).mappings().one()
        with patch.dict(app.extensions, {'consultation_database': db}), \
                patch('server.get_service', side_effect=AssertionError('History must not load ML')), \
                patch('server.analyze_batch', side_effect=AssertionError('History must not analyze')):
            client = app.test_client()
            response = client.get('/consultations')
            self.assertEqual(response.status_code, 200, response.json)
            items = response.json['consultations']
            self.assertEqual(len(items), before['consultations'])
            self.assertEqual([item['id'] for item in items], expected_ids)
            self.assertTrue(all('result_json' not in str(item.keys()) for item in items))
            cid, rid = completed['consultation_id'], completed['id']
            detail = client.get(f'/consultations/{cid}')
            self.assertEqual(detail.status_code, 200, detail.json)
            self.assertIn(str(rid), [run['id'] for run in detail.json['runs']])
            saved = client.get(f'/consultations/{cid}/runs/{rid}')
            self.assertEqual(saved.status_code, 200, saved.json)
            self.assertEqual(saved.json['result'], completed['result_json'])
            self.assertEqual(saved.json['run']['response_count'], completed['result_json']['total_received'])
            self.assertEqual(saved.json['run']['accepted_count'], completed['result_json']['total_responses'])
            self.assertEqual(client.get(f'/consultations/{uuid4()}/runs/{rid}').status_code, 404)
            self.assertEqual(client.get(f'/consultations/{uuid4()}').status_code, 404)
            failed_response = client.get(f"/consultations/{failed['consultation_id']}/runs/{failed['id']}")
            self.assertEqual(failed_response.status_code, 200)
            self.assertIsNone(failed_response.json['result'])
            self.assertEqual(failed_response.json['run']['status'], 'FAILED')
        with db.transaction() as session:
            after = {name: session.scalar(sa.select(sa.func.count()).select_from(table))
                     for name, table in s.metadata.tables.items()}
        self.assertEqual(before, after)


if __name__ == '__main__':
    unittest.main()
