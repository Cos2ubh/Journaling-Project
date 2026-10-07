import React, { useEffect, useState } from 'react';
import { scoreBand } from '../today/format';
import { useCountUp, prefersReducedMotion } from '../../hooks/useMotion';

/** Invented examples (clearly labelled) that show the range of scores. */
const EXAMPLES = [
  {
    tab: 'Credible',
    source: 'Example Times',
    time: '2 hours ago',
    title: 'City council approves three new bus routes after public consultation',
    summary: 'The council voted 9 to 2 to add routes linking the east side to the central station, after 4,000 residents responded to a survey. Service starts in March.',
    signals: { source: 91, language: 96, aiReview: 84 },
    score: 88
  },
  {
    tab: 'Mixed',
    source: 'Daily Buzz Wire',
    time: '5 hours ago',
    title: 'Experts warn the latest phone update could drain batteries faster',
    summary: 'Some users report shorter battery life after the update. The article quotes two unnamed engineers and one user forum; the manufacturer has not commented.',
    signals: { source: 58, language: 64, aiReview: 52 },
    score: 57
  },
  {
    tab: 'Clickbait',
    source: 'ViralNow Report',
    time: '1 hour ago',
    title: 'SHOCKING: This one food is secretly destroying your memory, doctors stunned',
    summary: 'The post cites "a new study" without naming it, links to a supplement shop, and asks readers to share before it gets taken down.',
    signals: { source: 22, language: 8, aiReview: 14 },
    score: 15
  }
];

const SIGNALS = [
  { key: 'source', label: 'Source reliability' },
  { key: 'language', label: 'Language' },
  { key: 'aiReview', label: 'AI review' }
];

// reading -> scoring -> scored -> (hold) -> next example
const TIMING = { reading: 1300, scoring: 1100, hold: 3600 };

const DemoSignal = ({ label, value, active, order }) => {
  const shown = useCountUp(value, { start: active, duration: 600, delay: order * 280 });
  const band = scoreBand(value);
  return (
    <li className={`vd-signal band-${band.key}`} style={{ '--order': order }}>
      <div className="vd-signal-row">
        <span className="vd-signal-label">{label}</span>
        <span className="vd-signal-value">{active ? shown : '–'}</span>
      </div>
      <div className="vd-signal-track" aria-hidden="true">
        <div className={`vd-demo-fill${active ? ' on' : ''}`} style={{ '--to': `${value}%`, '--order': order }} />
      </div>
    </li>
  );
};

const ScoreDemo = () => {
  const reduced = prefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(reduced ? 'scored' : 'reading');
  const [paused, setPaused] = useState(false);
  const example = EXAMPLES[index];
  const band = scoreBand(example.score);
  const total = useCountUp(example.score, { start: phase === 'scored', duration: 800 });

  useEffect(() => {
    if (reduced) return undefined;
    const timers = [];
    if (phase === 'reading') timers.push(setTimeout(() => setPhase('scoring'), TIMING.reading));
    if (phase === 'scoring') timers.push(setTimeout(() => setPhase('scored'), TIMING.scoring));
    if (phase === 'scored' && !paused) {
      timers.push(setTimeout(() => {
        setIndex((i) => (i + 1) % EXAMPLES.length);
        setPhase('reading');
      }, TIMING.hold));
    }
    return () => timers.forEach(clearTimeout);
  }, [phase, paused, reduced]);

  const choose = (i) => {
    setIndex(i);
    setPhase(reduced ? 'scored' : 'reading');
  };

  const signalsActive = phase === 'scoring' || phase === 'scored';

  return (
    <aside
      className={`vd-demo phase-${phase}`}
      aria-label="Example: how Veritas Daily scores a story"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="vd-demo-tabs" role="group" aria-label="Example stories">
        <span className="vd-demo-tag">Example</span>
        {EXAMPLES.map((ex, i) => (
          <button key={ex.tab} className={`vd-demo-tab${i === index ? ' on' : ''}`} aria-pressed={i === index} onClick={() => choose(i)}>
            {ex.tab}
          </button>
        ))}
      </div>

      <div className="vd-demo-story" key={index}>
        <p className="vd-story-meta"><span className="vd-story-source">{example.source}</span><span>{example.time}</span></p>
        <h2 className="vd-story-title vd-demo-text">{example.title}</h2>
        <p className="vd-story-summary vd-demo-text">{example.summary}</p>
        <div className="vd-demo-scan" aria-hidden="true" />
      </div>

      <ul className="vd-signals vd-demo-signals">
        {SIGNALS.map((s, i) => (
          <DemoSignal key={`${index}-${s.key}`} label={s.label} value={example.signals[s.key]} active={signalsActive} order={i} />
        ))}
      </ul>

      <div className={`vd-demo-total band-${band.key}`}>
        <span className="vd-demo-status" aria-live="polite">
          {phase === 'reading' ? 'Reading the story…' : phase === 'scoring' ? 'Checking signals…' : band.label}
        </span>
        <span className="vd-demo-score">{phase === 'scored' ? total : '–'}<span className="vd-cred-of">/100</span></span>
      </div>
    </aside>
  );
};

export default ScoreDemo;
