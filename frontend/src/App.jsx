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
import { checkHealth, analyzeResponses, inspectFile, analyzeCsv, APIError } from './lib/api.js';
import { parseResponses } from './lib/utils.js';
import { SAMPLES, SAMPLE_LABELS } from './lib/presets.js';

const LIMITS = {
  maxResponses: 2000,
  maxCharacters: 500000,
  maxCsvBytes: 1048576 // 1MB
};

export default function App() {
  const [view, setView] = useState('workspace'); // 'workspace' | 'results'
  const [busy, setBusy] = useState(false);
  const [systemReady, setSystemReady] = useState(false);
  const [systemError, setSystemError] = useState(null);
  const [error, setError] = useState(null);

  // Ingestion mode
  const [mode, setMode] = useState('paste'); // 'paste' | 'csv' | 'url'

  // Text state
  const [text, setText] = useState('');
  const [separator, setSeparator] = useState('line');
  const [sampleNote, setSampleNote] = useState(null);
  const [source, setSource] = useState('Pasted responses');

  // CSV state
  const [file, setFile] = useState(null);
  const [inspection, setInspection] = useState(null);
  const [mapping, setMapping] = useState({
    text_column: '',
    date_column: '',
    category_column: '',
    id_column: '',
    source_column: ''
  });
  const [metadataColumns, setMetadataColumns] = useState([]);

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

  const handleFileSelected = async (selectedFile) => {
    if (!selectedFile || busy) return;
    setError(null);
    setFile(null);
    setInspection(null);

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError(new APIError('Choose a CSV file with a .csv filename.'));
      return;
    }
    if (selectedFile.size > LIMITS.maxCsvBytes) {
      setError(
        new APIError(`The CSV exceeds ${LIMITS.maxCsvBytes / 1000000} MB.`)
      );
      return;
    }

    setFile(selectedFile);
    setBusy(true);

    try {
      const insp = await inspectFile(selectedFile);
      setInspection(insp);
      setMapping({
        text_column: insp.suggested_mapping?.text_column || insp.columns[0] || '',
        date_column: insp.suggested_mapping?.date_column || '',
        category_column: insp.suggested_mapping?.category_column || '',
        id_column: '',
        source_column: ''
      });
      setMetadataColumns([]);
    } catch (err) {
      setFile(null);
      setInspection(null);
      setError(err instanceof APIError ? err : new APIError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setInspection(null);
    setMapping({
      text_column: '',
      date_column: '',
      category_column: '',
      id_column: '',
      source_column: ''
    });
    setMetadataColumns([]);
    setError(null);
  };

  const handleMappingChange = (field, value) => {
    setMapping((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleMetadata = (col) => {
    setMetadataColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const handleSubmitCsv = async () => {
    if (busy || !file || !inspection) return;
    setError(null);

    if (!mapping.text_column) {
      setError(new APIError('Select the response text column before analyzing.'));
      return;
    }

    setBusy(true);
    const csvSource = `CSV · ${file.name}`;
    setSource(csvSource);

    try {
      const data = await analyzeCsv(file, mapping, metadataColumns);
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
    const ws = document.getElementById('workspace');
    if (ws) ws.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            file={file}
            inspection={inspection}
            mapping={mapping}
            metadataColumns={metadataColumns}
            onFileSelected={handleFileSelected}
            onRemoveFile={handleRemoveFile}
            onMappingChange={handleMappingChange}
            onToggleMetadata={handleToggleMetadata}
            onSubmitCsv={handleSubmitCsv}
            onSelectSample={handleSelectSample}
            sampleNote={sampleNote}
            hasResult={!!analysisResult}
            busy={busy}
          />
        )}

        {busy && <ProcessingSection />}

        {error && <ActionError error={error} onDismiss={() => setError(null)} />}

        {view === 'results' && !busy && analysisResult && (
          <ResultsSection
            data={analysisResult}
            source={source}
            onEditInput={handleShowWorkspace}
            onOpenIssue={handleOpenIssue}
          />
        )}

        <AboutSection />
        <HelpSection />
      </main>

      <Footer onBackToTop={handleShowWorkspace} />

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
