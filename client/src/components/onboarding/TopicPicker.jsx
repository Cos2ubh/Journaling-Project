import React, { useEffect, useState } from 'react';
import meService from '../../services/meService';
import '../../styles/Onboarding.css';

export const FREE_TOPIC_LIMIT = 3;

/**
 * Topic chooser shared by onboarding and settings.
 * Selecting beyond the free limit calls onLimitReached instead of selecting.
 */
const TopicPicker = ({ selected, onChange, onLimitReached, limit = FREE_TOPIC_LIMIT }) => {
  const [topics, setTopics] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    meService.getTopics()
      .then((list) => {
        if (cancelled) return;
        setTopics(list.filter((t) => t.isActive !== false).sort((a, b) => a.name.localeCompare(b.name)));
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => { cancelled = true; };
  }, []);

  const toggle = (slug) => {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else if (selected.length >= limit) {
      onLimitReached?.();
    } else {
      onChange([...selected, slug]);
    }
  };

  if (status === 'loading') return <p className="vd-topics-status">Loading topics…</p>;
  if (status === 'error') return <p className="vd-topics-status error">Couldn't load topics. Refresh the page to try again.</p>;

  return (
    <div className="vd-topics" role="group" aria-label="Topics">
      {topics.map((topic) => {
        const on = selected.includes(topic.slug);
        return (
          <button
            key={topic.slug}
            type="button"
            className={`vd-topic${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={() => toggle(topic.slug)}
            style={{ '--topic-color': topic.color || 'var(--accent-primary)' }}
          >
            <span className="vd-topic-dot" aria-hidden="true" />
            {topic.name}
          </button>
        );
      })}
    </div>
  );
};

export default TopicPicker;
