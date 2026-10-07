import React, { useState } from 'react';
import { stripSourceSuffix } from '../../utils/headline';
import '../../styles/ArticleCard.css';

const ArticleCard = ({ article }) => {
  const {
    _id,
    title,
    description,
    source,
    publishedAt,
    urlToImage,
    url,
    categories = [],
    filteringMetadata
  } = article;

  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(urlToImage) && !imageFailed;
  const displayTitle = stripSourceSuffix(title, source?.name);
  const score = filteringMetadata?.overallScore || 0;
  const credibility = filteringMetadata?.credibility?.sourceRating || 0;
  const biasRating = filteringMetadata?.credibility?.biasRating || 'unknown';

  const getScoreColor = (score) => {
    if (score >= 80) return '#27ae60';
    if (score >= 60) return '#f39c12';
    if (score >= 40) return '#e67e22';
    return '#e74c3c';
  };

  const getBiasLabel = (bias) => {
    const labels = {
      'left': 'Left',
      'center-left': 'Center-Left',
      'center': 'Center',
      'center-right': 'Center-Right',
      'right': 'Right',
      'unknown': 'Unknown'
    };
    return labels[bias] || 'Unknown';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="article-card">
      {showImage && (
        <div className="article-image">
          <img src={urlToImage} alt="" loading="lazy" onError={() => setImageFailed(true)} />
          <div className="score-badge" title="Story credibility score" style={{ backgroundColor: getScoreColor(score) }}>
            {score}
          </div>
        </div>
      )}

      <div className="article-content">
        <div className="article-meta">
          {!showImage && (
            <span className="score-inline" title="Story credibility score" style={{ color: getScoreColor(score) }}>
              {score}
            </span>
          )}
          <span className="source-name">{source?.name}</span>
          <span className="separator">•</span>
          <span className="publish-date">{formatDate(publishedAt)}</span>
          <span className="separator">•</span>
          <span className={`bias-badge bias-${biasRating}`}>
            {getBiasLabel(biasRating)}
          </span>
        </div>

        <h3 className="article-title">
          <a href={url} target="_blank" rel="noopener noreferrer">
            {displayTitle}
          </a>
        </h3>

        {description && (
          <p className="article-description">
            {description.length > 150 ? `${description.substring(0, 150)}...` : description}
          </p>
        )}

        <div className="article-footer">
          <div className="categories">
            {categories.slice(0, 3).map(cat => (
              <span
                key={cat._id}
                className="category-tag"
                style={{ backgroundColor: cat.color + '20', color: cat.color }}
              >
                {cat.name}
              </span>
            ))}
          </div>

          <div className="credibility-info">
            <span className="credibility-score" title="How reliable this outlet is overall">
              Source {credibility}/100
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticleCard;
