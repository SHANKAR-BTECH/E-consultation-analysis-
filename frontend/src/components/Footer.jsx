import React from 'react';

export default function Footer({ onBackToTop }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <span>◈ Consultation Analytics</span>
        <p>
          E-Consultation Feedback Sentiment Analysis Using NLP &amp; Machine Learning
          <br />
          Academic prototype · Government/public-policy e-consultation
        </p>
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            onBackToTop();
          }}
        >
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}
