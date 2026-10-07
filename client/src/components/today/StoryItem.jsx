import React from 'react';
import CredibilityBar from './CredibilityBar';
import { scoreBand, timeAgo } from './format';
import { track } from '../../services/analytics';

const StoryItem = ({ story, position, variant }) => {
  const open = () => track('story_opened', {
    position,
    source: story.source,
    score_band: scoreBand(story.score).key,
    credibility_display: variant
  });

  return (
    <article className="vd-story">
      <p className="vd-story-meta">
        <span className="vd-story-source">{story.source}</span>
        <span className="vd-story-time">{timeAgo(story.publishedAt)}</span>
      </p>
      <h2 className="vd-story-title">
        <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={open}>{story.title}</a>
      </h2>
      <p className="vd-story-summary">{story.summary}</p>
      <CredibilityBar score={story.score} sourceScore={story.sourceScore} variant={variant} position={position} />
      <div className="vd-story-foot">
        {story.topics?.length > 0 && (
          <ul className="vd-story-topics" aria-label="Topics">
            {story.topics.slice(0, 2).map((t) => <li key={t.slug}>{t.name}</li>)}
          </ul>
        )}
        <a className="vd-story-link" href={story.url} target="_blank" rel="noopener noreferrer" onClick={open}>
          Read at {story.source}
        </a>
      </div>
    </article>
  );
};

export default StoryItem;