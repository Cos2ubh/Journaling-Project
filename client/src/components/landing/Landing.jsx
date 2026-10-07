import React, { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { track } from '../../services/analytics';
import ScoreDemo from './ScoreDemo';
import '../../styles/AppShell.css';
import '../../styles/Today.css';
import '../../styles/TodayMotion.css';
import '../../styles/Landing.css';

const Landing = () => {
  const { user, loading } = useAuth();

  useEffect(() => {
    track('landing_viewed');
  }, []);

  if (!loading && user) return <Navigate to="/today" replace />;

  return (
    <div className="vd-landing">
      <header className="vd-landing-top">
        <span className="vd-brand">Veritas Daily</span>
        <Link to="/login" className="vd-btn vd-btn-quiet">Log in</Link>
      </header>

      <main className="vd-landing-main">
        <section className="vd-landing-copy">
          <h1 className="vd-landing-title">Five stories a day you can trust.</h1>
          <p className="vd-landing-lead">
            Every morning Veritas Daily picks the most credible news in the topics you follow,
            shows you how each story scored, and ends with a 3-question check so it sticks.
          </p>
          <div className="vd-landing-actions">
            <Link to="/register" className="vd-btn vd-btn-primary" onClick={() => track('landing_cta_clicked', { cta: 'register' })}>
              Get today's briefing
            </Link>
            <span className="vd-landing-free">Free. Takes about 5 minutes a day.</span>
          </div>
        </section>

        <ScoreDemo />
      </main>

      <section className="vd-landing-how" aria-labelledby="how-title">
        <h2 id="how-title">How a story gets its score</h2>
        <dl>
          <div><dt>The source</dt><dd>Each outlet has a reliability rating based on its track record.</dd></div>
          <div><dt>The language</dt><dd>Clickbait and sensational wording lower the score.</dd></div>
          <div><dt>An AI review</dt><dd>Claude reads the article for evidence, named sources and opinion presented as fact.</dd></div>
        </dl>
        <p className="vd-landing-small">You can also paste any link or claim into the checker to see how it scores.</p>
      </section>
    </div>
  );
};

export default Landing;