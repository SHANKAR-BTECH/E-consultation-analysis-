"""Input normalization and the one consultation analysis orchestration service."""
from datetime import date, datetime
import json
import math

from config import MAX_BATCH_RESPONSES, MAX_BATCH_CHARACTERS, MAX_METADATA_CHARACTERS
from model_service import get_service
from text_insights import build_insights


class AnalysisError(ValueError):
    def __init__(self, message, details=None):
        super().__init__(message)
        self.details = details or {}


def normalize_date(value):
    """ISO dates/timestamps, year-first slash dates, explicit day-first formats.

    Timestamps retain the calendar date written in the source (no UTC shifting).
    """
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        pass
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        pass
    for fmt in ("%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def normalize_response(row, index):
    if not isinstance(row, dict):
        raise ValueError("Each response must be a JSON object.")
    if "text" not in row:
        raise ValueError("Each response requires a text field.")
    if not isinstance(row["text"], str):
        raise ValueError("Response text must be a string.")
    identity = row.get("id", index)
    if isinstance(identity, bool) or not isinstance(identity, (str, int)) or len(str(identity)) > 256:
        raise ValueError("Response id must be a string or integer of at most 256 characters.")
    result = {"row_index": index, "id": identity, "text": row["text"]}
    for field in ("date", "category", "source"):
        value = row.get(field)
        if value is not None and (not isinstance(value, str) or len(value) > 256):
            raise ValueError(f"{field} must be null or a string of at most 256 characters.")
        result[field] = (value.strip() or None) if value is not None else None
    metadata = row.get("metadata")
    if metadata is not None:
        if not isinstance(metadata, dict) or any(
            not isinstance(k, str) or not isinstance(v, (str, int, float, bool, type(None)))
            or (isinstance(v, float) and not math.isfinite(v)) for k, v in metadata.items()
        ):
            raise ValueError("metadata must be a flat JSON object with finite scalar values.")
        if len(json.dumps(metadata, ensure_ascii=False)) > MAX_METADATA_CHARACTERS:
            raise ValueError(f"metadata exceeds {MAX_METADATA_CHARACTERS} characters.")
    result["metadata"] = metadata
    result["date_input"] = result["date"]
    result["date"] = normalize_date(result["date"])
    return result


def analyze_text(text, **metadata):
    return analyze_batch([{**metadata, "text": text}])


def analyze_batch(responses):
    if not isinstance(responses, list) or not responses:
        raise AnalysisError("responses must be a non-empty array of response objects.")
    if len(responses) > MAX_BATCH_RESPONSES:
        raise AnalysisError(f"At most {MAX_BATCH_RESPONSES} responses may be analyzed per request.")
    characters = sum(len(row.get("text", "")) for row in responses
                     if isinstance(row, dict) and isinstance(row.get("text"), str))
    if characters > MAX_BATCH_CHARACTERS:
        raise AnalysisError(f"Combined response text exceeds {MAX_BATCH_CHARACTERS} characters.")
    normalized, rejected = [], []
    for index, row in enumerate(responses, 1):
        try:
            normalized.append(normalize_response(row, index))
        except ValueError as exc:
            rejected.append({"row_index": index, "message": str(exc)})
    service = get_service()
    predictions = service.predict_batch([row["text"] for row in normalized])
    valid, warnings = [], []
    for row, prediction in zip(normalized, predictions):
        if "message" in prediction:
            rejected.append({"row_index": row["row_index"], "message": prediction["message"]})
            continue
        # Original text is preserved verbatim for traceable quotations.
        row.update(prediction)
        row["sentiment"] = row["sentiment"].lower()
        valid.append(row)
        if row["date_input"] and not row["date"]:
            warnings.append({"row_index": row["row_index"], "message": "Date could not be parsed; response excluded from trends only."})
    rejected.sort(key=lambda row: row["row_index"])
    if not valid:
        raise AnalysisError("No valid responses could be analyzed.", {"total_received": len(responses), "rejected": rejected})
    return {
        "schema_version": "2.0",
        "total_received": len(responses), "total_responses": len(valid),
        "rejected_count": len(rejected), "rejected": rejected, "warnings": warnings,
        "responses": valid,
        **build_insights(valid, service.classes),
    }
