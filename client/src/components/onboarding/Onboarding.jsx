import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import meService from '../../services/meService';
import { track } from '../../services/analytics';
import TopicPicker, { FREE_TOPIC_LIMIT } from './TopicPicker';
import ProModal from '../common/ProModal';
import '../../styles/AppShell.css';
import '../../styles/Onboarding.css';

const Onboarding = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [topics, setTopics] = useState([]);
  const [digestOptIn, setDigestOptIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [proOpen, setProOpen] = useState(false);

  useEffect(() => {
    track('onboarding_started');
  }, []);

  if (user?.onboarded) return <Navigate to="/today" replace />;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await meService.updatePreferences({ topics, digestOptIn });
      track('onboarding_completed', { topics_count: topics.length, topics, digest_opt_in: digestOptIn });
      updateUser(updated);
      navigate('/today', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save your topics. Try again.");
      setSaving(false);
    }
  };

  return (
    <main className="vd-onboarding">
      <div className="vd-onboarding-inner">
        <p className="vd-onboarding-brand">Veritas Daily</p>
        <h1 className="vd-onboarding-title">What do you want to follow?</h1>
        <p className="vd-onboarding-lead">
          Pick up to {FREE_TOPIC_LIMIT} topics. Each morning your briefing leads with the most credible stories in them.
        </p>

        <TopicPicker
          selected={topics}
          onChange={setTopics}
          onLimitReached={() => setProOpen(true)}
        />
        <p className="vd-topics-count" aria-live="polite">
          {topics.length} of {FREE_TOPIC_LIMIT} selected
        </p>

        <label className="vd-check">
          <input type="checkbox" checked={digestOptIn} onChange={(e) => setDigestOptIn(e.target.checked)} />
          <span>Email me my briefing every morning at 7</span>
        </label>

        {error && <p className="vd-form-error" role="alert">{error}</p>}

        <button className="vd-btn vd-btn-primary vd-onboarding-cta" onClick={save} disabled={topics.length === 0 || saving}>
          {saving ? 'Building your briefing…' : 'Build my briefing'}
        </button>
      </div>

      <ProModal isOpen={proOpen} onClose={() => setProOpen(false)} source="topic-limit" />
    </main>
  );
};

export default Onboarding;