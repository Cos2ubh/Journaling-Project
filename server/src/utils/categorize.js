/**
 * Keyword-based topic tagging (pure).
 *
 * The previous version used substring matching, so "ai" matched "said" and
 * "against", "app" matched "happened", and "war" matched "award" -- nearly every
 * story ended up tagged "technology" or "world". Rules now:
 *   - whole words only
 *   - keywords containing capitals (AI, UN, TV, FDA, NASA, CEO) are case-sensitive
 *   - other keywords are case-insensitive and also match simple plurals
 */

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function keywordPattern(keyword) {
  const kw = String(keyword).trim();
  if (!kw) return null;
  const caseSensitive = /[A-Z]/.test(kw);
  const plural = !caseSensitive && kw.length > 3 ? '(?:s|es)?' : '';
  return new RegExp(`\\b${escapeRegex(kw)}${plural}\\b`, caseSensitive ? '' : 'i');
}

/**
 * @param {string} text - title + description
 * @param {Array<{_id: any, keywords: string[]}>} categories
 * @returns {Array} ids of matching categories
 */
function matchCategories(text, categories) {
  const haystack = String(text || '');
  return categories
    .filter((category) => (category.keywords || []).some((kw) => {
      const pattern = keywordPattern(kw);
      return pattern ? pattern.test(haystack) : false;
    }))
    .map((category) => category._id);
}

module.exports = { matchCategories, keywordPattern };