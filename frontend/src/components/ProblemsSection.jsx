import React from 'react';
import { number, percent, title } from '../lib/utils.js';

export default function ProblemsSection({ issues = [], totalResponses, onOpenIssue }) {
  return (
    <section className="report-section problems-section" id="problems-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Operational Concerns</p>
          <h2>Problems requiring attention.</h2>
        </div>
        <p>
          Recurring issues associated with negative feedback, prioritized by response coverage
          and negative concentration.
        </p>
      </div>

      {issues.length > 0 ? (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Prioritized problems and evidence</caption>
            <thead>
              <tr>
                <th style={{ width: '26%' }}>Problem</th>
                <th style={{ width: '12%' }}>Priority</th>
                <th className="numeric" style={{ width: '10%' }}>Mentions</th>
                <th className="numeric" style={{ width: '10%' }}>Coverage</th>
                <th className="numeric" style={{ width: '12%' }}>Negative Ratio</th>
                <th style={{ width: '20%' }}>Why It Matters</th>
                <th style={{ width: '10%' }}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, idx) => {
                const pLevel = (issue.priority?.level || 'low').toLowerCase();
                const coverage = totalResponses > 0 ? (issue.mentions / totalResponses) * 100 : 0;
                return (
                  <tr key={idx}>
                    <td>
                      <strong>{title(issue.issue)}</strong>
                      <div className="lifecycle-tag">
                        <span className="lifecycle-dot problem" />
                        Life cycle: Remaining problem
                      </div>
                    </td>
                    <td>
                      <span className={`priority ${pLevel}`}>
                        {title(issue.priority?.level || '')} · {number(issue.priority?.score || 0)}
                      </span>
                    </td>
                    <td className="numeric">{number(issue.mentions)}</td>
                    <td className="numeric">{percent(coverage)}</td>
                    <td className="numeric">
                      <span className="neg-highlight">{percent((issue.negative_ratio || 0) * 100)}</span>
                    </td>
                    <td>
                      <p className="small muted">
                        {pLevel === 'high'
                          ? 'High complaint density representing a focal area of public grievance.'
                          : 'Persistent friction affecting a subset of consultation participants.'}
                      </p>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => onOpenIssue(idx)}
                        aria-label={`View evidence for ${issue.issue}`}
                      >
                        View evidence ↗
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="unavailable">
          No recurring phrases met the candidate-problem thresholds. This does not mean there are no concerns.
        </p>
      )}
    </section>
  );
}
