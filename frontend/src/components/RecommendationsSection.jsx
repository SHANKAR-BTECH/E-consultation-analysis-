import React from 'react';

export default function RecommendationsSection({ recommendations = [] }) {
  if (!recommendations.length) return null;

  return (
    <section className="report-section recommendations-section" id="recommendations">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Administrative Guidance</p>
          <h2>Recommended areas of action.</h2>
        </div>
        <p>
          Evidence-grounded operational suggestions for administrative review and policy consideration.
        </p>
      </div>

      <div className="recommendations-list">
        {recommendations.map((rec, idx) => (
          <div key={idx} className="recommendation-item">
            <div className="rec-verb-badge">{rec.actionVerb}</div>
            <div className="rec-content">
              <h3 className="rec-title">{rec.title}</h3>
              <p className="rec-rationale">{rec.rationale}</p>
              <p className="rec-guidance small muted">{rec.guidance}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
