import React from 'react';
import { number } from '../lib/utils.js';

export default function ErrorToast({ error, onDismiss }) {
  if (!error) return null;

  const rejected = Array.isArray(error.details?.rejected) ? error.details.rejected : [];

  return (
    <div className="action-error-toast" role="alert" tabIndex="-1">
      <div className="toast-header">
        <div className="toast-title-group">
          <span className="toast-icon" aria-hidden="true">✕</span>
          <strong>Analysis Input Error</strong>
        </div>
        <button
          type="button"
          className="btn-toast-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          Dismiss
        </button>
      </div>

      <div className="toast-body">
        <p className="toast-message">{error.message || 'Please check your inputs and try again.'}</p>
        {rejected.length > 0 && (
          <div className="toast-rejected-list">
            <span className="rejected-label">Validation issues:</span>
            <ul>
              {rejected.slice(0, 5).map((row, i) => (
                <li key={i}>
                  Response {row.row_index}: {row.message}
                </li>
              ))}
              {rejected.length > 5 && (
                <li>…and {number(rejected.length - 5)} more rejected rows.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
