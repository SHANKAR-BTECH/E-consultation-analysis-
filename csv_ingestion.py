"""Bounded UTF-8 CSV parsing and explicit column mapping; no ML logic."""
import csv
import io
import json

from analysis_service import AnalysisError
from config import MAX_CSV_BYTES, MAX_CSV_COLUMNS, MAX_BATCH_RESPONSES

ALIASES = {
    "text_column": {"feedback", "comment", "review", "response", "text"},
    "date_column": {"date", "timestamp", "submitted_at"},
    "category_column": {"category", "department", "service", "type"},
}


def parse_csv(stream):
    payload = stream.read(MAX_CSV_BYTES + 1)
    if len(payload) > MAX_CSV_BYTES:
        raise AnalysisError(f"CSV exceeds {MAX_CSV_BYTES} bytes.")
    try:
        content = payload.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise AnalysisError("CSV must be UTF-8 encoded (an optional BOM is supported).") from exc
    if not content.strip() or "\x00" in content:
        raise AnalysisError("CSV is empty or contains invalid null bytes.")
    try:
        reader = csv.reader(io.StringIO(content, newline=""), strict=True)
        columns = [name.strip() for name in next(reader)]
        if (not columns or len(columns) > MAX_CSV_COLUMNS or any(not name for name in columns)
                or len({name.casefold() for name in columns}) != len(columns)):
            raise AnalysisError(f"CSV requires unique, non-empty column names (at most {MAX_CSV_COLUMNS}).")
        rows = []
        for row in reader:
            if len(rows) >= MAX_BATCH_RESPONSES:
                raise AnalysisError(f"CSV exceeds {MAX_BATCH_RESPONSES} data records.")
            if not row:
                row = [""] * len(columns)
            if len(row) != len(columns):
                raise AnalysisError(f"CSV record {len(rows) + 1} has {len(row)} fields; expected {len(columns)}.")
            rows.append(dict(zip(columns, row)))
        if not rows:
            raise AnalysisError("CSV contains a header but no response records.")
    except (csv.Error, StopIteration) as exc:
        raise AnalysisError("Malformed CSV. Use a comma-delimited file with a header and correctly quoted fields.") from exc
    return columns, rows


def inspect_columns(columns, rows):
    candidates = {role: [name for name in columns if name.casefold() in aliases]
                  for role, aliases in ALIASES.items()}
    suggested = {role: values[0] if len(values) == 1 else None for role, values in candidates.items()}
    return {"columns": columns, "row_count": len(rows), "suggested_mapping": suggested,
            "candidates": candidates, "requires_selection": suggested["text_column"] is None}


def map_csv(columns, rows, options):
    inspection = inspect_columns(columns, rows)
    selected = {}
    for role in (*ALIASES, "id_column", "source_column"):
        # Omitted optional fields may be detected; explicitly empty disables them.
        name = options.get(role, inspection["suggested_mapping"].get(role))
        if name and name not in columns:
            raise AnalysisError(f"Selected {role} is not a CSV column.", inspection)
        selected[role] = name or None
    if not selected["text_column"]:
        raise AnalysisError("Select the CSV feedback column using text_column.", inspection)
    role_columns = [name for name in selected.values() if name]
    if len(role_columns) != len(set(role_columns)):
        raise AnalysisError("Select a different column for each mapped field.")
    try:
        metadata_columns = json.loads(options.get("metadata_columns", "[]"))
    except (ValueError, TypeError, RecursionError) as exc:
        raise AnalysisError("metadata_columns must be a JSON array of column names.") from exc
    if (not isinstance(metadata_columns, list) or any(not isinstance(name, str) or name not in columns for name in metadata_columns)
            or len(metadata_columns) != len(set(metadata_columns))):
        raise AnalysisError("metadata_columns must contain unique existing CSV column names.")
    normalized = []
    for row in rows:
        entry = {"text": row[selected["text_column"]]}
        for role in ("id", "date", "category", "source"):
            column = selected[role + "_column"]
            if column and row[column].strip():
                entry[role] = row[column]
        if metadata_columns:
            entry["metadata"] = {name: row[name] for name in metadata_columns}
        normalized.append(entry)
    return normalized
