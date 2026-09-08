import React from 'react';

export default function MixedFeedbackSection({ mixed = [], onFilterResponses }) {
  if (!mixed.length) return null;

  return (
    <section className="decision-section mixed-feedback-section" id="mixed-feedback" aria-labelledby="mixed-feedback-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Nuanced Submissions & Partial Implementation</p>
          <h2 id="mixed-feedback-title">Mixed feedback</h2>
          <p className="section-desc">
            Feedback that recognizes progress but highlights remaining concerns. Not forced into simple positive or negative.
          </p>
        </div>
      </div>

      <div className="mixed-grid">
        {mixed.map((item, idx) => (
          <article key={idx} className="mixed-card">
            <div className="mixed-card-header">
              <span className="badge badge-neutral">MIXED SENTIMENT · RESPONSE #{item.responseIndex}</span>
              {onFilterResponses && (
                <button
                  type="button"
                  className="button secondary sm"
                  onClick={() => onFilterResponses('Mixed Submission', [item.responseIndex])}
                >
                  View in Explorer <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>

            <blockquote className="mixed-source-quote">
              "{item.fullText}"
            </blockquote>

            <div className="mixed-decomposition-grid">
              <div className="mixed-decomp-item improvement-border">
                <span className="decomp-label">REPORTED IMPROVEMENT:</span>
                <p className="decomp-text">{item.reportedImprovement}</p>
              </div>

              <div className="mixed-decomp-item concern-border">
                <span className="decomp-label">REMAINING CONCERN:</span>
                <p className="decomp-text">{item.remainingConcern}</p>
              </div>

              <div className="mixed-decomp-item request-border">
                <span className="decomp-label">PUBLIC REQUEST:</span>
                <p className="decomp-text request-quote">{item.publicRequest}</p>
              </div>
            </div>

            <div className="mixed-analysis-panel">
              <div className="mixed-analysis-row">
                <span className="analysis-label">INTERPRETATION:</span>
                <p className="analysis-text">{item.interpretation}</p>
              </div>
              <div className="mixed-analysis-row highlight">
                <span className="analysis-label">SUGGESTED FOLLOW-UP:</span>
                <p className="analysis-text follow-up-text">{item.suggestedFollowUp}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
