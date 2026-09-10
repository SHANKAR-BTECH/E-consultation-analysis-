import React, { useState, useRef } from 'react';
import { number } from '../lib/utils.js';

export default function PdfUpload({
  files = [],
  file = null, // fallback for legacy single-file
  inspection = null, // fallback for legacy
  domain = 'Transport',
  analysisMode = 'together',
  domainRelevance = null,
  onSwitchDomain,
  onSetAnalysisMode,
  onFilesSelected,
  onFileSelected, // fallback
  onRemoveFile,
  onSubmit,
  busy
}) {
  const [dragover, setDragover] = useState(false);
  const additionalInputRef = useRef(null);

  // Normalize files array: if `files` prop is empty but legacy `file` prop is present, construct list
  const activeFiles = files.length > 0
    ? files
    : (file ? [{ file, inspection, status: inspection ? 'ready' : 'extracting' }] : []);

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

  const totalExtracted = activeFiles.reduce((sum, f) => {
    return sum + (f.inspection?.row_count || 0);
  }, 0);

  const allReady = activeFiles.length > 0 && activeFiles.every((f) => f.inspection && !f.error);

  return (
    <div id="pane-pdf" role="tabpanel" aria-labelledby="tab-pdf">
      {activeFiles.length === 0 && (
        <div
          className={`upload-area ${dragover ? 'dragover' : ''}`}
          id="pdf-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <span className="upload-symbol" aria-hidden="true">↑</span>
          <h2>Upload PDF consultation documents.</h2>
          <p>Choose one or multiple .pdf files for the <strong>{domain}</strong> consultation.</p>
          <label className="button secondary upload-label">
            Choose PDF file(s)
            <input
              type="file"
              id="pdf-file"
              accept=".pdf,application/pdf"
              multiple
              aria-label="Choose PDF files"
              onChange={handleFileInputChange}
              disabled={busy}
            />
          </label>
          <p className="small muted">
            Or drop PDF files here. .pdf format · 10 MB per file · One consultation domain
          </p>
        </div>
      )}

      {activeFiles.length > 0 && (
        <div id="pdf-selected" className="multi-file-container">
          <div className="multi-file-header">
            <div>
              <span className="eyebrow" id="pdf-consultation-eyebrow">
                {domain} CONSULTATION
              </span>
              <h3>
                {activeFiles.length} {activeFiles.length === 1 ? 'PDF file' : 'PDF files'} · {domain} consultation
              </h3>
            </div>
            <div className="multi-file-top-actions">
              <input
                type="file"
                ref={additionalInputRef}
                accept=".pdf,application/pdf"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
                disabled={busy}
              />
              <button
                type="button"
                className="button secondary sm btn-add-more-files"
                id="btn-add-pdf"
                onClick={() => additionalInputRef.current?.click()}
                disabled={busy}
              >
                + Add another PDF
              </button>
            </div>
          </div>

          {/* Queue of uploaded PDF files */}
          <div className="file-queue" id="pdf-file-queue" role="list">
            {activeFiles.map((item, idx) => {
              const f = item.file;
              const insp = item.inspection;
              const isFirst = idx === 0;

              return (
                <div
                  key={`${f.name}-${idx}`}
                  className="file-queue-item"
                  id={isFirst ? 'pdf-selected-first' : undefined}
                  role="listitem"
                >
                  <div className="file-info-col">
                    <div className="file-title-row">
                      <span className="file-icon" aria-hidden="true">📄</span>
                      <strong className="file-name" id={isFirst ? 'pdf-file-name' : undefined}>
                        {f.name}
                      </strong>
                      {insp && (
                        <span className="badge badge-ready">✓ Ready</span>
                      )}
                      {!insp && !item.error && (
                        <span className="badge badge-pending">Extracting…</span>
                      )}
                      {item.error && (
                        <span className="badge badge-error">⚠ {item.error}</span>
                      )}
                    </div>
                    <p
                      className="small muted file-description"
                      id={isFirst ? 'pdf-file-description' : undefined}
                    >
                      {insp
                        ? `${number(insp.row_count)} responses extracted · ${number(insp.page_count)} pages · ${(f.size / 1024).toFixed(1)} KB`
                        : item.error
                        ? item.error
                        : 'Extracting text…'}
                    </p>
                  </div>
                  <div className="file-action-col">
                    <button
                      type="button"
                      id={isFirst ? 'remove-pdf-file' : undefined}
                      className="button text-button remove-file-btn"
                      onClick={() => onRemoveFile(idx)}
                      disabled={busy}
                      aria-label={`Remove ${f.name}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary bar */}
          <div className="queue-summary-bar">
            <span>
              <strong>{activeFiles.length} {activeFiles.length === 1 ? 'file' : 'files'}</strong> · <strong>{number(totalExtracted)}</strong> total responses
            </span>
          </div>

          {/* Analysis Mode Toggle (when 1 or more files are present) */}
          <div className="analysis-mode-selector" id="pdf-analysis-mode-selector">
            <span className="mode-label">Analysis Mode:</span>
            <div className="mode-options">
              <label className="radio-option">
                <input
                  type="radio"
                  name="pdf-analysis-mode"
                  id="pdf-mode-together"
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
                  name="pdf-analysis-mode"
                  id="pdf-mode-separate"
                  value="separate"
                  checked={analysisMode === 'separate'}
                  onChange={() => onSetAnalysisMode && onSetAnalysisMode('separate')}
                  disabled={busy}
                />
                <span><strong>Analyze separately</strong> <span className="small muted">(Individual file analyses grouped under consultation)</span></span>
              </label>
            </div>
          </div>

          {/* Preview of extracted text */}
          {activeFiles[0]?.inspection && (
            <div id="pdf-summary">
              <p className="mapping-heading">
                Text extracted from <strong>{activeFiles[0].file.name}</strong> {activeFiles.length > 1 ? `(+ ${activeFiles.length - 1} other files)` : ''}
                <span className="small muted"> Layout text is read as-is, exactly as it appears in the document.</span>
              </p>
              <ol className="pdf-preview" id="pdf-preview">
                {activeFiles[0].inspection.preview.slice(0, 6).map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ol>
            </div>
          )}

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

          {/* Analyze action button */}
          <div className="csv-action" style={{ marginTop: '24px' }}>
            <button
              type="button"
              id="analyze-pdf"
              className="button primary"
              onClick={onSubmit}
              disabled={busy || !allReady || totalExtracted === 0 || domainRelevance?.isClearlyUnrelated}
            >
              {busy ? `Analyzing ${domain} feedback…` : `Analyze ${domain} Feedback →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}