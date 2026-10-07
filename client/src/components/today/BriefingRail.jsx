import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ActivityStrip from './ActivityStrip';
import { scoreBand } from './format';
import { prefersReducedMotion } from '../../hooks/useMotion';

/**
 * Desktop side rail: index of today's stories (highlights the one being read),
 * quick-check progress, streak history and topics. Hidden on small screens.
 */
const BriefingRail = ({ briefing, topics = [] }) => {
  const [active, setActive] = useState(1);
  const { stories, quiz, streak } = briefing;
  const answered = quiz.questions.filter((q) => q.answered).length;

  // Scroll-spy: the story closest to the upper third of the screen is "active".
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const targets = stories.map((_, i) => document.getElementById(`story-${i + 1}`)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length) {
        const top = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        setActive(Number(top.target.id.replace('story-', '')));
      }
    }, { rootMargin: '-25% 0px -60% 0px' });
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [stories]);

  const jump = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    el.focus?.({ preventScroll: true });
  };

  return (
    <aside className="vd-rail" aria-label="Briefing overview">
      <section className="vd-rail-block">
        <h2 className="vd-rail-title">In this briefing</h2>
        <ol className="vd-index">
          {stories.map((s, i) => {
            const band = scoreBand(s.score);
            return (
              <li key={s.id}>
                <a
                  href={`#story-${i + 1}`}
                  onClick={jump(`story-${i + 1}`)}
                  className={`vd-index-item${active === i + 1 ? ' active' : ''}`}
                  aria-current={active === i + 1 ? 'true' : undefined}
                >
                  <span className="vd-index-title">{s.title}</span>
                  <span className={`vd-index-score band-${band.key}`} title={band.label}>
                    {typeof s.score === 'number' ? Math.round(s.score) : '–'}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>

      {quiz.total > 0 && (
        <section className="vd-rail-block">
          <a href="#quick-check" onClick={jump('quick-check')} className="vd-rail-check">
            <span>
              <span className="vd-rail-title">Quick check</span>
              <span className="vd-rail-sub">
                {quiz.completed
                  ? `Done: ${quiz.correctCount} of ${quiz.total} right`
                  : answered > 0 ? `${answered} of ${quiz.total} answered` : `${quiz.total} questions waiting`}
              </span>
            </span>
            <span className="vd-rail-dots" aria-hidden="true">
              {quiz.questions.map((q) => (
                <i key={q.index} className={q.answered ? (q.correct ? 'right' : 'wrong') : ''} />
              ))}
            </span>
          </a>
        </section>
      )}

      <section className="vd-rail-block">
        <div className="vd-rail-streak">
          <span className="vd-rail-streak-number">{streak?.current || 0}</span>
          <span className="vd-rail-sub">
            day streak{streak?.longest > (streak?.current || 0) ? `. Best: ${streak.longest}` : ''}
          </span>
        </div>
        <ActivityStrip refreshKey={quiz.completed ? 'done' : 'open'} />
      </section>

      {topics.length > 0 && (
        <section className="vd-rail-block">
          <div className="vd-rail-row">
            <h2 className="vd-rail-title">Your topics</h2>
            <Link to="/settings" className="vd-rail-link">Edit</Link>
          </div>
          <ul className="vd-rail-topics">
            {topics.map((t) => <li key={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</li>)}
          </ul>
        </section>
      )}
    </aside>
  );
};

export default BriefingRail;
