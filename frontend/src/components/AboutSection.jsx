import React from 'react';

export default function AboutSection() {
  return (
    <section id="about" className="about-section">
      <p className="eyebrow">A transparent approach</p>
      <div className="about-layout">
        <h2>
          Useful insights.<br />
          Understandable methods.
        </h2>
        <div>
          <p>
            Sentiment is classified with TF-IDF and Multinomial Naive Bayes. Topics and candidate
            issues come from measurable phrase patterns—not semantic policy reasoning.
          </p>
          <details>
            <summary>How the analysis works</summary>
            <div className="methodology">
              <h3>From text to sentiment</h3>
              <p>
                Light preprocessing normalizes text while preserving negation. The saved TF-IDF
                vectorizer represents words and two-word phrases; the saved Naive Bayes classifier
                supplies sentiment probabilities.
              </p>
              <h3>Keywords, topics and evidence</h3>
              <p>
                Actual one-to-three-word phrases are counted once per response. Common stopwords are
                excluded, similar overlapping labels are suppressed, and representative feedback is
                quoted unchanged.
              </p>
              <h3>Issue priority</h3>
              <p>
                A candidate issue needs at least two negative-associated mentions and a negative
                ratio of at least 50%. Priority combines response coverage (40%) and negative ratio
                (60%). It is a documented heuristic, not verified severity.
              </p>
              <h3>Model evaluation</h3>
              <p>Prototype Test Accuracy: 94.20%</p>
              <p>
                1,250 samples in the generated prototype dataset. This controlled evaluation does
                not establish accuracy on real consultation responses. Confidence is not calibrated
                real-world accuracy.
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
