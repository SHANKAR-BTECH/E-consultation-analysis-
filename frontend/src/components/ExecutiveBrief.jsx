import React from 'react';

export default function ExecutiveBrief({ paragraphs = [] }) {
  return (
    <section className="report-section executive-brief-section" id="executive-brief">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Executive Brief</p>
          <h2>What people are telling you.</h2>
        </div>
        <p>
          Overall interpretation synthesized from verified model classification,
          recurring concerns, citizen requests, and reported improvements.
        </p>
      </div>

      <div className="executive-brief-card">
        {paragraphs.map((p, idx) => (
          <p key={idx} className={idx === 0 ? 'brief-lead' : 'brief-body'}>
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}
