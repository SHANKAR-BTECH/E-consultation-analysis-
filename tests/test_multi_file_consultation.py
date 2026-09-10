"""Test suite for Multi-File Single-Domain Consultation Architecture."""
import io
import unittest
import openpyxl

from werkzeug.datastructures import MultiDict
from server import app
from pdf_fixture import pdf_bytes
from persistence.service import PersistenceService

POSITIVE = "The newly introduced bus schedule is frequent and clean. Transit staff were helpful."
NEGATIVE = "Bus route 42 was rerouted without notice and waiting times are excessive."
NEUTRAL = "Public hearings regarding the transport hub will take place next week."

FOOD_POS = "The food ration distribution was prompt and well-organized."
FOOD_NEG = "Quality of grain supplied at the center was poor and substandard."


def excel_bytes(rows, sheet_name="Feedback"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name
    ws.append(["Feedback", "District", "Date"])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class MultiFileConsultationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_multi_pdf_same_domain_combined_analysis(self):
        pdf1 = pdf_bytes([POSITIVE, NEUTRAL])
        pdf2 = pdf_bytes([NEGATIVE])

        files = MultiDict([
            ('files', (io.BytesIO(pdf1), 'transport1.pdf')),
            ('files', (io.BytesIO(pdf2), 'transport2.pdf')),
            ('domain', 'Transport'),
            ('analysis_mode', 'together')
        ])

        response = self.client.post('/analyze-file', data=files, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)
        body = response.json
        self.assertEqual(body['domain'], 'Transport')
        self.assertEqual(body['total_responses'], 3)
        self.assertEqual(body['files'], ['transport1.pdf', 'transport2.pdf'])

        # Verify provenance stored in metadata
        provenances = [r['metadata']['source_file'] for r in body['responses']]
        self.assertEqual(provenances, ['transport1.pdf', 'transport1.pdf', 'transport2.pdf'])

        domains = [r['metadata']['domain'] for r in body['responses']]
        self.assertEqual(domains, ['Transport', 'Transport', 'Transport'])

    def test_multi_excel_same_domain_combined_analysis(self):
        xlsx1 = excel_bytes([[FOOD_POS, "North", "2026-03-01"]])
        xlsx2 = excel_bytes([[FOOD_NEG, "South", "2026-03-02"]])

        files = MultiDict([
            ('files', (io.BytesIO(xlsx1), 'food1.xlsx')),
            ('files', (io.BytesIO(xlsx2), 'food2.xlsx')),
            ('domain', 'Food & Public Distribution'),
            ('analysis_mode', 'together'),
            ('text_column', 'Feedback')
        ])

        response = self.client.post('/analyze-file', data=files, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)
        body = response.json
        self.assertEqual(body['domain'], 'Food & Public Distribution')
        self.assertEqual(body['total_responses'], 2)
        self.assertEqual(body['files'], ['food1.xlsx', 'food2.xlsx'])

        # Check provenance
        files_provenance = [r['metadata']['source_file'] for r in body['responses']]
        self.assertEqual(files_provenance, ['food1.xlsx', 'food2.xlsx'])

    def test_pdf_and_excel_mixed_format_rejected(self):
        pdf = pdf_bytes([POSITIVE])
        xlsx = excel_bytes([[FOOD_POS, "North", "2026-03-01"]])

        files = MultiDict([
            ('files', (io.BytesIO(pdf), 'transport.pdf')),
            ('files', (io.BytesIO(xlsx), 'transport.xlsx')),
            ('domain', 'Transport')
        ])

        response = self.client.post('/analyze-file', data=files, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 400)
        self.assertIn("PDF and Excel cannot be mixed", response.json['message'])

    def test_separate_analysis_mode(self):
        pdf1 = pdf_bytes([POSITIVE])
        pdf2 = pdf_bytes([NEGATIVE])

        files = MultiDict([
            ('files', (io.BytesIO(pdf1), 'transport_a.pdf')),
            ('files', (io.BytesIO(pdf2), 'transport_b.pdf')),
            ('domain', 'Transport'),
            ('analysis_mode', 'separate')
        ])

        response = self.client.post('/analyze-file', data=files, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)
        body = response.json
        self.assertEqual(body['domain'], 'Transport')
        self.assertEqual(body['analysis_mode'], 'separate')
        self.assertIn('transport_a.pdf', body['results'])
        self.assertIn('transport_b.pdf', body['results'])
        self.assertEqual(body['results']['transport_a.pdf']['total_responses'], 1)
        self.assertEqual(body['results']['transport_b.pdf']['total_responses'], 1)

    def test_history_shows_domain_and_file_count(self):
        pdf1 = pdf_bytes([POSITIVE])
        pdf2 = pdf_bytes([NEGATIVE])

        files = MultiDict([
            ('files', (io.BytesIO(pdf1), 'history_t1.pdf')),
            ('files', (io.BytesIO(pdf2), 'history_t2.pdf')),
            ('domain', 'Transport'),
            ('analysis_mode', 'together')
        ])

        res = self.client.post('/analyze-file', data=files, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 200)

        # Query history
        hist_res = self.client.get('/consultations')
        self.assertEqual(hist_res.status_code, 200)
        consultations = hist_res.json['consultations']
        self.assertTrue(len(consultations) > 0)
        latest = consultations[0]
        self.assertEqual(latest['domain'], 'Transport')
        self.assertEqual(latest['file_count'], 2)
        self.assertIn('history_t1.pdf', latest['files'])
        self.assertIn('history_t2.pdf', latest['files'])

    def test_multi_file_inspect_mode(self):
        pdf1 = pdf_bytes([POSITIVE, NEUTRAL])
        pdf2 = pdf_bytes([NEGATIVE])

        files = MultiDict([
            ('files', (io.BytesIO(pdf1), 'inspect1.pdf')),
            ('files', (io.BytesIO(pdf2), 'inspect2.pdf')),
            ('domain', 'Transport'),
            ('mode', 'inspect')
        ])

        response = self.client.post('/analyze-file', data=files, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)
        body = response.json
        self.assertEqual(body['domain'], 'Transport')
        self.assertEqual(body['total_responses'], 3)
        self.assertEqual(len(body['files']), 2)
        self.assertEqual(body['files'][0]['row_count'], 2)
        self.assertEqual(body['files'][1]['row_count'], 1)


if __name__ == '__main__':
    unittest.main()
