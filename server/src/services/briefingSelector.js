/**
 * Pick the stories for a daily briefing (pure, no I/O).
 *
 * Rules, in priority order:
 *   1. Higher credibility score first.
 *   2. Never two stories about the same event (near-duplicate headlines).
 *   3. At most `maxPerSource` stories from one outlet, so one source can't dominate.
 *   4. Stories in the user's topics first; fill remaining slots with the best of the rest.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'at', 'by', 'with', 'from',
  'is', 'are', 'was', 'were', 'be', 'as', 'after', 'over', 'its', 'it', 'this', 'that', 'says', 'said'
]);

/** Significant words of a headline (drops "- Source Name" suffixes and stopwords). */
function headlineWords(title = '') {
  return String(title)
    .replace(/\s[-|–]\s[^-|–]+$/, '') // "Headline - Reuters" -> "Headline"
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Two headlines are about the same story if they share most significant words. */
function isNearDuplicate(a, b) {
  const wa = new Set(headlineWords(a));
  const wb = new Set(headlineWords(b));
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.6;
}

function scoreOf(article) {
  return article?.filteringMetadata?.overallScore ?? 0;
}

function topicSlugs(article) {
  return (article.categories || []).map((c) => (typeof c === 'string' ? c : c?.slug)).filter(Boolean);
}

/**
 * @param {Array} candidates - articles with title, source.name, categories (slugs or {slug}), filteringMetadata.overallScore
 * @param {{topics?: string[], count?: number, maxPerSource?: number}} options
 * @returns {Array} selected articles, best first
 */
function selectStories(candidates, { topics = [], count = 5, maxPerSource = 2 } = {}) {
  const ranked = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a));
  const wanted = new Set(topics);
  const picked = [];
  const perSource = new Map();

  const tryAdd = (article) => {
    if (picked.length >= count || picked.includes(article)) return;
    const source = article.source?.name || 'unknown';
    if ((perSource.get(source) || 0) >= maxPerSource) return;
    if (picked.some((p) => isNearDuplicate(p.title, article.title))) return;
    picked.push(article);
    perSource.set(source, (perSource.get(source) || 0) + 1);
  };

  if (wanted.size > 0) {
    for (const article of ranked) {
      if (topicSlugs(article).some((slug) => wanted.has(slug))) tryAdd(article);
    }
  }
  for (const article of ranked) tryAdd(article);

  return picked;
}

module.exports = { selectStories, isNearDuplicate, headlineWords };
