import React from 'react';
import { number, title, classOrder, sentimentClass } from '../lib/utils.js';

export default function TemporalTrends({ trends }) {
  if (!trends?.available) {
    return (
      <div className="dossier-card trends-card">
        <div className="card-top-bar">
          <span className="card-kicker-badge">CHRONOLOGICAL DYNAMICS</span>
        </div>
        <h3 className="rail-card-title">Temporal Trends</h3>
        <div className="unavailable-callout">
          <strong>Temporal Analytics Inactive</strong>
          <p>{trends?.reason || 'Date information was not mapped or provided in this dataset.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dossier-card trends-card">
      <div className="card-top-bar">
        <span className="card-kicker-badge">CHRONOLOGICAL DYNAMICS</span>
      </div>
      <h3 className="rail-card-title">Temporal Trends</h3>
      <p className="rail-card-sub">
        {number(trends.dated_responses)} dated submissions · {number(trends.undated_responses)} undated
      </p>

      <div className="table-responsive-wrapper">
        <table className="trends-table" aria-label="Dated response volumes">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" className="col-numeric">Volume</th>
              <th scope="col">Sentiment Spread</th>
            </tr>
          </thead>
          <tbody>
            {trends.points.map((pt, i) => {
              const totalPt = pt.total_responses || 1;
              const counts = pt.sentiment?.counts || {};
              return (
                <tr key={i} className="trend-row">
                  <td className="cell-date">{pt.date}</td>
                  <td className="cell-numeric">{number(pt.total_responses)}</td>
                  <td className="cell-distribution">
                    <div className="mini-stacked-bar">
                      {classOrder(counts).map((k) => {
                        const w = ((counts[k] || 0) / totalPt) * 100;
                        return (
                          <span
                            key={k}
                            className={`mini-bar-seg fill-${sentimentClass(k)}`}
                            style={{ width: `${w}%` }}
                            title={`${title(k)}: ${counts[k]}`}
                          />
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
