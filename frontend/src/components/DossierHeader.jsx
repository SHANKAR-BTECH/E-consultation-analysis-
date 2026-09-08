import React from 'react';
import { number } from '../lib/utils.js';

export default function DossierHeader({
  data,
  source,
  onReturnToStudio
}) {
  return (
    <header className="results-header-dock">
      <div className="dossier-meta-group">
        <div className="dossier-breadcrumb">
          <span className="crumb-brand">CONSULTATION INTELLIGENCE</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-doc">EXECUTIVE DOSSIER</span>
        </div>
        <h1 className="dossier-heading">
          {number(data.total_responses)}{' '}
          {data.total_responses === 1 ? 'Response Analyzed' : 'Responses Analyzed'}
        </h1>
        <p className="dossier-sub">
          Source: <strong>{source}</strong> · {number(data.total_received)} received ·{' '}
          {number(data.rejected_count)} excluded from analytical totals
        </p>
      </div>

      <div className="dossier-actions">
        <button
          type="button"
          className="btn-return-studio"
          onClick={onReturnToStudio}
          title="Adjust inputs or submit a new consultation dataset"
        >
          <span className="return-arrow" aria-hidden="true">←</span>
          <span>Return to Studio</span>
        </button>
      </div>
    </header>
  );
}
