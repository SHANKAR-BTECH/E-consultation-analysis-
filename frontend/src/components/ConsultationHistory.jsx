import React, { useCallback, useEffect, useState } from 'react';
import { listConsultations, getConsultation, getConsultationRun } from '../lib/api.js';
import ResultsSection from './ResultsSection.jsx';
import IssueDialog from './IssueDialog.jsx';
import './ConsultationHistory.css';

function useResource(load, enabled, revision) {
  const [state, setState] = useState({});
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    load().then(
      (data) => { if (current) setState({ load, revision, status: 'success', data }); },
      (error) => { if (current) setState({ load, revision, status: 'error', error: error.message }); }
    );
    return () => { current = false; };
  }, [load, enabled, revision]);
  return state.load === load && state.revision === revision ? state : { status: 'loading' };
}

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
    {!selectedId ? <>
      <Notice state={list} loading="Loading consultations…" onRetry={onRetry} />
      {list.status === 'success' && (list.data.length === 0
        ? <p className="notice" role="status">No saved consultations yet. Complete an analysis to create one.</p>
        : <div className="history-list">{list.data.map((item) => <article className="report-section history-card" key={item.id}>
          <h2>{item.title}</h2>
          <p className="muted">{timestamp(item.created_at)} · {item.latest_run?.response_count ?? 0} responses · {item.latest_run?.status ?? 'NO RUNS'}</p>
          <p className="history-identifier">Consultation ID: {item.id}</p>
          <button className="button secondary" onClick={() => onSelect(item.id)} aria-label={`Open consultation ${item.id}`}>Open consultation</button>
        </article>)}</div>)}
    </> : <>
      <button className="button secondary" onClick={onBack}>Back to consultations</button>
      <Notice state={detail} loading="Loading consultation…" onRetry={onRetry} />
      {detail.status === 'success' && <>
        <div className="report-section history-detail">
          <h2>{detail.data.title}</h2>
          <p className="history-identifier">Consultation ID: {detail.data.id}</p>
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
              onEditInput={onNewAnalysis} onOpenIssue={onOpenIssue} />}
          </>}
        </>}
      </>}
    </>}
  </section>;
}

export default function ConsultationHistory({ onNewAnalysis }) {
  const [selectedId, setSelectedId] = useState(null);
  const [runId, setRunId] = useState(null);
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const list = useResource(listConsultations, true, revision);
  const loadDetail = useCallback(() => getConsultation(selectedId), [selectedId]);
  const detail = useResource(loadDetail, !!selectedId, revision);
  const activeRunId = runId || detail.data?.runs[0]?.id;
  const loadRun = useCallback(() => getConsultationRun(selectedId, activeRunId), [selectedId, activeRunId]);
  const saved = useResource(loadRun, !!selectedId && !!activeRunId, revision);
  const select = (id) => { setSelectedId(id); setRunId(null); setDialog(null); };

  useEffect(() => {
    if (!isRefreshing) return;
    const isBusy = (!selectedId && list.status === 'loading') ||
      (!!selectedId && (detail.status === 'loading' || (activeRunId && saved.status === 'loading')));
    if (!isBusy) {
      setIsRefreshing(false);
    }
  }, [isRefreshing, selectedId, activeRunId, list.status, detail.status, saved.status]);

  const handleRetry = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRevision((value) => value + 1);
    setDialog(null);
  }, [isRefreshing]);

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
