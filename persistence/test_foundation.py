"""Offline structure/unit checks only: these do not exercise PostgreSQL."""
import io
import math
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.dialects import postgresql

from persistence.database import Database, database_url
from persistence import repository as repo, schema_v1 as s


class FoundationTests(unittest.TestCase):
    def test_configuration_requires_explicit_postgresql(self):
        with patch.dict('os.environ', {}, clear=True):
            for url in (None, '', 'sqlite:///test.db', 'postgresql://host',
                        'postgresql+psycopg2://host/db', 'not a url'):
                with self.subTest(url=url), self.assertRaises(ValueError):
                    database_url(url)
        self.assertEqual(database_url('postgresql://host/db').drivername,
                         'postgresql+psycopg')

    def test_engine_creation_is_lazy_and_transaction_rolls_back(self):
        # Test SQLAlchemy's actual session context, with no connection or SQL.
        db = Database('postgresql://localhost/unused_offline_test')
        events = []
        sa.event.listen(db.sessions, 'after_commit', lambda session: events.append('commit'))
        sa.event.listen(db.sessions, 'after_rollback', lambda session: events.append('rollback'))
        try:
            with db.transaction():
                pass
            with self.assertRaisesRegex(RuntimeError, 'abort'):
                with db.transaction():
                    raise RuntimeError('abort')
            self.assertEqual(events, ['commit', 'rollback'])
        finally:
            db.close()

    def test_all_foreign_keys_resolve_and_restrict_deletion(self):
        self.assertEqual(len(s.metadata.tables), 12)
        for table in s.metadata.tables.values():
            for constraint in table.foreign_key_constraints:
                self.assertEqual(constraint.ondelete, 'RESTRICT')
                remote = tuple(element.column.name for element in constraint.elements)
                parent = constraint.elements[0].column.table
                keys = [tuple(c.name for c in parent.primary_key)]
                keys += [tuple(c.name for c in key.columns) for key in parent.constraints
                         if isinstance(key, sa.UniqueConstraint)]
                self.assertIn(remote, keys)

    def test_duplicates_are_not_unique_content(self):
        prohibited = {'title', 'original_text', 'external_id', 'raw_checksum',
                      'content_hash', 'logical_record'}
        for table in s.metadata.tables.values():
            for constraint in table.constraints:
                if isinstance(constraint, (sa.UniqueConstraint, sa.PrimaryKeyConstraint)):
                    self.assertFalse(prohibited.intersection(c.name for c in constraint.columns))
        session = MagicMock()
        _, ids = repo.create_import(session, uuid.uuid4(),
                                   [{'id': 1, 'text': 'same'}, {'id': 1, 'text': 'same'}, None])
        self.assertEqual(len(set(ids)), 3)
        inserts = [call.args[0] for call in session.execute.call_args_list
                   if getattr(call.args[0], 'is_insert', False)
                   and call.args[0].table.name == 'responses']
        values = [statement.compile().params for statement in inserts]
        self.assertEqual([v['record_ordinal'] for v in values], [1, 2, 3])
        self.assertEqual(values[0]['raw_record'], values[1]['raw_record'])
        self.assertIsNone(values[2]['raw_record'])

    def test_prediction_and_evidence_require_accepted_same_run_rows(self):
        for table in (s.sentiment_predictions, s.finding_evidence):
            keys = [tuple(c.name for c in fk.columns) for fk in table.foreign_key_constraints]
            self.assertIn(('run_id', 'row_index', 'validation_status'), keys)
        keys = [tuple(c.name for c in fk.columns) for fk in s.snapshot_members.foreign_key_constraints]
        self.assertIn(('snapshot_id', 'consultation_id'), keys)
        self.assertIn(('response_id', 'consultation_id'), keys)

    def test_offline_upgrade_and_downgrade_compile(self):
        output = io.StringIO()
        config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'), output_buffer=output)
        with patch('sqlalchemy.engine.Engine.connect', side_effect=AssertionError('offline must not connect')):
            command.upgrade(config, 'head', sql=True)
            upgrade = output.getvalue()
            for table in s.metadata.tables:
                self.assertIn('CREATE TABLE ' + table, upgrade)
            self.assertEqual(upgrade.count('CREATE FUNCTION p5_'), 7)
            self.assertIn('DEFERRABLE INITIALLY DEFERRED', upgrade)
            self.assertIn('CREATE TRIGGER run_guard', upgrade)
            output.seek(0)
            output.truncate()
            command.downgrade(config, '0001:base', sql=True)
        downgrade = output.getvalue()
        for table in s.metadata.tables:
            self.assertIn('DROP TABLE ' + table, downgrade)
        self.assertEqual(downgrade.count('DROP FUNCTION p5_'), 7)

    def test_indexes_compile_for_postgresql(self):
        indexes = [index for table in s.metadata.tables.values() for index in table.indexes]
        self.assertEqual(len({index.name for index in indexes}), len(indexes))
        for index in indexes:
            self.assertIn('CREATE INDEX', str(sa.schema.CreateIndex(index).compile(dialect=postgresql.dialect())))

    def test_hash_preserves_typed_ids_order_and_whitespace(self):
        baseline = repo.checksum([{'id': 1, 'text': ' a '}])
        self.assertEqual(baseline, repo.checksum([{'text': ' a ', 'id': 1}]))
        self.assertNotEqual(baseline, repo.checksum([{'id': '1', 'text': ' a '}]))
        self.assertNotEqual(baseline, repo.checksum([{'id': 1, 'text': 'a'}]))
        self.assertNotEqual(repo.checksum([1, 2]), repo.checksum([2, 1]))
        with self.assertRaises(ValueError):
            repo.checksum([math.nan])

    def test_retry_reuses_snapshot_and_manifest(self):
        run = {'status': 'FAILED', 'snapshot_id': 'snapshot', 'model_manifest': {'model': 'pinned'}}
        with patch.object(repo, 'locked_run', return_value=run), patch.object(repo, 'create_run', return_value='new') as create:
            session = object()
            self.assertEqual(repo.retry_run(session, 'old'), 'new')
            create.assert_called_once_with(session, 'snapshot', {'model': 'pinned'}, retry_of='old')
            run['status'] = 'COMPLETED'
            with self.assertRaises(ValueError):
                repo.retry_run(session, 'old')

    def test_idempotency_returns_original_receipt_and_rejects_conflict(self):
        session = MagicMock()
        saved = {'fingerprint': 'a' * 64, 'receipt': {'run_id': 'original'}}
        session.execute.return_value.mappings.return_value.one.return_value = saved
        kwargs = dict(scope='local', kind='analyze', key='delivery', fingerprint='a' * 64)
        self.assertEqual(repo.record_operation(session, **kwargs), saved)
        statement = session.execute.call_args_list[0].args[0]
        self.assertIn('ON CONFLICT (scope, operation_kind, operation_key) DO NOTHING',
                      str(statement.compile(dialect=postgresql.dialect())))
        with self.assertRaises(repo.IdempotencyConflict):
            repo.record_operation(session, **dict(kwargs, fingerprint='b' * 64))


if __name__ == '__main__':
    unittest.main()
