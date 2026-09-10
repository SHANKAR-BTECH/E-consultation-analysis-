import React, { useState } from 'react';
import { number } from '../lib/utils.js';

export default function PdfUpload({
  file,
  inspection,
  onFileSelected,
  onRemoveFile,
  onSubmit,
  busy
}) {
  const [dragover, setDragover] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!busy) setDragover(true);
  };

  const handleDragLeave = () => {
    setDragover(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    if (busy) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  return (
    <div id="pane-pdf" role="tabpanel" aria-labelledby="tab-pdf">
      {!file && (
        <div
          className={`upload-area ${dragover ? 'dragover' : ''}`}
          id="pdf-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-symbol" aria-hidden="true">↑</span>
          <h2>Upload a PDF document.</h2>
          <p>Choose a .pdf file; extracted text lines become the responses analyzed.</p>
          <label className="button secondary upload-label">
            Choose PDF file
            <input
              type="file"
              id="pdf-file"
              accept=".pdf,application/pdf"
              aria-label="Choose PDF file"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onFileSelected(e.target.files[0]);
                }
              }}
              disabled={busy}
            />
          </label>
          <p className="small muted">
            Or drop a file here. .pdf format · <span id="pdf-limit">10 MB</span> maximum
          </p>
        </div>
      )}

      {file && (
        <div id="pdf-selected">
          <div className="file-summary">
            <div>
              <strong id="pdf-file-name">{file.name}</strong>
              <p id="pdf-file-description" className="small muted">
                {inspection
                  ? `${number(inspection.row_count)} responses extracted · ${number(inspection.page_count)} pages · ${(file.size / 1024).toFixed(1)} KB`
                  : 'Extracting text…'}
              </p>
            </div>
            <button
              type="button"
              id="remove-pdf-file"
              className="button text-button"
              onClick={onRemoveFile}
              disabled={busy}
            >
              Remove file
            </button>
          </div>

          {inspection && (
            <div id="pdf-summary">
              <p className="mapping-heading">
                Text extracted <span className="small muted">Layout text is read as-is, exactly as it appears in the document.</span>
              </p>
              <ol className="pdf-preview" id="pdf-preview">
                {inspection.preview.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ol>
              <div className="csv-action">
                <button
                  type="button"
                  id="analyze-pdf"
                  className="button primary"
                  onClick={onSubmit}
                  disabled={busy}
                >
                  Analyze consultation <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}