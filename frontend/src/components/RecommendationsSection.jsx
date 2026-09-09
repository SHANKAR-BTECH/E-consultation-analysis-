import React from 'react';

export default function RecommendationsSection({ recommendations = [] }) {
  if (!recommendations.length) return null;

  return (
    <section className="decision-section recommendations-section" id="recommendations" aria-labelledby="recommendations-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Administrative Guidance & Problem Follow-Up</p>
          <h2 id="recommendations-title">Recommended areas of action</h2>
          <p className="section-desc">
            Evidence-grounded operational follow-ups derived directly from identified problems and citizen requests.
          </p>
        </div>
      </div>

      <div className="recommendations-cards-grid">
        {recommendations.map((rec, idx) => (
          <article key={idx} className="recommendation-card">
            <div className="rec-top-bar">
              <span className="badge badge-neutral">{rec.actionVerb}</span>
              {rec.problem && <span className="rec-problem-tag">{rec.problem}</span>}
            </div>

            <h3 className="rec-title-text">{rec.title}</h3>

            {rec.evidence && (
              <div className="rec-detail-block">
                <span className="field-label">CITIZEN EVIDENCE:</span>
                <p className="rec-evidence-text">"{typeof rec.evidence === 'string' ? rec.evidence : rec.evidence.text}"</p>
              </div>
            )}

            {rec.relatedRequest && (
              <div className="rec-detail-block">
                <span className="field-label">RELATED CITIZEN REQUEST:</span>
                <p className="rec-request-text">"{rec.relatedRequest}"</p>
              </div>
            )}

            {rec.guidance && (
              <div className="rec-guidance-block">
                <p className="rec-guidance-text small muted">{rec.guidance}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
