import React from 'react';
import { number } from '../lib/utils.js';

export default function ExecutiveMemorandum({ data }) {
  const notes = [];
  if (data.rejected_count) {
    notes.push(
      `${number(data.rejected_count)} ${
        data.rejected_count === 1 ? 'response was excluded' : 'responses were excluded'
      } from totals. Review Ingestion Audit for line-by-line reasons.`
    );
  }
  if (data.warnings && data.warnings.length) {
    notes.push(`${number(data.warnings.length)} date format warnings were noted during parsing.`);
  }
  if (data.analysis_notes?.term_limit_reached) {
    notes.push('Vocabulary discovery cap was reached; extracted topics represent top salient terms.');
  }

  return (
    <article className="dossier-card executive-memorandum">
      <div className="card-top-bar">
        <span className="card-kicker-badge">EXECUTIVE MEMORANDUM</span>
        <span className="card-date-badge">SYNTHESIZED INTELLIGENCE</span>
      </div>

      <div className="memorandum-body">
        <h2 className="memorandum-title">Key Findings & Consultation Posture</h2>
        <p className="summary-prose">{data.summary}</p>

        {notes.length > 0 && (
          <div className="memorandum-notice-box">
            <span className="notice-icon">⚠</span>
            <div className="notice-text">
              {notes.map((note, i) => (
                <p key={i}>{note}</p>
              ))}
            </div>
          </div>
        )}

        <div className="memorandum-disclaimer">
          Synthesis assembled autonomously from verified ML feature extractions. Review representative
          citizen feedback in the explorer below before taking policy action.
        </div>
      </div>
    </article>
  );
}
