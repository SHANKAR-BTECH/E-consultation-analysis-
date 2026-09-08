import React, { useState } from 'react';
import { number } from '../lib/utils.js';

export default function CsvUpload({
  file,
  inspection,
  mapping,
  metadataColumns,
  onFileSelected,
  onRemoveFile,
  onMappingChange,
  onToggleMetadata,
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
    <div id="pane-csv" role="tabpanel" aria-labelledby="tab-csv">
      {!file && (
        <div
          className={`upload-area ${dragover ? 'dragover' : ''}`}
          id="drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-symbol" aria-hidden="true">↑</span>
          <h2>Bring your responses together.</h2>
          <p>Choose a CSV, then tell us which columns to use.</p>
          <label className="button secondary upload-label">
            Choose CSV file
            <input
              type="file"
              id="csv-file"
              accept=".csv,text/csv"
              aria-label="Choose CSV file"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onFileSelected(e.target.files[0]);
                }
              }}
              disabled={busy}
            />
          </label>
          <p className="small muted">
            Or drop a file here. UTF-8 CSV · <span id="csv-limit">1 MB</span> maximum
          </p>
        </div>
      )}

      {file && (
        <div id="csv-selected">
          <div className="file-summary">
            <div>
              <strong id="file-name">{file.name}</strong>
              <p id="file-description" className="small muted">
                {inspection
                  ? `${number(inspection.row_count)} records detected · ${(file.size / 1024).toFixed(1)} KB`
                  : 'Inspecting columns…'}
              </p>
            </div>
            <button
              type="button"
              id="remove-file"
              className="button text-button"
              onClick={onRemoveFile}
              disabled={busy}
            >
              Remove file
            </button>
          </div>

          {inspection && (
            <div id="csv-mapping">
              <p className="mapping-heading">
                Match your columns <span className="small muted">Only the response column is required.</span>
              </p>
              <div className="mapping-grid">
                <label>
                  Response text <span aria-hidden="true">*</span>
                  <select
                    id="map-text"
                    required
                    value={mapping.text_column}
                    onChange={(e) => onMappingChange('text_column', e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Select a response column</option>
                    {inspection.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Date
                  <select
                    id="map-date"
                    value={mapping.date_column}
                    onChange={(e) => onMappingChange('date_column', e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Do not use</option>
                    {inspection.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Category / department
                  <select
                    id="map-category"
                    value={mapping.category_column}
                    onChange={(e) => onMappingChange('category_column', e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Do not use</option>
                    {inspection.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Response ID
                  <select
                    id="map-id"
                    value={mapping.id_column}
                    onChange={(e) => onMappingChange('id_column', e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Use row number</option>
                    {inspection.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Source
                  <select
                    id="map-source"
                    value={mapping.source_column}
                    onChange={(e) => onMappingChange('source_column', e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Do not use</option>
                    {inspection.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="small muted">
                Optional columns can be left unused. Day-first dates such as 03/04/2026 mean 3 April.
              </p>

              <details className="metadata-options">
                <summary>Additional metadata columns</summary>
                <div id="metadata-columns">
                  {inspection.columns.map((column) => (
                    <label key={column}>
                      <input
                        type="checkbox"
                        value={column}
                        checked={metadataColumns.includes(column)}
                        onChange={() => onToggleMetadata(column)}
                        disabled={busy}
                      />
                      {column}
                    </label>
                  ))}
                </div>
              </details>

              <div className="csv-action">
                <button
                  type="button"
                  id="analyze-csv"
                  className="button primary"
                  onClick={onSubmit}
                  disabled={busy || !mapping.text_column}
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
