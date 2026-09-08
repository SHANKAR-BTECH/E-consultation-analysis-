import React from 'react';
import { number, percent, title, classOrder, sentimentClass } from '../lib/utils.js';

export default function PolarityDistribution({ sentiment }) {
  const counts = sentiment?.counts || {};
  const percentages = sentiment?.percentages || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="dossier-card polarity-card">
      <div className="card-top-bar">
        <span className="card-kicker-badge">SENTIMENT SPECTRUM</span>
      </div>
      <h3 className="rail-card-title">Polarity Distribution</h3>
      <p className="rail-card-sub">Global sentiment split across all valid feedback</p>

      <div className="polarity-visual-wrap">
        <div className="stacked-polarity-bar" role="img" aria-label="Sentiment distribution bar">
          {classOrder(counts).map((key) => {
            const count = counts[key] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <span
                key={key}
                className={`bar-segment fill-${sentimentClass(key)}`}
                style={{ width: `${pct}%` }}
                title={`${title(key)}: ${number(count)} (${percent(pct)})`}
              />
            );
          })}
        </div>

        <ul className="polarity-legend">
          {classOrder(counts).map((key) => {
            const count = counts[key] || 0;
            const pct = percentages[key] || 0;
            const sCls = sentimentClass(key);
            return (
              <li key={key} className="legend-row">
                <div className="legend-label">
                  <i className={`legend-dot fill-${sCls}`} />
                  <span className="legend-name">{title(key)}</span>
                </div>
                <div className="legend-values">
                  <strong className="legend-pct">{percent(pct)}</strong>
                  <span className="legend-count">{number(count)} records</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
