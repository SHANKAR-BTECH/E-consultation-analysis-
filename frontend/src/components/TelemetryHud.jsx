import React from 'react';
import { number, percent } from '../lib/utils.js';

export default function TelemetryHud({ data }) {
  const sentiment = data?.sentiment || { counts: {}, percentages: {} };
  const posCount = sentiment.counts?.positive || 0;
  const neuCount = sentiment.counts?.neutral || 0;
  const negCount = sentiment.counts?.negative || 0;

  const posPct = sentiment.percentages?.positive || 0;
  const neuPct = sentiment.percentages?.neutral || 0;
  const negPct = sentiment.percentages?.negative || 0;

  const avgConf =
    sentiment.average_confidence !== null && sentiment.average_confidence !== undefined
      ? percent(sentiment.average_confidence * 100)
      : 'N/A';

  return (
    <section className="telemetry-hud" aria-label="Key Performance Indicators">
      <div className="hud-tile total-tile">
        <span className="hud-kicker">DATASET VOLUME</span>
        <div className="hud-metric">{number(data.total_responses)}</div>
        <span className="hud-sub">Verified responses</span>
      </div>

      <div className="hud-tile sentiment-tile pos">
        <span className="hud-kicker">POSITIVE RATIO</span>
        <div className="hud-metric positive">{percent(posPct)}</div>
        <span className="hud-sub">{number(posCount)} responses</span>
      </div>

      <div className="hud-tile sentiment-tile neu">
        <span className="hud-kicker">NEUTRAL / EQUIVOCAL</span>
        <div className="hud-metric neutral">{percent(neuPct)}</div>
        <span className="hud-sub">{number(neuCount)} responses</span>
      </div>

      <div className="hud-tile sentiment-tile neg">
        <span className="hud-kicker">NEGATIVE / CRITICAL</span>
        <div className="hud-metric negative">{percent(negPct)}</div>
        <span className="hud-sub">{number(negCount)} responses</span>
      </div>

      <div className="hud-tile conf-tile">
        <span className="hud-kicker">AVG MODEL CONFIDENCE</span>
        <div className="hud-metric">{avgConf}</div>
        <span className="hud-sub">Probabilistic certainty</span>
      </div>
    </section>
  );
}
