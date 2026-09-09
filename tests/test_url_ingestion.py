import base64
import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from analysis_service import analyze_batch
from url_fetcher import Resource, URLAcquisitionError
from url_sources import parse_mygov, parse_export
from url_ingestion import acquire_consultation, last_access, source_delays

URL = 'https://www.mygov.in/group-issue/consultation'
HTML = (Path(__file__).parent / 'fixtures/url_ingestion/mygov.html').read_bytes()


class ExtractionTests(unittest.TestCase):
    def resource(self, body=HTML):
        return Resource(URL, body, 'text/html', [])

    def test_extract_only_answer_bodies_and_existing_analysis(self):
        records, raw, total, next_url = parse_mygov(self.resource())
        self.assertEqual(total, 2)
        self.assertIsNone(next_url)
        self.assertEqual([r['text'] for r in records], [
            'The process was quick and very helpful.', 'Poor internet connectivity.\nThe portal keeps failing.'])
        self.assertEqual([r['source_id'] for r in raw], ['comment-1','comment-2'])
        result = analyze_batch(records)
        self.assertEqual(result['total_received'], 2)
        self.assertEqual([r['row_index'] for r in result['responses']], [1,2])
        self.assertEqual(result['responses'][0]['text'], records[0]['text'])

    def test_unsupported_empty_changed_js_auth_and_attachments(self):
        cases = [(b'<html><nav>great consultation responses</nav></html>', 'UNSUPPORTED_SOURCE'),
                 (b'<noscript>Please enable JavaScript</noscript>', 'JS_REQUIRED'),
                 (b'<form><input type="password"></form>', 'SOURCE_ACCESS_RESTRICTED'),
                 (b'<form id="challenge-form"></form>', 'SOURCE_ACCESS_RESTRICTED'),
                 (HTML.replace(b'class="comments-row"', b'class="unknown"'), 'NO_PUBLIC_RESPONSES'),
                 (HTML.replace(b'comment-1', b'unknown'), 'EXTRACTION_CHANGED'),
                 (HTML.replace(b'Like 99', b'<span class="comment-file">attachment</span>Like 99'), 'UNSUPPORTED_FORMAT')]
        for body, code in cases:
            with self.subTest(code=code), self.assertRaises(URLAcquisitionError) as caught:
                parse_mygov(self.resource(body))
            self.assertEqual(caught.exception.details['code'], code)

    def test_open_paginated_discussion_rejected(self):
        body = HTML.replace(b'01/01/2020', b'01/01/2099').replace(b'</body>',
            b'<li class="pager__item--next"><a href="?page=1">Next</a></li></body>')
        with self.assertRaises(URLAcquisitionError) as caught:
            parse_mygov(self.resource(body))
        self.assertEqual(caught.exception.details['code'], 'INCOMPLETE_COLLECTION')

    def test_export_reuses_csv_mapping_and_strict_json(self):
        records, raw = parse_export(Resource(URL, b'feedback,extra\nGood service,retained\nGood service,retained\n',
                                             'text/csv', []), {'format':'csv'})
        self.assertEqual(len(records), 2)
        self.assertEqual(raw[0]['extra'], 'retained')
        rows = [{'id':1,'text':'Good service'}, {'id':'1','text':'Good service'}]
        self.assertEqual(parse_export(Resource(URL, json.dumps({'responses': rows}).encode(), 'application/json', []),
                                     {'format':'json'})[0], rows)
        for body in (b'{"responses":[],"responses":[]}', b'{"responses":[NaN]}', b'<html>login</html>'):
            with self.assertRaises(URLAcquisitionError):
                parse_export(Resource(URL, body, 'application/json', []), {'format':'json'})

    def test_acquisition_provenance_and_count_mismatch(self):
        last_access.clear(); source_delays.clear()
        policy = Resource('https://www.mygov.in/robots.txt', b'User-agent: *\nAllow: /', 'text/plain', [])
        with patch('url_ingestion.PublicFetcher.fetch', side_effect=[policy,self.resource()]):
            records, provenance = acquire_consultation(URL)
        self.assertEqual(provenance['source_type'], 'json')
        self.assertEqual(provenance['source_metadata']['original_url'], URL)
        self.assertEqual(len(provenance['raw_records']), len(records))
        captured = json.loads(provenance['raw_bytes'])['resources'][0]
        self.assertEqual(base64.b64decode(captured['body_base64']), HTML)
        self.assertEqual(captured['sha256'], hashlib.sha256(HTML).hexdigest())
        self.assertEqual(records[0]['metadata']['url_resource'], 'resource-1')
        with patch('url_ingestion.PublicFetcher.fetch', side_effect=[policy,self.resource(HTML.replace(b'<span>2',b'<span>3'))]), \
                self.assertRaises(URLAcquisitionError) as caught:
            acquire_consultation(URL)
        self.assertEqual(caught.exception.details['code'], 'INCOMPLETE_COLLECTION')

    def test_unregistered_source_and_robots_denial(self):
        with self.assertRaises(URLAcquisitionError):
            acquire_consultation('https://example.com/responses.csv')
        policy = Resource('https://www.mygov.in/robots.txt', b'User-agent: *\nDisallow: /group-issue/', 'text/plain', [])
        with patch('url_ingestion.PublicFetcher.fetch', return_value=policy) as fetch, self.assertRaises(URLAcquisitionError):
            acquire_consultation(URL)
        self.assertEqual(fetch.call_count, 1)
