import React, { useEffect } from 'react';
import { number, percent, title } from '../lib/utils.js';

export default function EvidenceModal({
  issue,
  totalResponses,
  onClose,
  onExploreIssue
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!issue) return null;

  const signals = issue.priority?.signals || {};
  const pLevel = (issue.priority?.level || 'low').toLowerCase();

  return (
    <div className="evidence-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-issue-title">
      <div className="evidence-modal">
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-kicker">ISSUE EVIDENCE & PROVENANCE DOSSIER</span>
            <h2 id="modal-issue-title" className="modal-title">
              {issue.issue}
            </h2>
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-score-banner">
            <span className={`priority-badge ${pLevel}`}>
              {title(pLevel)} Priority · {number(issue.priority?.score)} / 100
            </span>
            <div className="banner-stats">
              <div className="b-stat">
                <strong>{number(issue.mentions)}</strong>
                <span>Matching Responses</span>
              </div>
              <div className="b-stat">
                <strong className="neg-val">{percent(issue.negative_ratio * 100)}</strong>
                <span>Negative Association</span>
              </div>
            </div>
          </div>

          <div className="modal-signals-section">
            <h3 className="subheading">Why this priority score?</h3>
            <p className="sub-helper">
              Relative to {number(totalResponses)} valid consultation submissions. Transparent
              scoring heuristic based on frequency and negative bias.
            </p>

            <div className="signals-table">
              <div className="signal-row">
                <span className="sig-name">Response Coverage</span>
                <span className="sig-val">{percent(signals.coverage * 100)}</span>
              </div>
              <div className="signal-row">
                <span className="sig-name">Negative Sentiment Concentration</span>
                <span className="sig-val">{percent(signals.negative_ratio * 100)}</span>
              </div>
              <div className="signal-row">
                <span className="sig-name">
                  Coverage Component ({percent((signals.frequency_weight || 0.4) * 100)} weight)
                </span>
                <span className="sig-val">{number(signals.frequency_contribution)} pts</span>
              </div>
              <div className="signal-row">
                <span className="sig-name">
                  Negative Component ({percent((signals.negative_weight || 0.6) * 100)} weight)
                </span>
                <span className="sig-val">{number(signals.negative_contribution)} pts</span>
              </div>
              <div className="signal-row total">
                <span className="sig-name">Composite Priority Rating</span>
                <span className="sig-val highlight">{number(issue.priority?.score)} / 100</span>
              </div>
            </div>
          </div>

          <div className="modal-quotes-section">
            <h3 className="subheading">In the Original Words</h3>
            <p className="sub-helper">
              Unedited representative submissions selected by model confidence and relevance.
            </p>

            <div className="quotes-list">
              {issue.representative_feedback && issue.representative_feedback.length > 0 ? (
                issue.representative_feedback.map((item, i) => (
                  <blockquote key={i} className="citizen-quote">
                    <p className="quote-text">“{item.text}”</p>
                    <footer className="quote-footer">
                      <span className="q-badge">Response {number(item.row_index)}</span>
                      <span className="q-sep">·</span>
                      <span className={`q-sentiment ${item.sentiment}`}>
                        {title(item.sentiment)}
                      </span>
                      <span className="q-sep">·</span>
                      <span className="q-conf">{percent(item.confidence * 100)} confidence</span>
                    </footer>
                  </blockquote>
                ))
              ) : (
                <p className="muted">No direct feedback quotes available for this issue.</p>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Close Dossier
          </button>
          <button
            type="button"
            className="btn-primary-action"
            onClick={onExploreIssue}
          >
            <span>Explore All {number(issue.mentions)} Submissions</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
