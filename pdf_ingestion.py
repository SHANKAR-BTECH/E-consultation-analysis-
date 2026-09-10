"""Bounded PDF parsing into response lines via pypdf; no ML logic."""
import io

from analysis_service import AnalysisError
from config import MAX_PDF_BYTES, MAX_BATCH_RESPONSES


def parse_pdf(stream):
    """Extract non-empty text lines from a PDF; returns (page_count, lines).

    Layout artifacts such as repeated page signatures are real extracted text
    and are passed through unchanged; nothing is inferred or fabricated.
    """
    payload = stream.read(MAX_PDF_BYTES + 1)
    if len(payload) > MAX_PDF_BYTES:
        raise AnalysisError(f"PDF file exceeds {MAX_PDF_BYTES} bytes.")
    try:
        from pypdf import PdfReader
    except ImportError:
        raise AnalysisError("PDF support requires the pypdf package.")
    try:
        reader = PdfReader(io.BytesIO(payload), strict=False)
    except Exception as exc:
        raise AnalysisError("Could not read the PDF. Ensure it is a valid .pdf file.") from exc
    lines = []
    for page in reader.pages:
        try:
            text = str(page.extract_text() or "")
        except Exception:
            text = ""
        for line in text.splitlines():
            candidate = line.strip()
            if not candidate:
                continue
            if len(lines) >= MAX_BATCH_RESPONSES:
                raise AnalysisError(f"PDF exceeds {MAX_BATCH_RESPONSES} extractable responses.")
            lines.append(candidate)
    if not lines:
        raise AnalysisError("The PDF contains no extractable text.")
    return len(reader.pages), lines


def inspect_pdf(page_count, lines):
    """Document-level inspection; never loads the model or analyzes rows."""
    return {"page_count": page_count, "row_count": len(lines), "preview": lines[:5]}


def map_pdf(lines, filename=None, domain=None):
    """Map extracted lines to response records; retains source provenance."""
    mapped = []
    for idx, line in enumerate(lines, 1):
        record = {"text": line}
        if filename:
            record["source_file"] = filename
            record["source_index"] = idx
        if domain:
            record["domain"] = domain
        mapped.append(record)
    return mapped