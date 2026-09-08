import React from 'react';

export default function InputTabs({ mode, onSelectTab, busy }) {
  return (
    <div className="input-tabs" role="tablist" aria-label="Response source">
      <button
        id="tab-paste"
        role="tab"
        aria-selected={mode === 'paste'}
        aria-controls="pane-paste"
        tabIndex={mode === 'paste' ? 0 : -1}
        onClick={() => !busy && onSelectTab('paste')}
      >
        Paste responses
      </button>
      <button
        id="tab-csv"
        role="tab"
        aria-selected={mode === 'csv'}
        aria-controls="pane-csv"
        tabIndex={mode === 'csv' ? 0 : -1}
        onClick={() => !busy && onSelectTab('csv')}
      >
        Upload CSV
      </button>
      <button
        id="tab-url"
        role="tab"
        aria-selected={mode === 'url'}
        aria-controls="pane-url"
        tabIndex={mode === 'url' ? 0 : -1}
        onClick={() => !busy && onSelectTab('url')}
      >
        Public URL <span className="soon">Coming soon</span>
      </button>
    </div>
  );
}
