/**
 * Date keys ("YYYY-MM-DD") in the app's timezone.
 * A user's "day" (for briefings and streaks) follows APP_TIMEZONE, default India.
 */

const DEFAULT_TZ = 'Asia/Kolkata';

function appTimezone() {
  return process.env.APP_TIMEZONE || DEFAULT_TZ;
}

/** Date key for `date` in `tz`, e.g. "2026-10-07". */
function dayKey(date = new Date(), tz = appTimezone()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/** The key for the day before `key`. Pure calendar arithmetic, no timezone involved. */
function previousDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** The last `n` day keys ending at `key` (oldest first). */
function lastNDayKeys(key, n) {
  const keys = [key];
  while (keys.length < n) keys.unshift(previousDayKey(keys[0]));
  return keys;
}

module.exports = { appTimezone, dayKey, previousDayKey, lastNDayKeys };
