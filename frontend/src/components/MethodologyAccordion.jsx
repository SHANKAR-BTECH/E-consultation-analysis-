import React, { useState } from 'react';

export default function MethodologyAccordion() {
  const [open, setOpen] = useState(false);

  return (
    <div className="dossier-card methodology-card" id="methodology">
      <div className="card-top-bar">
        <span className="card-kicker-badge">ALGORITHMIC GOVERNANCE</span>
      </div>
      <h3 className="rail-card-title">NLP Architecture & Governance</h3>
      <p className="rail-card-sub">Explainable feature extraction and model limits</p>

      <div className="methodology-accordion-wrap">
        <button
          type="button"
          className="btn-audit-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <span>{open ? 'Collapse Specifications' : 'Inspect Pipeline Specifications'}</span>
          <span className="toggle-icon">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div className="methodology-content">
            <div className="methodology-block">
              <h4>1. Preprocessing & Negation</h4>
              <p>
                Text is normalized to lowercase while retaining critical negation constructs (e.g., <em>not, never, no</em>).
                Punctuation is normalized; emojis and control characters are scrubbed.
              </p>
            </div>

            <div className="methodology-block">
              <h4>2. TF-IDF & Multinomial Naive Bayes</h4>
              <p>
                Unigrams and bigrams are weighted using Term Frequency-Inverse Document Frequency.
                Multinomial Naive Bayes infers class probabilities across positive, neutral, and negative labels.
              </p>
            </div>

            <div className="methodology-block">
              <h4>3. Phrase Discovery & Issue Scoring</h4>
              <p>
                1-to-3-word candidate n-grams are extracted per response. Candidate issues require at least 2 negative mentions
                and a minimum 50% negative correlation. Priority blends response frequency (40%) and negative ratio (60%).
              </p>
            </div>

            <div className="methodology-block">
              <h4>4. Prototype Benchmark Metrics</h4>
              <p>
                Prototype Test Accuracy: <strong>94.20%</strong> across controlled public-policy consultation corpora.
                Confidence scores represent model posterior probability, not empirical real-world ground truth.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
