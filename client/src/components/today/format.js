/** Small display helpers for the Today page. */

export function scoreBand(score) {
  if (typeof score !== 'number') return { key: 'unknown', label: 'Not scored' };
  if (score >= 80) return { key: 'excellent', label: 'Highly credible' };
  if (score >= 70) return { key: 'good', label: 'Credible' };
  if (score >= 55) return { key: 'moderate', label: 'Mixed signals' };
  if (score >= 40) return { key: 'low', label: 'Weak' };
  return { key: 'poor', label: 'Unreliable' };
}

/** "Wednesday, 7 October" from a "YYYY-MM-DD" day key. */
export function formatDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/** "3 hours ago", "yesterday", "4 days ago". */
export function timeAgo(dateString, now = Date.now()) {
  const then = new Date(dateString).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}