import React from 'react';

export default function OverallAssessment({ assessment = '' }) {
  if (!assessment) return null;

  return (
    <section className="report-section overall-assessment-section" id="overall-assessment">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Strategic Conclusion</p>
          <h2>Overall assessment.</h2>
        </div>
        <p>
          Synthesized decision-support assessment combining public sentiment, service grievances,
          citizen proposals, and trajectory.
        </p>
      </div>

      <div className="overall-assessment-card">
        <p className="assessment-copy">{assessment}</p>
      </div>
    </section>
  );
}
