import React, { useState, useEffect } from 'react';
import { useVerification } from '../../hooks/useVerification';
import { toUrl, detectInputType } from '../../utils/detectInput';
import { track, scoreBand } from '../../services/analytics';
import { useAuth } from '../../contexts/AuthContext';
import ProModal from '../common/ProModal';
import '../../styles/NewsVerifier.css';

const NewsVerifier = ({ isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const { loading, error, result, verifyURL, verifyKeywords, clearResult } = useVerification();
  const { user, refreshUser } = useAuth();
  const [proOpen, setProOpen] = useState(false);

  // Funnel step: user opened the verifier
  useEffect(() => {
    if (isOpen) track('verifier_opened');
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const value = input.trim();
    if (!value) return;

    // Only the input TYPE is tracked, never the URL or text itself.
    const inputType = detectInputType(value);
    const startedAt = performance.now();
    track('verification_submitted', { input_type: inputType });

    try {
      const data = inputType === 'url'
        ? await verifyURL(toUrl(value))
        : await verifyKeywords(value);

      const durationMs = Math.round(performance.now() - startedAt);

      if (data?.success) {
        const v = data.verification || {};
        track('verification_completed', {
          input_type: inputType,
          score_band: scoreBand(v.overallScore),
          overall_score: v.overallScore,
          sources_found: v.crossVerification?.sourcesFound ?? 0,
          duration_ms: durationMs
        });
      } else {
        track('verification_failed', { input_type: inputType, error_type: 'rejected', duration_ms: durationMs });
      }
      refreshUser(); // update checks left today
    } catch (err) {
      const status = err.response?.status;
      if (err.response?.data?.code === 'DAILY_LIMIT') {
        track('verification_limit_hit', { input_type: inputType });
        setProOpen(true);
      }
      track('verification_failed', {
        input_type: inputType,
        error_type: status ? ('http_' + status) : 'network',
        duration_ms: Math.round(performance.now() - startedAt)
      });
      console.error('Verification error:', err);
    }
  };

  const handleClose = () => {
    setInput('');
    clearResult();
    onClose();
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#00d26a';
    if (score >= 60) return '#7dd956';
    if (score >= 40) return '#ffa500';
    return '#ff3b5c';
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && <div className="verifier-backdrop" onClick={onClose}></div>}

      {/* Modal */}
      <div className={`news-verifier-modal ${isOpen ? 'open' : ''}`}>
        <div className="verifier-header">
          <div className="verifier-icon-compact">🛡️</div>
          <div className="verifier-title-compact">
            <h3>News Verifier</h3>
            <p>
              Check article credibility
              {user?.checksLeftToday != null && `. ${user.checksLeftToday} free check${user.checksLeftToday === 1 ? '' : 's'} left today.`}
            </p>
          </div>
          <button className="close-btn" onClick={handleClose} title="Close verifier">
            ✕
          </button>
        </div>

        <form className="verifier-input-compact" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Paste article insight to verify..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
        >
          {loading ? '...' : '→'}
        </button>
      </form>

      {error && (
        <div className="verifier-error-compact">
          <span>⚠️</span> {error}
        </div>
      )}

      {result && (
        <div className="verifier-result-compact">

          <div className="score-display-compact">
            <div className="main-score-compact" style={{ color: getScoreColor(result.overallScore || 0) }}>
              {result.overallScore || 0}
              <span className="score-label-compact">/100</span>
            </div>
            <div className="score-text-compact">{result.recommendation}</div>
          </div>

          <div className="metrics-compact">
            <div className="metric-item-compact">
              <span className="metric-label-compact">Credibility</span>
              <span className="metric-value-compact">{result.credibilityScore || 0}</span>
            </div>
            <div className="metric-item-compact">
              <span className="metric-label-compact">Quality</span>
              <span className="metric-value-compact">{result.qualityScore || 0}</span>
            </div>
            <div className="metric-item-compact">
              <span className="metric-label-compact">Bias</span>
              <span className="metric-value-compact">{result.biasScore || 0}</span>
            </div>
          </div>

          {result.crossVerification && result.crossVerification.sourcesFound > 0 && (
            <div className="cross-verify-compact">
              <div className="cross-verify-label">
                ✓ Verified by {result.crossVerification.sourcesFound} sources
              </div>
              <div className="confidence-mini">
                Confidence: {result.crossVerification.confidence}%
              </div>
            </div>
          )}

          {result.source && (
            <div className="source-info-compact">
              <strong>Source:</strong> {result.source}
              {result.sourceCredibility && ` (${result.sourceCredibility.overallScore}/100)`}
            </div>
          )}
        </div>
      )}
      </div>
      <ProModal isOpen={proOpen} onClose={() => setProOpen(false)} source="verify-limit" />
    </>
  );
};

export default NewsVerifier;
