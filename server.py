"""Existing Flask application, backed by the shared inference service."""
import io
from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge, UnsupportedMediaType

from config import (MAX_REQUEST_BYTES, MAX_ANALYSIS_REQUEST_BYTES, PROJECT_TITLE,
                    MAX_BATCH_RESPONSES, MAX_BATCH_CHARACTERS, MAX_INPUT_CHARACTERS,
                    MAX_PDF_BYTES, MAX_EXCEL_BYTES)
from evaluation_info import load_evaluation
from model_service import get_service, validate_feedback, InvalidFeedback, ModelUnavailable
from analysis_service import analyze_batch, AnalysisError
from pdf_ingestion import parse_pdf, inspect_pdf, map_pdf
from excel_ingestion import parse_excel, inspect_excel_columns, map_excel
from persistence.database import init_app
from persistence.flask_service import model_manifest, persist_analysis, PersistenceFailure
from persistence.history_routes import history_api

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_ANALYSIS_REQUEST_BYTES
# This local application is edited between runs. Never retain an obsolete
# compiled page while Flask serves updated CSS/JS from disk.
app.config["TEMPLATES_AUTO_RELOAD"] = True
init_app(app)
app.register_blueprint(history_api)


@app.after_request
def revalidate_frontend(response):
    if request.endpoint == "index":
        response.headers["Cache-Control"] = "no-store"
    elif request.endpoint == "static":
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.before_request
def apply_request_limit():
    # Flask 3.1 supports per-request limits; retain the Phase 1 /predict ceiling.
    request.max_content_length = MAX_ANALYSIS_REQUEST_BYTES if request.path in ("/analyze", "/analyze-file") else MAX_REQUEST_BYTES


def error(message, status=400):
    return jsonify({"error": True, "message": message}), status


@app.errorhandler(RequestEntityTooLarge)
def too_large(exc):
    return error("Request body exceeds the configured size limit for this endpoint.")


@app.errorhandler(AnalysisError)
def analysis_error(exc):
    body = {"error": True, "message": str(exc)}
    if exc.details:
        body["details"] = exc.details
    return jsonify(body), 400


def run_analysis(responses, **provenance):
    try:
        result = analyze_batch(responses)
        database = app.extensions.get('consultation_database')
        if database is not None:
            try:
                manifest = model_manifest(get_service())
                persist_analysis(database, responses, result, manifest, **provenance)
            except PersistenceFailure:
                raise
            except Exception:
                raise PersistenceFailure('Analysis could not be saved. Check the database and retry.') from None
        return jsonify(result)
    except PersistenceFailure as exc:
        return error(str(exc), 503)
    except AnalysisError:
        raise
    except ModelUnavailable as exc:
        return error(str(exc), 503)
    except Exception:
        app.logger.exception("Analysis failed")
        return error("Analysis failed. Please try again or contact the application operator.", 500)


@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        data = request.get_json()
    except (BadRequest, UnsupportedMediaType, RecursionError):
        return error("Request must contain a valid JSON object with a responses array.")
    if not isinstance(data, dict) or "responses" not in data:
        return error("Request must contain a JSON object with a responses array.")
    return run_analysis(data["responses"], source_type='json',
                        raw_bytes=request.get_data(), source_metadata={'endpoint': '/analyze'})


@app.route("/analyze-file", methods=["POST"])
def analyze_file():
    try:
        if request.mimetype != "multipart/form-data":
            raise AnalysisError("Submit a file as multipart/form-data with a file field.")
        if len(request.files.getlist("file")) != 1:
            raise AnalysisError("Submit exactly one file in the file field.")
        upload = request.files["file"]
        if not upload.filename:
            raise AnalysisError("Uploaded file must have a filename.")
        filename_lower = upload.filename.lower()
        is_pdf = filename_lower.endswith(".pdf")
        is_xlsx = filename_lower.endswith(".xlsx")
        if not is_pdf and not is_xlsx:
            raise AnalysisError("Uploaded file must have a .pdf or .xlsx filename.")
        mode = request.form.get("mode", "analyze")
        if mode not in ("inspect", "analyze"):
            raise AnalysisError("mode must be inspect or analyze.")
        if is_xlsx:
            raw_bytes = upload.stream.read(MAX_EXCEL_BYTES + 1)
            sheet = request.form.get("sheet", "")
            sheets, columns, rows = parse_excel(io.BytesIO(raw_bytes), sheet)
            if mode == "inspect":
                return jsonify(inspect_excel_columns(sheets, columns, rows))
            return run_analysis(map_excel(columns, rows, request.form), source_type='excel',
                                filename=upload.filename, raw_bytes=raw_bytes, raw_records=rows,
                                mapping={key: request.form[key] for key in (
                                    'text_column', 'date_column', 'category_column',
                                    'id_column', 'source_column', 'metadata_columns') if key in request.form},
                                source_metadata={'endpoint': '/analyze-file', 'headers': columns,
                                                 'file_type': 'xlsx', 'sheet': sheet or sheets[0]})
        else:
            raw_bytes = upload.stream.read(MAX_PDF_BYTES + 1)
            page_count, lines = parse_pdf(io.BytesIO(raw_bytes))
            if mode == "inspect":
                return jsonify(inspect_pdf(page_count, lines))
            return run_analysis(map_pdf(lines), source_type='pdf',
                                filename=upload.filename, raw_bytes=raw_bytes, raw_records=lines,
                                mapping={},
                                source_metadata={'endpoint': '/analyze-file', 'file_type': 'pdf',
                                                 'page_count': page_count,
                                                 'extracted_responses': len(lines)})
    except BadRequest:
        return error("Malformed multipart request.")


@app.route("/")
def index():
    try:
        service = get_service()
        classes, ready = service.classes, True
    except ModelUnavailable:
        classes, ready = (), False
    return render_template("index.html", metadata=load_evaluation(),
                           classes=classes, assets_ok=ready, project_title=PROJECT_TITLE,
                           ui_limits={"maxResponses": MAX_BATCH_RESPONSES, "maxCharacters": MAX_BATCH_CHARACTERS,
                                      "maxPerResponse": MAX_INPUT_CHARACTERS, "maxPdfBytes": MAX_PDF_BYTES,
                                      "maxExcelBytes": MAX_EXCEL_BYTES})


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()
    except (BadRequest, UnsupportedMediaType, RecursionError):
        return error("Request must contain a valid JSON object with a feedback field.")
    if not isinstance(data, dict):
        return error("Request must contain a valid JSON object.")
    if "feedback" not in data:
        return error("The feedback field is required.")
    try:
        validate_feedback(data["feedback"])
        return jsonify(get_service().predict(data["feedback"]))
    except InvalidFeedback as exc:
        return error(str(exc))
    except ModelUnavailable as exc:
        return error(str(exc), 503)
    except Exception:
        app.logger.exception("Prediction failed")
        return error("Prediction failed. Please try again or contact the application operator.", 500)


@app.route("/health")
def health():
    try:
        service = get_service()
        return jsonify({"status": "ok", "model_loaded": True, "classes": list(service.classes)})
    except ModelUnavailable:
        return jsonify({"status": "unavailable", "model_loaded": False, "classes": []}), 503


if __name__ == "__main__":
    print("Open: http://localhost:5000")
    app.run(debug=False, port=5000)
