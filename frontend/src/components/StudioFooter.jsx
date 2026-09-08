import React from 'react';

export default function StudioFooter() {
  return (
    <footer className="studio-footer" role="contentinfo">
      <div className="footer-inner">
        <div className="footer-brand-lockup">
          <span className="brand-glyph" aria-hidden="true">◈</span>
          <div className="footer-texts">
            <strong>CONSULTATION ANALYTICS STUDIO</strong>
            <p>
              E-Consultation Feedback Sentiment Analysis Using NLP & Machine Learning.
              Academic prototype for public-policy consultation intelligence.
            </p>
          </div>
        </div>

        <div className="footer-links">
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
