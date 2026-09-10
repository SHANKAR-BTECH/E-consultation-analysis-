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
        id="tab-excel"
        role="tab"
        aria-selected={mode === 'excel'}
        aria-controls="pane-excel"
        tabIndex={mode === 'excel' ? 0 : -1}
        onClick={() => !busy && onSelectTab('excel')}
      >
        Upload Excel
      </button>
      <button
        id="tab-pdf"
        role="tab"
        aria-selected={mode === 'pdf'}
        aria-controls="pane-pdf"
        tabIndex={mode === 'pdf' ? 0 : -1}
        onClick={() => !busy && onSelectTab('pdf')}
      >
        Upload PDF
      </button>
    </div>
  );
}