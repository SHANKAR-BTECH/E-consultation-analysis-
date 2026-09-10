"""Minimal valid PDF generator using only the standard library.

Builds a compact PDF whose pages contain Helvetica text lines so pypdf can
extract them. Used only by tests; no third-party PDF writer is required.
"""


def _escape(text):
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(pages):
    """Return bytes of a valid PDF. `pages` is a list of list-of-line strings."""
    objects = {}
    objects[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objects[2] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (
        b" ".join(b"%d 0 R" % (4 + 2 * i) for i in range(len(pages))),
        len(pages),
    )
    objects[3] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    for page_index, lines in enumerate(pages):
        page_id = 4 + 2 * page_index
        content_id = page_id + 1
        stream = b"BT /F1 14 Tf 64 760 Td\n"
        first = True
        for line in lines:
            if first:
                first = False
            else:
                stream += b"0 -18 Td\n"
            stream += b"(%s) Tj\n" % _escape(line).encode("utf-8", "replace")
        stream += b"ET"
        objects[content_id] = (
            b"<< /Length %d >>\n" % len(stream) + b"stream\n" + stream + b"\nendstream"
        )
        resources = b"<< /Font << /F1 3 0 R >> >>"
        objects[page_id] = (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources %s /Contents %d 0 R >>" % (resources, content_id)
        )

    buffer = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for number in range(1, max(objects) + 1):
        offsets[number] = len(buffer)
        buffer += b"%d 0 obj\n" % number
        buffer += objects[number]
        buffer += b"\nendobj\n"

    xref_offset = len(buffer)
    buffer += b"xref\n0 %d\n0000000000 65535 f \n" % (max(objects) + 1)
    for number in range(1, max(objects) + 1):
        buffer += b"%010d 00000 n \n" % offsets[number]
    buffer += b"trailer << /Size %d /Root 1 0 R >>\n" % (max(objects) + 1)
    buffer += b"startxref\n%d\n%%%%EOF\n" % xref_offset
    return bytes(buffer)


def pdf_bytes(lines):
    """One-page convenience: a single page carrying `lines`."""
    return make_pdf([lines])