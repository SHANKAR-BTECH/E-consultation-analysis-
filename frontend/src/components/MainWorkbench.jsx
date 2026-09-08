import React from 'react';
import TextPane from './TextPane.jsx';
import CsvPane from './CsvPane.jsx';
import UrlPane from './UrlPane.jsx';

export default function MainWorkbench({
  activeTab,
  onSelectTab,
  // Text pane props
  text,
  onChangeText,
  separator,
  onChangeSeparator,
  responseCount,
  characterCount,
  sampleNote,
  onClearText,
  onSubmitText,
  // CSV pane props
  file,
  inspection,
  mapping,
  metadataColumns,
  onFileSelected,
  onRemoveFile,
  onUpdateMapping,
  onToggleMetadataColumn,
  onSubmitCsv,
  // General
  busy
}) {
  return (
    <main className="main-workbench" role="main">
      <div className="workbench-bar">
        <div className="workbench-title-group">
          <span className="active-badge">
            {activeTab === 'paste'
              ? 'ACTIVE CANVAS: DIRECT TEXT SUBMISSION'
              : activeTab === 'csv'
              ? 'ACTIVE CANVAS: STRUCTURED CSV INGESTION'
              : 'CANVAS: PORTAL INTEGRATION'}
          </span>
          <h1 className="active-canvas-title">
            {activeTab === 'paste'
              ? 'Public Consultation Response Studio'
              : activeTab === 'csv'
              ? 'Batch Dataset Column Mapping & Audit'
              : 'Public Consultation Web Harvester'}
          </h1>
        </div>

        <div className="workbench-tools">
          {activeTab === 'paste' && (
            <span className="hotkey-pill">
              Run: <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
            </span>
          )}
        </div>
      </div>

      {activeTab === 'paste' && (
        <TextPane
          text={text}
          onChangeText={onChangeText}
          separator={separator}
          onChangeSeparator={onChangeSeparator}
          responseCount={responseCount}
          characterCount={characterCount}
          sampleNote={sampleNote}
          onClear={onClearText}
          onSubmit={onSubmitText}
          busy={busy}
        />
      )}

      {activeTab === 'csv' && (
        <CsvPane
          file={file}
          inspection={inspection}
          mapping={mapping}
          metadataColumns={metadataColumns}
          onFileSelected={onFileSelected}
          onRemoveFile={onRemoveFile}
          onUpdateMapping={onUpdateMapping}
          onToggleMetadataColumn={onToggleMetadataColumn}
          onSubmit={onSubmitCsv}
          busy={busy}
        />
      )}

      {activeTab === 'url' && (
        <UrlPane
          onSwitchToCsv={() => onSelectTab('csv')}
          busy={busy}
        />
      )}
    </main>
  );
}
