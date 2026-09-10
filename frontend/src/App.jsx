import React, { useState, useEffect } from 'react';
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
import { checkHealth, analyzeResponses, inspectPdfFile, analyzePdf, inspectExcelFile, analyzeExcel, APIError } from './lib/api.js';
import { parseResponses } from './lib/utils.js';
import { SAMPLES, SAMPLE_LABELS } from './lib/presets.js';

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

  // Ingestion mode
  const [mode, setMode] = useState('paste'); // 'paste' | 'pdf' | 'excel'

  // Text state
  const [text, setText] = useState('');
  const [separator, setSeparator] = useState('line');
  const [sampleNote, setSampleNote] = useState(null);
  const [source, setSource] = useState('Pasted responses');

  // PDF state
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfInspection, setPdfInspection] = useState(null);

  // Excel state
  const [excelFile, setExcelFile] = useState(null);
  const [excelInspection, setExcelInspection] = useState(null);
  const [excelSheets, setExcelSheets] = useState([]);
  const [excelSheet, setExcelSheet] = useState('');
  const [excelMapping, setExcelMapping] = useState({
    text_column: '',
    date_column: '',
    category_column: '',
    id_column: '',
    source_column: ''
  });
  const [excelMetadataColumns, setExcelMetadataColumns] = useState([]);

  // Result state
  const [analysisResult, setAnalysisResult] = useState(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeIssueIndex, setActiveIssueIndex] = useState(null);
  const [exploreCallback, setExploreCallback] = useState(null);

  const rows = parseResponses(text, separator);
  const responseCount = rows.length;
  const characterCount = [...text].length;

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

  const handleSelectTab = (newMode) => {
    if (busy) return;
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
      const data = await analyzeResponses(rows);

      if (!data.total_responses) {
        throw new APIError('No valid responses were available for analysis.');
      }

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

  const handlePdfFileSelected = async (selectedFile) => {
    if (!selectedFile || busy) return;
    setError(null);
    setPdfFile(null);
    setPdfInspection(null);

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError(new APIError('Choose a PDF file with a .pdf filename.'));
      return;
    }
    if (selectedFile.size > LIMITS.maxPdfBytes) {
      setError(new APIError(`The PDF exceeds ${LIMITS.maxPdfBytes / 1000000} MB.`));
      return;
    }

    setPdfFile(selectedFile);
    setBusy(true);

    try {
      const insp = await inspectPdfFile(selectedFile);
      setPdfInspection(insp);
    } catch (err) {
      setPdfFile(null);
      setPdfInspection(null);
      setError(err instanceof APIError ? err : new APIError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePdfFile = () => {
    setPdfFile(null);
    setPdfInspection(null);
    setError(null);
  };

  const handleSubmitPdf = async () => {
    if (busy || !pdfFile || !pdfInspection) return;
    setError(null);

    setBusy(true);
    const pdfSource = `PDF · ${pdfFile.name}`;
    setSource(pdfSource);

    try {
      const data = await analyzePdf(pdfFile);
      if (!data.total_responses) {
        throw new APIError('No valid responses were available for analysis.');
      }

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

  const handleExcelFileSelected = async (selectedFile) => {
    if (!selectedFile || busy) return;
    setError(null);
    setExcelFile(null);
    setExcelInspection(null);
    setExcelSheets([]);
    setExcelSheet('');

    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      setError(new APIError('Choose an Excel file with a .xlsx filename.'));
      return;
    }
    if (selectedFile.size > LIMITS.maxExcelBytes) {
      setError(new APIError(`The Excel file exceeds ${LIMITS.maxExcelBytes / 1000000} MB.`));
      return;
    }

    setExcelFile(selectedFile);
    setExcelSheet('');
    setBusy(true);

    try {
      const insp = await inspectExcelFile(selectedFile, '');
      setExcelInspection(insp);
      setExcelSheets(insp.sheets || []);
      setExcelSheet(insp.sheets?.[0] || '');
      setExcelMapping({
        text_column: insp.suggested_mapping?.text_column || insp.columns[0] || '',
        date_column: insp.suggested_mapping?.date_column || '',
        category_column: insp.suggested_mapping?.category_column || '',
        id_column: '',
        source_column: ''
      });
      setExcelMetadataColumns([]);
    } catch (err) {
      setExcelFile(null);
      setExcelInspection(null);
      setExcelSheets([]);
      setExcelSheet('');
      setError(err instanceof APIError ? err : new APIError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleExcelSheetChange = async (sheet) => {
    if (!excelFile || busy) return;
    setExcelSheet(sheet);
    setBusy(true);
    setError(null);
    try {
      const insp = await inspectExcelFile(excelFile, sheet);
      setExcelInspection(insp);
      setExcelMapping({
        text_column: insp.suggested_mapping?.text_column || insp.columns[0] || '',
        date_column: insp.suggested_mapping?.date_column || '',
        category_column: insp.suggested_mapping?.category_column || '',
        id_column: '',
        source_column: ''
      });
      setExcelMetadataColumns([]);
    } catch (err) {
      setError(err instanceof APIError ? err : new APIError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveExcelFile = () => {
    setExcelFile(null);
    setExcelInspection(null);
    setExcelSheets([]);
    setExcelSheet('');
    setExcelMapping({
      text_column: '',
      date_column: '',
      category_column: '',
      id_column: '',
      source_column: ''
    });
    setExcelMetadataColumns([]);
    setError(null);
  };

  const handleExcelMappingChange = (field, value) => {
    setExcelMapping((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleExcelMetadata = (col) => {
    setExcelMetadataColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const handleSubmitExcel = async () => {
    if (busy || !excelFile || !excelInspection) return;
    setError(null);

    if (!excelMapping.text_column) {
      setError(new APIError('Select the response text column before analyzing.'));
      return;
    }

    setBusy(true);
    const excelSource = `Excel · ${excelFile.name}`;
    setSource(excelSource);

    try {
      const data = await analyzeExcel(excelFile, excelMapping, excelMetadataColumns, excelSheet);
      if (!data.total_responses) {
        throw new APIError('No valid responses were available for analysis.');
      }

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
        onHistory={() => { if (!busy) { setView('history'); setError(null); setDialogOpen(false); } }}
      />

      <main className="container">
        <noscript>
          <p className="notice error">
            JavaScript is needed to submit responses and explore results. Please enable it and
            reload.
          </p>
        </noscript>

        {systemError && (
          <p id="system-error" className="notice error" role="alert">
            {systemError}
          </p>
        )}

        {view === 'workspace' && !busy && (
          <AnalysisWorkspace
            mode={mode}
            onSelectTab={handleSelectTab}
            text={text}
            onTextChange={handleTextChange}
            separator={separator}
            onSeparatorChange={setSeparator}
            responseCount={responseCount}
            characterCount={characterCount}
            onClearText={handleClearText}
            onSubmitText={handleSubmitText}
            pdfFile={pdfFile}
            pdfInspection={pdfInspection}
            onPdfFileSelected={handlePdfFileSelected}
            onRemovePdfFile={handleRemovePdfFile}
            onSubmitPdf={handleSubmitPdf}
            excelFile={excelFile}
            excelInspection={excelInspection}
            excelSheets={excelSheets}
            excelSheet={excelSheet}
            excelMapping={excelMapping}
            excelMetadataColumns={excelMetadataColumns}
            onExcelFileSelected={handleExcelFileSelected}
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

        {view === 'history' && !busy && <ConsultationHistory onNewAnalysis={handleNewAnalysis} />}

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
