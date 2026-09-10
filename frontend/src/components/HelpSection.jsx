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
          <h3>Uploading a PDF</h3>
          <p>
            Use a .pdf file with selectable text. Extracted text lines become the responses
            analyzed, exactly as they appear in the document.
          </p>
        </div>
        <div>
          <h3>Uploading an Excel workbook</h3>
          <p>
            Use a .xlsx file with a header row. Select the sheet and then the feedback column
            before analyzing.
          </p>
        </div>
        <div>
          <h3>Working within the limits</h3>
          <p id="limits-help">
            Up to 2,000 responses per analysis, 4,000 characters per response, and 500,000 combined
            characters.
          </p>
        </div>
      </div>
    </section>
  );
}
