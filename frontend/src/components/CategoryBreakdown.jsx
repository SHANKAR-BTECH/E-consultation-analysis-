import React from 'react';
import { number, title, classOrder, sentimentClass } from '../lib/utils.js';

export default function CategoryBreakdown({ categories }) {
  if (!categories?.available) {
    return (
      <div className="dossier-card category-card">
        <div className="card-top-bar">
          <span className="card-kicker-badge">DEPARTMENTAL DISAGGREGATION</span>
        </div>
        <h3 className="rail-card-title">Category Breakdown</h3>
        <div className="unavailable-callout">
          <strong>Category Analytics Inactive</strong>
          <p>{categories?.reason || 'Category or department column was not mapped in this dataset.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dossier-card category-card">
      <div className="card-top-bar">
        <span className="card-kicker-badge">DEPARTMENTAL DISAGGREGATION</span>
      </div>
      <h3 className="rail-card-title">Category Breakdown</h3>
      <p className="rail-card-sub">
        {number(categories.categorized_responses)} categorized · {number(categories.uncategorized_responses)} uncategorized
      </p>

      <div className="table-responsive-wrapper">
        <table className="categories-table" aria-label="Departmental categories">
          <thead>
            <tr>
              <th scope="col">Department</th>
              <th scope="col" className="col-numeric">Volume</th>
              <th scope="col">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {categories.groups.map((grp, i) => {
              const totalGrp = grp.total_responses || 1;
              const counts = grp.sentiment?.counts || {};
              return (
                <tr key={i} className="category-row">
                  <td className="cell-cat-name">
                    <strong>{grp.category}</strong>
                  </td>
                  <td className="cell-numeric">{number(grp.total_responses)}</td>
                  <td className="cell-cat-sentiment">
                    <div className="mini-stacked-bar">
                      {classOrder(counts).map((k) => {
                        const w = ((counts[k] || 0) / totalGrp) * 100;
                        return (
                          <span
                            key={k}
                            className={`mini-bar-seg fill-${sentimentClass(k)}`}
                            style={{ width: `${w}%` }}
                            title={`${title(k)}: ${counts[k]}`}
                          />
                        );
                      })}
                    </div>
                    {grp.issues && grp.issues.length > 0 && (
                      <div className="cat-sub-issues">
                        {grp.issues.map((iss, j) => (
                          <span key={j} className="cat-issue-pill">
                            {iss.issue} ({number(iss.mentions)})
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
