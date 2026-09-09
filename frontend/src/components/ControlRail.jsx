import React from 'react';
import { PRESETS, PRESET_METADATA } from '../lib/presets.js';

export default function ControlRail({
  activeTab,
  onSelectTab,
  onSelectPreset,
  busy
}) {
  return (
    <aside className="control-rail" aria-label="Input Configuration Rail">
      <div className="rail-header">
        <span className="rail-eyebrow">INPUT WORKSPACE</span>
        <h2 className="rail-title">Source Modality</h2>
        <p className="rail-sub">Select how feedback data enters the analysis pipeline.</p>
      </div>

      <div className="mode-selector" role="tablist" aria-label="Ingestion modes">
        <button
          type="button"
          role="tab"
          id="tab-paste"
          aria-selected={activeTab === 'paste'}
          className={`mode-tab ${activeTab === 'paste' ? 'active' : ''}`}
          onClick={() => onSelectTab('paste')}
          disabled={busy}
        >
          <span className="mode-icon">¶</span>
          <div className="mode-text">
            <span className="mode-title">Paste Submissions</span>
            <span className="mode-desc">Direct text entries, 1 per line</span>
          </div>
          {activeTab === 'paste' && <span className="mode-badge">Active</span>}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-csv"
          aria-selected={activeTab === 'csv'}
          className={`mode-tab ${activeTab === 'csv' ? 'active' : ''}`}
          onClick={() => onSelectTab('csv')}
          disabled={busy}
        >
          <span className="mode-icon">⊞</span>
          <div className="mode-text">
            <span className="mode-title">Batch CSV Ingestion</span>
            <span className="mode-desc">Structured dataset with column map</span>
          </div>
          {activeTab === 'csv' && <span className="mode-badge">Active</span>}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-excel"
          aria-selected={activeTab === 'excel'}
          className={`mode-tab ${activeTab === 'excel' ? 'active' : ''}`}
          onClick={() => onSelectTab('excel')}
          disabled={busy}
        >
          <span className="mode-icon">⊟</span>
          <div className="mode-text">
            <span className="mode-title">Excel Workbook Upload</span>
            <span className="mode-desc">.xlsx with sheet & column map</span>
          </div>
          {activeTab === 'excel' && <span className="mode-badge">Active</span>}
        </button>
      </div>

      <div className="rail-card">
        <span className="card-kicker">CURATED CASE STUDIES</span>
        <h3 className="card-heading">Demonstration Datasets</h3>
        <p className="card-caption">
          Load verified representative citizen feedback across core policy areas:
        </p>
        <div className="scenario-buttons">
          {Object.entries(PRESET_METADATA).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              className="scenario-pill"
              onClick={() => onSelectPreset(key)}
              disabled={busy}
              title={meta.desc}
            >
              <span className="sc-dot" />
              <span className="sc-name">{meta.label}</span>
              <span className="sc-count">{meta.count} rows</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rail-card">
        <span className="card-kicker">ENGINE TELEMETRY & SPECS</span>
        <div className="telemetry-rows">
          <div className="telem-row">
            <span className="telem-label">Classification Model</span>
            <span className="telem-val">TF-IDF + Multinomial NB</span>
          </div>
          <div className="telem-row">
            <span className="telem-label">Max Responses</span>
            <span className="telem-val">2,000 records / run</span>
          </div>
          <div className="telem-row">
            <span className="telem-label">File Size Limit</span>
            <span className="telem-val">1.0 MB CSV · 10 MB XLSX</span>
          </div>
          <div className="telem-row">
            <span className="telem-label">Ingestion Encoding</span>
            <span className="telem-val">UTF-8 Normalized</span>
          </div>
        </div>
      </div>

      <div className="rail-footnote">
        <div className="academic-mark">ACADEMIC RESEARCH PROTOTYPE</div>
        E-Consultation Feedback Sentiment Analysis using NLP & Machine Learning.
      </div>
    </aside>
  );
}
