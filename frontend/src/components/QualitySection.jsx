import React from 'react';
import { number } from '../lib/utils.js';

export default function QualitySection({ data, source, onFilterResponses }) {
  if (!data) return null;

  return (
    <section id="quality-section" className="decision-section quality-section" aria-labelledby="quality-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Data Integrity & Audit Traceability</p>
          <h2 id="quality-title">Data quality</h2>
          <p className="section-desc">
            Every response accounted for. Rejected responses are excluded from analytical totals to prevent data distortion.
          </p>
        </div>
      </div>

      <div className="quality-card-layout">
        <div id="quality-counts" className="quality-counts">
          <div>
            <strong>{number(data.total_received)}</strong>
            <span>Received</span>
          </div>
          <div>
            <strong>{number(data.total_responses)}</strong>
            <span>Valid Responses</span>
          </div>
          <div>
            <strong>{number(data.rejected_count)}</strong>
            <span>Rejected / Excluded</span>
          </div>
        </div>

        <details id="quality-details" className="quality-details-dropdown">
          <summary>View exclusions and validation notes</summary>
          <div id="quality-list" className="quality-list-container">
            {(!data.rejected || data.rejected.length === 0) && (!data.warnings || data.warnings.length === 0) ? (
              <p className="muted">All submitted responses passed validation. No exclusions or date warnings reported.</p>
            ) : (
              <>
                {data.rejected?.map((row, i) => (
                  <div key={`rej-${i}`} className="quality-issue-row">
                    <strong>Response #{number(row.row_index)} · Excluded</strong>
                    <p className="muted">{row.message}</p>
                  </div>
                ))}
                {data.warnings?.map((row, i) => (
                  <div key={`warn-${i}`} className="quality-issue-row">
                    <strong>Response #{number(row.row_index)} · Date warning</strong>
                    <p className="muted">{row.message}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}
