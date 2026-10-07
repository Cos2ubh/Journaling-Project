import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import briefingService from '../../services/briefingService';
import { track } from '../../services/analytics';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import AppHeader from '../common/AppHeader';
import StoryItem from './StoryItem';
import QuickCheck from './QuickCheck';
import BriefingRail from './BriefingRail';
import { formatDayKey } from './format';
import '../../styles/AppShell.css';
import '../../styles/Today.css';
import '../../styles/TodayMotion.css';
import '../../styles/TodayLayout.css';

const EXPERIMENT = 'briefing-credibility-display';

/** Rough reading time: summaries at ~220 wpm plus ~20 seconds per quiz question. */
function readingMinutes(briefing) {
  const words = briefing.stories.reduce((n, s) => n + `${s.title} ${s.summary}`.split(/\s+/).length, 0);
  const seconds = (words / 220) * 60 + briefing.quiz.total * 20;
  return Math.max(1, Math.round(seconds / 60));
}

/** Thin line under the header showing how far down the briefing you are. */
const ReadingProgress = () => {
  const barRef = useRef(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return <div className="vd-progress" aria-hidden="true"><div ref={barRef} className="vd-progress-bar" /></div>;
};

/** Placeholder in the shape of the briefing while it loads. */
const BriefingSkeleton = () => (
  <div className="vd-skeleton" role="status" aria-label="Loading today's briefing">
    <div className="vd-sk vd-sk-date" />
    <div className="vd-sk vd-sk-line" style={{ width: '58%' }} />
    <p className="vd-skeleton-note">Picking today's most credible stories and summarising them. The first briefing of the day takes a few seconds.</p>
    {[0, 1, 2].map((i) => (
      <div key={i} className="vd-sk-story">
        <div className="vd-sk vd-sk-meta" />
        <div className="vd-sk vd-sk-title" />
        <div className="vd-sk vd-sk-title" style={{ width: '64%' }} />
        <div className="vd-sk vd-sk-line" />
        <div className="vd-sk vd-sk-line" />
        <div className="vd-sk vd-sk-line" style={{ width: '72%' }} />
        <div className="vd-sk vd-sk-meter" />
      </div>
    ))}
  </div>
);

const Today = () => {
  const { user, refreshUser } = useAuth();
  const [briefing, setBriefing] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | onboarding
  const [error, setError] = useState('');
  const viewedRef = useRef(false);

  const flag = useFeatureFlag(EXPERIMENT, 'visible');
  const variant = flag === 'on-tap' ? 'on-tap' : 'visible';

  // State is only set in the request callbacks (not synchronously in the effect).
  const fetchBriefing = useCallback(() => briefingService.getToday()
    .then((data) => {
      setBriefing(data);
      setStatus('ready');
    })
    .catch((err) => {
      if (err.response?.data?.code === 'ONBOARDING_REQUIRED') {
        setStatus('onboarding');
        return;
      }
      setError(err.response?.data?.message || "Couldn't load today's briefing.");
      setStatus('error');
    }), []);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);

  const load = () => {
    setStatus('loading');
    setError('');
    fetchBriefing();
  };

  useEffect(() => {
    if (status !== 'ready' || !briefing || viewedRef.current) return;
    viewedRef.current = true;
    track('briefing_viewed', {
      stories: briefing.stories.length,
      quiz_total: briefing.quiz.total,
      already_completed: briefing.quiz.completed,
      streak: briefing.streak?.current || 0,
      credibility_display: variant
    });
  }, [status, briefing, variant]);

  if (status === 'onboarding') return <Navigate to="/onboarding" replace />;

  const onStreakChange = (streak) => {
    setBriefing((b) => ({ ...b, streak }));
    refreshUser(); // keep the header streak in sync
  };

  return (
    <>
      <AppHeader />
      {status === 'ready' && briefing?.stories.length > 0 && <ReadingProgress />}
      <main className="vd-page vd-today">
        {status === 'loading' && <BriefingSkeleton />}

        {status === 'error' && (
          <div className="vd-state" role="alert">
            <h2>Today's briefing didn't load</h2>
            <p>{error} Check your connection, then try again.</p>
            <button className="vd-btn vd-btn-primary" onClick={load}>Try again</button>
          </div>
        )}

        {status === 'ready' && briefing && (
          <>
            <header className="vd-masthead">
              <h1 className="vd-masthead-date">{formatDayKey(briefing.date)}</h1>
              <div className="vd-masthead-sub">
                {briefing.stories.length > 0 ? (
                  <>
                    <p>
                      Your {briefing.stories.length} most credible stories today
                      {briefing.quiz.total > 0 ? `, then a ${briefing.quiz.total}-question check` : ''}.
                    </p>
                    <p className="vd-masthead-time">About {readingMinutes(briefing)} min</p>
                  </>
                ) : (
                  <p>Your briefing</p>
                )}
              </div>
            </header>

            {briefing.stories.length === 0 ? (
              <div className="vd-state">
                <h2>Not enough credible news yet</h2>
                <p>New stories are checked every few hours. Come back later today, or browse everything in Explore.</p>
              </div>
            ) : (
              <div className="vd-today-grid">
                <div className="vd-today-main">
                  <div className="vd-stories">
                    {briefing.stories.map((story, i) => (
                      <StoryItem key={story.id} story={story} position={i + 1} variant={variant} lead={i === 0} />
                    ))}
                  </div>
                  <div id="quick-check" tabIndex={-1} className="vd-anchor">
                    <QuickCheck
                      quiz={briefing.quiz}
                      streak={briefing.streak}
                      onQuizUpdate={(quiz) => setBriefing((b) => ({ ...b, quiz }))}
                      onStreakChange={onStreakChange}
                    />
                  </div>
                </div>
                <BriefingRail briefing={briefing} topics={user?.preferences?.topics || []} />
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
};

export default Today;
