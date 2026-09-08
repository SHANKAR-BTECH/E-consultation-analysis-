import React from 'react';
import { number, title } from '../lib/utils.js';

export default function RequestsSection({ requests = [], onFilterResponses }) {
  if (!requests.length) return null;

  return (
    <section className="decision-section requests-section" id="requests-section" aria-labelledby="requests-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Citizen Submissions & Actionable Proposals</p>
          <h2 id="requests-title">What people are asking for</h2>
          <p className="section-desc">
            Explicit actionable requests extracted from citizen feedback, distinguished from generic topics.
          </p>
        </div>
      </div>

      <div className="requests-cards-grid">
        {requests.map((req, idx) => {
          const pLevel = (req.priority || 'medium').toLowerCase();
          const priorityCls = req.priority === 'HIGH' ? 'priority-high' : (req.priority === 'LOW' ? 'priority-low' : 'priority-medium');

          return (
            <article key={idx} className="request-card">
              <div className="request-card-header">
                <span className={`badge ${priorityCls}`}>
                  {req.priority} PRIORITY
                </span>
                <span className="request-count-pill">
                  <strong>{number(req.count)}</strong> {req.count === 1 ? 'response' : 'responses'}
                </span>
              </div>

              <div className="request-content-block">
                <span className="field-label">REQUEST:</span>
                <h3 className="request-title-text">{req.title}</h3>
              </div>

              <div className="request-quote-block">
                <span className="field-label">REPRESENTATIVE QUOTE:</span>
                <blockquote className="request-quote-text">
                  "{req.representativeQuote || req.representativeEvidence}"
                </blockquote>
              </div>

              <div className="request-footer">
                <div className="evidence-info">
                  <span className="evidence-count-label">Evidence count:</span>
                  <strong>{number(req.evidenceCount || req.count)} responses</strong>
                </div>

                {onFilterResponses && req.supportingResponses && req.supportingResponses.length > 0 && (
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => onFilterResponses(`Request: ${req.title}`, req.supportingResponses)}
                  >
                    View {number(req.evidenceCount || req.count)} evidence responses <span aria-hidden="true">→</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
