/**
 * NewsAPI headlines usually end with the outlet: "Story text - AP News".
 * The source is shown next to each headline, so strip that suffix for display.
 * Conservative: only removes a trailing segment that matches the source name or
 * looks like an outlet name. Kept identical to server/src/utils/headline.js.
 */
const SMALL_WORDS = new Set(['the', 'of', 'and', 'de', 'la', 'le', 'for', 'on']);

export function stripSourceSuffix(title, sourceName = '') {
  const text = String(title || '').trim();
  const match = text.match(/^(.*\S)\s+[-\u2013\u2014|]\s+([^-\u2013\u2014|]{2,60})$/);
  if (!match) return text;

  const [, head, tail] = match;
  if (head.length < 20) return text;

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const tailKey = norm(tail);
  const sourceKey = norm(sourceName);
  if (sourceKey && tailKey && (tailKey.includes(sourceKey) || sourceKey.includes(tailKey))) return head;

  const words = tail.trim().split(/\s+/);
  const looksLikeOutlet = words.length <= 5
    && words.every((w) => /^[A-Z0-9&'"(.]/.test(w) || SMALL_WORDS.has(w.toLowerCase()))
    && /^[A-Z0-9"'(]/.test(words[0]);
  return looksLikeOutlet ? head : text;
}
