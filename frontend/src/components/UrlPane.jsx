import React from 'react';

export default function UrlPane({ onSwitchToCsv, url, onUrlChange, onSubmit, busy }) {
  return (
    <div id="pane-url" className="url-pane" role="tabpanel" aria-labelledby="tab-url">
      <span className="eyebrow">Supported public sources</span>
      <h2>Public feedback, directly from its source.</h2>
      <p>
        Analyze published text responses from supported MyGov discussion pages.<br />
        Incomplete collections, response attachments and restricted pages require a CSV export.
      </p>
      <label>
        Public consultation URL
        <input type="url" placeholder="https://www.mygov.in/group-issue/…"
          value={url} onChange={(event) => onUrlChange(event.target.value)}
          maxLength={2048} disabled={busy} />
      </label>
      <button type="button" id="analyze-url" className="button primary"
        onClick={onSubmit} disabled={busy || !url?.trim()}>
        Analyze consultation <span aria-hidden="true">→</span>
      </button>
      <button
        type="button"
        id="url-use-csv"
        className="button secondary"
        onClick={onSwitchToCsv}
        disabled={busy}
      >
        Upload a CSV instead <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
