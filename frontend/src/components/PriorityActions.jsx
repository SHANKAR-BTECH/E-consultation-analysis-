import React from 'react';
import { number, title } from '../lib/utils.js';

export default function PriorityActions({ actions = [], onFilterResponses }) {
  if (!actions || actions.length === 0) return null;

  return (
    <section
      id="priority-actions"
      className="priority-actions-container"
      aria-labelledby="priority-actions-title"
    >
      <div className="section-header">
        <div>
          <p className="eyebrow">Administrative Decision Support</p>
          <h2 id="priority-actions-title">Priority actions to review</h2>
          <p className="section-desc">
            The fastest way for an administrator to understand urgent complaints, citizen requests, and recommended follow-up.
          </p>
        </div>
      </div>

      <div className="priority-actions-grid">
        {actions.map((action) => {
          const priorityCls = action.priority === 'HIGH' ? 'priority-high' : 'priority-medium';

          return (
            <div key={action.rank} className={`priority-action-card ${priorityCls}`}>
              <div className="priority-action-top">
                <span className={`badge ${priorityCls}`}>
                  {action.priority} PRIORITY
                </span>
                <span className="action-evidence-count">
                  {number(action.evidenceCount)} responses
                </span>
              </div>

              <h3 className="priority-action-problem">
                {action.rank}. {action.problem}
              </h3>

              <div className="priority-action-detail">
                <span className="action-label">Related Public Request:</span>
                <p className="action-value request-quote">
                  "{action.relatedRequest}"
                </p>
              </div>

              <div className="priority-action-detail">
                <span className="action-label">Suggested Administrative Follow-Up:</span>
                <p className="action-value follow-up-text">
                  {action.suggestedFollowUp}
                </p>
              </div>

              {onFilterResponses && action.supportingResponses && action.supportingResponses.length > 0 && (
                <div className="priority-action-footer">
                  <button
                    type="button"
                    className="button secondary sm action-view-btn"
                    onClick={() => onFilterResponses(`Issue: ${action.problem}`, action.supportingResponses)}
                  >
                    View {number(action.evidenceCount)} supporting responses <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
