import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listConsultations, getConsultation, getConsultationRun, clearConsultationHistory } from '../lib/api.js';
import { getDomainInfo } from '../lib/domainConfig.js';
import ResultsSection from './ResultsSection.jsx';
import IssueDialog from './IssueDialog.jsx';
import './ConsultationHistory.css';

const timestamp = (value) => value ? new Date(value).toLocaleString() : 'Unavailable';

function Notice({ state, loading, onRetry }) {
  if (state.status === 'loading') return <p className="notice" role="status">{loading}</p>;
  if (state.status === 'error') return <div className="notice error" role="alert">
    <p>{state.error || 'Consultation history could not be loaded.'}</p>
    <button className="button secondary" onClick={onRetry}>Try again</button>
  </div>;
  return null;
}

// Pure view also makes each remote-data state testable without a browser store.
export function HistoryPanel({ list, detail, saved, selectedId, onSelect, onSelectRun,
  onBack, onRetry, onNewAnalysis, onOpenIssue, isRefreshing = false, refreshError = null,
  isClearing = false, clearError = null, clearSuccess = null, onOpenClearConfirm = () => {} }) {
  return <section id="consultation-history" aria-labelledby="history-title">
    <div className="results-heading">
      <div><p className="eyebrow">Saved records</p><h1 id="history-title">Previous Consultations</h1>
        <p className="muted">Open a saved consultation and review its analysis.</p></div>
      <div className="history-heading-actions">
        <button
          type="button"
          className="button secondary btn-refresh-history"
          onClick={onRetry}
          disabled={isRefreshing || isClearing}
          aria-busy={isRefreshing}
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh History'}
        </button>
        {!selectedId && (
          <button
            type="button"
            className="button secondary btn-clear-history"
            onClick={onOpenClearConfirm}
            disabled={isRefreshing || isClearing || list.status !== 'success' || (list.data && list.data.length === 0)}
            aria-label="Clear all consultation history"
          >
            Clear History
          </button>
        )}
      </div>
    </div>
    {clearSuccess && (
      <div className="notice success clear-success" role="status" style={{ margin: '8px 0 16px' }}>
        <p>{clearSuccess}</p>
      </div>
    )}
    {clearError && (
      <div className="notice error clear-error" role="alert" style={{ margin: '8px 0 16px' }}>
        <p>{clearError}</p>
      </div>
    )}
    {refreshError && (
      <div className="notice error refresh-error" role="alert" style={{ margin: '8px 0 16px' }}>
        <p>{refreshError}</p>
      </div>
    )}
    {selectedId && list.status === 'error' &&
      <Notice state={list} onRetry={onRetry} />}
    {!selectedId ? <>
      <Notice state={list} loading="Loading consultations…" onRetry={onRetry} />
      {list.status === 'success' && (list.data.length === 0
        ? <p className="notice" role="status">No saved consultations yet. Complete an analysis to create one.</p>
        : <div className="history-list">{list.data.map((item) => {
          const domainInfo = getDomainInfo(item.domain || item.title);
          return (
            <article className="report-section history-card" key={item.id}>
              <div className="history-card-header">
                <h2>{domainInfo?.icon ? `${domainInfo.icon} ` : ''}{item.title}</h2>
                <span className={`status-badge status-${(item.latest_run?.status || 'no-runs').toLowerCase().replace('_', '-')}`}>
                  {item.latest_run?.status ?? 'NO RUNS'}
                </span>
              </div>
              <p className="muted history-card-meta">
                {item.file_count ? (
                  <>
                    <span><strong>{item.file_count} {item.file_count === 1 ? 'file' : 'files'}</strong></span>
                    <span className="meta-dot">·</span>
                  </>
                ) : null}
                <span><strong>{item.latest_run?.response_count ?? 0} responses</strong></span>
                {item.input_format ? (
                  <>
                    <span className="meta-dot">·</span>
                    <span className="meta-format" style={{ fontWeight: '600', textTransform: 'uppercase' }}>{item.input_format}</span>
                  </>
                ) : null}
                <span className="meta-dot">·</span>
                <span>{timestamp(item.created_at)}</span>
                <span className="meta-dot">·</span>
                <span className="meta-status">{item.latest_run?.status ?? 'NO RUNS'}</span>
              </p>
              <p className="history-identifier">Consultation ID: <code>{item.id}</code></p>
              <div className="history-card-actions">
                <button
                  type="button"
                  className="button secondary btn-open-consultation"
                  onClick={() => onSelect(item.id)}
                  aria-label={`Open consultation ${item.id}`}
                >
                  Open consultation →
                </button>
              </div>
            </article>
          );
        })}</div>)}
    </> : <>
      <button type="button" className="button secondary btn-back-consultations" onClick={onBack}>
        ← Back to consultations
      </button>
      <Notice state={detail} loading="Loading consultation…" onRetry={onRetry} />
      {detail.status === 'success' && <>
        <div className="report-section history-detail">
          <div className="history-detail-header">
            {detail.data.domain && (
              <p className="eyebrow" style={{ marginBottom: '4px' }}>{detail.data.domain.toUpperCase()} CONSULTATION</p>
            )}
            <h2>
              {getDomainInfo(detail.data.domain || detail.data.title)?.icon ? `${getDomainInfo(detail.data.domain || detail.data.title).icon} ` : ''}
              {detail.data.title}
            </h2>
          </div>
          <p className="history-identifier">Consultation ID: <code>{detail.data.id}</code></p>
          <p className="muted">
            {detail.data.input_format && <strong style={{ textTransform: 'uppercase' }}>{detail.data.input_format} · </strong>}
            {timestamp(detail.data.created_at)} · {detail.data.status}
          </p>

          {/* List constituent files if multiple or single file */}
          {Array.isArray(detail.data.files) && detail.data.files.length > 0 && (
            <div className="history-files-list" style={{ marginTop: '14px', padding: '12px 16px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
              <span className="small" style={{ fontWeight: '600', color: '#495057' }}>Constituent Files ({detail.data.files.length}):</span>
              <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px', fontSize: '13.5px', color: '#555d67' }}>
                {detail.data.files.map((f, fi) => (
                  <li key={fi}>
                    📄 <strong>{f.filename}</strong> {f.response_count !== null && <span className="muted">({f.response_count} responses)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.data.runs.length === 0 ? <p role="status">No analysis runs have been saved for this consultation.</p>
            : <><label htmlFor="history-run">Analysis run</label>
              <select id="history-run" value={saved.data?.run.id || ''} onChange={(event) => onSelectRun(event.target.value)}>
                {!saved.data && <option value="" disabled>Selecting run…</option>}
                {detail.data.runs.map((run) => <option key={run.id} value={run.id}>
                  {timestamp(run.created_at)} · {run.response_count} responses · {run.status} · {run.id}
                </option>)}
              </select></>}
        </div>
        {detail.data.runs.length > 0 && <>
          <Notice state={saved} loading="Loading saved analysis…" onRetry={onRetry} />
          {saved.status === 'success' && <>
            <p className="notice" role="status">Run status: {saved.data.run.status} · {saved.data.run.response_count} responses received
              {saved.data.run.accepted_count !== null && ` · ${saved.data.run.accepted_count} analyzed`}
              {' · '}{timestamp(saved.data.run.ended_at || saved.data.run.created_at)}</p>
            {saved.data.run.status === 'FAILED' && <p className="notice error" role="alert">
              This analysis failed. {saved.data.run.failure?.message || 'No completed results are available.'}
            </p>}
            {['PENDING', 'RUNNING'].includes(saved.data.run.status) && <p className="notice">
              No completed results are available. Refresh history to check the saved status.
            </p>}
            {saved.data.run.status === 'COMPLETED' && <ResultsSection key={saved.data.run.id}
              data={saved.data.result} source={`Saved consultation ${detail.data.id}`} persisted
              onEditInput={onNewAnalysis} onNewAnalysis={onNewAnalysis} onHome={onNewAnalysis} onOpenIssue={onOpenIssue} />}
          </>}
        </>}
      </>}
    </>}
  </section>;
}

export default function ConsultationHistory({ onNewAnalysis }) {
  const [selectedId, setSelectedId] = useState(null);
  const [runId, setRunId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const refreshPending = useRef(false);
  const requestSeq = useRef(0);

  const [list, setList] = useState({ status: 'loading' });
  const [detail, setDetail] = useState({ status: 'loading' });
  const [saved, setSaved] = useState({ status: 'loading' });

  const fetchList = useCallback(async (refresh = false) => {
    const seq = ++requestSeq.current;
    if (!refresh) {
      setList({ status: 'loading' });
      setRefreshError(null);
    }
    try {
      const data = await listConsultations();
      if (seq === requestSeq.current) {
        setList({ status: 'success', data: [...data] });
        setRefreshError(null);
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setList((prev) => {
          if (refresh && prev.status === 'success') {
            return prev;
          }
          return { status: 'error', error: error.message || 'Consultation history could not be loaded.' };
        });
        if (refresh) {
          setRefreshError(error.message || 'Refresh failed. Please check your network connection.');
        }
      }
    }
  }, []);

  const fetchDetailAndRun = useCallback(async (cId, rId, refresh = false) => {
    if (!cId) return;
    if (!refresh) {
      setDetail({ status: 'loading' });
    }
    try {
      const dData = await getConsultation(cId);
      setDetail({ status: 'success', data: dData });
      const targetRunId = rId || dData?.runs?.[0]?.id;
      if (targetRunId) {
        if (!refresh) setSaved({ status: 'loading' });
        const sData = await getConsultationRun(cId, targetRunId);
        setSaved({ status: 'success', data: sData });
      } else {
        setSaved({ status: 'success', data: null });
      }
    } catch (error) {
      setDetail((prev) => {
        if (refresh && prev.status === 'success') return prev;
        return { status: 'error', error: error.message || 'Consultation details could not be loaded.' };
      });
      if (refresh) {
        setRefreshError(error.message || 'Failed to refresh consultation details.');
      }
    }
  }, []);

  useEffect(() => {
    fetchList(false);
  }, [fetchList]);

  useEffect(() => {
    if (selectedId) {
      fetchDetailAndRun(selectedId, runId, false);
    }
  }, [selectedId, runId, fetchDetailAndRun]);

  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearError, setClearError] = useState(null);
  const [clearSuccess, setClearSuccess] = useState(null);

  const select = (id) => {
    setSelectedId(id);
    setRunId(null);
    setDialog(null);
    setRefreshError(null);
  };

  const handleRetry = useCallback(async () => {
    if (refreshPending.current || isClearing) return;
    refreshPending.current = true;
    setIsRefreshing(true);
    setDialog(null);
    setRefreshError(null);
    setClearSuccess(null);
    try {
      // The list must stay current even while a saved consultation is open.
      await Promise.all([
        fetchList(true),
        selectedId ? fetchDetailAndRun(selectedId, runId, true) : Promise.resolve(),
      ]);
    } catch (err) {
      setRefreshError(err.message || 'Refresh failed. Please try again.');
    } finally {
      refreshPending.current = false;
      setIsRefreshing(false);
    }
  }, [selectedId, runId, fetchDetailAndRun, fetchList, isClearing]);

  const handleOpenClearConfirm = () => {
    if (isClearing || isRefreshing) return;
    setClearError(null);
    setShowClearConfirm(true);
  };

  const handleCancelClear = () => {
    if (isClearing) return;
    setShowClearConfirm(false);
  };

  const handleConfirmClear = async () => {
    if (isClearing) return;
    setIsClearing(true);
    setClearError(null);
    setClearSuccess(null);
    try {
      await clearConsultationHistory();
      setShowClearConfirm(false);
      setSelectedId(null);
      setRunId(null);
      // Perform fresh fetch from backend as required
      await fetchList(true);
      setClearSuccess('Consultation history cleared successfully.');
    } catch (err) {
      setClearError(err.message || 'Could not clear consultation history. Please try again.');
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    if (!showClearConfirm) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isClearing) {
        handleCancelClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showClearConfirm, isClearing]);

  return <>
    <HistoryPanel list={list} detail={detail} saved={saved} selectedId={selectedId}
      onSelect={select} onBack={() => select(null)} onSelectRun={(id) => { setRunId(id); setDialog(null); }}
      onRetry={handleRetry} onNewAnalysis={onNewAnalysis}
      onOpenIssue={(index, explore) => setDialog({ index, explore })}
      isRefreshing={isRefreshing}
      refreshError={refreshError}
      isClearing={isClearing}
      clearError={clearError}
      clearSuccess={clearSuccess}
      onOpenClearConfirm={handleOpenClearConfirm} />

    {showClearConfirm && (
      <div
        className="confirm-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-history-title"
      >
        <div className="confirm-modal-content">
          <h3 id="clear-history-title" className="confirm-modal-title">
            Clear consultation history?
          </h3>
          <p className="confirm-modal-message">
            This will permanently delete all saved consultation history,
            including consultation records, source files metadata, responses,
            analysis runs, and associated provenance stored in the local database.
            <br /><br />
            <strong>This action cannot be undone.</strong>
          </p>
          <div className="confirm-modal-actions">
            <button
              type="button"
              className="button secondary btn-cancel-clear"
              onClick={handleCancelClear}
              disabled={isClearing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary btn-confirm-delete"
              onClick={handleConfirmClear}
              disabled={isClearing}
              aria-busy={isClearing}
            >
              {isClearing ? 'Clearing…' : 'Clear History'}
            </button>
          </div>
        </div>
      </div>
    )}

    <IssueDialog isOpen={!!dialog} issue={saved.data?.result?.issues?.[dialog?.index]}
      issueIndex={dialog?.index} totalResponses={saved.data?.result?.total_responses || 0}
      onClose={() => setDialog(null)} onExploreIssue={(index) => dialog?.explore(index)} />
  </>;
}
