import React from 'react';

export default function ImprovementsSection({ improvements = [], onFilterResponses }) {
  if (!improvements.length) return null;

  return (
    <section className="decision-section improvements-section" id="improvements-section" aria-labelledby="improvements-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Positive Outcomes & Implementation Evaluation</p>
          <h2 id="improvements-title">Improvements reported</h2>
          <p className="section-desc">
            Verified positive outcomes evaluated against remaining concerns to assess whether interventions solved problems completely or only partially.
          </p>
        </div>
      </div>

      <div className="improvements-grid">
        {improvements.map((item, idx) => (
          <article key={idx} className="improvement-card">
            <div className="improvement-top">
              <span className="badge badge-positive">✓ REPORTED IMPROVEMENT</span>
            </div>

            <div className="improvement-body">
              <span className="field-label">IMPROVEMENT:</span>
              <h3 className="improvement-title">{item.title}</h3>
            </div>

            <div className="improvement-evidence-block">
              <span className="field-label">SUPPORTING EVIDENCE:</span>
              <blockquote className="improvement-quote">
                "{item.evidence}"
              </blockquote>
            </div>

            <div className="remaining-concerns-block">
              <span className="field-label">REMAINING CONCERNS:</span>
              <ul className="remaining-concerns-list">
                {item.remainingConcerns && item.remainingConcerns.length > 0 ? (
                  item.remainingConcerns.map((concern, cIdx) => (
                    <li key={cIdx} className="remaining-concern-item">
                      {concern}
                    </li>
                  ))
                ) : (
                  <li className="remaining-concern-item muted">No recurring secondary concerns detected.</li>
                )}
              </ul>
            </div>

            {onFilterResponses && (
              <div className="improvement-footer">
                <button
                  type="button"
                  className="button secondary sm"
                  onClick={() => onFilterResponses(`Improvement: ${item.title}`, [item.responseIndex])}
                >
                  Inspect response #{item.responseIndex} <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
