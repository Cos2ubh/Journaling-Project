import React, { useId, useState } from 'react';
import { scoreBand } from './format';
import { track } from '../../services/analytics';
import { useCountUp, useInView } from '../../hooks/useMotion';

const SIGNALS = [
  { key: 'source', label: 'Source reliability', help: "The outlet's track record" },
  { key: 'language', label: 'Language', help: 'Lower for clickbait and sensational wording' },
  { key: 'aiReview', label: 'AI review', help: 'Evidence, named sources, opinion vs fact' }
];

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/** One row of the breakdown: label, value and a thin bar that fills when shown. */
const SignalRow = ({ label, help, value, active, order }) => {
  const shown = useCountUp(typeof value === 'number' ? clamp(value) : 0, { start: active, duration: 700, delay: order * 120 });
  const band = scoreBand(value);
  return (
    <li className={`vd-signal band-${band.key}`} style={{ '--order': order }}>
      <div className="vd-signal-row">
        <span className="vd-signal-label">{label}</span>
        <span className="vd-signal-value">{typeof value === 'number' ? shown : '–'}</span>
      </div>
      <div className="vd-signal-track" aria-hidden="true">
        <div className="vd-signal-fill" style={{ '--to': `${active && typeof value === 'number' ? clamp(value) : 0}%` }} />
      </div>
      <p className="vd-signal-help">{help}</p>
    </li>
  );
};

/**
 * The credibility meter on every story.
 * Experiment "briefing-credibility-display": visible (control) | on-tap.
 * Motion: when the meter scrolls into view, it "measures" (fill + count-up),
 * staggered by the story's position. Reduced motion shows the final state.
 */
const CredibilityBar = ({ score, signals = {}, variant = 'visible', position = 1 }) => {
  const [revealed, setRevealed] = useState(variant !== 'on-tap');
  const [open, setOpen] = useState(false);
  const [ref, inView] = useInView();
  const panelId = useId();

  const band = scoreBand(score);
  const value = typeof score === 'number' ? clamp(score) : 0;
  const measuring = revealed && inView;
  const delay = variant === 'on-tap' ? 0 : Math.min(position - 1, 4) * 140;
  const shown = useCountUp(value, { start: measuring, duration: 1000, delay });

  if (!revealed) {
    return (
      <div ref={ref}>
        <button
          className="vd-cred-reveal"
          onClick={() => {
            setRevealed(true);
            track('credibility_revealed', { position, score_band: band.key });
          }}
        >
          Why trust this?
        </button>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`vd-cred band-${band.key}${measuring ? ' is-measured' : ''}`}
      style={{ '--delay': `${delay}ms`, '--to': `${value}%` }}
    >
      <div className="vd-cred-row">
        <span className="vd-cred-label">{band.label}</span>
        <span className="vd-cred-score" aria-hidden="true">{typeof score === 'number' ? shown : '–'}<span className="vd-cred-of">/100</span></span>
      </div>
      <div
        className="vd-cred-track"
        role="meter"
        aria-label={`Credibility score ${value} out of 100`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="vd-cred-fill" />
        {[40, 55, 70, 80].map((tick) => <span key={tick} className="vd-cred-tick" style={{ left: `${tick}%` }} />)}
      </div>

      <button
        className="vd-cred-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) track('score_breakdown_opened', { position, score_band: band.key });
        }}
      >
        How this was scored
        <svg className="vd-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div id={panelId} className={`vd-cred-panel${open ? ' open' : ''}`} hidden={!open}>
        <ul className="vd-signals">
          {SIGNALS.map((s, i) => (
            <SignalRow key={s.key} label={s.label} help={s.help} value={signals[s.key]} active={open} order={i} />
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CredibilityBar;
