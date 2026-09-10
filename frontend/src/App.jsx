import React, { useState, useEffect, useMemo } from 'react';
import Header from './components/Header.jsx';
import AnalysisWorkspace from './components/AnalysisWorkspace.jsx';
import ProcessingSection from './components/ProcessingSection.jsx';
import ActionError from './components/ActionError.jsx';
import ResultsSection from './components/ResultsSection.jsx';
import AboutSection from './components/AboutSection.jsx';
import HelpSection from './components/HelpSection.jsx';
import Footer from './components/Footer.jsx';
import IssueDialog from './components/IssueDialog.jsx';
import ConsultationHistory from './components/ConsultationHistory.jsx';
import {
  checkHealth,
  analyzeResponses,
  inspectPdfFile,
  analyzePdf,
  inspectExcelFile,
  analyzeExcel,
  APIError
} from './lib/api.js';
import { parseResponses } from './lib/utils.js';
import { SAMPLES, SAMPLE_LABELS } from './lib/presets.js';
import { findLikelyFeedbackColumn, findLikelySheet } from './lib/excelValidation.js';
import { evaluateDomainRelevance } from './lib/domainConfig.js';

const LIMITS = {
  maxResponses: 2000,
  maxCharacters: 500000,
  maxPdfBytes: 10485760, // 10MB
  maxExcelBytes: 10485760 // 10MB
};

