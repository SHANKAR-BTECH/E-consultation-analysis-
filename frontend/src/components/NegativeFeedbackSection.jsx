import React, { useState } from 'react';
import { number, percent } from '../lib/utils.js';

export default function NegativeFeedbackSection({
  negativeIssues = [],
  totalResponses = 1,
  onFilterResponses,
  onOpenIssueModal
}) {
  const [expandedIssues, setExpandedIssues] = useState({});

  if (!negativeIssues || negativeIssues.length === 0) {
    return (
      <section id="negative-feedback" className="decision-section" aria-labelledby="negative-feedback-title">
        <div className="section-header">
          <div>
            <p className="eyebrow">Complaint Analysis & Problem Resolution</p>
            <h2 id="negative-feedback-title">Negative feedback requiring attention</h2>
          </div>
        </div>
        <div className="empty-panel">
          <p className="muted">No recurring negative issues breached frequency thresholds in this consultation dataset.</p>
        </div>
      </section>
    );
  }

  const toggleExpand = (issueKey) => {
    setExpandedIssues((prev) => ({
      ...prev,
      [issueKey]: !prev[issueKey]
    }));
  };

  return (
    <section id="negative-feedback" className="decision-section" aria-labelledby="negative-feedback-title">
      <div className="section-header">
        <div>
          <p className="eyebrow">Actionable Complaint Workflow</p>
          <h2 id="negative-feedback-title">Negative feedback requiring attention</h2>
          <p className="section-desc">
            Organizes negative feedback into actionable issues, connecting verified complaints directly to citizen requests and cautious follow-up proposals.
          </p>
        </div>
      </div>

      <div className="negative-issues-list">
        {negativeIssues.map((item, index) => {
          const isExpanded = !!expandedIssues[item.issue];
          const hasLinkedRequests = item.linkedRequests[0] !== "No directly related public request was identified in the analyzed responses.";
          const priorityCls = item.priority === 'HIGH' ? 'priority-high' : 'priority-medium';

          return (
            <article key={item.issue || index} className="negative-issue-dossier">
              {/* Header */}
              <div className="negative-issue-header">
                <div className="issue-headline-block">
                  <span className={`badge ${priorityCls}`}>
                    {item.priority} PRIORITY
                  </span>
                  <h3 className="negative-issue-title">{item.displayTitle}</h3>
                </div>
                <div className="negative-issue-meta">
                  <span className="count-badge">
                    <strong>{number(item.negativeCount)}</strong> negative responses
                  </span>
                  <span className="coverage-badge">
                    {percent(item.percentage)} of consultation
                  </span>
                </div>
              </div>

              {item.recurrenceNote && (
                <div className="recurrence-note-strip">
                  <span className="muted small">ℹ {item.recurrenceNote}</span>
                </div>
              )}

              <p className="negative-issue-explanation">{item.explanation}</p>

              {/* Core 4-Stage Decision Workflow */}
              <div className="workflow-connector-bar">
                <div className="workflow-step">
                  <span className="step-tag">PROBLEM</span>
                  <p className="step-content">{item.workflow.problem}</p>
                </div>
                <div className="workflow-arrow" aria-hidden="true">↓</div>

                <div className="workflow-step">
                  <span className="step-tag">PEOPLE REPORT</span>
                  <p className="step-content">{item.workflow.evidence}</p>
                </div>
                <div className="workflow-arrow" aria-hidden="true">↓</div>

                <div className="workflow-step">
                  <span className="step-tag">PEOPLE REQUEST</span>
                  <p className="step-content request-quote">
                    {hasLinkedRequests ? `"${item.linkedRequests[0]}"` : item.linkedRequests[0]}
                  </p>
                </div>
                <div className="workflow-arrow" aria-hidden="true">↓</div>

                <div className="workflow-step highlight-step">
                  <span className="step-tag">SUGGESTED FOLLOW-UP</span>
                  <p className="step-content follow-up-text">{item.suggestedFollowUp}</p>
                </div>
              </div>

              {/* Representative Negative Quotes */}
              <div className="representative-quotes-block">
                <h4 className="quotes-heading">Representative negative feedback:</h4>
                <div className="quotes-list">
                  {item.representativeFeedback.slice(0, isExpanded ? 6 : 2).map((quote, qIdx) => (
                    <blockquote key={qIdx} className="negative-quote">
                      <p>"{typeof quote === 'string' ? quote : quote.text}"</p>
                    </blockquote>
                  ))}
                </div>

                {item.representativeFeedback.length > 2 && (
                  <button
                    type="button"
                    className="button text-button expand-quotes-btn"
                    onClick={() => toggleExpand(item.issue)}
                  >
                    {isExpanded ? 'Show fewer quotes' : `Show ${item.representativeFeedback.length - 2} more supporting negative responses`}
                  </button>
                )}
              </div>

              {/* Related Public Requests from the Same Consultation */}
              <div className="linked-requests-block">
                <h4 className="requests-heading">Public requests related to this issue:</h4>
                {hasLinkedRequests ? (
                  <ol className="linked-requests-list">
                    {item.linkedRequests.map((req, rIdx) => (
                      <li key={rIdx} className="linked-request-item">
                        "{req}"
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="linked-request-fallback muted">
                    {item.linkedRequests[0]}
                  </p>
                )}
              </div>

              {/* Actions Footer */}
              <div className="negative-issue-footer">
                {onFilterResponses && item.supportingResponses && item.supportingResponses.length > 0 && (
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => onFilterResponses(`Complaints: ${item.displayTitle}`, item.supportingResponses)}
                  >
                    Filter explorer by this issue ({number(item.negativeCount)} responses)
                  </button>
                )}

                {onOpenIssueModal && (
                  <button
                    type="button"
                    className="button tertiary sm"
                    onClick={() => onOpenIssueModal(item)}
                  >
                    Inspect detailed evidence modal <span aria-hidden="true">↗</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
