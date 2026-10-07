/**
 * Decide whether verifier input is a URL or free text (keywords / a claim).
 *
 * The old check treated ANY input containing a "." as a URL, so a pasted sentence
 * like "The minister said prices will fall. Experts disagree." was sent to the URL
 * fetcher and failed. A URL never contains whitespace, so we require that.
 */

const BARE_DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]\S*)?$/i;

/**
 * @param {string} value
 * @returns {string|null} a normalised absolute http(s) URL, or null if the input isn't a URL
 */
export function toUrl(value) {
  const v = (value || '').trim();
  if (!v || /\s/.test(v)) return null;

  try {
    if (/^https?:\/\//i.test(v)) return new URL(v).href;
    if (BARE_DOMAIN.test(v)) return new URL(`https://${v}`).href;
  } catch {
    return null;
  }
  return null;
}

/** @returns {'url'|'keywords'} */
export function detectInputType(value) {
  return toUrl(value) ? 'url' : 'keywords';
}
