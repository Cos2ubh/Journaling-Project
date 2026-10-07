import React, { useState } from 'react';
import CredibilityBar from './CredibilityBar';
import { scoreBand, timeAgo } from './format';
import { track } from '../../services/analytics';

/**
 * One story. `lead` gives the first story a front-page treatment on wide screens.
 * The publisher image sits beside the text; if it fails to load it's dropped.
 */
const StoryItem = ({ story, position, variant, lead = false }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(story.image) && !imageFailed;

  const open = () => track('story_opened', {
    position,
    source: story.source,
    score_band: scoreBand(story.score).key,
    credibility_display: variant
  });

  return (
    <article
      id={`story-${position}`}
      tabIndex={-1}
      className={`vd-story${lead ? ' lead' : ''}${showImage ? ' has-image' : ''}`}
    >
      <div className="vd-story-body">
        <p className="vd-story-meta">
          <span className="vd-story-source">{story.source}</span>
          <time className="vd-story-time" dateTime={story.publishedAt}>{timeAgo(story.publishedAt)}</time>
        </p>
        <h2 className="vd-story-title">
          <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={open}>
            <span className="vd-underline">{story.title}</span>
          </a>
        </h2>
        <p className="vd-story-summary">{story.summary}</p>
        <CredibilityBar
          score={story.score}
          signals={story.signals || { source: story.sourceScore }}
          variant={variant}
          position={position}
        />
        <div className="vd-story-foot">
          {story.topics?.length > 0 && (
            <ul className="vd-story-topics" aria-label="Topics">
              {story.topics.slice(0, 2).map((t) => <li key={t.slug}>{t.name}</li>)}
            </ul>
          )}
          <a className="vd-story-link" href={story.url} target="_blank" rel="noopener noreferrer" onClick={open}>
            Read at {story.source}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4 2.5h5.5V8M9.5 2.5 3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>

      {showImage && (
        <a className="vd-story-figure" href={story.url} target="_blank" rel="noopener noreferrer" onClick={open} tabIndex={-1} aria-hidden="true">
          <img src={story.image} alt="" loading={lead ? 'eager' : 'lazy'} onError={() => setImageFailed(true)} />
        </a>
      )}
    </article>
  );
};

export default StoryItem;
