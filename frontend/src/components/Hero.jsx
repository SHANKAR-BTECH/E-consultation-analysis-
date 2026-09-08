import React from 'react';

export default function Hero() {
  return (
    <div className="intro">
      <div>
        <p className="eyebrow">Public consultation analysis</p>
        <h1 id="workspace-title">
          Understand what people<br />
          are <em>really saying.</em>
        </h1>
        <p className="intro-copy">
          Analyze public consultation responses to uncover sentiment,<br className="desktop-break" /> recurring
          concerns, major topics and the issues that deserve attention.
        </p>
      </div>
      <aside className="intro-note">
        <span className="note-rule"></span>
        <p>
          A clearer view of public feedback.<br />
          Grounded in the original responses.
        </p>
        <a href="#about">
          Explore the methodology <span aria-hidden="true">↗</span>
        </a>
      </aside>
    </div>
  );
}
