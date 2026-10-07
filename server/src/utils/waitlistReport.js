/**
 * Pro waitlist report (pure functions, unit-tested).
 */

const REASON_LABELS = {
  checks: 'Checking forwards',
  topics: 'More topics',
  updates: 'Correction alerts',
  other: 'Something else'
};
const SOURCE_LABELS = {
  'verify-limit': 'Hit check limit',
  'topic-limit': 'Hit topic limit',
  nav: 'Header button',
  settings: 'Settings',
  briefing: 'Briefing',
  unknown: 'Unknown'
};

/** Rows for everyone currently on the waitlist (joined and not left), oldest first. */
function waitlistRows(users) {
  return users
    .filter((u) => u.proInterest?.firstAt && !u.proInterest.leftAt)
    .map((u) => ({
      email: u.email,
      name: u.name,
      joinedAt: new Date(u.proInterest.firstAt),
      source: u.proInterest.lastSource || 'unknown',
      reason: u.proInterest.reason || '',
      note: u.proInterest.note || '',
      clicks: u.proInterest.count || 1
    }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

/** Counts for the summary: how many, from where, and why. */
function summarize(users) {
  const rows = waitlistRows(users);
  const everJoined = users.filter((u) => u.proInterest?.firstAt).length;
  const tally = (key, labels) => rows.reduce((acc, r) => {
    const label = labels[r[key]] || (r[key] ? r[key] : 'No answer');
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  return {
    onList: rows.length,
    left: everJoined - rows.length,
    answered: rows.filter((r) => r.reason).length,
    bySource: tally('source', SOURCE_LABELS),
    byReason: tally('reason', REASON_LABELS)
  };
}

/**
 * CSV with formula-injection protection: a cell starting with = + - @ (or tab/CR)
 * would run as a formula in Excel/Sheets, so it's prefixed with an apostrophe.
 */
function csvCell(value) {
  let s = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const header = ['email', 'name', 'joined_at', 'came_from', 'wants_pro_for', 'note', 'pro_clicks'];
  const lines = rows.map((r) => [
    r.email, r.name, r.joinedAt, SOURCE_LABELS[r.source] || r.source,
    REASON_LABELS[r.reason] || '', r.note, r.clicks
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\n') + '\n';
}

module.exports = { waitlistRows, summarize, toCsv, csvCell, REASON_LABELS, SOURCE_LABELS };
