import React from 'react';

export default function UrlPane({ onSwitchToCsv }) {
  return (
    <div id="pane-url" className="url-pane" role="tabpanel" aria-labelledby="tab-url">
      <span className="eyebrow">Coming soon</span>
      <h2>Public feedback, directly from its source.</h2>
      <p>
        Support for selected public consultation pages is planned.<br />
        For now, paste responses or upload a CSV. No URL is fetched.
      </p>
      <label>
        Public consultation URL
        <input type="url" placeholder="https://…" disabled />
      </label>
      <button
        type="button"
        id="url-use-csv"
        className="button secondary"
        onClick={onSwitchToCsv}
      >
        Upload a CSV instead <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
