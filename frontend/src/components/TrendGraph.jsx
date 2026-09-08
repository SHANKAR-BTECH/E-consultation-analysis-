import React, { useState } from 'react';
import { number, percent } from '../lib/utils.js';

export default function TrendGraph({ history = [], onClearHistory }) {
  const [activeMetric, setActiveMetric] = useState('sentiment'); // 'sentiment' | 'issues'

  const pointsCount = history.length;
  const latest = pointsCount > 0 ? history[pointsCount - 1] : null;

  // Chart dimensions for SVG
  const width = 800;
  const height = 240;
  const padLeft = 50;
  const padRight = 40;
  const padTop = 30;
  const padBottom = 40;

  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;

  const getX = (index) => {
    if (pointsCount <= 1) return padLeft + chartWidth / 2;
    return padLeft + (index / (pointsCount - 1)) * chartWidth;
  };

  const getY = (pct) => {
    return padTop + chartHeight - (pct / 100) * chartHeight;
  };

  // Generate SVG polyline points string
  const getPolyline = (key) => {
    return history
      .map((h, i) => `${getX(i)},${getY(h[key] || 0)}`)
      .join(' ');
  };

  return (
    <section className="report-section trend-graph-section" id="trend-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Longitudinal Dynamics</p>
          <h2>How feedback is changing.</h2>
        </div>
        <p>
          Tracking sentiment evolution across recorded consultation periods.
          Stored persistently to monitor public sentiment trajectory over time.
        </p>
      </div>

      <div className="trend-card-container">
        <div className="trend-card-header">
          <div className="trend-meta">
            <span className="trend-points-count">
              {pointsCount} {pointsCount === 1 ? 'consultation recorded' : 'consultation periods recorded'}
            </span>
            {pointsCount > 1 && (
              <button
                type="button"
                className="link-button small muted"
                onClick={onClearHistory}
                title="Reset local trend history"
              >
                Reset history ✕
              </button>
            )}
          </div>
          <div className="trend-legend">
            <span className="legend-chip pos">
              <i className="dot" /> Positive %
            </span>
            <span className="legend-chip neu">
              <i className="dot" /> Neutral %
            </span>
            <span className="legend-chip neg">
              <i className="dot" /> Negative %
            </span>
          </div>
        </div>

        <div className="svg-chart-wrapper">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="trend-svg"
            preserveAspectRatio="xMidYMid meet"
            aria-label="Longitudinal sentiment graph"
          >
            {/* Horizontal Grid lines */}
            {[0, 25, 50, 75, 100].map((val) => {
              const y = getY(val);
              return (
                <g key={val}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    className="grid-line"
                  />
                  <text x={padLeft - 10} y={y + 4} className="axis-text" textAnchor="end">
                    {val}%
                  </text>
                </g>
              );
            })}

            {/* If only 1 point, draw single point with guide text */}
            {pointsCount === 1 && latest && (
              <g className="single-point-group">
                {/* Positive point */}
                <circle cx={getX(0)} cy={getY(latest.positive_pct)} r={6} className="pt-circle pos" />
                {/* Neutral point */}
                <circle cx={getX(0)} cy={getY(latest.neutral_pct)} r={6} className="pt-circle neu" />
                {/* Negative point */}
                <circle cx={getX(0)} cy={getY(latest.negative_pct)} r={6} className="pt-circle neg" />

                <text x={getX(0)} y={height - 15} textAnchor="middle" className="axis-text date-label">
                  Current Analysis ({latest.label || 'Run 1'})
                </text>
              </g>
            )}

            {/* If 2 or more points, draw line paths */}
            {pointsCount > 1 && (
              <g className="trend-lines-group">
                {/* Positive Line */}
                <polyline
                  fill="none"
                  stroke="#35715a"
                  strokeWidth="2.5"
                  points={getPolyline('positive_pct')}
                />
                {/* Neutral Line */}
                <polyline
                  fill="none"
                  stroke="#7a8693"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                  points={getPolyline('neutral_pct')}
                />
                {/* Negative Line */}
                <polyline
                  fill="none"
                  stroke="#a74b42"
                  strokeWidth="2.5"
                  points={getPolyline('negative_pct')}
                />

                {/* Data point dots */}
                {history.map((h, i) => (
                  <g key={i}>
                    <circle cx={getX(i)} cy={getY(h.positive_pct)} r={4.5} className="pt-circle pos" />
                    <circle cx={getX(i)} cy={getY(h.neutral_pct)} r={4} className="pt-circle neu" />
                    <circle cx={getX(i)} cy={getY(h.negative_pct)} r={4.5} className="pt-circle neg" />
                    <text x={getX(i)} y={height - 15} textAnchor="middle" className="axis-text date-label">
                      {h.label || `Run ${i + 1}`}
                    </text>
                  </g>
                ))}
              </g>
            )}
          </svg>
        </div>

        {pointsCount <= 1 ? (
          <div className="trend-empty-note">
            <p className="muted">
              Trend history will appear as additional consultations are analyzed.
            </p>
          </div>
        ) : (
          <div className="trend-interpretation-box">
            <p className="small">
              <strong>Longitudinal observation:</strong>{' '}
              {history[pointsCount - 1]?.interpretation ||
                `Comparing Run 1 with Run ${pointsCount}: Positive feedback shifted from ${percent(
                  history[0].positive_pct
                )} to ${percent(history[pointsCount - 1].positive_pct)}, and negative feedback shifted from ${percent(
                  history[0].negative_pct
                )} to ${percent(history[pointsCount - 1].negative_pct)}.`}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
