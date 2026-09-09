import React, { useState, useEffect, useMemo } from 'react';
import ExecutiveBrief from './ExecutiveBrief.jsx';
import PriorityActions from './PriorityActions.jsx';
import KeyFindings from './KeyFindings.jsx';
import RequestsSection from './RequestsSection.jsx';
import NegativeFeedbackSection from './NegativeFeedbackSection.jsx';
import ProblemsSection from './ProblemsSection.jsx';
import ImprovementsSection from './ImprovementsSection.jsx';
import MixedFeedbackSection from './MixedFeedbackSection.jsx';
import RecommendationsSection from './RecommendationsSection.jsx';
import CitizenExplorer from './CitizenExplorer.jsx';
import TrendGraph from './TrendGraph.jsx';
import OverallAssessment from './OverallAssessment.jsx';
import QualitySection from './QualitySection.jsx';
import {
  number,
  percent,
  title,
  classOrder,
  sentimentClass,
  filteredRows,
  pageRows
} from '../lib/utils.js';
import {
  extractRawRequests,
  extractRequests,
  extractNegativeIssues,
  synthesizePriorityActions,
  extractImprovements,
  extractMixedFeedback,
  synthesizeExecutiveBrief,
  synthesizeKeyFindings,
  synthesizeRecommendations,
  synthesizeOverallAssessment,
  trendHistory
} from '../lib/consultationIntelligence.js';

