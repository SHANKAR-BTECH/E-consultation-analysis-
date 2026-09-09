"""Characterize existing HTTP contracts; no persistence or production changes.

Success paths use the existing saved model. Faults are injected only at service
boundaries. Exact keys/messages describe today's contract, not new behavior.
"""
import io
import unittest
from unittest.mock import patch

from werkzeug.datastructures import MultiDict
from config import MAX_INPUT_CHARACTERS, MAX_REQUEST_BYTES
from model_service import ModelUnavailable, get_service
from server import app


POSITIVE = "The process was quick and very helpful."
NEGATIVE = "The portal keeps failing and nobody answers my complaint. Poor internet connectivity."
NEUTRAL = "Applications will open on Monday according to the official notice."
ROWS = [
    {"id": "same", "text": NEGATIVE, "date": "03/04/2026", "category": "Rural"},
    {"id": "same", "text": NEGATIVE, "date": "2026-04-04", "category": "Rural"},
    {"text": POSITIVE, "category": "Urban"},
    {"text": NEUTRAL},
]
ENVELOPE = {
    "schema_version", "total_received", "total_responses", "rejected_count",
    "rejected", "warnings", "responses", "sentiment", "keywords", "topics",
    "issues", "trends", "categories", "summary", "analysis_notes",
}
RESPONSE_KEYS = {
    "row_index", "id", "text", "sentiment", "confidence", "input_length",
    "word_count", "date", "date_input", "category", "source", "metadata",
}
PREDICTION_KEYS = {"sentiment", "confidence", "input_length", "word_count"}
SIGNALS = {"coverage", "negative_ratio", "frequency_weight", "negative_weight",
           "frequency_contribution", "negative_contribution"}


