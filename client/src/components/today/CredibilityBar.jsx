import React, { useState } from 'react';
import { scoreBand } from './format';
import { track } from '../../services/analytics';

/**
 * The credibility meter shown on every story.
 * Experiment "briefing-credibility-display":
 *   visible (control) - meter shown up front
 *   on-tap            - meter behind a "Why trust this?" button
 */
const CredibilityBar = ({ score, sourceScore, variant = 'visible', position }) => {
  const [revealed, setRevealed] = useState(variant !== 'on-tap');
  const band = scoreBand(score);

  if (!revealed) {
    return (
      <button
        className="vd-cred-reveal"
        onClick={() => {
          setRevealed(true);
          track('credibility_revealed', { position, score_band: band.key });
        }}
      >
        Why trust this?
      </button>
    );
  }

  const value = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : 0;
  return (
    <div className={`vd-cred band-${band.key}`}>
      <div className="vd-cred-row">
        <span className="vd-cred-label">{band.label}</span>
        <span className="vd-cred-score">{typeof score === 'number' ? `${Math.round(score)}/100` : '–'}</span>
      </div>
      <div
        className="vd-cred-track"
        role="meter"
        aria-label="Credibility score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="vd-cred-fill" style={{ width: `${value}%` }} />
      </div>
      {typeof sourceScore === 'number' && (
        <p className="vd-cred-note">Source reliability {Math.round(sourceScore)}/100. Score combines source, language and AI review.</p>
      )}
    </div>
  );
};

export default CredibilityBar;