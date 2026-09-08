import React from 'react';
import { number, percent, title } from '../lib/utils.js';

export default function PriorityIssues({ issues, onSelectIssue }) {
  return (
    <section className="dossier-card priority-issues-card" id="issues-section">
      <div className="card-top-bar">
        <span className="card-kicker-badge">CRITICAL SIGNALS</span>
        <span className="card-caption-tag">HEURISTIC RANKING</span>
      </div>

      <div className="issues-header-block">
        <h2 className="section-title">Priority Issues & Recurring Citizen Grievances</h2>
        <p className="section-sub">
          Recurring key phrases with high negative sentiment correlation. Priority score blends coverage (40%)
          and negative concentration (60%).
        </p>
      </div>

      {(!issues || issues.length === 0) ? (
        <div className="issues-empty-box">
          <span className="empty-icon">✓</span>
          <p>No recurring phrases breached critical negative frequency thresholds.</p>
          <small>This indicates low complaint clustering, not necessarily absence of localized concerns.</small>
        </div>
      ) : (
        <div className="table-responsive-wrapper">
          <table className="priority-table" aria-label="Priority issues ranking">
            <thead>
              <tr>
                <th scope="col" className="col-issue">Issue / Phrase</th>
                <th scope="col" className="col-numeric">Mentions</th>
                <th scope="col" className="col-numeric">Negative Ratio</th>
                <th scope="col" className="col-priority">Priority Score</th>
                <th scope="col" className="col-action">Source Evidence</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, idx) => {
                const pLevel = (issue.priority?.level || 'low').toLowerCase();
                return (
                  <tr key={idx} className="issue-row">
                    <td className="cell-issue">
                      <strong>{issue.issue}</strong>
                    </td>
                    <td className="cell-numeric">{number(issue.mentions)}</td>
                    <td className="cell-numeric">
                      <span className="neg-highlight">
                        {percent(issue.negative_ratio * 100)}
                      </span>
                    </td>
                    <td className="cell-priority">
                      <span className={`priority-badge ${pLevel}`}>
                        {title(pLevel)} · {number(issue.priority?.score)}
                      </span>
                    </td>
                    <td className="cell-action">
                      <button
                        type="button"
                        className="btn-evidence-link"
                        onClick={() => onSelectIssue(idx)}
                        aria-label={`View evidence for ${issue.issue}`}
                      >
                        <span>View Evidence</span>
                        <span aria-hidden="true">↗</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
