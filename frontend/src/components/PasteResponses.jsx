import React from 'react';
import { number } from '../lib/utils.js';

export default function PasteResponses({
  text,
  onTextChange,
  separator,
  onSeparatorChange,
  responseCount,
  characterCount,
  onClear,
  onSubmit,
  busy
}) {
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!busy && responseCount > 0) {
        onSubmit();
      }
    }
  };

  return (
    <div id="pane-paste" role="tabpanel" aria-labelledby="tab-paste">
      <div className="input-caption">
        <label htmlFor="paste-input">Your consultation responses</label>
        <label className="split-control">
          Separate by{' '}
          <select
            id="separator"
            value={separator}
            onChange={(e) => onSeparatorChange(e.target.value)}
            disabled={busy}
          >
            <option value="line">New line</option>
            <option value="paragraph">Blank line</option>
          </select>
        </label>
      </div>
      <textarea
        id="paste-input"
        placeholder="Paste consultation responses here..."
        aria-describedby="paste-help counters"
        spellCheck="true"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
      ></textarea>
      <div className="input-footer">
        <div>
          <p id="counters" aria-live="polite">
            <strong id="response-count">{number(responseCount)}</strong> responses detected{' '}
            <span className="divider-dot">·</span>{' '}
            <span id="character-count">{number(characterCount)}</span> characters
          </p>
          <p id="paste-help" className="small muted">
            {separator === 'paragraph'
              ? 'Separate responses with a blank line. Line breaks within a response are preserved.'
              : 'One response per line. Empty lines are ignored.'}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            id="clear-paste"
            className="button text-button"
            onClick={onClear}
            disabled={busy}
          >
            Clear
          </button>
          <button
            type="button"
            id="analyze-paste"
            className="button primary"
            onClick={onSubmit}
            disabled={busy || responseCount === 0}
          >
            Analyze consultation <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
