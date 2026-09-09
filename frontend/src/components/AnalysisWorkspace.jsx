import React from 'react';
import Hero from './Hero.jsx';
import InputTabs from './InputTabs.jsx';
import PasteResponses from './PasteResponses.jsx';
import CsvUpload from './CsvUpload.jsx';
import UrlPane from './UrlPane.jsx';
import { SAMPLE_LABELS } from '../lib/presets.js';

export default function AnalysisWorkspace({
  mode,
  onSelectTab,
  // Paste
  text,
  onTextChange,
  separator,
  onSeparatorChange,
  responseCount,
  characterCount,
  onClearText,
  onSubmitText,
  // CSV
  file,
  inspection,
  mapping,
  metadataColumns,
  onFileSelected,
  onRemoveFile,
  onMappingChange,
  onToggleMetadata,
  onSubmitCsv,
  url,
  onUrlChange,
  onSubmitUrl,
  // Samples
  onSelectSample,
  sampleNote,
  hasResult,
  busy
}) {
  return (
    <section id="workspace" aria-labelledby="workspace-title">
      <Hero />

      <div className="input-workspace">
        <InputTabs mode={mode} onSelectTab={onSelectTab} busy={busy} />

        {mode === 'paste' && (
          <PasteResponses
            text={text}
            onTextChange={onTextChange}
            separator={separator}
            onSeparatorChange={onSeparatorChange}
            responseCount={responseCount}
            characterCount={characterCount}
            onClear={onClearText}
            onSubmit={onSubmitText}
            busy={busy}
          />
        )}

        {mode === 'csv' && (
          <CsvUpload
            file={file}
            inspection={inspection}
            mapping={mapping}
            metadataColumns={metadataColumns}
            onFileSelected={onFileSelected}
            onRemoveFile={onRemoveFile}
            onMappingChange={onMappingChange}
            onToggleMetadata={onToggleMetadata}
            onSubmit={onSubmitCsv}
            busy={busy}
          />
        )}

        {mode === 'url' && (
          <UrlPane onSwitchToCsv={() => onSelectTab('csv')} url={url}
            onUrlChange={onUrlChange} onSubmit={onSubmitUrl} busy={busy} />
        )}
      </div>

      <div className="samples">
        <span>Try an illustrative sample</span>
        {Object.entries(SAMPLE_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-sample={key}
            onClick={() => onSelectSample(key)}
            disabled={busy}
          >
            {label}
          </button>
        ))}
      </div>

      {sampleNote && <p id="sample-note" className="small muted">{sampleNote}</p>}

      {!hasResult && (
        <div id="empty-state" className="workspace-foot">
          <p>No consultation analyzed yet.</p>
          <p>
            Paste responses or upload a CSV to begin.
            <span> English-language prototype · Original evidence retained</span>
          </p>
        </div>
      )}
    </section>
  );
}
