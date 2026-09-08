import React from 'react';
import { number, percent, title, classOrder, sentimentClass } from '../lib/utils.js';

export default function MajorTopics({ topics, totalResponses, onSelectTopic }) {
  if (!topics || topics.length === 0) {
    return (
      <div className="dossier-card topics-card">
        <div className="card-top-bar">
          <span className="card-kicker-badge">RECURRING CLUSTERS</span>
        </div>
        <h3 className="rail-card-title">Major Consultation Topics</h3>
        <p className="card-empty-note">No recurring phrase clusters extracted from this dataset.</p>
      </div>
    );
  }

  return (
    <div className="dossier-card topics-card" id="topics-section">
      <div className="card-top-bar">
        <span className="card-kicker-badge">RECURRING CLUSTERS</span>
      </div>
      <h3 className="rail-card-title">Major Consultation Topics</h3>
      <p className="rail-card-sub">Select any topic to filter the feedback explorer</p>

      <div className="table-responsive-wrapper">
        <table className="topics-table" aria-label="Extracted topics table">
          <thead>
            <tr>
              <th scope="col">Topic Cluster</th>
              <th scope="col" className="col-numeric">Mentions</th>
              <th scope="col" className="col-numeric">Share</th>
              <th scope="col">Polarity</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic, idx) => {
              const share = totalResponses > 0 ? (topic.count / totalResponses) * 100 : 0;
              return (
                <tr key={idx} className="topic-row">
                  <td className="cell-topic-name">
                    <button
                      type="button"
                      className="btn-topic-filter"
                      onClick={() => onSelectTopic(idx)}
                      title={`Filter citizen explorer by "${topic.topic}"`}
                    >
                      {topic.topic}
                    </button>
                  </td>
                  <td className="cell-numeric">{number(topic.count)}</td>
                  <td className="cell-numeric">{percent(share)}</td>
                  <td className="cell-topic-polarity">
                    <div className="topic-sentiment-pills">
                      {classOrder(topic.sentiment).map((k) => (
                        <span key={k} className={`pill-mini ${sentimentClass(k)}`}>
                          {title(k)[0]} {number(topic.sentiment[k])}
                        </span>
                      ))}
                    </div>
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
