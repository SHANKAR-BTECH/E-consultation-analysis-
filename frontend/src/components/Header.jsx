import React from 'react';

export default function Header({ systemReady, systemError, onReset }) {
  let statusClass = '';
  let statusText = 'Checking system';

  if (systemReady) {
    statusClass = 'ready';
    statusText = 'System ready';
  } else if (systemError) {
    statusClass = 'unavailable';
    statusText = 'Service unavailable';
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <a
          href="/"
          className="brand"
          aria-label="Consultation Analytics home"
          onClick={(e) => {
            e.preventDefault();
            onReset();
          }}
        >
          <span className="brand-glyph" aria-hidden="true">◈</span>
          <span>
            <strong>Consultation Analytics</strong>
            <small>Government Public Consultation Intelligence</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a
            href="#workspace"
            id="nav-analysis"
            aria-current="page"
            onClick={(e) => {
              e.preventDefault();
              onReset();
            }}
          >
            Analysis
          </a>
          <a href="#about">About</a>
          <a href="#help">Help</a>
        </nav>
        <span id="system-status" className={`system-status ${statusClass}`} role="status">
          <i></i>
          {statusText}
        </span>
      </div>
    </header>
  );
}