export default function App() {
  const [view, setView] = useState('workspace'); // 'workspace' | 'results' | 'history'
  const [busy, setBusy] = useState(false);
  const [systemReady, setSystemReady] = useState(false);
  const [systemError, setSystemError] = useState(null);
  const [error, setError] = useState(null);

  // Policy Domain State (Step 1)
  const [domain, setDomain] = useState('Transport');

  // Ingestion mode (Step 2)
  const [mode, setMode] = useState('paste'); // 'paste' | 'pdf' | 'excel'

  // Analysis Mode ('together' vs 'separate')
  const [analysisMode, setAnalysisMode] = useState('together');

  // Text state
  const [text, setText] = useState('');
  const [separator, setSeparator] = useState('line');
  const [sampleNote, setSampleNote] = useState(null);
  const [source, setSource] = useState('Pasted responses');

  // Multi-PDF state
  const [pdfFiles, setPdfFiles] = useState([]); // Array of { file, inspection, error }

  // Multi-Excel state
  const [excelFiles, setExcelFiles] = useState([]); // Array of { file, inspection, sheets, sheet, mapping, metadataColumns, error }

  // Result state
  const [analysisResult, setAnalysisResult] = useState(null);
  const [historyKey, setHistoryKey] = useState(0);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeIssueIndex, setActiveIssueIndex] = useState(null);
  const [exploreCallback, setExploreCallback] = useState(null);

  const rows = parseResponses(text, separator);
  const responseCount = rows.length;
  const characterCount = [...text].length;

  // Domain locking rule: locked once files are present in the current consultation
  const domainLocked = Boolean(
    (mode === 'pdf' && pdfFiles.length > 0) ||
    (mode === 'excel' && excelFiles.length > 0)
  );

  // Real-time domain relevance evaluation across uploaded files / pasted text
  const domainRelevance = useMemo(() => {
    if (mode === 'pdf' && pdfFiles.length > 0) {
      const previews = pdfFiles.flatMap((f) => f.inspection?.preview || []);
      if (previews.length > 0) {
        return evaluateDomainRelevance(previews, domain);
      }
    } else if (mode === 'excel' && excelFiles.length > 0) {
      const serverRelevance = excelFiles.find((f) => f.inspection?.domain_relevance)?.inspection?.domain_relevance;
      if (serverRelevance && serverRelevance.selected_domain === domain) {
        return {
          isClearlyUnrelated: serverRelevance.is_clearly_unrelated,
          status: serverRelevance.status,
          selectedDomain: serverRelevance.selected_domain,
          suggestedDomain: serverRelevance.suggested_domain,
          message: serverRelevance.message
        };
      }
      const previews = excelFiles.flatMap((f) => f.inspection?.preview || []);
      if (previews.length > 0) {
        return evaluateDomainRelevance(previews, domain);
      }
    } else if (mode === 'paste' && rows.length > 0) {
      return evaluateDomainRelevance(rows, domain);
    }
    return null;
  }, [mode, pdfFiles, excelFiles, rows, domain]);

  const handleSwitchDomain = (newDomain) => {
    if (!newDomain) return;
    setDomain(newDomain);
    setError(null);
  };

  // Check health on mount
  useEffect(() => {
    async function verify() {
      try {
        const health = await checkHealth();
        if (health && health.model_loaded) {
          setSystemReady(true);
          setSystemError(null);
        } else {
          throw new Error(
            'The saved model is unavailable. Please restart the server after checking its artifacts.'
          );
        }
      } catch (err) {
        setSystemReady(false);
        setSystemError(err.message || 'Service unavailable');
      }
    }
    verify();
  }, []);

  // Sync view with URL hash
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#consultation-history') {
        setView('history');
        setError(null);
        setDialogOpen(false);
      } else if (hash === '#workspace' || hash === '' || hash === '#analysis') {
        setView('workspace');
        setError(null);
        setDialogOpen(false);
      }
    };
    window.addEventListener('hashchange', handleHash);
    if (window.location.hash === '#consultation-history') {
      setView('history');
    }
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleSelectDomain = (newDomain) => {
    if (domainLocked) {
      setError(
        new APIError(
          `This consultation is for ${domain}. Start a new consultation to analyze feedback from another domain.`
        )
      );
      return;
    }
    setDomain(newDomain);
    setError(null);
  };

  const handleSelectTab = (newMode) => {
    if (busy) return;
    if (newMode === mode) return;

    // Strict format separation rule
    if (mode === 'pdf' && pdfFiles.length > 0 && newMode !== 'pdf') {
      setError(
        new APIError(
          `This consultation is currently in PDF format for ${domain}. PDF and Excel cannot be mixed in one consultation. Remove the PDF files or start a new consultation.`
        )
      );
      return;
    }
    if (mode === 'excel' && excelFiles.length > 0 && newMode !== 'excel') {
      setError(
        new APIError(
          `This consultation is currently in Excel format for ${domain}. PDF and Excel cannot be mixed in one consultation. Remove the Excel workbooks or start a new consultation.`
        )
      );
      return;
    }

    setMode(newMode);
    setError(null);
  };

  const handleSelectSample = (name) => {
    if (busy) return;
    const sampleRows = SAMPLES[name] || [];
    setMode('paste');
    setText(sampleRows.join('\n'));
    setSeparator('line');
    setSource(`Illustrative sample · ${SAMPLE_LABELS[name]}`);
    setSampleNote(
      `Illustrative ${SAMPLE_LABELS[name]} inputs, not verified citizen submissions. All results will be calculated by the analysis service.`
    );
    setError(null);
  };

  const handleTextChange = (val) => {
    setText(val);
    setSource('Pasted responses');
    setSampleNote(null);
    setError(null);
  };

  const handleClearText = () => {
    setText('');
    setSource('Pasted responses');
    setSampleNote(null);
    setError(null);
  };

  const handleSubmitText = async () => {
    if (busy) return;
    setError(null);

    try {
      if (!rows.length) {
        throw new APIError('Paste at least one response or choose an illustrative sample.');
      }
      if (rows.length > LIMITS.maxResponses) {
        throw new APIError(
          `Use at most ${LIMITS.maxResponses.toLocaleString('en-IN')} responses per analysis.`
        );
      }
      if (characterCount > LIMITS.maxCharacters) {
        throw new APIError(
          `The combined responses exceed ${LIMITS.maxCharacters.toLocaleString('en-IN')} characters.`
        );
      }

      setBusy(true);
      const data = await analyzeResponses(rows, domain);

      if (!data.total_responses) {
        throw new APIError('No valid responses were available for analysis.');
      }

      data.domain = domain;
      setAnalysisResult(data);
      setView('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(
        err instanceof APIError
          ? err
          : new APIError(
              'The results could not be displayed. Your inputs are still available; please try again.'
            )
      );
    } finally {
      setBusy(false);
    }
  };

  // --- Multi-PDF Handlers ---

  const handlePdfFilesSelected = async (selected) => {
    if (!selected || busy) return;
    setError(null);

    const fileList = Array.isArray(selected) ? selected : [selected];
    const newItems = [];

    for (const f of fileList) {
      if (!f.name.toLowerCase().endsWith('.pdf')) {
        setError(new APIError(`"${f.name}" is not a PDF file. Choose files with a .pdf extension.`));
        return;
      }
      if (f.size > LIMITS.maxPdfBytes) {
        setError(new APIError(`"${f.name}" exceeds the 10 MB limit.`));
        return;
      }
      // Avoid duplicate filenames
      if (pdfFiles.some((item) => item.file.name === f.name)) {
        continue;
      }
      newItems.push({ file: f, inspection: null, error: null });
    }

    if (!newItems.length) return;

    setPdfFiles((prev) => [...prev, ...newItems]);
    setBusy(true);

    try {
      for (const item of newItems) {
        try {
          const insp = await inspectPdfFile(item.file);
          setPdfFiles((prev) =>
            prev.map((p) => (p.file.name === item.file.name ? { ...p, inspection: insp, error: null } : p))
          );
        } catch (err) {
          setError(err instanceof APIError ? err : new APIError(err.message));
          setPdfFiles((prev) => prev.filter((p) => p.file.name !== item.file.name));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePdfFile = (index) => {
    setError(null);
    if (index === undefined) {
      setPdfFiles([]);
    } else {
      setPdfFiles((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmitPdf = async () => {
    if (busy || !pdfFiles.length) return;
    setError(null);

    const validFiles = pdfFiles.filter((p) => p.inspection && !p.error);
    if (!validFiles.length) {
      setError(new APIError('No valid PDF files ready for analysis. Please check uploaded documents.'));
      return;
    }

    setBusy(true);
    const fileObjects = validFiles.map((p) => p.file);
    const pdfSource =
      validFiles.length === 1
        ? `PDF · ${validFiles[0].file.name}`
        : `${domain} Consultation · ${validFiles.length} PDF files (${validFiles.map((f) => f.file.name).join(', ')})`;
    setSource(pdfSource);

    try {
      const data = await analyzePdf(fileObjects, domain, analysisMode);
      if (!data.total_responses) {
        throw new APIError('No valid responses were available for analysis.');
      }

      data.domain = domain;
      setAnalysisResult(data);
      setView('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(
        err instanceof APIError
          ? err
          : new APIError(
              'The results could not be displayed. Your inputs are still available; please try again.'
            )
      );
    } finally {
      setBusy(false);
    }
  };

  // --- Multi-Excel Handlers ---

  const handleExcelFilesSelected = async (selected) => {
    if (!selected || busy) return;
    setError(null);

    const fileList = Array.isArray(selected) ? selected : [selected];
    const newItems = [];

    for (const f of fileList) {
      if (!f.name.toLowerCase().endsWith('.xlsx')) {
        setError(new APIError(`"${f.name}" is not an Excel workbook. Choose files with a .xlsx extension.`));
        return;
      }
      if (f.size > LIMITS.maxExcelBytes) {
        setError(new APIError(`"${f.name}" exceeds the 10 MB limit.`));
        return;
      }
      if (excelFiles.some((item) => item.file.name === f.name)) {
        continue;
      }
      newItems.push({
        file: f,
        inspection: null,
        sheets: [],
        sheet: '',
        mapping: { text_column: '', date_column: '', category_column: '', id_column: '', source_column: '' },
        metadataColumns: [],
        error: null
      });
    }

    if (!newItems.length) return;

    setExcelFiles((prev) => [...prev, ...newItems]);
    setBusy(true);

    try {
      for (const item of newItems) {
        try {
          let insp = await inspectExcelFile(item.file, '', domain);
          const sheets = insp.sheets || [];
          const targetSheet = findLikelySheet(sheets);
          if (targetSheet && targetSheet !== (sheets[0] || '')) {
            insp = await inspectExcelFile(item.file, targetSheet, domain);
          }
          const autoTextCol = findLikelyFeedbackColumn(insp.columns, insp.suggested_mapping?.text_column);
          setExcelFiles((prev) =>
            prev.map((p) =>
              p.file.name === item.file.name
                ? {
                    ...p,
                    inspection: insp,
                    sheets,
                    sheet: targetSheet || sheets[0] || '',
                    mapping: {
                      text_column: autoTextCol,
                      date_column: insp.suggested_mapping?.date_column || '',
                      category_column: insp.suggested_mapping?.category_column || '',
                      id_column: '',
                      source_column: ''
                    },
                    error: null
                  }
                : p
            )
          );
        } catch (err) {
          setError(err instanceof APIError ? err : new APIError(err.message));
          setExcelFiles((prev) => prev.filter((p) => p.file.name !== item.file.name));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleExcelSheetChange = async (sheet, index = 0) => {
    const target = excelFiles[index];
    if (!target || busy) return;
    setError(null);
    setBusy(true);

    try {
      const insp = await inspectExcelFile(target.file, sheet, domain);
      const autoTextCol = findLikelyFeedbackColumn(insp.columns, insp.suggested_mapping?.text_column);
      setExcelFiles((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                sheet,
                inspection: insp,
                mapping: {
                  ...item.mapping,
                  text_column: autoTextCol,
                  date_column: insp.suggested_mapping?.date_column || '',
                  category_column: insp.suggested_mapping?.category_column || ''
                }
              }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof APIError ? err : new APIError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleExcelMappingChange = (field, value, index = 0) => {
    setExcelFiles((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, mapping: { ...item.mapping, [field]: value } } : item
      )
    );
  };

  const handleToggleExcelMetadata = (col, index = 0) => {
    setExcelFiles((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              metadataColumns: item.metadataColumns.includes(col)
                ? item.metadataColumns.filter((c) => c !== col)
                : [...item.metadataColumns, col]
            }
          : item
      )
    );
  };

  const handleRemoveExcelFile = (index) => {
    setError(null);
    if (index === undefined) {
      setExcelFiles([]);
    } else {
      setExcelFiles((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmitExcel = async () => {
    if (busy || !excelFiles.length) return;
    setError(null);

    // Validate that every workbook has a valid feedback column configured
    for (const f of excelFiles) {
      if (!f.inspection) {
        setError(new APIError(`Workbook "${f.file.name}" is still being inspected.`));
        return;
      }
      if (!f.mapping.text_column) {
        setError(new APIError(`Select the feedback column for "${f.file.name}" before analyzing.`));
        return;
      }
    }

    setBusy(true);
    const excelSource =
      excelFiles.length === 1
        ? `Excel · ${excelFiles[0].file.name}`
        : `${domain} Consultation · ${excelFiles.length} Excel workbooks (${excelFiles.map((f) => f.file.name).join(', ')})`;
    setSource(excelSource);

    const fileObjects = excelFiles.map((x) => x.file);
    const fileConfigs = excelFiles.map((x) => ({
      filename: x.file.name,
      sheet: x.sheet,
      text_column: x.mapping.text_column,
      date_column: x.mapping.date_column,
      category_column: x.mapping.category_column
    }));

    try {
      const data = await analyzeExcel(
        fileObjects,
        excelFiles[0].mapping,
        excelFiles[0].metadataColumns,
        excelFiles[0].sheet,
        domain,
        analysisMode,
        fileConfigs
      );

      if (!data.total_responses) {
        throw new APIError('No valid responses were available for analysis.');
      }

      data.domain = domain;
      setAnalysisResult(data);
      setView('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(
        err instanceof APIError
          ? err
          : new APIError(
              'The results could not be displayed. Your inputs are still available; please try again.'
            )
      );
    } finally {
      setBusy(false);
    }
  };

  // Navigation handlers
  const handleShowWorkspace = () => {
    if (busy) return;
    setView('workspace');
    setError(null);
    setDialogOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNewAnalysis = () => {
    if (busy) return;
    handleClearText();
    handleRemovePdfFile();
    handleRemoveExcelFile();
    setDomain('Transport');
    setAnalysisMode('together');
    setAnalysisResult(null);
    setView('workspace');
    setError(null);
    setDialogOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenIssue = (index, onExplore) => {
    setActiveIssueIndex(index);
    setExploreCallback(() => onExplore);
    setDialogOpen(true);
  };

  const handleExploreFromDialog = (idx) => {
    if (exploreCallback) {
      exploreCallback(idx);
    }
  };

  const activeIssue =
    activeIssueIndex !== null && analysisResult?.issues
      ? analysisResult.issues[activeIssueIndex]
      : null;

  return (
    <>
      <a className="skip-link" href="#workspace">
        Skip to analysis
      </a>

      <Header
        systemReady={systemReady}
        systemError={systemError}
        onReset={handleShowWorkspace}
        view={view}
        onHistory={() => {
          if (!busy) {
            setHistoryKey((k) => k + 1);
            setView('history');
            setError(null);
            setDialogOpen(false);
          }
        }}
      />

      <main className="container">
        <noscript>
          <p className="notice error">
            JavaScript is needed to submit responses and explore results. Please enable it and reload.
          </p>
        </noscript>

        {systemError && (
          <p id="system-error" className="notice error" role="alert">
            {systemError}
          </p>
        )}

        {view === 'workspace' && !busy && (
          <AnalysisWorkspace
            domain={domain}
            onSelectDomain={handleSelectDomain}
            domainLocked={domainLocked}
            domainRelevance={domainRelevance}
            onSwitchDomain={handleSwitchDomain}
            onResetConsultation={handleNewAnalysis}
            mode={mode}
            onSelectTab={handleSelectTab}
            analysisMode={analysisMode}
            onSetAnalysisMode={setAnalysisMode}
            text={text}
            onTextChange={handleTextChange}
            separator={separator}
            onSeparatorChange={setSeparator}
            responseCount={responseCount}
            characterCount={characterCount}
            onClearText={handleClearText}
            onSubmitText={handleSubmitText}
            pdfFiles={pdfFiles}
            onPdfFilesSelected={handlePdfFilesSelected}
            onRemovePdfFile={handleRemovePdfFile}
            onSubmitPdf={handleSubmitPdf}
            excelFiles={excelFiles}
            onExcelFilesSelected={handleExcelFilesSelected}
            onExcelSheetChange={handleExcelSheetChange}
            onRemoveExcelFile={handleRemoveExcelFile}
            onExcelMappingChange={handleExcelMappingChange}
            onToggleExcelMetadata={handleToggleExcelMetadata}
            onSubmitExcel={handleSubmitExcel}
            onSelectSample={handleSelectSample}
            sampleNote={sampleNote}
            hasResult={!!analysisResult}
            busy={busy}
          />
        )}

        {busy && <ProcessingSection />}

        {view === 'history' && !busy && <ConsultationHistory key={historyKey} onNewAnalysis={handleNewAnalysis} />}

        {error && <ActionError error={error} onDismiss={() => setError(null)} />}

        {view === 'results' && !busy && analysisResult && (
          <ResultsSection
            data={analysisResult}
            source={source}
            onEditInput={handleShowWorkspace}
            onNewAnalysis={handleNewAnalysis}
            onHome={handleShowWorkspace}
            onOpenIssue={handleOpenIssue}
          />
        )}

        <AboutSection />
        <HelpSection />
      </main>

      <Footer onBackToTop={handleScrollToTop} />

      <IssueDialog
        isOpen={dialogOpen}
        issue={activeIssue}
        issueIndex={activeIssueIndex}
        totalResponses={analysisResult?.total_responses || 0}
        onClose={() => setDialogOpen(false)}
        onExploreIssue={handleExploreFromDialog}
      />
    </>
  );
}
