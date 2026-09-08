import React, { useEffect, useRef } from 'react';
import { number, percent, title } from '../lib/utils.js';

export default function IssueDialog({
  isOpen,
  issue,
  issueIndex,
  totalResponses,
  onClose,
  onExploreIssue
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  if (!issue) return null;

  const signals = issue.priority?.signals || {};
  const pLevel = (issue.priority?.level || 'low').toLowerCase();

  const signalRows = [
    ['Coverage', percent((signals.coverage || 0) * 100)],
    ['Negative ratio', percent((signals.negative_ratio || 0) * 100)],
    [
      `Coverage contribution (${percent((signals.frequency_weight || 0) * 100)} weight)`,
      `${number(signals.frequency_contribution || 0)} points`
    ],
    [
      `Negative contribution (${percent((signals.negative_weight || 0) * 100)} weight)`,
      `${number(signals.negative_contribution || 0)} points`
    ],
    ['Priority score', `${number(issue.priority?.score || 0)} / 100`]
  ];

  return (
    <dialog
      id="issue-dialog"
      aria-labelledby="issue-title"
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-top">
        <span className="eyebrow">Issue &amp; evidence</span>
        <button
          type="button"
          id="close-issue"
          className="button secondary"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div id="issue-detail">
        <h2 id="issue-title">{issue.issue}</h2>
        <span className={`priority ${pLevel}`}>
          {title(issue.priority?.level || '')} · {number(issue.priority?.score || 0)}
        </span>

        <div className="issue-facts">
          <div>
            <strong>{number(issue.mentions)}</strong>
            <span>Matching responses</span>
          </div>
          <div>
            <strong>{percent((issue.negative_ratio || 0) * 100)}</strong>
            <span>Negative association</span>
          </div>
        </div>

        <h3>Why this priority?</h3>
        <p className="small muted">
          Relative to {number(totalResponses)} valid responses. This is an explainable heuristic, not
          verified severity.
        </p>

        {signalRows.map(([name, val], i) => (
          <div key={i} className="signal-row">
            <span>{name}</span>
            <strong>{val}</strong>
          </div>
        ))}

        <h3>In the original words</h3>
        <p className="small muted">
          Unedited source responses, selected by sentiment, confidence and length.
        </p>

        {issue.representative_feedback?.map((row, i) => (
          <blockquote key={i}>
            {row.text}
            <footer>
              Response {number(row.row_index)} · {title(row.sentiment)} ·{' '}
              {percent(row.confidence * 100)} model confidence
            </footer>
          </blockquote>
        ))}

        <button
          type="button"
          className="button primary"
          data-explore-issue={issueIndex}
          onClick={() => {
            onExploreIssue(issueIndex);
            onClose();
          }}
        >
          Explore matching responses →
        </button>
      </div>
    </dialog>
  );
}
