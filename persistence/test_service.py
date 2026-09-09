"""Service unit/SQL-construction tests, NOT PostgreSQL integration tests."""
from copy import deepcopy
import unittest
import uuid
from unittest.mock import MagicMock, patch

from sqlalchemy.dialects import postgresql

from persistence import repository as repo
from persistence.database import Database
from persistence.service import PersistenceService


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.session = MagicMock()
        self.session.in_transaction.return_value = True
        self.session.connection.return_value.get_isolation_level.return_value = 'READ COMMITTED'
        self.service = PersistenceService(self.session)
        self.run = dict(id=uuid.uuid4(), consultation_id=uuid.uuid4(),
                        snapshot_id=uuid.uuid4(), status='RUNNING')

    def writes(self, table, operation='insert'):
        return [call.args[0].compile().params for call in self.session.execute.call_args_list
                if getattr(call.args[0], 'is_' + operation, False)
                and call.args[0].table.name == table]

    def test_explicit_transaction_required_without_connecting(self):
        db = Database('postgresql://localhost/unused_offline_test')
        try:
            with db.sessions() as session:
                with self.assertRaisesRegex(RuntimeError, 'explicit'):
                    PersistenceService(session).create_consultation('Title')
            with db.transaction() as session:
                with patch.object(repo, 'create_consultation', return_value='id'):
                    self.assertEqual(PersistenceService(session).create_consultation('Title'), 'id')
                self.assertTrue(session.in_transaction())
        finally:
            db.close()

    def test_consultation_validation_and_audit(self):
        for title in ('', '  ', None, 'x' * 257):
            with self.assertRaises(ValueError):
                self.service.create_consultation(title)
        identity = self.service.create_consultation('Public transport')
        self.assertEqual(self.writes('consultations')[0]['id'], identity)
        self.assertEqual(self.writes('audit_logs')[0]['consultation_id'], identity)
        self.session.commit.assert_not_called()

    def test_import_retains_duplicates_raw_invalid_rows_and_provenance(self):
        records = [{'id': 1, 'text': ' same\n'}, {'id': '1', 'text': ' same\n'}, None]
        raw = [{'Comment': ' same\n', 'ignored': 'retained'}] * 2 + [None]
        _, ids = self.service.create_import(self.run['consultation_id'], records,
            source_type='csv', raw_records=raw, raw_bytes=b'raw csv',
            mapping={'text_column': 'Comment', 'date_column': ''},
            source_metadata={'headers': ['Comment'], 'declared_sample': True})
        self.assertEqual(len(set(ids)), 3)
        rows = self.writes('responses')
        self.assertEqual([row['logical_record'] for row in rows], records)
        self.assertEqual([row['raw_record'] for row in rows], raw)
        self.assertEqual([row['record_ordinal'] for row in rows], [1, 2, 3])
        imported = self.writes('imports')[0]
        self.assertEqual(imported['mapping']['date_column'], '')
        self.assertEqual(imported['raw_bytes'], b'raw csv')
        records[0]['text'] = 'changed'
        self.assertEqual(rows[0]['logical_record']['text'], ' same\n')
        self.assertIsNotNone(self.writes('imports', 'update')[0]['sealed_at'])

    def test_invalid_provenance_rejected_before_writes(self):
        for provenance in ({'raw_records': {}}, {'mapping': []},
                           {'source_type': 'unknown'}, {'source_metadata': {'x': float('nan')}}):
            with self.assertRaises(ValueError):
                self.service.create_import(uuid.uuid4(), [{'text': 'a'}], **provenance)
        self.session.execute.assert_not_called()

    def test_snapshot_preserves_explicit_order_and_scoping(self):
        first, second = uuid.uuid4(), uuid.uuid4()
        rows = [dict(id=identity, consultation_id=self.run['consultation_id'],
                     logical_record={'text': text}) for identity, text in ((first, 'a'), (second, 'b'))]
        self.session.execute.return_value.mappings.return_value.all.return_value = rows
        self.service.create_snapshot(self.run['consultation_id'], [second, first])
        self.assertEqual(self.writes('input_snapshots')[0]['logical_payload'], [{'text': 'b'}, {'text': 'a'}])
        with self.assertRaises(ValueError):
            self.service.create_snapshot(self.run['consultation_id'], [first, first])
        with self.assertRaises(ValueError):
            self.service.create_snapshot(uuid.uuid4(), [first, second])

    def test_run_creation_requires_manifest_and_retry_has_new_identity(self):
        for manifest in ({}, [], None, {'value': float('inf')}):
            with self.assertRaises(ValueError):
                self.service.create_run(self.run['snapshot_id'], manifest)
        self.session.execute.return_value.mappings.return_value.one.return_value = self.run
        original = self.service.create_run(self.run['snapshot_id'], {'model': 'pinned'})
        failed = dict(self.run, status='FAILED', model_manifest={'model': 'pinned'})
        with patch.object(repo, 'locked_run', return_value=failed):
            retry = self.service.retry_run(original)
        self.assertNotEqual(original, retry)
        values = self.writes('analysis_runs')[-1]
        self.assertEqual(values['snapshot_id'], self.run['snapshot_id'])
        self.assertEqual(values['model_manifest'], failed['model_manifest'])
        self.assertEqual(values['retry_of_run_id'], original)

    def test_status_transitions_and_terminal_guards(self):
        with patch.object(repo, 'locked_run', return_value=self.run):
            with self.assertRaises(ValueError):
                self.service.start_run(self.run['id'])
            self.run['status'] = 'PENDING'
            self.service.start_run(self.run['id'])
            self.service.fail_run(self.run['id'], code='MODEL_UNAVAILABLE', message='Pinned artifact unavailable.')
            for status in ('FAILED', 'COMPLETED'):
                self.run['status'] = status
                with self.assertRaises(ValueError):
                    self.service.fail_run(self.run['id'], code='FAIL', message='Safe message')
        self.assertEqual([row['status'] for row in self.writes('analysis_runs', 'update')], ['RUNNING', 'FAILED'])

    def result(self):
        row = dict(row_index=1, id=1, text=' unchanged\n', sentiment='negative',
                   confidence=0.8, input_length=9, word_count=1)
        return dict(schema_version='2.0', total_received=2, total_responses=1, rejected_count=1,
                    responses=[row], rejected=[dict(row_index=2, message='Invalid text')],
                    warnings=[dict(row_index=1, message='Invalid date')],
                    topics=[dict(topic='unchanged', response_indices=[1])],
                    issues=[dict(issue='unchanged', response_indices=[1], representative_feedback=[row])])

    def test_completion_persists_predictions_rejections_and_full_provenance(self):
        result = self.result()
        before = deepcopy(result)
        with patch.object(repo, 'locked_run', return_value=self.run):
            self.service.complete_run(self.run['id'], result)
        self.assertEqual(result, before)
        rows = self.writes('run_responses')
        self.assertEqual([row['validation_status'] for row in rows], ['ACCEPTED', 'REJECTED'])
        self.assertTrue(all(row['snapshot_id'] == self.run['snapshot_id'] for row in rows))
        self.assertEqual([row['row_index'] for row in self.writes('sentiment_predictions')], [1])
        evidence = self.writes('finding_evidence')
        self.assertEqual(len(evidence), 2)
        self.assertEqual(evidence[0]['quote_text'], ' unchanged\n')
        self.assertEqual(evidence[0]['representative_rank'], 1)
        self.assertIsNone(evidence[1]['representative_rank'])
        saved = self.writes('analysis_runs', 'update')[0]
        self.assertEqual(saved['result_json'], before)
        self.assertEqual(saved['result_hash'], repo.checksum(before))
        self.session.commit.assert_not_called()

    def test_completion_failure_exits_savepoint_without_terminal_update(self):
        self.session.execute.side_effect = RuntimeError('insertion failed')
        with patch.object(repo, 'locked_run', return_value=self.run):
            with self.assertRaisesRegex(RuntimeError, 'insertion failed'):
                self.service.complete_run(self.run['id'], self.result())
        exit_call = self.session.begin_nested.return_value.__exit__.call_args
        self.assertEqual(exit_call.args[0], RuntimeError)
        self.assertEqual(self.writes('analysis_runs', 'update'), [])

    def test_completion_rejects_terminal_runs_before_writes(self):
        for status in ('PENDING', 'COMPLETED', 'FAILED'):
            with patch.object(repo, 'locked_run', return_value=dict(self.run, status=status)):
                with self.assertRaises(ValueError):
                    self.service.complete_run(self.run['id'], self.result())
        self.session.execute.assert_not_called()

    def operation(self, command):
        return self.service.execute_operation(scope='local', kind='create', key='delivery',
                                              request={'title': 'Title'}, command=command)

    def test_operation_claim_precedes_side_effect_and_receipt(self):
        self.session.execute.return_value.mappings.return_value.one_or_none.return_value = None
        events = []
        def command(service):
            self.assertIs(service, self.service)
            statements = [str(call.args[0].compile(dialect=postgresql.dialect()))
                          for call in self.session.execute.call_args_list]
            self.assertIn('pg_advisory_xact_lock', statements[0])
            self.assertIn('operation_receipts', statements[1])
            events.append('command')
            return {'consultation_id': self.run['consultation_id'], 'receipt': {'id': 'saved'}}
        def record(*args, **kwargs):
            events.append('receipt')
            self.assertEqual(kwargs['fingerprint'], repo.checksum({'title': 'Title'}))
            return kwargs
        with patch.object(repo, 'record_operation', side_effect=record):
            self.assertEqual(self.operation(command)['receipt'], {'id': 'saved'})
        self.assertEqual(events, ['command', 'receipt'])
        self.session.commit.assert_not_called()

    def test_replay_and_conflict_do_not_execute_command(self):
        saved = dict(fingerprint=repo.checksum({'title': 'Title'}), receipt={'id': 'original'})
        self.session.execute.return_value.mappings.return_value.one_or_none.return_value = saved
        command = MagicMock()
        self.assertEqual(self.operation(command), saved)
        saved['fingerprint'] = '0' * 64
        with self.assertRaises(repo.IdempotencyConflict):
            self.operation(command)
        command.assert_not_called()

    def test_command_failure_exits_savepoint_and_does_not_record_receipt(self):
        self.session.execute.return_value.mappings.return_value.one_or_none.return_value = None
        with patch.object(repo, 'record_operation') as record:
            with self.assertRaisesRegex(RuntimeError, 'abort'):
                self.operation(MagicMock(side_effect=RuntimeError('abort')))
            record.assert_not_called()
        self.assertEqual(self.session.begin_nested.return_value.__exit__.call_args.args[0], RuntimeError)

    def test_stale_snapshot_isolation_rejected_before_side_effects(self):
        self.session.connection.return_value.get_isolation_level.return_value = 'REPEATABLE READ'
        command = MagicMock()
        with self.assertRaisesRegex(ValueError, 'READ COMMITTED'):
            self.operation(command)
        command.assert_not_called()
        self.session.execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
