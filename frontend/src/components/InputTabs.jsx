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
        id="tab-excel"
        role="tab"
        aria-selected={mode === 'excel'}
        aria-controls="pane-excel"
        tabIndex={mode === 'excel' ? 0 : -1}
        onClick={() => !busy && onSelectTab('excel')}
      >
        Upload Excel
      </button>
    </div>
  );
}
