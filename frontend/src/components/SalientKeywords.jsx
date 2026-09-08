import React from 'react';
import { number } from '../lib/utils.js';

export default function SalientKeywords({ keywords }) {
  const maxCount = Math.max(1, ...(keywords || []).map((k) => k.count));

  return (
    <div className="dossier-card keywords-card">
      <div className="card-top-bar">
        <span className="card-kicker-badge">LEXICAL FREQUENCY</span>
      </div>
      <h3 className="rail-card-title">Salient Keywords & N-Grams</h3>
      <p className="rail-card-sub">Top recurring vocabulary across submissions</p>

      {(!keywords || keywords.length === 0) ? (
        <p className="card-empty-note">No usable keywords extracted.</p>
      ) : (
        <ol className="keywords-rank-list">
          {keywords.slice(0, 10).map((item, i) => {
            const barWidth = (item.count / maxCount) * 100;
            return (
              <li key={i} className="kw-item">
                <div className="kw-label-row">
                  <span className="kw-word">{item.keyword}</span>
                  <span className="kw-count">{number(item.count)}</span>
                </div>
                <div className="kw-bar-track" aria-hidden="true">
                  <div className="kw-bar-fill" style={{ width: `${barWidth}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