class Phase5ContractTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def analyze(self, rows):
        return self.client.post('/analyze', json={"responses": rows})

    def upload(self, content, **fields):
        return self.client.post('/analyze-file', content_type='multipart/form-data',
                                data={"file": (io.BytesIO(content), "input.csv"), **fields})

    def assert_error(self, response, status=400, message=None, details=False):
        self.assertEqual(response.status_code, status)
        self.assertEqual(response.mimetype, 'application/json')
        body = response.get_json()
        self.assertEqual(set(body), {'error', 'message', 'details'} if details else {'error', 'message'})
        self.assertIs(body['error'], True)
        self.assertIsInstance(body['message'], str)
        if message is not None:
            self.assertEqual(body['message'], message)
        return body

    def assert_distribution(self, value, total):
        self.assertEqual(set(value), {'counts', 'percentages', 'average_confidence'})
        self.assertEqual(set(value['counts']), set(get_service().classes))
        self.assertEqual(set(value['percentages']), set(value['counts']))
        self.assertEqual(sum(value['counts'].values()), total)
        for label, count in value['counts'].items():
            self.assertIs(type(count), int)
            self.assertEqual(value['percentages'][label], round(count / total * 100, 4))
        self.assertIsInstance(value['average_confidence'], float)

    def test_health_ready_contract(self):
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'application/json')
        self.assertEqual(response.json, {'status': 'ok', 'model_loaded': True,
                                         'classes': list(get_service().classes)})

    def test_health_unavailable_contract(self):
        with patch('server.get_service', side_effect=ModelUnavailable('not public')):
            response = self.client.get('/health')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json, {'status': 'unavailable', 'model_loaded': False, 'classes': []})

    def test_predict_success_contract(self):
        response = self.client.post('/predict', json={'feedback': '  ' + POSITIVE + '  ', 'ignored': 1})
        self.assertEqual(response.status_code, 200)
        body = response.json
        self.assertEqual(set(body), PREDICTION_KEYS)
        self.assertEqual(body['sentiment'], 'Positive')
        self.assertIs(type(body['input_length']), int)
        self.assertEqual(body['input_length'], len(POSITIVE))
        self.assertEqual(body['word_count'], len(POSITIVE.split()))
        self.assertIsInstance(body['confidence'], float)
        self.assertGreaterEqual(body['confidence'], 0)
        self.assertLessEqual(body['confidence'], 1)
        self.assertEqual(body['confidence'], round(body['confidence'], 6))

    def test_predict_shape_errors_and_unused_react_helper_mismatch(self):
        for raw, message in [
            ('{', 'Request must contain a valid JSON object with a feedback field.'),
            ('[]', 'Request must contain a valid JSON object.'),
            ('null', 'Request must contain a valid JSON object.'),
            ('{}', 'The feedback field is required.'),
            ('{"text":"helpful"}', 'The feedback field is required.'),
        ]:
            with self.subTest(raw=raw):
                self.assert_error(self.client.post('/predict', data=raw, content_type='application/json'), message=message)
        self.assert_error(self.client.post('/predict', data='text', content_type='text/plain'))

    def test_predict_text_validation_contract(self):
        for value in (None, True, 1, [], {}, '', '  '):
            with self.subTest(value=value):
                self.assert_error(self.client.post('/predict', json={'feedback': value}),
                                  message='Feedback must be a non-empty text value.')
        for text, message in [
            ('!!!', 'Feedback must contain usable English words, not only numbers or punctuation.'),
            ('अच्छा', 'This prototype supports English feedback only; non-Latin text is unsupported.'),
            ('zzzxxyyqqq', 'No vocabulary recognized by this English prototype. Please provide a meaningful English consultation response.'),
            ('x' * (MAX_INPUT_CHARACTERS + 1), f'Feedback must contain at most {MAX_INPUT_CHARACTERS} characters, including surrounding whitespace.'),
        ]:
            with self.subTest(message=message):
                self.assert_error(self.client.post('/predict', json={'feedback': text}), message=message)

    def test_predict_unavailable_and_generic_failure(self):
        with patch('server.get_service', side_effect=ModelUnavailable('Model unavailable.')):
            self.assert_error(self.client.post('/predict', json={'feedback': POSITIVE}), 503, 'Model unavailable.')
            # Basic validation precedes model access.
            self.assert_error(self.client.post('/predict', json={'feedback': ''}), 400)
        with patch('server.get_service', side_effect=RuntimeError('private detail')), self.assertLogs(app.logger, level='ERROR'):
            self.assert_error(self.client.post('/predict', json={'feedback': POSITIVE}), 500,
                              'Prediction failed. Please try again or contact the application operator.')

    def test_analyze_full_schema_and_numeric_contract(self):
        response = self.analyze(ROWS)
        self.assertEqual(response.status_code, 200)
        body = response.json
        self.assertEqual(set(body), ENVELOPE)
        self.assertEqual(body['schema_version'], '2.0')
        self.assertEqual((body['total_received'], body['total_responses'], body['rejected_count']), (4, 4, 0))
        self.assertEqual(body['rejected'], [])
        self.assertEqual(body['warnings'], [])
        for key in ('responses', 'keywords', 'topics', 'issues'):
            self.assertIsInstance(body[key], list)
            self.assertTrue(body[key])
        self.assert_distribution(body['sentiment'], 4)
        for row in body['responses']:
            self.assertEqual(set(row), RESPONSE_KEYS)
            self.assertIs(type(row['row_index']), int)
            self.assertEqual(row['sentiment'], row['sentiment'].lower())
            self.assertIsInstance(row['confidence'], float)
        for keyword in body['keywords']:
            self.assertEqual(set(keyword), {'keyword', 'count'})
        for topic in body['topics']:
            self.assertEqual(set(topic), {'topic', 'count', 'sentiment', 'response_indices'})
            self.assertEqual(topic['count'], len(topic['response_indices']))
        for issue in body['issues']:
            self.assertEqual(set(issue), {'issue', 'mentions', 'negative_mentions', 'negative_ratio',
                                         'sentiment', 'priority', 'response_indices', 'representative_feedback'})
            self.assertEqual(set(issue['priority']), {'score', 'level', 'signals'})
            self.assertEqual(set(issue['priority']['signals']), SIGNALS)
            self.assertIn(issue['priority']['level'], ('HIGH', 'MEDIUM', 'LOW'))
        self.assertIsInstance(body['summary'], str)
        self.assertEqual(set(body['analysis_notes']), {'summary_method', 'topic_method', 'issue_method',
            'term_limit_reached', 'unique_terms_considered', 'issue_thresholds', 'priority_thresholds',
            'confidence', 'priority_formula'})
        self.assertEqual(body['analysis_notes']['issue_thresholds'],
                         {'minimum_mentions': 2, 'minimum_negative_mentions': 2, 'minimum_negative_ratio': 0.5})

    def test_analyze_nested_trends_categories_and_evidence(self):
        body = self.analyze(ROWS).json
        self.assertEqual(set(body['trends']), {'available', 'reason', 'dated_responses', 'undated_responses', 'points'})
        self.assertIsNone(body['trends']['reason'])
        for point in body['trends']['points']:
            self.assertEqual(set(point), {'date', 'total_responses', 'sentiment', 'issue_mentions'})
            self.assert_distribution(point['sentiment'], point['total_responses'])
        self.assertEqual(set(body['categories']), {'available', 'reason', 'categorized_responses', 'uncategorized_responses', 'groups'})
        for group in body['categories']['groups']:
            self.assertEqual(set(group), {'category', 'total_responses', 'sentiment', 'issues'})
            self.assert_distribution(group['sentiment'], group['total_responses'])
            for issue in group['issues']:
                self.assertEqual(set(issue), {'issue', 'mentions', 'negative_mentions', 'priority'})
        rows = {r['row_index']: r for r in body['responses']}
        for issue in body['issues']:
            self.assertEqual(issue['response_indices'], sorted(set(issue['response_indices'])))
            self.assertLessEqual(len(issue['representative_feedback']), 3)
            for quote in issue['representative_feedback']:
                self.assertEqual(set(quote), {'row_index', 'id', 'text', 'sentiment', 'confidence'})
                self.assertIn(quote['row_index'], issue['response_indices'])
                self.assertEqual(quote, {key: rows[quote['row_index']][key] for key in quote})

    def test_analyze_invalid_envelopes(self):
        for raw in ('{', 'null', '[]', '{}'):
            with self.subTest(raw=raw):
                self.assert_error(self.client.post('/analyze', data=raw, content_type='application/json'))
        for rows in (None, [], {}, ''):
            with self.subTest(rows=rows):
                self.assert_error(self.analyze(rows), message='responses must be a non-empty array of response objects.')

    def test_analyze_all_invalid_details(self):
        body = self.assert_error(self.analyze([{}, {'text': '!!!'}]), details=True,
                                 message='No valid responses could be analyzed.')
        self.assertEqual(body['details'], {'total_received': 2, 'rejected': [
            {'row_index': 1, 'message': 'Each response requires a text field.'},
            {'row_index': 2, 'message': 'Feedback must contain usable English words, not only numbers or punctuation.'},
        ]})

    def test_analyze_partial_rows_keep_original_indices_and_date_warning(self):
        body = self.analyze([{}, {'text': POSITIVE, 'date': 'not-a-date'}, {'text': '!!!'}, {'text': NEUTRAL}]).json
        self.assertEqual((body['total_received'], body['total_responses'], body['rejected_count']), (4, 2, 2))
        self.assertEqual([r['row_index'] for r in body['responses']], [2, 4])
        self.assertEqual([r['id'] for r in body['responses']], [2, 4])
        self.assertEqual([r['row_index'] for r in body['rejected']], [1, 3])
        self.assertEqual(body['warnings'], [{'row_index': 2, 'message': 'Date could not be parsed; response excluded from trends only.'}])
        self.assertEqual(body['responses'][0]['date_input'], 'not-a-date')
        self.assertIsNone(body['responses'][0]['date'])

    def test_analyze_duplicate_text_and_typed_external_ids(self):
        rows = [{'id': identity, 'text': NEGATIVE} for identity in ('same', 'same', 1, '1')]
        body = self.analyze(rows).json
        self.assertEqual(body['total_responses'], 4)
        self.assertEqual([r['id'] for r in body['responses']], ['same', 'same', 1, '1'])
        self.assertEqual([r['row_index'] for r in body['responses']], [1, 2, 3, 4])
        self.assertEqual(body['issues'][0]['mentions'], 4)
        self.assertEqual(body['issues'][0]['response_indices'], [1, 2, 3, 4])
        self.assertEqual([r['row_index'] for r in body['issues'][0]['representative_feedback']], [1, 2, 3])
        self.assertEqual(body, self.analyze(rows).json)  # No run ID/time/save side effect in contract.

    def test_analyze_raw_text_normalization_and_unknown_fields(self):
        text = '  ' + POSITIVE + '\n '
        body = self.client.post('/analyze', json={'unused': True, 'responses': [{
            'text': text, 'source': ' survey ', 'category': ' ', 'date': ' 03/04/2026 ',
            'metadata': {'region': ' South ', 'verified': False}, 'unused': 'ignored',
        }]}).json
        row = body['responses'][0]
        self.assertEqual(row['text'], text)
        self.assertEqual(row['input_length'], len(POSITIVE))
        self.assertEqual(row['date_input'], '03/04/2026')
        self.assertEqual(row['date'], '2026-04-03')
        self.assertIsNone(row['category'])
        self.assertEqual(row['source'], 'survey')
        self.assertEqual(row['metadata'], {'region': ' South ', 'verified': False})
        self.assertNotIn('unused', row)

    def test_analyze_absent_optional_fields_and_unavailable_breakdowns(self):
        body = self.analyze([{'text': POSITIVE}]).json
        for key in ('date', 'date_input', 'category', 'source', 'metadata'):
            self.assertIsNone(body['responses'][0][key])
        self.assertEqual(body['issues'], [])
        self.assertEqual(body['trends'], {'available': False, 'reason': 'No valid dates in analyzed responses.',
                                          'dated_responses': 0, 'undated_responses': 1, 'points': []})
        self.assertEqual(body['categories'], {'available': False, 'reason': 'No categories in analyzed responses.',
            'categorized_responses': 0, 'uncategorized_responses': 1, 'groups': []})

    def test_csv_inspection_does_not_infer_or_analyze_rows(self):
        with patch('analysis_service.get_service', side_effect=AssertionError('inspection must not load ML')):
            response = self.upload(b'opinion,submitted,region\n!!!,bad,South\n', mode='inspect')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {'columns': ['opinion', 'submitted', 'region'], 'row_count': 1,
            'suggested_mapping': {'text_column': None, 'date_column': None, 'category_column': None},
            'candidates': {'text_column': [], 'date_column': [], 'category_column': []}, 'requires_selection': True})

    def test_csv_mapped_success_is_same_envelope_as_json(self):
        csv = f'opinion,submitted,dept,external,source,region\n{POSITIVE},03/04/2026,Water,same,survey,South\n'.encode()
        response = self.upload(csv, text_column='opinion', date_column='submitted', category_column='dept',
                               id_column='external', source_column='source', metadata_columns='["region"]')
        self.assertEqual(response.status_code, 200)
        expected = self.analyze([{'text': POSITIVE, 'date': '03/04/2026', 'category': 'Water',
                                 'id': 'same', 'source': 'survey', 'metadata': {'region': 'South'}}]).json
        self.assertEqual(response.json, expected)
        self.assertEqual(set(response.json), ENVELOPE)

    def test_csv_malformed_contract(self):
        for payload in (b'', b'text\n', b'text\n"unterminated', b'text,date\nwrong\n',
                        b'text,Text\nx,y\n', b'text\n\xff', b'text\n\x00'):
            with self.subTest(payload=payload):
                self.assert_error(self.upload(payload))

    def test_csv_missing_ambiguous_and_unknown_mapping(self):
        for header in ('opinion', 'text,feedback'):
            payload = (header + '\n' + ','.join([POSITIVE] * len(header.split(','))) + '\n').encode()
            body = self.assert_error(self.upload(payload), details=True,
                                     message='Select the CSV feedback column using text_column.')
            self.assertTrue(body['details']['requires_selection'])
            self.assertEqual(body['details']['columns'], header.split(','))
        self.assert_error(self.upload(f'text\n{POSITIVE}\n'.encode(), text_column='missing'), details=True,
                          message='Selected text_column is not a CSV column.')

    def test_csv_blank_mapping_disables_detection(self):
        payload = f'text,date,category\n{POSITIVE},2026-01-01,Water\n'.encode()
        detected = self.upload(payload).json
        disabled = self.upload(payload, date_column='', category_column='').json
        self.assertTrue(detected['trends']['available'])
        self.assertTrue(detected['categories']['available'])
        self.assertFalse(disabled['trends']['available'])
        self.assertFalse(disabled['categories']['available'])

    def test_csv_multiline_bom_blank_record_and_duplicate_upload(self):
        text = '  ' + POSITIVE + '\nPublic feedback.  '
        payload = ('\ufefftext\n\n"' + text + '"\n"' + text + '"\n').encode()
        response = self.upload(payload)
        self.assertEqual(response.status_code, 200)
        body = response.json
        self.assertEqual(body['total_received'], 3)
        self.assertEqual(body['rejected_count'], 1)
        self.assertEqual([r['row_index'] for r in body['responses']], [2, 3])
        self.assertEqual([r['text'] for r in body['responses']], [text, text])
        self.assertEqual(body, self.upload(payload).json)
        self.assertTrue(all(r['source'] is None for r in body['responses']))

    def test_csv_requires_one_file_and_valid_mode(self):
        self.assert_error(self.client.post('/analyze-file', json={}))
        self.assert_error(self.client.post('/analyze-file', data={}, content_type='multipart/form-data'))
        files = MultiDict([('file', (io.BytesIO(b'text\nx\n'), 'one.csv')),
                           ('file', (io.BytesIO(b'text\ny\n'), 'two.csv'))])
        self.assert_error(self.client.post('/analyze-file', data=files, content_type='multipart/form-data'),
                          message='Submit exactly one file in the file field.')
        self.assert_error(self.upload(b'text\nx\n', mode='save'), message='mode must be inspect or analyze.')

    def test_analysis_routes_unavailable_and_generic_failure(self):
        for route in ('json', 'csv'):
            send = (lambda: self.analyze(ROWS)) if route == 'json' else (lambda: self.upload(f'text\n{POSITIVE}\n'.encode()))
            with self.subTest(route=route):
                with patch('analysis_service.get_service', side_effect=ModelUnavailable('Model unavailable.')):
                    self.assert_error(send(), 503, 'Model unavailable.')
                with patch('server.analyze_batch', side_effect=RuntimeError('private detail')), self.assertLogs(app.logger, level='ERROR'):
                    self.assert_error(send(), 500, 'Analysis failed. Please try again or contact the application operator.')

    def test_transport_limit_remains_400_not_413(self):
        response = self.client.post('/predict', data=b' ' * (MAX_REQUEST_BYTES + 1), content_type='application/json')
        self.assert_error(response, 400, 'Request body exceeds the configured size limit for this endpoint.')


if __name__ == '__main__':
    unittest.main()
