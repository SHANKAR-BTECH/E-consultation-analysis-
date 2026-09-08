import React, { useState } from 'react';
import DossierHeader from './DossierHeader.jsx';
import TelemetryHud from './TelemetryHud.jsx';
import ExecutiveMemorandum from './ExecutiveMemorandum.jsx';
import PriorityIssues from './PriorityIssues.jsx';
import CitizenExplorer from './CitizenExplorer.jsx';
import PolarityDistribution from './PolarityDistribution.jsx';
import MajorTopics from './MajorTopics.jsx';
import SalientKeywords from './SalientKeywords.jsx';
import TemporalTrends from './TemporalTrends.jsx';
import CategoryBreakdown from './CategoryBreakdown.jsx';
import IngestionAudit from './IngestionAudit.jsx';
import MethodologyAccordion from './MethodologyAccordion.jsx';
import EvidenceModal from './EvidenceModal.jsx';
import { filteredRows, pageRows } from '../lib/utils.js';

export default function ResultsCommandCenter({
  data,
  source,
  onReturnToStudio
}) {
  const [selectedIssueIndex, setSelectedIssueIndex] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    sentiment: '',
    category: '',
    topic: '',
    issueIndices: null,
    issueLabel: ''
  });
  const [currentPage, setCurrentPage] = useState(1);

  // Compute filtered and paginated rows
  const matchingRows = filteredRows(data, filters);
  const pageData = pageRows(matchingRows, currentPage, 10);

  const handleUpdateFilter = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value
    }));
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters({
      search: '',
      sentiment: '',
      category: '',
      topic: '',
      issueIndices: null,
      issueLabel: ''
    });
    setCurrentPage(1);
  };

  const handleClearIssueContext = () => {
    setFilters((prev) => ({
      ...prev,
      issueIndices: null,
      issueLabel: ''
    }));
    setCurrentPage(1);
  };

  const handleSelectTopic = (topicIndex) => {
    setFilters((prev) => ({
      ...prev,
      topic: String(topicIndex),
      issueIndices: null,
      issueLabel: ''
    }));
    setCurrentPage(1);
    const explorerEl = document.getElementById('explorer');
    if (explorerEl) {
      explorerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleOpenIssueEvidence = (index) => {
    setSelectedIssueIndex(index);
  };

  const handleCloseIssueEvidence = () => {
    setSelectedIssueIndex(null);
  };

  const handleExploreIssueSubmissions = () => {
    if (selectedIssueIndex !== null && data.issues[selectedIssueIndex]) {
      const issue = data.issues[selectedIssueIndex];
      setFilters((prev) => ({
        ...prev,
        issueIndices: issue.response_indices,
        issueLabel: issue.issue,
        topic: ''
      }));
      setCurrentPage(1);
      setSelectedIssueIndex(null);
      const explorerEl = document.getElementById('explorer');
      if (explorerEl) {
        explorerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const activeIssue =
    selectedIssueIndex !== null && data?.issues ? data.issues[selectedIssueIndex] : null;

  return (
    <div className="results-command-center" id="results">
      <DossierHeader
        data={data}
        source={source}
        onReturnToStudio={onReturnToStudio}
      />

      <TelemetryHud data={data} />

      <div className="asymmetric-intelligence-grid">
        {/* Primary Intelligence Column (65%) */}
        <div className="primary-intelligence-column">
          <ExecutiveMemorandum data={data} />
          <PriorityIssues
            issues={data.issues}
            onSelectIssue={handleOpenIssueEvidence}
          />
          <CitizenExplorer
            result={data}
            filters={filters}
            pageData={pageData}
            onUpdateFilter={handleUpdateFilter}
            onResetFilters={handleResetFilters}
            onPrevPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setCurrentPage((p) => Math.min(pageData.pages, p + 1))}
            onClearIssueContext={handleClearIssueContext}
          />
        </div>

        {/* Telemetry Intelligence Rail (35%) */}
        <aside className="telemetry-intelligence-rail" aria-label="Analytical Breakdowns Rail">
          <PolarityDistribution sentiment={data.sentiment} />
          <MajorTopics
            topics={data.topics}
            totalResponses={data.total_responses}
            onSelectTopic={handleSelectTopic}
          />
          <SalientKeywords keywords={data.keywords} />
          <TemporalTrends trends={data.trends} />
          <CategoryBreakdown categories={data.categories} />
          <IngestionAudit
            totalReceived={data.total_received}
            totalResponses={data.total_responses}
            rejectedCount={data.rejected_count}
            rejected={data.rejected}
            warnings={data.warnings}
          />
          <MethodologyAccordion />
        </aside>
      </div>

      {activeIssue && (
        <EvidenceModal
          issue={activeIssue}
          totalResponses={data.total_responses}
          onClose={handleCloseIssueEvidence}
          onExploreIssue={handleExploreIssueSubmissions}
        />
      )}
    </div>
  );
}
