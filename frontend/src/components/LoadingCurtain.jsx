import React from 'react';

export default function LoadingCurtain({ active }) {
  if (!active) return null;

  return (
    <div className="studio-loading-curtain" role="status" aria-live="assertive">
      <div className="loading-card">
        <div className="loading-spinner-wrap">
          <div className="loading-scanner-bar" />
        </div>
        <div className="loading-text-group">
          <span className="loading-eyebrow">ML PIPELINE EXECUTION IN PROGRESS</span>
          <h2 className="loading-title">Synthesizing Public Consultation Feedback</h2>
          <p className="loading-desc">
            Executing TF-IDF vectorization, Multinomial Naive Bayes sentiment classification,
            phrase n-gram extraction, and issue priority scoring.
          </p>
        </div>
        <div className="loading-stages">
          <div className="stage-pill active">1. Cleaning & Ingestion</div>
          <span className="stage-arrow">→</span>
          <div className="stage-pill active">2. Sentiment & Probabilities</div>
          <span className="stage-arrow">→</span>
          <div className="stage-pill active">3. Phrase Topics & Priority</div>
        </div>
        <p className="loading-disclaimer">
          Analysis execution typically completes within 1–3 seconds on local CPU.
        </p>
      </div>
    </div>
  );
}
