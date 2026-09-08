import React, { useState } from 'react';
import { number } from '../lib/utils.js';

export default function IngestionAudit({ totalReceived, totalResponses, rejectedCount, rejected, warnings }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const hasIssues = (rejected && rejected.length > 0) || (warnings && warnings.length > 0);

  return (
    <div className="dossier-card audit-card" id="quality-section">
      <div className="card-top-bar">
        <span className="card-kicker-badge">INGESTION AUDIT</span>
      </div>
      <h3 className="rail-card-title">Data Ingestion Integrity</h3>
      <p className="rail-card-sub">Validation summary of raw consultation input records</p>

      <div className="audit-metrics-grid">
        <div className="audit-tile">
          <strong>{number(totalReceived)}</strong>
          <span>Received</span>
        </div>
        <div className="audit-tile valid">
          <strong>{number(totalResponses)}</strong>
          <span>Analyzed</span>
        </div>
        <div className="audit-tile rejected">
          <strong>{number(rejectedCount)}</strong>
          <span>Excluded</span>
        </div>
      </div>

      <div className="audit-details-wrap">
        <button
          type="button"
          className="btn-audit-toggle"
          onClick={() => setDetailsOpen(!detailsOpen)}
          aria-expanded={detailsOpen}
        >
          <span>{detailsOpen ? 'Hide Audit Log' : 'View Exclusions & Warnings Log'}</span>
          <span className="toggle-icon">{detailsOpen ? '▲' : '▼'}</span>
        </button>

        {detailsOpen && (
          <div className="audit-log-content">
            {!hasIssues ? (
              <p className="clean-audit-msg">
                ✓ All submitted records passed ingestion schema validation without warnings.
              </p>
            ) : (
              <ul className="audit-issues-list">
                {rejected &&
                  rejected.map((r, i) => (
                    <li key={`rej-${i}`} className="audit-issue-item error">
                      <strong>Response #{number(r.row_index)} · Excluded:</strong> {r.message}
                    </li>
                  ))}
                {warnings &&
                  warnings.map((w, i) => (
                    <li key={`warn-${i}`} className="audit-issue-item warning">
                      <strong>Response #{number(w.row_index)} · Date Warning:</strong> {w.message}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
