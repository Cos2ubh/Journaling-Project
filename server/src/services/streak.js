/**
 * Streak logic (pure).
 * A streak counts consecutive days on which the user finished their daily briefing.
 */

const { previousDayKey } = require('../utils/dates');

/**
 * @param {{current?: number, longest?: number, lastActiveDate?: string}} streak
 * @param {string} today - day key "YYYY-MM-DD"
 * @returns {{current: number, longest: number, lastActiveDate: string, extended: boolean}}
 *   extended = true when today's activity changed the streak
 */
function applyActivity(streak = {}, today) {
  const current = Number(streak.current) || 0;
  const longest = Number(streak.longest) || 0;
  const last = streak.lastActiveDate;

  if (last === today) {
    return { current, longest, lastActiveDate: last, extended: false };
  }

  const next = last === previousDayKey(today) ? current + 1 : 1;
  return {
    current: next,
    longest: Math.max(longest, next),
    lastActiveDate: today,
    extended: true
  };
}

/**
 * The streak as it should be displayed today: if the user missed yesterday,
 * the stored count is stale and the visible streak is 0.
 */
function visibleStreak(streak = {}, today) {
  const last = streak.lastActiveDate;
  const alive = last === today || last === previousDayKey(today);
  return {
    current: alive ? Number(streak.current) || 0 : 0,
    longest: Number(streak.longest) || 0,
    doneToday: last === today
  };
}

module.exports = { applyActivity, visibleStreak };
