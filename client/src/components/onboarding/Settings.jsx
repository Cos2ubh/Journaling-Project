import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import meService from '../../services/meService';
import { track } from '../../services/analytics';
import AppHeader from '../common/AppHeader';
import ProModal from '../common/ProModal';
import TopicPicker, { FREE_TOPIC_LIMIT } from './TopicPicker';
import '../../styles/AppShell.css';
import '../../styles/Onboarding.css';

const Settings = () => {
  const { user, updateUser } = useAuth();
  const [topics, setTopics] = useState(user?.preferences?.topics || []);
  const [digestOptIn, setDigestOptIn] = useState(Boolean(user?.preferences?.digestOptIn));
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');
  const [proOpen, setProOpen] = useState(false);
  const [proSource, setProSource] = useState('topic-limit');
  const [leaveStep, setLeaveStep] = useState('idle'); // idle | confirm | leaving | error

  const openPro = (source) => { setProSource(source); setProOpen(true); };

  const leaveWaitlist = async () => {
    setLeaveStep('leaving');
    try {
      const updated = await meService.leaveProWaitlist();
      updateUser(updated);
      track('pro_waitlist_left');
      setLeaveStep('idle');
    } catch {
      setLeaveStep('error');
    }
  };

  const REASON_TEXT = {
    checks: 'checking forwards and links',
    topics: 'following more topics',
    updates: 'hearing when stories are corrected',
    other: 'something else'
  };
  const waitlist = user?.proWaitlist;

  const save = async (e) => {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      const before = user?.preferences || {};
      const updated = await meService.updatePreferences({ topics, digestOptIn });
      updateUser(updated);
      if (Boolean(before.digestOptIn) !== digestOptIn) track('digest_toggled', { enabled: digestOptIn, source: 'settings' });
      track('preferences_updated', { topics_count: topics.length });
      setStatus('saved');
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save your settings. Try again.");
      setStatus('error');
    }
  };

  return (
    <>
      <AppHeader />
      <main className="vd-page">
        <h1 className="vd-settings-title">Settings</h1>
        <form onSubmit={save}>
          <section className="vd-settings-section">
            <h2>Topics</h2>
            <p className="vd-settings-help">Your briefing leads with these. Changes apply from tomorrow's briefing.</p>
            <TopicPicker
              selected={topics}
              onChange={(next) => { setTopics(next); setStatus('idle'); }}
              onLimitReached={() => openPro('topic-limit')}
            />
            <p className="vd-topics-count">{topics.length} of {FREE_TOPIC_LIMIT} selected</p>
          </section>

          <section className="vd-settings-section">
            <h2>Morning email</h2>
            <label className="vd-check">
              <input type="checkbox" checked={digestOptIn} onChange={(e) => { setDigestOptIn(e.target.checked); setStatus('idle'); }} />
              <span>Email me my briefing every morning at 7</span>
            </label>
          </section>

          {error && <p className="vd-form-error" role="alert">{error}</p>}
          <div className="vd-settings-actions">
            <button className="vd-btn vd-btn-primary" type="submit" disabled={topics.length === 0 || status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            {status === 'saved' && <span className="vd-saved" role="status">Changes saved</span>}
          </div>
        </form>

        <section className="vd-settings-section vd-settings-pro" aria-labelledby="pro-settings-title">
          <h2 id="pro-settings-title">Pro waitlist</h2>
          {user?.joinedProWaitlist ? (
            <>
              <p className="vd-settings-help">
                You joined on {new Date(waitlist?.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.
                We'll email you once when Pro launches.
                {waitlist?.reason ? ` You said you'd use it for ${REASON_TEXT[waitlist.reason]}.` : ''}
              </p>
              {leaveStep === 'confirm' || leaveStep === 'leaving' ? (
                <div className="vd-settings-confirm" role="group" aria-label="Confirm leaving the waitlist">
                  <span>Leave the waitlist? You won't hear when Pro launches.</span>
                  <button type="button" className="vd-btn vd-btn-secondary" onClick={leaveWaitlist} disabled={leaveStep === 'leaving'}>
                    {leaveStep === 'leaving' ? 'Leaving…' : 'Leave the waitlist'}
                  </button>
                  <button type="button" className="vd-btn vd-btn-quiet" onClick={() => setLeaveStep('idle')}>Stay on it</button>
                </div>
              ) : (
                <div className="vd-settings-inline">
                  {!waitlist?.reason && (
                    <button type="button" className="vd-btn vd-btn-secondary" onClick={() => openPro('settings')}>
                      Tell us what you'd use it for
                    </button>
                  )}
                  <button type="button" className="vd-btn vd-btn-quiet" onClick={() => setLeaveStep('confirm')}>Leave the waitlist</button>
                </div>
              )}
              {leaveStep === 'error' && <p className="vd-form-error" role="alert">Couldn't leave the waitlist. Try again.</p>}
            </>
          ) : (
            <>
              <p className="vd-settings-help">Pro isn't available yet. Join the waitlist to hear when it launches; nothing is charged.</p>
              <button type="button" className="vd-btn vd-btn-secondary" onClick={() => openPro('settings')}>See what Pro includes</button>
            </>
          )}
        </section>
      </main>
      <ProModal isOpen={proOpen} onClose={() => setProOpen(false)} source={proSource} />
    </>
  );
};

export default Settings;