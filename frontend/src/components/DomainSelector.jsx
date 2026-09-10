import React from 'react';
import { POLICY_DOMAINS, getDomainInfo } from '../lib/domainConfig.js';

export default function DomainSelector({
  selectedDomain,
  onSelectDomain,
  isLocked,
  fileCount,
  inputFormat,
  domainRelevance,
  onResetConsultation,
  busy
}) {
  const current = getDomainInfo(selectedDomain);

  return (
    <div className="domain-selection-panel" id="domain-selection-panel">
      <div className="domain-header">
        <div className="domain-step-badge">STEP 1</div>
        <div className="domain-title-group">
          <label htmlFor="consultation-domain-select" className="domain-label">
            Policy Domain / Consultation Topic
          </label>
          <span className="domain-sub">
            A consultation belongs to exactly one domain. All uploaded files must belong to this consultation.
          </span>
        </div>
        {isLocked && (
          <div className="domain-lock-badge" id="domain-lock-badge" title="Domain is locked for the current consultation">
            <span className="lock-icon" aria-hidden="true">🔒</span>
            <span>Locked ({fileCount} {inputFormat.toUpperCase()} {fileCount === 1 ? 'file' : 'files'})</span>
          </div>
        )}
      </div>

      <div className="domain-control-row">
        <div className="domain-select-wrapper">
          <span className="domain-icon-display" aria-hidden="true">{current.icon}</span>
          <select
            id="consultation-domain-select"
            value={selectedDomain}
            onChange={(e) => onSelectDomain(e.target.value)}
            disabled={busy || isLocked}
            className="domain-select"
            aria-label="Select policy domain for consultation"
          >
            {POLICY_DOMAINS.map((dom) => (
              <option key={dom.id} value={dom.label}>
                {dom.icon} {dom.label}
              </option>
            ))}
          </select>
        </div>

        {isLocked ? (
          <div className="domain-locked-explanation" role="status">
            <span>
              This consultation is active for <strong>{selectedDomain}</strong>.
            </span>
            {onResetConsultation && (
              <button
                type="button"
                className="button text-button sm"
                id="btn-reset-domain-lock"
                style={{ marginLeft: '12px', textDecoration: 'underline' }}
                onClick={onResetConsultation}
                disabled={busy}
              >
                Change Domain / New Consultation
              </button>
            )}
          </div>
        ) : (
          <div className="domain-hints">
            <span className="domain-hint-text">Select the policy domain before uploading files.</span>
          </div>
        )}
      </div>
    </div>
  );
}
