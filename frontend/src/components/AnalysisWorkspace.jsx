import React from 'react';
import Hero from './Hero.jsx';
import DomainSelector from './DomainSelector.jsx';
import InputTabs from './InputTabs.jsx';
import PasteResponses from './PasteResponses.jsx';
import PdfUpload from './PdfUpload.jsx';
import ExcelUpload from './ExcelUpload.jsx';
import { SAMPLE_LABELS } from '../lib/presets.js';

export default function AnalysisWorkspace({
  domain,
  onSelectDomain,
  domainLocked,
  domainRelevance,
  onSwitchDomain,
  onResetConsultation,
  mode,
  onSelectTab,
  analysisMode,
  onSetAnalysisMode,
  // Paste
  text,
  onTextChange,
  separator,
  onSeparatorChange,
  responseCount,
  characterCount,
  onClearText,
  onSubmitText,
  // PDF
  pdfFiles,
  onPdfFilesSelected,
  onRemovePdfFile,
  onSubmitPdf,
  // Excel
  excelFiles,
  onExcelFilesSelected,
  onExcelSheetChange,
  onRemoveExcelFile,
  onExcelMappingChange,
  onToggleExcelMetadata,
  onSubmitExcel,
  // Samples
  onSelectSample,
  sampleNote,
  hasResult,
  busy
}) {
  const activeFileCount = mode === 'pdf' ? (pdfFiles?.length || 0) : mode === 'excel' ? (excelFiles?.length || 0) : 0;

  return (
    <section id="workspace" aria-labelledby="workspace-title">
      <Hero />

      <div className="input-workspace">
        {/* Step 1: Policy Domain Selection */}
        <DomainSelector
          selectedDomain={domain}
          onSelectDomain={onSelectDomain}
          isLocked={domainLocked}
          fileCount={activeFileCount}
          inputFormat={mode}
          domainRelevance={domainRelevance}
          onResetConsultation={onResetConsultation}
          busy={busy}
        />

        {/* Step 2: Format Choice */}
        <InputTabs mode={mode} onSelectTab={onSelectTab} busy={busy} />

        {mode === 'paste' && (
          <PasteResponses
            text={text}
            onTextChange={onTextChange}
            separator={separator}
            onSeparatorChange={onSeparatorChange}
            responseCount={responseCount}
            characterCount={characterCount}
            domain={domain}
            domainRelevance={domainRelevance}
            onSwitchDomain={onSwitchDomain}
            onClear={onClearText}
            onSubmit={onSubmitText}
            busy={busy}
          />
        )}

        {mode === 'pdf' && (
          <PdfUpload
            files={pdfFiles}
            domain={domain}
            analysisMode={analysisMode}
            domainRelevance={domainRelevance}
            onSwitchDomain={onSwitchDomain}
            onSetAnalysisMode={onSetAnalysisMode}
            onFilesSelected={onPdfFilesSelected}
            onRemoveFile={onRemovePdfFile}
            onSubmit={onSubmitPdf}
            busy={busy}
          />
        )}

        {mode === 'excel' && (
          <ExcelUpload
            files={excelFiles}
            domain={domain}
            analysisMode={analysisMode}
            domainRelevance={domainRelevance}
            onSwitchDomain={onSwitchDomain}
            onSetAnalysisMode={onSetAnalysisMode}
            onFilesSelected={onExcelFilesSelected}
            onSheetChange={onExcelSheetChange}
            onRemoveFile={onRemoveExcelFile}
            onMappingChange={onExcelMappingChange}
            onToggleMetadata={onToggleExcelMetadata}
            onSubmit={onSubmitExcel}
            busy={busy}
          />
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
            Select a domain, then upload PDF documents or Excel workbooks to begin.
            <span> English-language prototype · Original evidence retained</span>
          </p>
        </div>
      )}
    </section>
  );
}
