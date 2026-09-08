import React from 'react';

export default function SystemAlerts({ systemError }) {
  if (!systemError) return null;

  return (
    <div className="alert-container" role="alert">
      <div className="sys-banner error">
        <span className="banner-icon" aria-hidden="true">⚠</span>
        <div className="banner-content">
          <strong>Backend Service Alert:</strong>
          <span>{systemError}</span>
        </div>
      </div>
    </div>
  );
}
