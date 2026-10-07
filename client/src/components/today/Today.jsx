import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import briefingService from '../../services/briefingService';
import { track } from '../../services/analytics';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import AppHeader from '../common/AppHeader';
import StoryItem from './StoryItem';
import QuickCheck from './QuickCheck';
import { formatDayKey } from './format';
import '../../styles/AppShell.css';
import '../../styles/Today.css';

const EXPERIMENT = 'briefing-credibility-display';

const Today = () => {
  const { refreshUser } = useAuth();
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
      <main className="vd-page vd-today">
        {status === 'loading' && (
          <div className="vd-state" role="status">
            <h2>Putting together today's briefing</h2>
            <p>Picking the most credible stories and summarising them. The first briefing of the day can take a few seconds.</p>
            <div className="vd-loading-bar" aria-hidden="true" />
          </div>
        )}

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
              <p className="vd-masthead-sub">
                {briefing.stories.length > 0
                  ? `Your ${briefing.stories.length} most credible stories today${briefing.quiz.total > 0 ? `, then a ${briefing.quiz.total}-question check` : ''}.`
                  : 'Your briefing'}
              </p>
            </header>

            {briefing.stories.length === 0 ? (
              <div className="vd-state">
                <h2>Not enough credible news yet</h2>
                <p>New stories are checked every few hours. Come back later today, or browse everything in Explore.</p>
              </div>
            ) : (
              <>
                <div className="vd-stories">
                  {briefing.stories.map((story, i) => (
                    <StoryItem key={story.id} story={story} position={i + 1} variant={variant} />
                  ))}
                </div>
                <QuickCheck
                  quiz={briefing.quiz}
                  streak={briefing.streak}
                  onQuizUpdate={(quiz) => setBriefing((b) => ({ ...b, quiz }))}
                  onStreakChange={onStreakChange}
                />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
};

export default Today;
