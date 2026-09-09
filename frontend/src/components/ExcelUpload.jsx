import React, { useState } from 'react';
import { number } from '../lib/utils.js';

export default function ExcelUpload({
  file,
  inspection,
  sheets,
  sheet,
  mapping,
  metadataColumns,
  onFileSelected,
  onSheetChange,
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
    <div id="pane-excel" role="tabpanel" aria-labelledby="tab-excel">
      {!file && (
        <div
          className={`upload-area ${dragover ? 'dragover' : ''}`}
          id="excel-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-symbol" aria-hidden="true">↑</span>
          <h2>Upload an Excel workbook.</h2>
          <p>Choose a .xlsx file, then select the sheet and feedback column.</p>
          <label className="button secondary upload-label">
            Choose Excel file
            <input
              type="file"
              id="excel-file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Choose Excel file"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onFileSelected(e.target.files[0]);
                }
              }}
              disabled={busy}
            />
          </label>
          <p className="small muted">
            Or drop a file here. .xlsx format · <span id="excel-limit">10 MB</span> maximum
          </p>
        </div>
      )}

      {file && (
        <div id="excel-selected">
          <div className="file-summary">
            <div>
              <strong id="excel-file-name">{file.name}</strong>
              <p id="excel-file-description" className="small muted">
                {inspection
                  ? `${number(inspection.row_count)} records detected · ${(file.size / 1024).toFixed(1)} KB`
                  : 'Inspecting workbook…'}
              </p>
            </div>
            <button
              type="button"
              id="remove-excel-file"
              className="button text-button"
              onClick={onRemoveFile}
              disabled={busy}
            >
              Remove file
            </button>
          </div>

          {sheets.length > 1 && (
            <div id="excel-sheet-select">
              <p className="mapping-heading">
                Select sheet <span className="small muted">The workbook contains multiple worksheets.</span>
              </p>
              <label>
                Sheet
                <select
                  id="excel-sheet"
                  value={sheet}
                  onChange={(e) => onSheetChange(e.target.value)}
                  disabled={busy}
                >
                  {sheets.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {inspection && (
            <div id="excel-mapping">
              <p className="mapping-heading">
                Match your columns <span className="small muted">Only the response column is required.</span>
              </p>
              <div className="mapping-grid">
                <label>
                  Response text <span aria-hidden="true">*</span>
                  <select
                    id="excel-map-text"
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
                    id="excel-map-date"
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
                    id="excel-map-category"
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
                    id="excel-map-id"
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
                    id="excel-map-source"
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
                <div id="excel-metadata-columns">
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
                  id="analyze-excel"
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