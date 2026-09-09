"""Opt-in real e_consultation verification. Retains labeled analysis fixtures.

Run after alembic upgrade head with RUN_POSTGRES_INTEGRATION=1 and DATABASE_URL.
Never creates/drops a database, truncates data, or downgrades a migration.
"""
import io
import os
import unittest
from unittest.mock import patch

import sqlalchemy as sa

from analysis_service import analyze_batch
from persistence.database import Database, database_url
from persistence import schema_v1 as s
from persistence.service import PersistenceService
from server import app

TEXT = 'Poor internet connectivity. The portal keeps failing and nobody answers my complaint.'
ROWS = [{'id': 'same', 'text': TEXT, 'source': 'Phase 5D integration fixture'},
        None, {'id': 'same', 'text': TEXT, 'source': 'Phase 5D integration fixture'}]


@unittest.skipUnless(os.environ.get('RUN_POSTGRES_INTEGRATION') == '1', 'real PostgreSQL opt-in required')
class PostgreSQLIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        url = database_url()
        if url.database != 'e_consultation' or url.host not in ('localhost', '127.0.0.1', '::1'):
            raise RuntimeError('Integration verification requires local e_consultation.')
        cls.db = Database()
        cls.addClassCleanup(cls.db.close)
        try:
            with cls.db.engine.connect() as connection:
                if connection.scalar(sa.text('select current_database()')) != 'e_consultation':
                    raise RuntimeError('Unexpected database.')
                missing = set(s.metadata.tables) - set(sa.inspect(connection).get_table_names())
                if missing or connection.scalar(sa.text('select version_num from alembic_version')) != '0001':
                    raise RuntimeError('Apply migration 0001 before testing.')
        except Exception:
            raise RuntimeError('PostgreSQL connection/schema verification failed; check configuration and migration.') from None

    def setUp(self):
        self.client = app.test_client()
        extensions = patch.dict(app.extensions, {'consultation_database': self.db})
        extensions.start()
        self.addCleanup(extensions.stop)

    def latest_run(self):
        with self.db.transaction() as session:
            return dict(session.execute(sa.select(s.analysis_runs).order_by(
                s.analysis_runs.c.created_at.desc()).limit(1)).mappings().one())

    def test_real_routes_and_provenance(self):
        self.assertEqual(self.client.get('/health').status_code, 200)
        self.assertEqual(self.client.post('/predict', json={'feedback': TEXT}).status_code, 200)
        response = self.client.post('/analyze', json={'responses': ROWS})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.json, analyze_batch(ROWS))
        run = self.latest_run()
        self.assertEqual(run['status'], 'COMPLETED')
        self.assertEqual(run['result_json'], response.json)
        with self.db.transaction() as session:
            records = session.execute(sa.select(s.responses).where(
                s.responses.c.consultation_id == run['consultation_id']).order_by(
                s.responses.c.record_ordinal)).mappings().all()
            self.assertEqual([row['logical_record'] for row in records], ROWS)
            self.assertEqual(len({row['id'] for row in records}), 3)
            for table, expected in ((s.run_responses, 3), (s.sentiment_predictions, 2),
                                    (s.operation_receipts, 1)):
                self.assertEqual(session.scalar(sa.select(sa.func.count()).select_from(table).where(
                    table.c.run_id == run['id'])), expected)
            for table in (s.findings, s.finding_evidence):
                self.assertGreater(session.scalar(sa.select(sa.func.count()).select_from(table).where(
                    table.c.run_id == run['id'])), 0)
        raw = ('comment,extra\r\n"' + TEXT + '",retained\r\n"' + TEXT + '",retained\r\n').encode()
        response = self.client.post('/analyze-file', data={
            'file': (io.BytesIO(raw), 'phase5d-integration.csv'), 'date_column': ''})
        self.assertEqual(response.status_code, 200, response.json)
        csv_run = self.latest_run()
        with self.db.transaction() as session:
            imported = session.execute(sa.select(s.imports).where(
                s.imports.c.consultation_id == csv_run['consultation_id'])).mappings().one()
            self.assertEqual(imported['raw_bytes'], raw)
            self.assertEqual(imported['mapping'], {'date_column': ''})
            self.assertEqual(imported['record_count'], 2)
        print('Verified completed JSON run:', run['id'])
        print('Verified completed CSV run:', csv_run['id'])

    def test_partial_completion_is_rejected_and_rolled_back(self):
        with self.db.transaction() as session:
            service = PersistenceService(session)
            consultation = service.create_consultation('Phase 5D rollback integration fixture')
            _, ids = service.create_import(consultation, ROWS)
            snapshot = service.create_snapshot(consultation, ids)
            run_id = service.create_run(snapshot, {'test': 'deliberately incomplete result'})
            service.start_run(run_id)
        result = analyze_batch(ROWS)
        result['responses'].pop()
        # Avoid an immediate evidence FK failure: exercise the deferred totals
        # guard at outer commit after all remaining inserts have succeeded.
        result['issues'] = []
        result['topics'] = []
        with self.assertRaises(sa.exc.DBAPIError):
            with self.db.transaction() as session:
                PersistenceService(session).complete_run(run_id, result)
        with self.db.transaction() as session:
            for table in (s.run_responses, s.sentiment_predictions, s.findings, s.finding_evidence):
                self.assertEqual(session.scalar(sa.select(sa.func.count()).select_from(table).where(
                    table.c.run_id == run_id)), 0)
            PersistenceService(session).fail_run(run_id, code='INTEGRATION_ROLLBACK',
                                                message='Intentional incomplete-result test.')


if __name__ == '__main__':
    unittest.main()
