import React, { useState, useRef } from 'react';
import { number } from '../lib/utils.js';
import { validateSelectedFeedbackColumn } from '../lib/excelValidation.js';

export default function ExcelUpload({
  files = [],
  file = null, // legacy single-file fallback
  inspection = null,
  sheets = [],
  sheet = '',
  mapping = { text_column: '' },
  metadataColumns = [],
  domain = 'Transport',
  analysisMode = 'together',
  domainRelevance = null,
  onSwitchDomain,
  onSetAnalysisMode,
  onFilesSelected,
  onFileSelected, // legacy fallback
  onSheetChange,
  onRemoveFile,
  onMappingChange,
  onToggleMetadata,
  onSubmit,
  busy
}) {
  const [dragover, setDragover] = useState(false);
  const additionalInputRef = useRef(null);

  // Normalize files array: if `files` prop is empty but legacy props exist, construct list
  const activeFiles = files.length > 0
    ? files
    : (file ? [{
        file,
        inspection,
        sheets: sheets.length > 0 ? sheets : (inspection?.sheets || []),
        sheet,
        mapping,
        metadataColumns
      }] : []);

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
      const dropped = Array.from(e.dataTransfer.files);
      if (onFilesSelected) {
        onFilesSelected(dropped);
      } else if (onFileSelected) {
        onFileSelected(dropped[0]);
      }
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      if (onFilesSelected) {
        onFilesSelected(selected);
      } else if (onFileSelected) {
        onFileSelected(selected[0]);
      }
    }
  };

  // Check validation for each workbook
  const evaluatedFiles = activeFiles.map((item, idx) => {
    const insp = item.inspection;
    const currentMapping = item.mapping || (idx === 0 ? mapping : { text_column: '' });
    const validation = validateSelectedFeedbackColumn(currentMapping.text_column, insp);
    const isConfigured = Boolean(validation.isValid && !busy);
    return {
      ...item,
      mapping: currentMapping,
      validation,
      isConfigured
    };
  });

  const totalResponses = evaluatedFiles.reduce((sum, item) => {
    return sum + (item.isConfigured ? (item.inspection?.row_count || 0) : 0);
  }, 0);

  const allConfigured = evaluatedFiles.length > 0 && evaluatedFiles.every((item) => item.isConfigured);

  // For the first workbook, grab its validation to render matching notices
  const firstValidation = evaluatedFiles[0]?.validation || { isValid: false, status: 'no_column' };
  const firstIsConfigured = Boolean(firstValidation.isValid && !busy);

  return (
    <div id="pane-excel" role="tabpanel" aria-labelledby="tab-excel">
      {activeFiles.length === 0 && (
        <div
          className={`upload-area ${dragover ? 'dragover' : ''}`}
          id="excel-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-symbol" aria-hidden="true">↑</span>
          <h2>Upload an Excel workbook.</h2>
          <p>Choose one or multiple .xlsx workbooks for the <strong>{domain}</strong> consultation.</p>
          <label className="button secondary upload-label">
            Choose Excel file
            <input
              type="file"
              id="excel-file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              aria-label="Choose Excel file"
              onChange={handleFileInputChange}
              disabled={busy}
            />
          </label>
          <p className="small muted">
            Or drop a file here. .xlsx format · <span id="excel-limit">10 MB</span> maximum
          </p>
        </div>
      )}

      {activeFiles.length > 0 && (
        <div id="excel-selected" className="excel-workflow multi-file-container">
          {/* Header row */}
          <div className="multi-file-header">
            <div>
              <span className="eyebrow" id="excel-consultation-eyebrow">
                {domain} CONSULTATION
              </span>
              <h3>
                {activeFiles.length} {activeFiles.length === 1 ? 'Excel workbook' : 'Excel workbooks'} · {domain} consultation
              </h3>
            </div>
            <div className="multi-file-top-actions">
              <input
                type="file"
                ref={additionalInputRef}
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
                disabled={busy}
              />
              <button
                type="button"
                className="button secondary sm btn-add-more-files"
                id="btn-add-excel"
                onClick={() => additionalInputRef.current?.click()}
                disabled={busy}
              >
                + Add another Excel workbook
              </button>
            </div>
          </div>

          {/* Workbooks queue */}
          <div className="file-queue excel-queue" id="excel-file-queue" role="list">
            {evaluatedFiles.map((item, idx) => {
              const f = item.file;
              const insp = item.inspection;
              const isFirst = idx === 0;
              const fileSheets = item.sheets || [];
              const activeSheet = item.sheet || '';
              const fileMapping = item.mapping || { text_column: '' };
              const val = item.validation;

              return (
                <div
                  key={`${f.name}-${idx}`}
                  className="file-queue-item excel-queue-card"
                  role="listitem"
                >
                  <div className="file-summary">
                    <div>
                      <strong id={isFirst ? 'excel-file-name' : undefined} className="file-name">
                        {f.name}
                      </strong>
                      <p
                        id={isFirst ? 'excel-file-description' : undefined}
                        className="small muted"
                      >
                        {insp
                          ? `${number(insp.row_count)} responses detected · ${(f.size / 1024).toFixed(1)} KB`
                          : 'Inspecting workbook…'}
                      </p>
                    </div>
                    <button
                      type="button"
                      id={isFirst ? 'remove-excel-file' : undefined}
                      className="button text-button remove-file-btn"
                      onClick={() => onRemoveFile(idx)}
                      disabled={busy}
                      aria-label={`Remove ${f.name}`}
                    >
                      Remove file
                    </button>
                  </div>

                  {/* Multi-sheet selector */}
                  {fileSheets.length > 1 && (
                    <div id={isFirst ? 'excel-sheet-select' : undefined} className="excel-field-group">
                      <label htmlFor={isFirst ? 'excel-sheet' : `excel-sheet-${idx}`}>
                        Sheet <span className="small muted">· Multiple worksheets detected</span>
                      </label>
                      <select
                        id={isFirst ? 'excel-sheet' : `excel-sheet-${idx}`}
                        value={activeSheet}
                        onChange={(e) => onSheetChange(e.target.value, idx)}
                        disabled={busy}
                      >
                        {fileSheets.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Feedback column selector & validation */}
                  {insp && (
                    <div id={isFirst ? 'excel-mapping' : undefined} className="excel-field-group">
                      <label htmlFor={isFirst ? 'excel-map-text' : `excel-map-text-${idx}`}>
                        {fileMapping.text_column ? 'Feedback column' : 'Choose the column containing citizen feedback'}
                      </label>

                      <select
                        id={isFirst ? 'excel-map-text' : `excel-map-text-${idx}`}
                        required
                        value={fileMapping.text_column || ''}
                        onChange={(e) => onMappingChange('text_column', e.target.value, idx)}
                        disabled={busy}
                      >
                        <option value="">Choose the column containing citizen feedback</option>
                        {insp.columns.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>

                      {!fileMapping.text_column && (
                        <div className="notice error" role="alert" style={{ margin: '14px 0 0 0' }}>
                          <p>
                            We couldn't find a column containing feedback responses. Please choose the column that contains the citizen comments or responses.
                          </p>
                        </div>
                      )}

                      {val.status === 'metadata_rejected' && (
                        <div className="notice error" role="alert" style={{ margin: '14px 0 0 0' }}>
                          <p>{val.message}</p>
                        </div>
                      )}

                      {val.status === 'empty_sheet' && (
                        <div className="notice error" role="alert" style={{ margin: '14px 0 0 0' }}>
                          <p>{val.message}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ready status notice */}
          {allConfigured && (
            <p className="excel-ready-status" id="excel-ready-status">
              {number(totalResponses)} feedback responses ready for analysis.
            </p>
          )}

          {/* Analysis Mode Toggle */}
          <div className="analysis-mode-selector" id="excel-analysis-mode-selector">
            <span className="mode-label">Analysis Mode:</span>
            <div className="mode-options">
              <label className="radio-option">
                <input
                  type="radio"
                  name="excel-analysis-mode"
                  id="excel-mode-together"
                  value="together"
                  checked={analysisMode === 'together'}
                  onChange={() => onSetAnalysisMode && onSetAnalysisMode('together')}
                  disabled={busy}
                />
                <span><strong>Analyze together</strong> <span className="small muted">(Unified {domain} dataset)</span></span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="excel-analysis-mode"
                  id="excel-mode-separate"
                  value="separate"
                  checked={analysisMode === 'separate'}
                  onChange={() => onSetAnalysisMode && onSetAnalysisMode('separate')}
                  disabled={busy}
                />
                <span><strong>Analyze separately</strong> <span className="small muted">(Individual file analyses grouped under consultation)</span></span>
              </label>
            </div>
          </div>

          {/* Domain Relevance Alert / Notice */}
          {domainRelevance?.isClearlyUnrelated && (
            <div className="domain-mismatch-banner" id="domain-mismatch-alert" role="alert">
              <div className="mismatch-icon" aria-hidden="true">⚠️</div>
              <div className="mismatch-content">
                <div className="mismatch-title">These responses do not appear to match the selected {domain} consultation domain.</div>
                <p>
                  Selected domain: <strong>{domain}</strong>
                  <br />
                  Detected feedback appears unrelated to this domain{domainRelevance.suggestedDomain ? ` and predominantly consistent with ${domainRelevance.suggestedDomain}` : ''}.
                </p>
                <div className="mismatch-actions">
                  {domainRelevance.suggestedDomain && onSwitchDomain && (
                    <button
                      type="button"
                      className="button primary sm"
                      id="btn-switch-domain"
                      onClick={() => onSwitchDomain(domainRelevance.suggestedDomain)}
                    >
                      Change domain to {domainRelevance.suggestedDomain}
                    </button>
                  )}
                  {onRemoveFile && (
                    <button
                      type="button"
                      className="button secondary sm"
                      id="btn-replace-files"
                      onClick={() => onRemoveFile()}
                    >
                      Replace files
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!domainRelevance?.isClearlyUnrelated && domainRelevance?.status === 'mixed' && (
            <div className="domain-notice-banner" id="domain-mixed-alert" role="status">
              <span className="notice-icon" aria-hidden="true">ℹ️</span>
              <span>{domainRelevance.message || `Most feedback appears relevant to ${domain}, but some responses may belong to a different consultation domain.`}</span>
            </div>
          )}

          {!domainRelevance?.isClearlyUnrelated && domainRelevance?.status === 'ambiguous' && (
            <div className="domain-notice-banner subtle" id="domain-ambiguous-alert" role="status">
              <span className="notice-icon" aria-hidden="true">ℹ️</span>
              <span>Some feedback could not be confidently matched to the {domain} domain, but analysis is permitted.</span>
            </div>
          )}

          {/* Submit action */}
          <div className="csv-action" style={{ marginTop: '20px' }}>
            <button
              type="button"
              id="analyze-excel"
              className="button primary"
              onClick={onSubmit}
              disabled={busy || !allConfigured || totalResponses === 0 || domainRelevance?.isClearlyUnrelated}
            >
              {busy ? `Analyzing ${domain} responses…` : <>Analyze consultation <span aria-hidden="true">→</span></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}