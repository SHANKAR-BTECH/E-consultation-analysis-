import React from 'react';

export default function HelpSection() {
  return (
    <section id="help" className="help-section">
      <h2>A little help getting started.</h2>
      <div className="help-grid">
        <div>
          <h3>Pasting responses</h3>
          <p>
            Choose new lines or blank lines as the separator. Check the detected count before
            submitting. English-language text is supported.
          </p>
        </div>
        <div>
          <h3>Preparing a CSV</h3>
          <p>
            Use UTF-8 encoding and a header row. Select the response column after inspection.
            Dates and categories are optional.
          </p>
        </div>
        <div>
          <h3>Working within the limits</h3>
          <p id="limits-help">
            Up to 2,000 responses per analysis, 4,000 characters per response, and 500,000 combined
            characters.
          </p>
          <p>URL extraction is not yet available.</p>
        </div>
      </div>
    </section>
  );
}
