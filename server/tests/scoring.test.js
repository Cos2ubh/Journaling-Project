const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WEIGHTS,
  scoreOrNeutral,
  calculateOverallScore,
  determineCurationStatus
} = require('../src/services/scoring');

const articleWith = ({ keyword, credibility, quality, aiCred } = {}) => ({
  filteringMetadata: {
    keywordFilter: { score: keyword },
    credibility: { overallScore: credibility },
    aiAnalysis: { qualityScore: quality, credibilityScore: aiCred }
  }
});

test('weights sum to 1.0', () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}`);
});

test('scoreOrNeutral preserves a real zero (regression: used to become 50)', () => {
  assert.equal(scoreOrNeutral(0), 0);
});

test('scoreOrNeutral falls back to neutral for missing/invalid values', () => {
  assert.equal(scoreOrNeutral(undefined), 50);
  assert.equal(scoreOrNeutral(null), 50);
  assert.equal(scoreOrNeutral(NaN), 50);
  assert.equal(scoreOrNeutral('80'), 50);
});

test('an article that scores 0 on every layer is NOT treated as neutral', () => {
  const score = calculateOverallScore(articleWith({ keyword: 0, credibility: 0, quality: 0, aiCred: 0 }));
  // Only the fixed engagement placeholder (50 * 0.15 = 7.5) remains
  assert.equal(score, 8);
  assert.ok(score < 40, 'worst-possible article must land in the reject band');
});

test('an article with no metadata gets the neutral score', () => {
  assert.equal(calculateOverallScore({}), 50);
  assert.equal(calculateOverallScore(undefined), 50);
});

test('a perfect article scores high but is bounded by the engagement placeholder', () => {
  const score = calculateOverallScore(articleWith({ keyword: 100, credibility: 100, quality: 100, aiCred: 100 }));
  assert.equal(score, 93); // 85 + 7.5 = 92.5, rounded
});

test('score is always clamped to 0-100', () => {
  const high = calculateOverallScore(articleWith({ keyword: 900, credibility: 900, quality: 900, aiCred: 900 }));
  const low = calculateOverallScore(articleWith({ keyword: -900, credibility: -900, quality: -900, aiCred: -900 }));
  assert.equal(high, 100);
  assert.equal(low, 0);
});

test('source credibility has the largest influence (30%)', () => {
  const base = { keyword: 50, credibility: 50, quality: 50, aiCred: 50 };
  const bumpCredibility = calculateOverallScore(articleWith({ ...base, credibility: 100 }));
  const bumpKeyword = calculateOverallScore(articleWith({ ...base, keyword: 100 }));
  assert.ok(bumpCredibility > bumpKeyword);
});

test('determineCurationStatus boundaries', () => {
  assert.equal(determineCurationStatus(100), 'approved');
  assert.equal(determineCurationStatus(70), 'approved');
  assert.equal(determineCurationStatus(69), 'pending');
  assert.equal(determineCurationStatus(40), 'pending');
  assert.equal(determineCurationStatus(39), 'rejected');
  assert.equal(determineCurationStatus(0), 'rejected');
});
