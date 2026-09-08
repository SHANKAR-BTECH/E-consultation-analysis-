import React from 'react';
import { number } from '../lib/utils.js';

export default function ActionError({ error, onDismiss }) {
  if (!error) return null;

  const rejected = Array.isArray(error.details?.rejected) ? error.details.rejected : [];

  return (
    <div id="action-error" className="notice error" role="alert" tabIndex="-1">
      <div>
        <strong>We couldn’t analyze this dataset.</strong>
        <p id="error-message">{error.message || 'Please try again.'}</p>
        {rejected.length > 0 && (
          <ul id="error-details">
            {rejected.slice(0, 20).map((row, i) => (
              <li key={i}>
                Response {row.row_index}: {row.message}
              </li>
            ))}
            {rejected.length > 20 && (
              <li>{number(rejected.length - 20)} more responses were rejected.</li>
            )}
          </ul>
        )}
      </div>
      <button
        type="button"
        id="dismiss-error"
        className="button text-button"
        aria-label="Dismiss error"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
