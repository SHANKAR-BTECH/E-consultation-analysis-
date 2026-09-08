import React from 'react';
import { number, title } from '../lib/utils.js';

export default function KeyFindings({ findings = [], onFilterResponses }) {
  if (!findings.length) return null;

  return (
    <section className="decision-section key-findings-section" id="key-findings" aria-labelledby="key-findings-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Strategic Intelligence & Synthesis</p>
          <h2 id="key-findings-title">Key findings</h2>
          <p className="section-desc">
            High-value findings synthesized from citizen concerns, actionable requests, and confirmed service outcomes.
          </p>
        </div>
      </div>

      <div className="findings-grid">
        {findings.map((item, idx) => {
          const priorityCls = item.priority === 'HIGH' ? 'priority-high' : (item.priority === 'LOW' ? 'priority-low' : 'priority-medium');

          return (
            <article key={idx} className="finding-card">
              <div className="finding-top">
                <span className={`badge ${priorityCls}`}>
                  {item.priority} PRIORITY
                </span>
                <span className="finding-sentiment-badge">
                  {item.sentiment}
                </span>
              </div>

              <h3 className="finding-headline">{item.headline}</h3>

              <div className="finding-meta-row">
                <span className="finding-metric">
                  <strong>{number(item.count)}</strong> {item.count === 1 ? 'response' : 'responses'}
                </span>
                {item.coverage && (
                  <span className="finding-coverage">
                    Coverage: {item.coverage}
                  </span>
                )}
              </div>

              <p className="finding-interpretation">{item.interpretation || item.explanation}</p>

              {item.supportingResponses?.length > 0 && onFilterResponses && (
                <div className="finding-footer">
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => onFilterResponses(item.headline, item.supportingResponses)}
                  >
                    View evidence ({number(item.count)} responses) <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
