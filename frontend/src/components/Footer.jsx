import React from 'react';
 
export default function Footer({ onBackToTop }) {
  const handleScrollTop = (e) => {
    e.preventDefault();
    if (typeof onBackToTop === 'function') {
      onBackToTop();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-meta">
          <span className="footer-glyph" aria-hidden="true">◈</span>
          <div>
            <strong>Consultation Analytics</strong>
            <p>
              E-Consultation Feedback Sentiment Analysis Using NLP &amp; Machine Learning
              <br />
              Academic prototype · Government/public-policy e-consultation
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button secondary back-to-top-btn"
          onClick={handleScrollTop}
          aria-label="Scroll back to top of page"
        >
          Back to top <span aria-hidden="true">↑</span>
        </button>
      </div>
    </footer>
  );
}
