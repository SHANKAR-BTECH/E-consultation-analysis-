import json
import unittest
from unittest.mock import MagicMock, patch

from server import app
from url_fetcher import URLAcquisitionError
from url_ingestion import acquisition_lock
from tests.test_url_ingestion import URL, HTML
from url_sources import parse_mygov
from url_fetcher import Resource


class URLAPITests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        extensions = patch.dict(app.extensions, {'consultation_database': MagicMock()})
        extensions.start(); self.addCleanup(extensions.stop)

    def test_request_validation_precedes_fetch(self):
        with patch('server.acquire_consultation') as acquire:
            for data in ({}, [], {'url':URL,'headers':{}}, {'url':'http://127.0.0.1'}, {'url':None}):
                self.assertEqual(self.client.post('/analyze-url',json=data).status_code, 400)
            self.assertEqual(self.client.get('/analyze-url').status_code, 405)
            self.assertEqual(self.client.post('/analyze-url',data='x').status_code, 400)
            self.assertEqual(self.client.post('/analyze-url',json={'url':'x'*17000}).status_code, 400)
            acquire.assert_not_called()

    def test_persistence_required_and_foreign_origin_blocked(self):
        with patch.dict(app.extensions, {'consultation_database':None}), patch('server.acquire_consultation') as acquire:
            self.assertEqual(self.client.post('/analyze-url',json={'url':URL}).status_code, 503)
            acquire.assert_not_called()
        self.assertEqual(self.client.post('/analyze-url',json={'url':URL},headers={'Origin':'https://evil.example'}).status_code,403)

    def test_success_uses_existing_analysis_and_save_with_provenance(self):
        rows = parse_mygov(Resource(URL, HTML, 'text/html', []))[0]
        provenance = dict(source_type='json',source_metadata={'original_url':URL},raw_records=rows,
                          raw_bytes=json.dumps({'url':URL}).encode())
        with patch('server.acquire_consultation',return_value=(rows,provenance)), patch('server.persist_analysis') as save:
            response = self.client.post('/analyze-url',json={'url':URL})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['schema_version'],'2.0')
        self.assertEqual(response.json['total_received'],2)
        self.assertEqual(response.headers['Cache-Control'],'no-store')
        save.assert_called_once()
        self.assertEqual(save.call_args.args[1],rows)
        self.assertEqual(save.call_args.args[2],response.json)
        self.assertEqual(save.call_args.kwargs,provenance)

    def test_error_envelope_and_no_persistence(self):
        with patch('server.acquire_consultation',side_effect=URLAcquisitionError('SOURCE_TIMEOUT','Source timed out.',504,'fetch',True)), \
                patch('server.persist_analysis') as save:
            response = self.client.post('/analyze-url',json={'url':URL})
        self.assertEqual(response.status_code,504)
        self.assertEqual(response.json['details']['code'],'SOURCE_TIMEOUT')
        save.assert_not_called()
        self.assertFalse(acquisition_lock.locked())

    def test_duplicate_admission(self):
        with acquisition_lock, patch('server.acquire_consultation') as acquire:
            self.assertEqual(self.client.post('/analyze-url',json={'url':URL}).status_code,429)
            acquire.assert_not_called()
