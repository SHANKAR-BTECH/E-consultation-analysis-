import React from 'react';
import { number } from '../lib/utils.js';

export default function TextPane({
  text,
  onChangeText,
  separator,
  onChangeSeparator,
  responseCount,
  characterCount,
  sampleNote,
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
    <div className="canvas-pane active" id="pane-paste" role="tabpanel" aria-labelledby="tab-paste">
      <div className="editor-frame">
        <div className="editor-header">
          <div className="editor-title-group">
            <span className="editor-tag">STUDIO EDITOR</span>
            <span className="editor-helper">
              {separator === 'paragraph'
                ? 'Separated by blank lines (paragraph mode).'
                : '1 consultation response per line.'}
            </span>
          </div>
          <div className="editor-actions">
            <label className="separator-select-label">
              <span>Separator:</span>
              <select
                value={separator}
                onChange={(e) => onChangeSeparator(e.target.value)}
                disabled={busy}
                className="select-micro"
              >
                <option value="line">New Line</option>
                <option value="paragraph">Blank Line</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-micro danger"
              onClick={onClear}
              disabled={busy || !text}
              title="Clear all editor contents"
            >
              Clear Editor
            </button>
          </div>
        </div>

        {sampleNote && (
          <div className="sample-banner-note">
            <span className="note-pin">ℹ</span>
            <span>{sampleNote}</span>
          </div>
        )}

        <div className="editor-surface">
          <textarea
            id="paste-input"
            className="studio-textarea"
            placeholder="Paste citizen feedback or consultation responses here...&#10;&#10;e.g.&#10;The newly introduced bus schedule is frequent and clean. Public transit staff were helpful.&#10;The online permit portal crashed repeatedly and nobody answered my complaint.&#10;Route 42 was rerouted without sufficient public notice. Waiting times increased significantly."
            value={text}
            onChange={(e) => onChangeText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            spellCheck="true"
            aria-label="Consultation response text input"
          />
        </div>

        <div className="workbench-dock">
          <div className="dock-telemetry">
            <div className="dock-stat">
              <span className="stat-num">{number(responseCount)}</span>
              <span className="stat-unit">responses detected</span>
            </div>
            <span className="dock-sep">·</span>
            <div className="dock-stat">
              <span className="stat-num">{number(characterCount)}</span>
              <span className="stat-unit">characters</span>
            </div>
            <span className="dock-sep">·</span>
            <span className="dock-hint">Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to execute</span>
          </div>

          <div className="dock-actions">
            <button
              type="button"
              id="analyze-paste"
              className="btn-primary-action"
              onClick={onSubmit}
              disabled={busy || responseCount === 0}
            >
              <span>Analyze Consultation</span>
              <span className="action-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
