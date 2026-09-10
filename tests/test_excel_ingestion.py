"""Excel (.xlsx) workbook ingestion: parsing, mapping, API and persistence contracts."""
import io
import json
import unittest
from flask import jsonify
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from analysis_service import AnalysisError
from config import MAX_BATCH_RESPONSES, MAX_EXCEL_BYTES
from excel_ingestion import parse_excel, inspect_excel_columns, map_excel
from persistence.database import Database
from persistence.service import PersistenceService
from server import app

POSITIVE = "The process was quick and very helpful."
NEGATIVE = "The portal keeps failing and nobody answers my complaint. Poor internet connectivity."

ENVELOPE = {
    "schema_version", "total_received", "total_responses", "rejected_count",
    "rejected", "warnings", "responses", "sentiment", "keywords", "topics",
    "issues", "trends", "categories", "summary", "analysis_notes",
}


def workbook_bytes(sheets):
    from openpyxl import Workbook
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets:
        ws = wb.create_sheet(title=name)
        for row in rows:
            ws.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


class ExcelUnitTests(unittest.TestCase):
    def test_parse_inspect_and_map_valid_workbook(self):
        content = workbook_bytes([("Sheet1", [
            ["feedback", "date", "region"],
            [POSITIVE, "03/04/2026", "South"],
        ])])
        sheets, columns, rows = parse_excel(io.BytesIO(content))
        self.assertEqual(sheets, ["Sheet1"])
        self.assertEqual(columns, ["feedback", "date", "region"])
        self.assertEqual(rows, [{"feedback": POSITIVE, "date": "03/04/2026", "region": "South"}])
        inspection = inspect_excel_columns(sheets, columns, rows)
        self.assertEqual(inspection["row_count"], 1)
        self.assertEqual(inspection["sheets"], ["Sheet1"])
        self.assertEqual(inspection["suggested_mapping"],
                         {"text_column": "feedback", "date_column": "date", "category_column": None})
        self.assertFalse(inspection["requires_selection"])
        self.assertEqual(map_excel(columns, rows, {"metadata_columns": '["region"]'}),
                         [{"text": POSITIVE, "date": "03/04/2026",
                           "metadata": {"region": "South"}}])

    def test_multi_sheet_selection_and_unknown_sheet(self):
        content = workbook_bytes([
            ("Responses", [["feedback"], [POSITIVE]]),
            ("Second", [["feedback", "extra"], [NEGATIVE, "x"]]),
        ])
        sheets, columns, rows = parse_excel(io.BytesIO(content))
        self.assertEqual(sheets, ["Responses", "Second"])
        self.assertEqual(columns, ["feedback"])
        _, columns, rows = parse_excel(io.BytesIO(content), "Second")
        self.assertEqual(columns, ["feedback", "extra"])
        self.assertEqual(rows, [{"feedback": NEGATIVE, "extra": "x"}])
        with self.assertRaisesRegex(AnalysisError, "Sheet 'Nope' was not found"):
            parse_excel(io.BytesIO(content), "Nope")

    def test_mixed_cell_types_and_empty_cells_become_text(self):
        content = workbook_bytes([("Sheet1", [
            ["feedback", "value"],
            [POSITIVE, 2],
            [NEGATIVE, 2.5],
            ["ok", True],
            ["also ok", None],
            ["dated", datetime(2026, 1, 1, 12, 0)],
        ])])
        _, _, rows = parse_excel(io.BytesIO(content))
        self.assertEqual([row["value"] for row in rows],
                         ["2", "2.5", "True", "", "2026-01-01 12:00:00"])
        mapping = map_excel(["feedback", "value"], rows, {"metadata_columns": '["value"]'})
        self.assertEqual(mapping[3]["metadata"]["value"], "")
        self.assertEqual(mapping[4]["metadata"]["value"], "2026-01-01 12:00:00")

    def test_missing_ambiguous_and_unknown_feedback_column(self):
        content = workbook_bytes([("Sheet1", [["note"], [POSITIVE]])])
        sheets, columns, rows = parse_excel(io.BytesIO(content))
        with self.assertRaisesRegex(AnalysisError, "Select the feedback column"):
            map_excel(columns, rows, {})
        ambiguous = workbook_bytes([("Sheet1", [["text", "feedback"], [POSITIVE, POSITIVE]])])
        _, columns, rows = parse_excel(io.BytesIO(ambiguous))
        inspection = inspect_excel_columns([], columns, rows)
        self.assertIsNone(inspection["suggested_mapping"]["text_column"])
        self.assertTrue(inspection["requires_selection"])
        self.assertEqual(map_excel(columns, rows, {"text_column": "feedback"}),
                         [{"text": POSITIVE}])
        with self.assertRaisesRegex(AnalysisError, "Selected text_column is not a column"):
            map_excel(columns, rows, {"text_column": "missing"})
        with self.assertRaisesRegex(AnalysisError, "different column"):
            map_excel(["text"], [{"text": POSITIVE}], {"text_column": "text", "id_column": "text"})

    def test_column_headers_require_unique_names_and_cap(self):
        duplicate = workbook_bytes([("Sheet1", [["text", "text"], [POSITIVE, POSITIVE]])])
        with self.assertRaisesRegex(AnalysisError, "unique, non-empty column names"):
            parse_excel(io.BytesIO(duplicate))
        many = workbook_bytes([("Sheet1", [[f"c{i}" for i in range(51)]])])
        with self.assertRaisesRegex(AnalysisError, "at most 50"):
            parse_excel(io.BytesIO(many))

    def test_empty_sheet_and_header_only_are_errors(self):
        content = workbook_bytes([("Sheet1", [])])
        with self.assertRaisesRegex(AnalysisError, "contains no data"):
            parse_excel(io.BytesIO(content))
        content = workbook_bytes([("Sheet1", [["feedback"]])])
        with self.assertRaisesRegex(AnalysisError, "header but no data records"):
            parse_excel(io.BytesIO(content))

    def test_file_size_and_record_limits(self):
        with self.assertRaisesRegex(AnalysisError, f"exceeds {MAX_EXCEL_BYTES} bytes"):
            parse_excel(io.BytesIO(b"x" * (MAX_EXCEL_BYTES + 1)))
        rows = [["feedback"]] + [[f"response {i + 1}"] for i in range(MAX_BATCH_RESPONSES + 1)]
        content = workbook_bytes([("Sheet1", rows)])
        with self.assertRaisesRegex(AnalysisError, f"exceeds {MAX_BATCH_RESPONSES} data records"):
            parse_excel(io.BytesIO(content))

    def test_corrupt_workbook_is_a_safe_error(self):
        with self.assertRaisesRegex(AnalysisError, "valid .xlsx file"):
            parse_excel(io.BytesIO(b"not a zip archive"))


class ExcelApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        no_persist = patch('server.persist_analysis', return_value=None)
        no_persist.start()
        self.addCleanup(no_persist.stop)

    def analyze(self, rows):
        return self.client.post('/analyze', json={"responses": rows})

    def upload(self, content, filename="input.xlsx", **fields):
        return self.client.post('/analyze-file', content_type='multipart/form-data',
                                data={"file": (io.BytesIO(content), filename), **fields})

    def assert_error(self, response, status=400, message=None, details=False):
        self.assertEqual(response.status_code, status)
        body = response.get_json()
        self.assertEqual(set(body), {'error', 'message', 'details'} if details else {'error', 'message'})
        self.assertIs(body['error'], True)
        if message is not None:
            self.assertEqual(body['message'], message)
        return body

    def test_excel_analysis_matches_json_envelope_and_pipeline(self):
        content = workbook_bytes([("Responses", [
            ["feedback", "date", "category", "id", "source", "region"],
            [POSITIVE, "03/04/2026", "Water", "same", "survey", "South"],
        ])])
        response = self.upload(content, text_column='feedback', date_column='date',
                               category_column='category', id_column='id', source_column='source',
                               metadata_columns='["region"]')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json), ENVELOPE)
        expected = self.analyze([{'text': POSITIVE, 'date': '03/04/2026', 'category': 'Water',
                                  'id': 'same', 'source': 'survey', 'metadata': {'region': 'South'}}]).json
        self.assertEqual(response.json, expected)

    def test_excel_inspection_does_not_load_ml_and_lists_sheets(self):
        content = workbook_bytes([("Alpha", [["opinion"], ["!!!"]])])
        with patch('analysis_service.get_service', side_effect=AssertionError('inspection must not load ML')):
            response = self.upload(content, mode='inspect')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {'columns': ['opinion'], 'row_count': 1, 'sheets': ['Alpha'],
            'suggested_mapping': {'text_column': None, 'date_column': None, 'category_column': None},
            'candidates': {'text_column': [], 'date_column': [], 'category_column': []},
            'requires_selection': True})

    def test_excel_sheet_selection_and_invalid_sheet(self):
        content = workbook_bytes([
            ("First", [["feedback"], [POSITIVE]]),
            ("Second", [["feedback"], [NEGATIVE]]),
        ])
        selected = self.upload(content, sheet='Second').json
        self.assertEqual(selected['total_responses'], 1)
        self.assertEqual(selected['responses'][0]['text'], NEGATIVE)
        self.assert_error(self.upload(content, sheet='Missing'),
                          message="Sheet 'Missing' was not found in the workbook.")

    def test_invalid_extension_and_multipart_contract(self):
        self.assert_error(self.upload(b'text\nx\n', filename='notes.txt'),
                          message='Uploaded file must have a .pdf or .xlsx filename.')
        self.assert_error(self.client.post('/analyze-file', json={}),
                          message='Submit a file as multipart/form-data with a file field.')
        self.assert_error(self.upload(workbook_bytes([("S", [["feedback"], [POSITIVE]])]), mode='save'),
                          message='mode must be inspect or analyze.')

    def test_excel_rows_keep_presented_order_and_blank_text_is_rejected(self):
        content = workbook_bytes([("Sheet1", [
            ["feedback"],
            [NEGATIVE],
            [POSITIVE],
            [" "],
            ["  "],
        ])])
        body = self.upload(content).json
        self.assertEqual((body['total_received'], body['total_responses'], body['rejected_count']), (4, 2, 2))
        self.assertEqual([r['row_index'] for r in body['responses']], [1, 2])
        self.assertEqual([r['row_index'] for r in body['rejected']], [3, 4])

    def test_excel_analysis_provenance_for_persistence(self):
        captured = {}
        content = workbook_bytes([("Responses", [["feedback"], [POSITIVE]])])

        def fake_run(responses, **provenance):
            captured.update(provenance, responses=responses)
            return jsonify({"fake": True})

        with patch('server.run_analysis', side_effect=fake_run):
            response = self.upload(content, sheet='Responses')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured['source_type'], 'excel')
        self.assertEqual(captured['filename'], 'input.xlsx')
        self.assertEqual(captured['source_metadata']['file_type'], 'xlsx')
        self.assertEqual(captured['source_metadata']['sheet'], 'Responses')
        self.assertEqual(captured['source_metadata']['headers'], ['feedback'])
        self.assertEqual(captured['raw_records'], [{'feedback': POSITIVE}])


class ExcelPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Database(str(Path(self.tmp.name) / 'history.sqlite3'))
        self.addCleanup(self.db.close)

    def test_service_import_accepts_excel_provenance(self):
        with self.db.transaction() as connection:
            service = PersistenceService(connection)
            consultation_id = service.create_consultation('Excel test')
            import_id = service.create_import(
                consultation_id, [{'text': POSITIVE}], source_type='excel',
                raw_records=[{'feedback': POSITIVE}], raw_bytes=b'xlsx bytes',
                source_metadata={'headers': ['feedback'], 'file_type': 'xlsx'},
                mapping={'text_column': 'feedback'})
        self.assertEqual(len(import_id), 36)
        with self.db.transaction() as connection:
            row = connection.execute(
                'SELECT source_type, original_filename, record_count, source_metadata, mapping FROM imports WHERE id = ?',
                (import_id,)).fetchone()
            self.assertEqual(row['source_type'], 'excel')
            self.assertEqual(row['original_filename'], None)
            self.assertEqual(row['record_count'], 1)
            self.assertEqual(json.loads(row['source_metadata'])['file_type'], 'xlsx')
            self.assertEqual(json.loads(row['mapping'])['text_column'], 'feedback')

    def test_excel_and_pdf_source_types_store_runs(self):
        from pdf_ingestion import map_pdf
        with self.db.transaction() as connection:
            service = PersistenceService(connection)
            consultation_id = service.create_consultation('Excel run test')
            other = service.create_consultation('PDF run test')
            excel_import = service.create_import(consultation_id, [{'text': POSITIVE}], source_type='excel',
                                                 source_metadata={'file_type': 'xlsx'})
            pdf_import = service.create_import(other, map_pdf(['nice.']), source_type='pdf',
                                               source_metadata={'file_type': 'pdf'})
            excel_run = service.create_run(consultation_id, [{'text': POSITIVE}], {'version': 'excel-run'})
            pdf_run = service.create_run(other, [{'text': 'nice.'}], {'version': 'pdf-run'})
            service.complete_run(excel_run, {'total_responses': 1})
            service.complete_run(pdf_run, {'total_responses': 1})
        self.assertTrue(excel_import)
        self.assertTrue(pdf_import)
        self.assertEqual(len(excel_run), 36)
        self.assertEqual(len(pdf_run), 36)


class ExcelFrontendTests(unittest.TestCase):
    def test_canonical_page_exposes_excel_input_and_no_url_ingestion(self):
        with app.test_client() as client:
            page = client.get('/')
            self.assertEqual(page.status_code, 200)
            for marker in (b'id="tab-excel"', b'id="pane-excel"', b'id="excel-file"',
                           b'id="analyze-excel"', b'id="excel-limit"', b'id="excel-sheet"'):
                self.assertIn(marker, page.data)
            for gone in (b'tab-url', b'pane-url', b'analyze-url'):
                self.assertNotIn(gone, page.data)
            self.assertIn(b'"maxExcelBytes"', page.data)

    def test_ui_limits_include_excel_size(self):
        with app.test_client() as client:
            page = client.get('/')
        self.assertIn(b'"maxExcelBytes": 10000000', page.data)


if __name__ == '__main__':
    unittest.main()