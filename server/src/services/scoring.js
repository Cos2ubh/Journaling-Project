/**
 * Scoring - pure functions, no I/O.
 * Kept separate from filterPipeline so the logic is unit-testable without
 * a database, AI client, or network.
 */

// Weights for each filtering layer (must sum to 1.0)
const WEIGHTS = {
  keyword: 0.20,       // Keyword-based filtering
  credibility: 0.30,   // Source credibility
  aiQuality: 0.25,     // AI quality analysis
  aiCredibility: 0.10, // AI credibility analysis
  engagement: 0.15     // User engagement (placeholder until real signals exist)
};

const NEUTRAL_SCORE = 50;

// Thresholds
const PASSING_THRESHOLD = 60; // isPassing
const APPROVE_THRESHOLD = 70; // auto-approve at or above
const REJECT_THRESHOLD = 40;  // auto-reject below

/**
 * Return `value` if it is a finite number (including 0), otherwise the neutral score.
 * Note: deliberately NOT `value || 50`, which would turn a legitimate 0 into 50.
 */
function scoreOrNeutral(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : NEUTRAL_SCORE;
}

/**
 * Calculate overall score (0-100) from all layers.
 * Missing layers fall back to a neutral score; real zeros are preserved.
 * @param {Object} article - Article with filteringMetadata
 * @returns {number}
 */
function calculateOverallScore(article) {
  const metadata = article?.filteringMetadata || {};

  const scores = {
    keyword: scoreOrNeutral(metadata.keywordFilter?.score),
    credibility: scoreOrNeutral(metadata.credibility?.overallScore),
    aiQuality: scoreOrNeutral(metadata.aiAnalysis?.qualityScore),
    aiCredibility: scoreOrNeutral(metadata.aiAnalysis?.credibilityScore),
    engagement: NEUTRAL_SCORE
  };

  let total = 0;
  for (const [layer, weight] of Object.entries(WEIGHTS)) {
    total += scores[layer] * weight;
  }

  return Math.round(Math.max(0, Math.min(100, total)));
}

/**
 * Map an overall score to a curation status.
 * @param {number} score
 * @returns {'approved'|'pending'|'rejected'}
 */
function determineCurationStatus(score) {
  if (score >= APPROVE_THRESHOLD) return 'approved';
  if (score < REJECT_THRESHOLD) return 'rejected';
  return 'pending';
}

module.exports = {
  WEIGHTS,
  NEUTRAL_SCORE,
  PASSING_THRESHOLD,
  APPROVE_THRESHOLD,
  REJECT_THRESHOLD,
  scoreOrNeutral,
  calculateOverallScore,
  determineCurationStatus
};
