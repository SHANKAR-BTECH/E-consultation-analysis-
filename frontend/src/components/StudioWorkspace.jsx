import React from 'react';
import ControlRail from './ControlRail.jsx';
import MainWorkbench from './MainWorkbench.jsx';

export default function StudioWorkspace({
  activeTab,
  onSelectTab,
  onSelectPreset,
  // Text Pane
  text,
  onChangeText,
  separator,
  onChangeSeparator,
  responseCount,
  characterCount,
  sampleNote,
  onClearText,
  onSubmitText,
  // CSV Pane
  file,
  inspection,
  mapping,
  metadataColumns,
  onFileSelected,
  onRemoveFile,
  onUpdateMapping,
  onToggleMetadataColumn,
  onSubmitCsv,
  // Shared
  busy
}) {
  return (
    <section className="studio-workspace" id="workspace" aria-label="Consultation Studio">
      <div className="studio-grid">
        <ControlRail
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          onSelectPreset={onSelectPreset}
          busy={busy}
        />
        <MainWorkbench
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          text={text}
          onChangeText={onChangeText}
          separator={separator}
          onChangeSeparator={onChangeSeparator}
          responseCount={responseCount}
          characterCount={characterCount}
          sampleNote={sampleNote}
          onClearText={onClearText}
          onSubmitText={onSubmitText}
          file={file}
          inspection={inspection}
          mapping={mapping}
          metadataColumns={metadataColumns}
          onFileSelected={onFileSelected}
          onRemoveFile={onRemoveFile}
          onUpdateMapping={onUpdateMapping}
          onToggleMetadataColumn={onToggleMetadataColumn}
          onSubmitCsv={onSubmitCsv}
          busy={busy}
        />
      </div>
    </section>
  );
}
