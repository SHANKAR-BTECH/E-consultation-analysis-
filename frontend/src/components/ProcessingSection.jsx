import React, { useEffect, useRef } from 'react';

export default function ProcessingSection() {
  const titleRef = useRef(null);

  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus({ preventScroll: true });
    }
  }, []);

  return (
    <section id="processing" className="processing" aria-labelledby="processing-title">
      <div className="activity-line" aria-hidden="true"></div>
      <p className="eyebrow">Analysis in progress</p>
      <h1 id="processing-title" tabIndex="-1" ref={titleRef}>
        Analyzing your consultation.
      </h1>
      <p>Turning the submitted responses into a clearer picture.</p>
      <p className="processing-description">
        Sentiment classification <span>→</span> Recurring phrases <span>→</span> Evidence &amp; findings
      </p>
      <p className="small muted">
        Waiting for the analysis service. These describe the workflow, not live stage progress.
      </p>
    </section>
  );
}
