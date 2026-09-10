import React from 'react';
import { number } from '../lib/utils.js';

export default function PasteResponses({
  text,
  onTextChange,
  separator,
  onSeparatorChange,
  responseCount,
  characterCount,
  domain = 'Transport',
  domainRelevance = null,
  onSwitchDomain,
  onClear,
  onSubmit,
  busy
}) {
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!busy && responseCount > 0 && !domainRelevance?.isClearlyUnrelated) {
        onSubmit();
      }
    }
  };

  return (
    <div id="pane-paste" role="tabpanel" aria-labelledby="tab-paste">
      <div className="input-caption">
        <label htmlFor="paste-input">Your consultation responses</label>
        <label className="split-control">
          Separate by{' '}
          <select
            id="separator"
            value={separator}
            onChange={(e) => onSeparatorChange(e.target.value)}
            disabled={busy}
          >
            <option value="line">New line</option>
            <option value="paragraph">Blank line</option>
          </select>
        </label>
      </div>
      <textarea
        id="paste-input"
        placeholder="Paste consultation responses here..."
        aria-describedby="paste-help counters"
        spellCheck="true"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
      ></textarea>

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
              {onClear && (
                <button
                  type="button"
                  className="button secondary sm"
                  id="btn-replace-files"
                  onClick={onClear}
                >
                  Clear responses
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

      <div className="input-footer">
        <div>
          <p id="counters" aria-live="polite">
            <strong id="response-count">{number(responseCount)}</strong> responses detected{' '}
            <span className="divider-dot">·</span>{' '}
            <span id="character-count">{number(characterCount)}</span> characters
          </p>
          <p id="paste-help" className="small muted">
            {separator === 'paragraph'
              ? 'Separate responses with a blank line. Line breaks within a response are preserved.'
              : 'One response per line. Empty lines are ignored.'}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            id="clear-paste"
            className="button text-button"
            onClick={onClear}
            disabled={busy}
          >
            Clear
          </button>
          <button
            type="button"
            id="analyze-paste"
            className="button primary"
            onClick={onSubmit}
            disabled={busy || responseCount === 0 || domainRelevance?.isClearlyUnrelated}
          >
            Analyze consultation <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
