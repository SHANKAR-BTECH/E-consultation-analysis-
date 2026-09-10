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
from persistence.flask_service import (model_manifest, persist_analysis,
                                        persist_multi_file_consultation, PersistenceFailure)
from persistence.history_routes import history_api

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_ANALYSIS_REQUEST_BYTES
# This local application is edited between runs. Never retain an obsolete
# compiled page while Flask serves updated CSS/JS from disk.
app.config["TEMPLATES_AUTO_RELOAD"] = True
init_app(app)
app.register_blueprint(history_api)


@app.before_request
def handle_cors_preflight():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        origin = request.headers.get("Origin")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Cache-Control, Pragma"
        return response


@app.after_request
def revalidate_frontend(response):
    origin = request.headers.get("Origin")
    if origin and ("127.0.0.1" in origin or "localhost" in origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Cache-Control, Pragma"

    if request.endpoint == "index":
        response.headers["Cache-Control"] = "no-store"
    elif request.endpoint == "static":
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.before_request
def apply_request_limit():
    # Flask 3.1 supports per-request limits; retain the Phase 1 /predict ceiling.
    is_large = request.path in (
        "/analyze", "/analyze-file",
        "/api/analyze", "/api/analyze-file"
    )
    request.max_content_length = MAX_ANALYSIS_REQUEST_BYTES if is_large else MAX_REQUEST_BYTES


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


def run_analysis(responses, domain=None, **provenance):
    try:
        result = analyze_batch(responses, domain=domain)
        database = app.extensions.get('consultation_database')
        if database is not None:
            try:
                manifest = model_manifest(get_service())
                persist_analysis(database, responses, result, manifest, domain=domain, **provenance)
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
    domain = data.get("domain") or None
    return run_analysis(data["responses"], domain=domain, source_type='json',
                        raw_bytes=request.get_data(), source_metadata={'endpoint': '/analyze'})


@app.route("/analyze-file", methods=["POST"])
def analyze_file():
    try:
        if request.mimetype != "multipart/form-data":
            raise AnalysisError("Submit a file as multipart/form-data with a file field.")

        domain = request.form.get("domain", "").strip() or None
        files_field = request.files.getlist("files")
        file_field = request.files.getlist("file")

        # Backward compatibility: reject multiple files in 'file' if no 'files' field and no domain specified
        if len(file_field) > 1 and not files_field and not domain:
            raise AnalysisError("Submit exactly one file in the file field.")

        uploads = files_field or file_field
        if not uploads:
            raise AnalysisError("Submit one or more files in the file or files field.")

        for upload in uploads:
            if not upload.filename:
                raise AnalysisError("Uploaded file must have a filename.")

        is_pdf_list = [u.filename.lower().endswith(".pdf") for u in uploads]
        is_xlsx_list = [u.filename.lower().endswith(".xlsx") for u in uploads]

        if any(not p and not x for p, x in zip(is_pdf_list, is_xlsx_list)):
            raise AnalysisError("Uploaded file must have a .pdf or .xlsx filename.")

        all_pdf = all(is_pdf_list)
        all_xlsx = all(is_xlsx_list)

        if not all_pdf and not all_xlsx:
            raise AnalysisError("All files in a consultation must have the same format (.pdf or .xlsx). PDF and Excel cannot be mixed.")

        mode = request.form.get("mode", "analyze")
        if mode not in ("inspect", "analyze"):
            raise AnalysisError("mode must be inspect or analyze.")

        analysis_mode = request.form.get("analysis_mode", "together")
        if analysis_mode not in ("together", "separate"):
            raise AnalysisError("analysis_mode must be together or separate.")

        is_multi = len(uploads) > 1 or bool(files_field) or (bool(domain) and domain != "General")

        # --- LEGACY SINGLE FILE FAST PATH ---
        if not is_multi and len(uploads) == 1:
            upload = uploads[0]
            if all_xlsx:
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

        # --- MULTI-FILE SINGLE-DOMAIN CONSULTATION PATH ---
        effective_domain = domain or "General"

        if all_pdf:
            inspected_list = []
            file_deliveries = []
            for upload in uploads:
                raw_bytes = upload.stream.read(MAX_PDF_BYTES + 1)
                try:
                    page_count, lines = parse_pdf(io.BytesIO(raw_bytes))
                except AnalysisError as exc:
                    raise AnalysisError(f"Error in {upload.filename}: {str(exc)}") if len(uploads) > 1 else exc
                inspected_list.append((upload, raw_bytes, page_count, lines))

                mapped = map_pdf(lines, filename=upload.filename, domain=effective_domain)
                file_deliveries.append({
                    'filename': upload.filename,
                    'records': mapped,
                    'raw_bytes': raw_bytes,
                    'source_metadata': {
                        'endpoint': '/analyze-file',
                        'file_type': 'pdf',
                        'page_count': page_count,
                        'extracted_responses': len(lines)
                    }
                })

            if mode == "inspect":
                files_info = [{
                    "filename": u.filename, "size": len(raw),
                    "row_count": len(l), "page_count": pc, "preview": l[:5]
                } for u, raw, pc, l in inspected_list]
                all_lines = []
                for _, _, _, l in inspected_list:
                    all_lines.extend(l)
                from domain_validation import evaluate_domain_relevance
                relevance = evaluate_domain_relevance(all_lines, effective_domain)
                if len(uploads) == 1:
                    single = inspect_pdf(inspected_list[0][2], inspected_list[0][3])
                    single["domain"] = effective_domain
                    single["domain_relevance"] = relevance
                    return jsonify(single)
                return jsonify({
                    "domain": effective_domain,
                    "domain_relevance": relevance,
                    "input_format": "pdf",
                    "files": files_info,
                    "total_responses": sum(f["row_count"] for f in files_info)
                })

            try:
                if analysis_mode == "together":
                    combined_records = []
                    for d in file_deliveries:
                        combined_records.extend(d['records'])

                    result = analyze_batch(combined_records, domain=effective_domain)
                    result["domain"] = effective_domain
                    result["analysis_mode"] = "together"
                    result["files"] = [d['filename'] for d in file_deliveries]

                    database = app.extensions.get('consultation_database')
                    if database is not None:
                        try:
                            manifest = model_manifest(get_service())
                            persist_multi_file_consultation(
                                database, file_deliveries, combined_records, result, manifest,
                                domain=effective_domain, input_format="pdf", analysis_mode="together"
                            )
                        except PersistenceFailure:
                            raise
                        except Exception:
                            raise PersistenceFailure('Analysis could not be saved. Check the database and retry.') from None
                    return jsonify(result)
                else:
                    file_results = {}
                    for d in file_deliveries:
                        f_res = analyze_batch(d['records'], domain=effective_domain)
                        f_res["domain"] = effective_domain
                        f_res["filename"] = d['filename']
                        file_results[d['filename']] = f_res

                    database = app.extensions.get('consultation_database')
                    if database is not None:
                        try:
                            manifest = model_manifest(get_service())
                            persist_multi_file_consultation(
                                database, file_deliveries, [], file_results, manifest,
                                domain=effective_domain, input_format="pdf", analysis_mode="separate"
                            )
                        except PersistenceFailure:
                            raise
                        except Exception:
                            raise PersistenceFailure('Analysis could not be saved. Check the database and retry.') from None

                    first_res = file_results[file_deliveries[0]['filename']] if file_deliveries else {}
                    return jsonify({
                        "domain": effective_domain,
                        "analysis_mode": "separate",
                        "files": [d['filename'] for d in file_deliveries],
                        "results": file_results,
                        **first_res
                    })
            except ModelUnavailable as exc:
                return error(str(exc), 503)

        else:
            # Excel files
            inspected_list = []
            file_deliveries = []
            for upload in uploads:
                raw_bytes = upload.stream.read(MAX_EXCEL_BYTES + 1)
                sheet = request.form.get(f"sheet_{upload.filename}", request.form.get("sheet", ""))
                try:
                    sheets, columns, rows = parse_excel(io.BytesIO(raw_bytes), sheet)
                except AnalysisError as exc:
                    raise AnalysisError(f"Error in {upload.filename}: {str(exc)}") if len(uploads) > 1 else exc

                insp = inspect_excel_columns(sheets, columns, rows, include_preview=True)
                inspected_list.append((upload, raw_bytes, sheets, columns, rows, insp, sheet))

                file_options = dict(request.form)
                for key in ('text_column', 'date_column', 'category_column', 'id_column', 'source_column'):
                    file_specific = request.form.get(f"{key}_{upload.filename}")
                    if file_specific:
                        file_options[key] = file_specific

                if mode == "analyze":
                    mapped = map_excel(columns, rows, file_options, filename=upload.filename, domain=effective_domain)
                    file_deliveries.append({
                        'filename': upload.filename,
                        'records': mapped,
                        'raw_bytes': raw_bytes,
                        'mapping': {k: file_options[k] for k in ('text_column', 'date_column', 'category_column', 'id_column', 'source_column', 'metadata_columns') if k in file_options},
                        'source_metadata': {
                            'endpoint': '/analyze-file',
                            'headers': columns,
                            'file_type': 'xlsx',
                            'sheet': sheet or sheets[0]
                        }
                    })

            if mode == "inspect":
                files_info = [{
                    "filename": u.filename, "size": len(raw),
                    "row_count": len(rows), "sheets": sheets, "columns": cols,
                    "suggested_mapping": insp["suggested_mapping"]
                } for u, raw, sheets, cols, rows, insp, sh in inspected_list]
                from domain_validation import evaluate_domain_relevance
                sample_texts = []
                for _, _, _, cols, rows, insp, _ in inspected_list:
                    text_col = insp.get("suggested_mapping", {}).get("text_column")
                    if text_col:
                        sample_texts.extend(str(r.get(text_col, "")).strip() for r in rows if r.get(text_col))
                    elif insp.get("preview"):
                        sample_texts.extend(insp["preview"])
                relevance = evaluate_domain_relevance(sample_texts, effective_domain)
                if len(uploads) == 1:
                    single = dict(inspected_list[0][5])
                    single["domain"] = effective_domain
                    single["domain_relevance"] = relevance
                    return jsonify(single)
                return jsonify({
                    "domain": effective_domain,
                    "domain_relevance": relevance,
                    "input_format": "excel",
                    "files": files_info,
                    "total_responses": sum(f["row_count"] for f in files_info)
                })

            try:
                if analysis_mode == "together":
                    combined_records = []
                    for d in file_deliveries:
                        combined_records.extend(d['records'])

                    result = analyze_batch(combined_records, domain=effective_domain)
                    result["domain"] = effective_domain
                    result["analysis_mode"] = "together"
                    result["files"] = [d['filename'] for d in file_deliveries]

                    database = app.extensions.get('consultation_database')
                    if database is not None:
                        try:
                            manifest = model_manifest(get_service())
                            persist_multi_file_consultation(
                                database, file_deliveries, combined_records, result, manifest,
                                domain=effective_domain, input_format="excel", analysis_mode="together"
                            )
                        except PersistenceFailure:
                            raise
                        except Exception:
                            raise PersistenceFailure('Analysis could not be saved. Check the database and retry.') from None
                    return jsonify(result)
                else:
                    file_results = {}
                    for d in file_deliveries:
                        f_res = analyze_batch(d['records'], domain=effective_domain)
                        f_res["domain"] = effective_domain
                        f_res["filename"] = d['filename']
                        file_results[d['filename']] = f_res

                    database = app.extensions.get('consultation_database')
                    if database is not None:
                        try:
                            manifest = model_manifest(get_service())
                            persist_multi_file_consultation(
                                database, file_deliveries, [], file_results, manifest,
                                domain=effective_domain, input_format="excel", analysis_mode="separate"
                            )
                        except PersistenceFailure:
                            raise
                        except Exception:
                            raise PersistenceFailure('Analysis could not be saved. Check the database and retry.') from None

                    first_res = file_results[file_deliveries[0]['filename']] if file_deliveries else {}
                    return jsonify({
                        "domain": effective_domain,
                        "analysis_mode": "separate",
                        "files": [d['filename'] for d in file_deliveries],
                        "results": file_results,
                        **first_res
                    })
            except ModelUnavailable as exc:
                return error(str(exc), 503)

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


# Support /api/* route aliases for Vercel Serverless Function & same-origin frontend routing
app.add_url_rule("/api/health", endpoint="api_health", view_func=health, methods=["GET"])
app.add_url_rule("/api/predict", endpoint="api_predict", view_func=predict, methods=["POST"])
app.add_url_rule("/api/analyze", endpoint="api_analyze", view_func=analyze, methods=["POST"])
app.add_url_rule("/api/analyze-file", endpoint="api_analyze_file", view_func=analyze_file, methods=["POST"])
app.register_blueprint(history_api, url_prefix="/api/consultations", name="api_history")


if __name__ == "__main__":
    print("Open: http://localhost:5000")
    app.run(debug=False, port=5000)
