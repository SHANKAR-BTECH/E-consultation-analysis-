import React from 'react';
import { number, percent, title, sentimentClass } from '../lib/utils.js';

export default function CitizenExplorer({
  result,
  filters,
  pageData,
  onUpdateFilter,
  onResetFilters,
  onPrevPage,
  onNextPage,
  onClearIssueContext
}) {
  const sentimentCounts = result?.sentiment?.counts || {};
  const categoriesAvailable = result?.categories?.available && Array.isArray(result?.categories?.groups);
  const topicsAvailable = Array.isArray(result?.topics) && result.topics.length > 0;
  const issues = result?.issues || [];

  const quickFilterOptions = [
    { id: 'all', label: 'All', tone: 'neutral' },
    { id: 'positive', label: 'Positive', tone: 'positive' },
    { id: 'negative', label: 'Negative', tone: 'negative' },
    { id: 'mixed_neutral', label: 'Mixed / Neutral', tone: 'mixed' },
    { id: 'requests', label: 'Requests', tone: 'requests' },
    { id: 'problems', label: 'Problems', tone: 'problems' },
    { id: 'improvements', label: 'Improvements', tone: 'improvements' }
  ];

  // Helper to map response to related issue if any
  const getRelatedIssue = (rowIndex, text) => {
    if (!issues.length) return null;
    for (const issue of issues) {
      if (issue.response_indices && issue.response_indices.includes(rowIndex)) {
        return issue.issue;
      }
      if (text && text.toLowerCase().includes(issue.issue.toLowerCase())) {
        return issue.issue;
      }
    }
    return null;
  };

  // Helper to identify if text contains an explicit request
  const getExplicitRequest = (text) => {
    if (!text) return null;
    const reqMatch = text.match(new RegExp(`(?:please|should|need to|must|request|suggest)\\s+[^.!?]+`, 'i'));
    return reqMatch ? `"${reqMatch[0].trim()}"` : null;
  };

  return (
    <section className="dossier-card citizen-explorer-card" id="explorer" aria-labelledby="explorer-title">
      <div className="card-top-bar">
        <div className="card-kicker-badge">SOURCE EVIDENCE</div>
        <div className="card-caption-tag">AUDITABLE • VERBATIM CITIZEN FEEDBACK</div>
      </div>

      <div className="explorer-header-block">
        <h2 id="explorer-title" className="section-title">Citizen Feedback Explorer</h2>
        <p className="section-sub">
          Search, filter, and inspect individual responses verbatim.
        </p>
      </div>

      {/* Quick Filter Bar */}
      <div className="quick-filters-container" role="tablist" aria-label="Feedback type quick filters">
        <div className="quick-filters-row">
          {quickFilterOptions.slice(0, 4).map((opt) => {
            const isActive = (filters.quickFilter || 'all') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`quick-filter-pill pill-${opt.tone} ${isActive ? 'active' : ''}`}
                onClick={() => onUpdateFilter('quickFilter', opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="quick-filters-row">
          {quickFilterOptions.slice(4).map((opt) => {
            const isActive = (filters.quickFilter || 'all') === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`quick-filter-pill pill-${opt.tone} ${isActive ? 'active' : ''}`}
                onClick={() => onUpdateFilter('quickFilter', opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Secondary Search & Dropdown Filter Bar */}
      <div className="explorer-filter-bar">
        <div className="filter-group search-field">
          <label htmlFor="search-input" className="filter-label">Search words or phrases</label>
          <input
            type="search"
            id="search-input"
            className="input-search"
            placeholder="Search words, phrases, or specific complaints…"
            value={filters.search}
            onChange={(e) => onUpdateFilter('search', e.target.value)}
          />
        </div>

        <div className="filter-group select-group">
          <label htmlFor="filter-sentiment" className="filter-label">Sentiment</label>
          <select
            id="filter-sentiment"
            className="select-filter"
            value={filters.sentiment}
            onChange={(e) => onUpdateFilter('sentiment', e.target.value)}
          >
            <option value="">All Sentiments</option>
            {['positive', 'neutral', 'negative'].map((s) => (
              <option key={s} value={s}>
                {title(s)} ({number(sentimentCounts[s] || 0)})
              </option>
            ))}
          </select>
        </div>

        {topicsAvailable && (
          <div className="filter-group select-group">
            <label htmlFor="filter-topic" className="filter-label">Topic</label>
            <select
              id="filter-topic"
              className="select-filter"
              value={filters.topic}
              onChange={(e) => onUpdateFilter('topic', e.target.value)}
            >
              <option value="">All Topics</option>
              {result.topics.map((t, idx) => (
                <option key={idx} value={String(idx)}>
                  {t.topic} ({number(t.count)})
                </option>
              ))}
            </select>
          </div>
        )}

        {categoriesAvailable && (
          <div className="filter-group select-group">
            <label htmlFor="filter-category" className="filter-label">Category</label>
            <select
              id="filter-category"
              className="select-filter"
              value={filters.category}
              onChange={(e) => onUpdateFilter('category', e.target.value)}
            >
              <option value="">All Categories</option>
              {result.categories.groups.map((g) => (
                <option key={g.category} value={g.category}>
                  {g.category} ({number(g.total_responses)})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="filter-group action-group">
          <button
            type="button"
            className="button secondary sm btn-reset-filters"
            onClick={onResetFilters}
            title="Clear all search parameters"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {filters.issueLabel && (
        <div className="issue-context-banner">
          <span className="ctx-icon">⚡</span>
          <span className="ctx-text">
            Active issue filter: <strong>{filters.issueLabel}</strong>
          </span>
          <button
            type="button"
            className="button text-button btn-clear-context"
            onClick={onClearIssueContext}
          >
            Clear Issue Filter ✕
          </button>
        </div>
      )}

      <div className="explorer-meta-strip">
        <span className="matches-count" aria-live="polite">
          <strong>{number(pageData.total)}</strong> of {number(result.total_responses)} responses match criteria
        </span>
        <span className="page-range">
          {pageData.total > 0
            ? `Showing ${number(pageData.offset + 1)}–${number(pageData.offset + pageData.rows.length)}`
            : '0 records'}
        </span>
      </div>

      {pageData.total === 0 ? (
        <div className="explorer-empty-state">
          <p className="muted">No feedback responses match the specified filters.</p>
          <button
            type="button"
            className="button secondary sm"
            onClick={onResetFilters}
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="table-responsive-wrapper">
          <table className="explorer-table" aria-label="Citizen feedback responses">
            <thead>
              <tr>
                <th scope="col" className="col-feedback">Consultation Response (Verbatim)</th>
                <th scope="col" className="col-sentiment">Sentiment</th>
                <th scope="col" className="col-numeric">Confidence</th>
                <th scope="col" className="col-category">Related Issue / Context</th>
                <th scope="col" className="col-date">Date</th>
              </tr>
            </thead>
            <tbody>
              {pageData.rows.map((row, i) => {
                const sCls = sentimentClass(row.sentiment);
                const relatedIssue = getRelatedIssue(row.row_index, row.text);
                const explicitReq = getExplicitRequest(row.text);

                return (
                  <tr key={row.row_index || i} className="feedback-row">
                    <td className="cell-feedback">
                      <div className="row-meta">
                        <span className="row-badge">Response #{number(row.row_index)}</span>
                        {(row.metadata?.source_file || row.source_file) && (
                          <span className="row-source-badge" title="Source provenance file">
                            📄 {row.metadata?.source_file || row.source_file}
                            {row.metadata?.source_index ? ` · #${row.metadata.source_index}` : ''}
                          </span>
                        )}
                        {row.id && <span className="row-id">ID: {row.id}</span>}
                      </div>
                      <p className="row-text">{row.text}</p>
                      {explicitReq && (
                        <div className="row-extracted-request">
                          <span className="req-tag">Identified Request:</span> {explicitReq}
                        </div>
                      )}
                    </td>
                    <td className="cell-sentiment">
                      <span className={`badge badge-${sCls}`}>
                        {title(row.sentiment)}
                      </span>
                    </td>
                    <td className="cell-numeric">
                      <span className="conf-val">{percent(row.confidence * 100)}</span>
                    </td>
                    <td className="cell-category">
                      {relatedIssue ? (
                        <span className="issue-tag" title="Connected recurring issue">
                          {relatedIssue}
                        </span>
                      ) : row.category ? (
                        <span className="category-pill">{row.category}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="cell-date">
                      {row.date ? (
                        <span className="date-val">{row.date}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination-dock">
        <span className="pagination-info">
          Page {pageData.page} of {pageData.pages}
        </span>
        <div className="pagination-buttons">
          <button
            type="button"
            className="button secondary sm"
            onClick={onPrevPage}
            disabled={pageData.page <= 1}
          >
            ← Previous
          </button>
          <span className="page-indicator">{pageData.page} / {pageData.pages}</span>
          <button
            type="button"
            className="button secondary sm"
            onClick={onNextPage}
            disabled={pageData.page >= pageData.pages}
          >
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}
