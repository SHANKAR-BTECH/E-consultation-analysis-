import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listConsultations, getConsultation, getConsultationRun } from '../lib/api.js';
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
  onBack, onRetry, onNewAnalysis, onOpenIssue, isRefreshing = false }) {
  return <section id="consultation-history" aria-labelledby="history-title">
    <div className="results-heading">
      <div><p className="eyebrow">Saved records</p><h1 id="history-title">Previous Consultations</h1>
        <p className="muted">Open a saved consultation and review its analysis.</p></div>
      <button
        type="button"
        className="button secondary btn-refresh-history"
        onClick={onRetry}
        disabled={isRefreshing}
        aria-busy={isRefreshing}
      >
        {isRefreshing ? 'Refreshing...' : 'Refresh History'}
      </button>
    </div>
    {selectedId && list.status === 'error' &&
      <Notice state={list} onRetry={onRetry} />}
    {!selectedId ? <>
      <Notice state={list} loading="Loading consultations…" onRetry={onRetry} />
      {list.status === 'success' && (list.data.length === 0
        ? <p className="notice" role="status">No saved consultations yet. Complete an analysis to create one.</p>
        : <div className="history-list">{list.data.map((item) => (
          <article className="report-section history-card" key={item.id}>
            <div className="history-card-header">
              <h2>{item.title}</h2>
              <span className={`status-badge status-${(item.latest_run?.status || 'no-runs').toLowerCase().replace('_', '-')}`}>
                {item.latest_run?.status ?? 'NO RUNS'}
              </span>
            </div>
            <p className="muted history-card-meta">
              <span>{timestamp(item.created_at)}</span>
              <span className="meta-dot">·</span>
              <span><strong>{item.latest_run?.response_count ?? 0} responses</strong></span>
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
        ))}</div>)}
    </> : <>
      <button type="button" className="button secondary btn-back-consultations" onClick={onBack}>
        ← Back to consultations
      </button>
      <Notice state={detail} loading="Loading consultation…" onRetry={onRetry} />
      {detail.status === 'success' && <>
        <div className="report-section history-detail">
          <h2>{detail.data.title}</h2>
          <p className="history-identifier">Consultation ID: <code>{detail.data.id}</code></p>
          <p className="muted">{timestamp(detail.data.created_at)} · {detail.data.status}</p>
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
  const refreshPending = useRef(false);

  const [list, setList] = useState({ status: 'loading' });
  const [detail, setDetail] = useState({ status: 'loading' });
  const [saved, setSaved] = useState({ status: 'loading' });

  const fetchList = useCallback(async (refresh = false) => {
    if (!refresh) {
      setList({ status: 'loading' });
    }
    try {
      const data = await listConsultations();
      setList({ status: 'success', data });
    } catch (error) {
      setList({ status: 'error', error: error.message || 'Consultation history could not be loaded.' });
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
      setDetail({ status: 'error', error: error.message || 'Consultation details could not be loaded.' });
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

  const select = (id) => {
    setSelectedId(id);
    setRunId(null);
    setDialog(null);
  };

  const handleRetry = useCallback(async () => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    setIsRefreshing(true);
    setDialog(null);
    try {
      // The list must stay current even while a saved consultation is open.
      await Promise.all([
        fetchList(true),
        selectedId ? fetchDetailAndRun(selectedId, runId, true) : Promise.resolve(),
      ]);
    } finally {
      refreshPending.current = false;
      setIsRefreshing(false);
    }
  }, [selectedId, runId, fetchDetailAndRun, fetchList]);

  return <>
    <HistoryPanel list={list} detail={detail} saved={saved} selectedId={selectedId}
      onSelect={select} onBack={() => select(null)} onSelectRun={(id) => { setRunId(id); setDialog(null); }}
      onRetry={handleRetry} onNewAnalysis={onNewAnalysis}
      onOpenIssue={(index, explore) => setDialog({ index, explore })}
      isRefreshing={isRefreshing} />
    <IssueDialog isOpen={!!dialog} issue={saved.data?.result?.issues?.[dialog?.index]}
      issueIndex={dialog?.index} totalResponses={saved.data?.result?.total_responses || 0}
      onClose={() => setDialog(null)} onExploreIssue={(index) => dialog?.explore(index)} />
  </>;
}
