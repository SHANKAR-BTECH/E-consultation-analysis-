import React, { useState } from 'react';
import { number } from '../lib/utils.js';

export default function CsvPane({
  file,
  inspection,
  mapping,
  metadataColumns,
  onFileSelected,
  onRemoveFile,
  onUpdateMapping,
  onToggleMetadataColumn,
  onSubmit,
  busy
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!busy) setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className="canvas-pane active"
      id="pane-csv"
      role="tabpanel"
      aria-labelledby="tab-csv"
    >
      <div className="csv-workspace-body">
        {!file && (
          <div
            className={`drop-zone-box ${dragOver ? 'dragover' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="drop-icon">⊞</div>
            <h3 className="drop-title">Upload Consultation Dataset</h3>
            <p className="drop-subtitle">
              Drag and drop your UTF-8 encoded <code>.csv</code> spreadsheet here, or select a file to inspect.
            </p>
            <label className="btn-browse-file">
              <span>Choose CSV File</span>
              <input
                type="file"
                id="csv-file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    onFileSelected(e.target.files[0]);
                  }
                }}
                disabled={busy}
              />
            </label>
            <span className="drop-specs">Maximum 1.0 MB · UTF-8 comma separated</span>
          </div>
        )}

        {file && (
          <div className="csv-configured-panel">
            <div className="csv-file-card">
              <div className="file-info-group">
                <span className="file-pill">CSV</span>
                <div>
                  <h4 className="file-name">{file.name}</h4>
                  <p className="file-sub">
                    {inspection
                      ? `${number(inspection.row_count)} records detected · ${(file.size / 1024).toFixed(1)} KB`
                      : 'Inspecting CSV columns…'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-micro danger"
                onClick={onRemoveFile}
                disabled={busy}
              >
                Remove File
              </button>
            </div>

            {inspection && (
              <div className="mapping-section">
                <div className="mapping-intro">
                  <h4 className="mapping-title">Schema & Column Alignment</h4>
                  <p className="mapping-helper">
                    Assign which CSV column contains feedback text. Date and Category columns unlock temporal and departmental analytics.
                  </p>
                </div>

                <div className="mapping-grid">
                  <div className="map-field required">
                    <label htmlFor="map-text">
                      <span>Response Text Column</span>
                      <span className="req-star">*</span>
                    </label>
                    <select
                      id="map-text"
                      value={mapping.text_column}
                      onChange={(e) => onUpdateMapping('text_column', e.target.value)}
                      disabled={busy}
                      required
                    >
                      <option value="">-- Select response column --</option>
                      {inspection.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="map-field">
                    <label htmlFor="map-date">Submission Date Column (Optional)</label>
                    <select
                      id="map-date"
                      value={mapping.date_column}
                      onChange={(e) => onUpdateMapping('date_column', e.target.value)}
                      disabled={busy}
                    >
                      <option value="">-- Do not use --</option>
                      {inspection.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="map-field">
                    <label htmlFor="map-category">Category / Dept Column (Optional)</label>
                    <select
                      id="map-category"
                      value={mapping.category_column}
                      onChange={(e) => onUpdateMapping('category_column', e.target.value)}
                      disabled={busy}
                    >
                      <option value="">-- Do not use --</option>
                      {inspection.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="map-field">
                    <label htmlFor="map-id">Response ID Column (Optional)</label>
                    <select
                      id="map-id"
                      value={mapping.id_column}
                      onChange={(e) => onUpdateMapping('id_column', e.target.value)}
                      disabled={busy}
                    >
                      <option value="">-- Use Row Index --</option>
                      {inspection.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="map-field">
                    <label htmlFor="map-source">Channel / Source Column (Optional)</label>
                    <select
                      id="map-source"
                      value={mapping.source_column}
                      onChange={(e) => onUpdateMapping('source_column', e.target.value)}
                      disabled={busy}
                    >
                      <option value="">-- Do not use --</option>
                      {inspection.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <details className="meta-columns-accordion">
                  <summary>Additional Metadata Columns ({metadataColumns.length} selected)</summary>
                  <div className="meta-checkbox-list">
                    {inspection.columns.map((col) => (
                      <label key={col} className="meta-check-item">
                        <input
                          type="checkbox"
                          checked={metadataColumns.includes(col)}
                          onChange={() => onToggleMetadataColumn(col)}
                          disabled={busy}
                        />
                        <span>{col}</span>
                      </label>
                    ))}
                  </div>
                </details>

                <div className="csv-dock-action">
                  <button
                    type="button"
                    id="analyze-csv"
                    className="btn-primary-action"
                    onClick={onSubmit}
                    disabled={busy || !mapping.text_column}
                  >
                    <span>Analyze CSV Dataset</span>
                    <span className="action-arrow" aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