export default function ResultsSection({
  data,
  source,
  onEditInput,
  onOpenIssue,
  persisted = false
}) {
  const [historyRecords, setHistoryRecords] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    sentiment: '',
    category: '',
    topic: '',
    quickFilter: 'all',
    issueIndices: null,
    issueLabel: '',
    page: 1,
    pageSize: 10
  });

  // Extract structured decision-support intelligence from verified response data
  const intelligence = useMemo(() => {
    if (!data || !data.responses) return null;

    const rawRequests = extractRawRequests(data.responses);
    const requests = extractRequests(data.responses, data.issues);
    const negativeIssues = extractNegativeIssues(data.issues, data.responses, data.total_responses);
    const priorityActions = synthesizePriorityActions(negativeIssues);
    const improvements = extractImprovements(data.responses, data.issues);
    const mixed = extractMixedFeedback(data.responses, rawRequests);
    const briefParagraphs = synthesizeExecutiveBrief(data, requests, improvements, mixed, negativeIssues);
    const keyFindings = synthesizeKeyFindings(negativeIssues, requests, improvements);
    const recommendations = synthesizeRecommendations(data.issues, requests, mixed);

    return {
      rawRequests,
      requests,
      negativeIssues,
      priorityActions,
      improvements,
      mixed,
      briefParagraphs,
      keyFindings,
      recommendations
    };
  }, [data]);

  // Manage persistent consultation trend history
  useEffect(() => {
    if (persisted || !data || !data.sentiment) return;

    const currentHistory = trendHistory.loadHistory();
    const posPct = data.sentiment.percentages?.positive || 0;
    const neuPct = data.sentiment.percentages?.neutral || 0;
    const negPct = data.sentiment.percentages?.negative || 0;

    const newRecord = {
      timestamp: new Date().toISOString(),
      label: source ? source.replace('Illustrative sample · ', '').replace('CSV · ', '') : `Run ${currentHistory.length + 1}`,
      source: source || 'Consultation',
      total_responses: data.total_responses,
      positive_pct: Math.round(posPct * 10) / 10,
      neutral_pct: Math.round(neuPct * 10) / 10,
      negative_pct: Math.round(negPct * 10) / 10,
      top_issue: data.issues?.[0]?.issue || 'None',
      top_request: intelligence?.requests?.[0]?.title || 'None'
    };

    const updated = trendHistory.saveRecord(newRecord);
    newRecord.interpretation = trendHistory.getInterpretation(updated);
    setHistoryRecords(trendHistory.loadHistory());
  }, [data, source, intelligence, persisted]);

  const handleClearHistory = () => {
    trendHistory.clearHistory();
    setHistoryRecords([]);
  };

  const trendInterpretation = useMemo(() => {
    return persisted ? '' : trendHistory.getInterpretation(historyRecords);
  }, [historyRecords, persisted]);

  const overallAssessmentText = useMemo(() => {
    if (!data || !intelligence) return '';
    return synthesizeOverallAssessment(
      data,
      intelligence.requests,
      intelligence.improvements,
      intelligence.negativeIssues,
      trendInterpretation
    );
  }, [data, intelligence, trendInterpretation]);

  // Filtering & Pagination for Citizen Feedback Explorer
  const matchingRows = filteredRows(data, filters);
  const paged = pageRows(matchingRows, filters.page, filters.pageSize);

  const handleFilterByContext = (label, responseIndices) => {
    setFilters((prev) => ({
      ...prev,
      issueIndices: responseIndices,
      issueLabel: label,
      page: 1
    }));
    const el = document.getElementById('explorer');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleClearContext = () => {
    setFilters((prev) => ({ ...prev, issueIndices: null, issueLabel: '', page: 1 }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      sentiment: '',
      category: '',
      topic: '',
      quickFilter: 'all',
      issueIndices: null,
      issueLabel: '',
      page: 1,
      pageSize: 10
    });
  };

  const handleUpdateFilter = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1
    }));
  };

  // Stack rendering helper
  const renderStack = (counts) => {
    const total = Object.values(counts || {}).reduce((a, b) => a + b, 0);
    return (
      <div className="stacked-bar" role="img" aria-label="Sentiment distribution">
        {classOrder(counts).map((key) => {
          const w = total ? ((counts[key] || 0) / total) * 100 : 0;
          return (
            <span
              key={key}
              className={`fill-${sentimentClass(key)}`}
              style={{ width: `${w}%` }}
              title={`${title(key)}: ${number(counts[key] || 0)}`}
            />
          );
        })}
      </div>
    );
  };

  // Metrics items for sentiment overview
  const metrics = [
    {
      name: 'Responses analyzed',
      value: number(data.total_responses),
      sub: 'Valid consultation responses',
      cls: ''
    },
    ...classOrder(data.sentiment.counts).map((key) => ({
      name: title(key),
      value: percent(data.sentiment.percentages[key]),
      sub: `${number(data.sentiment.counts[key])} responses`,
      cls: sentimentClass(key)
    })),
    {
      name: 'Average confidence',
      value:
        data.sentiment.average_confidence === null
          ? 'Unavailable'
          : percent(data.sentiment.average_confidence * 100),
      sub: 'Model classification certainty',
      cls: ''
    }
  ];

  return (
    <section id="results" aria-labelledby="results-title">
      {/* ── Results Header ── */}
      <div className="results-heading">
        <div>
          <p className="eyebrow">Public Consultation Decision Support</p>
          <h1 id="results-title" tabIndex="-1">
            {number(data.total_responses)}{' '}
            {data.total_responses === 1 ? 'response analyzed' : 'responses analyzed'}
          </h1>
          <p id="results-meta" className="muted">
            Source: {source} · {number(data.total_received)} received · {number(data.rejected_count)} excluded from analytical totals
          </p>
        </div>
        <button
          type="button"
          id="edit-input"
          className="button secondary"
          onClick={onEditInput}
        >
          {persisted ? 'New analysis' : 'Edit inputs'} <span aria-hidden="true">↗</span>
        </button>
      </div>

      {/* ── Section Navigation ── */}
      <nav className="section-nav" aria-label="Analysis sections">
        <a href="#executive-brief">Executive Brief</a>
        <a href="#priority-actions">Priority Actions</a>
        <a href="#key-findings">Key Findings</a>
        <a href="#requests-section">Requests</a>
        <a href="#negative-feedback">Negative Feedback</a>
        <a href="#improvements-section">Improvements</a>
        <a href="#mixed-feedback">Mixed Feedback</a>
        <a href="#recommendations">Recommendations</a>
        <a href="#explorer">Respondent Evidence</a>
        {!persisted && <a href="#trend-section">Trend History</a>}
        <a href="#overall-assessment">Overall Assessment</a>
        <a href="#quality-section">Data Quality</a>
      </nav>

      {/* ── 1. Executive Brief: "What people are telling you" ── */}
      <ExecutiveBrief paragraphs={intelligence?.briefParagraphs || []} />

      {/* ── 2. Administrator Quick Action Panel: "Priority actions to review" ── */}
      <PriorityActions
        actions={intelligence?.priorityActions || []}
        onFilterResponses={handleFilterByContext}
      />

      {/* ── 3. Key Findings ── */}
      <KeyFindings
        findings={intelligence?.keyFindings || []}
        onFilterResponses={handleFilterByContext}
      />

      {/* ── 4. What People Are Asking For (Actionable Requests) ── */}
      <RequestsSection
        requests={intelligence?.requests || []}
        onFilterResponses={handleFilterByContext}
      />

      {/* ── 5. Negative Feedback Requiring Attention (Dedicated Section) ── */}
      <NegativeFeedbackSection
        negativeIssues={intelligence?.negativeIssues || []}
        totalResponses={data.total_responses}
        onFilterResponses={handleFilterByContext}
        onOpenIssueModal={onOpenIssue}
      />

      {/* ── 6. Improvements Reported ── */}
      <ImprovementsSection
        improvements={intelligence?.improvements || []}
        onFilterResponses={handleFilterByContext}
      />

      {/* ── 7. Mixed Feedback / Remaining Problems ── */}
      <MixedFeedbackSection
        mixed={intelligence?.mixed || []}
        onFilterResponses={handleFilterByContext}
      />

      {/* ── 8. Request-Linked Suggestions / Recommendations ── */}
      <RecommendationsSection
        recommendations={intelligence?.recommendations || []}
      />

      {/* ── 9. Evidence from Respondents: Citizen Feedback Explorer ── */}
      <CitizenExplorer
        result={data}
        filters={filters}
        pageData={paged}
        onUpdateFilter={handleUpdateFilter}
        onResetFilters={handleResetFilters}
        onPrevPage={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
        onNextPage={() => setFilters((prev) => ({ ...prev, page: Math.min(paged.pages, prev.page + 1) }))}
        onClearIssueContext={handleClearContext}
      />

      {/* ── 10. Longitudinal Trend Graph: "How feedback is changing" ── */}
      {!persisted && <TrendGraph
        history={historyRecords}
        onClearHistory={handleClearHistory}
      />}

      {/* ── 11. Overall Assessment ── */}
      <OverallAssessment assessment={overallAssessmentText} />

      {/* ── 12. Sentiment Overview ── */}
      <section className="report-section sentiment-overview-section" id="sentiment-overview">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sentiment Spectrum</p>
            <h2>Sentiment overview &amp; confidence metrics.</h2>
          </div>
          <p>
            Model classification distribution across valid responses.
            Sentiment provides broader context for specific issues and requests.
          </p>
        </div>

        <div id="metrics" className="metrics" aria-label="Analysis metrics">
          {metrics.map((m, idx) => (
            <div key={idx}>
              <p className="metric-label">{m.name}</p>
              <p className={`metric-value ${m.cls}`}>{m.value}</p>
              <p className="metric-sub">{m.sub}</p>
            </div>
          ))}
        </div>

        <div className="sentiment-bar-block">
          {renderStack(data.sentiment.counts)}
          <ul className="sentiment-legend">
            {classOrder(data.sentiment.counts).map((key) => (
              <li key={key}>
                <span className="legend-name">
                  <i className={`legend-dot fill-${sentimentClass(key)}`}></i>
                  {title(key)}
                </span>
                <span className="legend-values">
                  {percent(data.sentiment.percentages[key])}
                  <span>{number(data.sentiment.counts[key])} responses</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 13. Data Quality & Audit Metadata ── */}
      <QualitySection
        data={data}
        source={source}
        onFilterResponses={handleFilterByContext}
      />
    </section>
  );
}
