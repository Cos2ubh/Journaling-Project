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
              onLimitReached={() => setProOpen(true)}
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
      </main>
      <ProModal isOpen={proOpen} onClose={() => setProOpen(false)} source="topic-limit" />
    </>
  );
};

export default Settings;