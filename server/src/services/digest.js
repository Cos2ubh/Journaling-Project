/**
 * Morning email digest: the same 5 stories as the user's Today page, with a link
 * back to the app for the quick check. One email per user per day, max.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const logger = require('../utils/logger');
const { dayKey } = require('../utils/dates');
const { getTodayBriefing } = require('./briefingService');

function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// ---------- unsubscribe tokens ----------

function unsubscribeToken(userId) {
  return jwt.sign({ sub: String(userId), purpose: 'unsubscribe' }, process.env.JWT_SECRET, { expiresIn: '90d' });
}

/** Returns the user id, or null if the token is invalid/expired/for another purpose. */
function verifyUnsubscribeToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), process.env.JWT_SECRET);
    return payload.purpose === 'unsubscribe' ? payload.sub : null;
  } catch {
    return null;
  }
}

// ---------- rendering (pure) ----------

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Only allow http(s) links in emails (article URLs come from third parties).
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? escapeHtml(u) : '#');

/**
 * @param {{date: string, stories: Array, quiz: {total: number}}} briefing
 * @param {{name: string}} user
 * @param {{appUrl: string, unsubscribeUrl: string}} links
 * @returns {{subject: string, html: string, text: string}}
 */
function renderDigestEmail(briefing, user, { appUrl, unsubscribeUrl }) {
  const firstName = String(user.name || '').trim().split(/\s+/)[0] || 'there';
  const todayUrl = `${appUrl.replace(/\/$/, '')}/today`;
  const lead = briefing.stories[0]?.title || "Today's most credible stories";

  const storiesHtml = briefing.stories.map((s) => `
    <tr><td style="padding:20px 0;border-top:1px solid #e5e5e5;">
      <p style="margin:0 0 6px;font:600 13px Arial,sans-serif;color:#555;">${escapeHtml(s.source)}</p>
      <p style="margin:0 0 8px;font:600 19px Georgia,serif;line-height:1.3;">
        <a href="${safeUrl(s.url)}" style="color:#111;text-decoration:none;">${escapeHtml(s.title)}</a>
      </p>
      <p style="margin:0 0 8px;font:16px Georgia,serif;line-height:1.55;color:#333;">${escapeHtml(s.summary)}</p>
      <p style="margin:0;font:13px Arial,sans-serif;color:#555;">Credibility ${s.score != null ? `${Math.round(s.score)}/100` : 'not scored'}</p>
    </td></tr>`).join('');

  const quizLine = briefing.quiz?.total > 0
    ? `Then take today's ${briefing.quiz.total}-question check to keep your streak.`
    : 'Open the app to mark it as read and keep your streak.';

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;padding:28px;">
    <tr><td>
      <p style="margin:0 0 4px;font:600 15px Georgia,serif;color:#555;">Veritas Daily</p>
      <h1 style="margin:0 0 8px;font:600 26px Georgia,serif;color:#111;">Good morning, ${escapeHtml(firstName)}</h1>
      <p style="margin:0 0 8px;font:16px Arial,sans-serif;color:#333;">Here are your ${briefing.stories.length} most credible stories today.</p>
    </td></tr>
    ${storiesHtml}
    <tr><td style="padding:24px 0 8px;border-top:1px solid #e5e5e5;">
      <p style="margin:0 0 16px;font:16px Arial,sans-serif;color:#333;">${quizLine}</p>
      <a href="${safeUrl(todayUrl)}" style="display:inline-block;background:#0070d1;color:#fff;padding:12px 22px;border-radius:6px;font:600 15px Arial,sans-serif;text-decoration:none;">Open today's briefing</a>
    </td></tr>
    <tr><td style="padding-top:28px;font:12px Arial,sans-serif;color:#777;">
      You get this because you turned on the morning email.
      <a href="${safeUrl(unsubscribeUrl)}" style="color:#777;">Unsubscribe</a>
    </td></tr>
  </table></body></html>`;

  const text = [
    `Good morning, ${firstName}`,
    `Your ${briefing.stories.length} most credible stories today:`,
    '',
    ...briefing.stories.map((s) => `${s.source}: ${s.title}\n${s.summary}\n${s.url}\n`),
    quizLine,
    todayUrl,
    '',
    `Unsubscribe: ${unsubscribeUrl}`
  ].join('\n');

  return { subject: `Today: ${lead}`.slice(0, 120), html, text };
}

// ---------- sending ----------

function links(userId) {
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const apiUrl = (process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, '');
  return { appUrl, unsubscribeUrl: `${apiUrl}/api/me/unsubscribe?token=${unsubscribeToken(userId)}` };
}

/** Send today's digest to every opted-in user who hasn't had it yet today. */
async function sendDailyDigests({ limit = 500 } = {}) {
  if (!isEmailConfigured()) {
    logger.warn('Digest skipped: SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS).');
    return { skipped: 'smtp-not-configured', sent: 0 };
  }

  const today = dayKey();
  const users = await User.find({
    'preferences.digestOptIn': true,
    onboardingCompletedAt: { $ne: null },
    'digest.lastSentDate': { $ne: today }
  }).limit(Number(limit));

  const counts = { candidates: users.length, sent: 0, failed: 0, empty: 0 };
  for (const user of users) {
    // Claim today's send first, so a parallel/second run can't email twice.
    const claimed = await User.updateOne(
      { _id: user._id, 'digest.lastSentDate': { $ne: today } },
      { $set: { 'digest.lastSentDate': today } }
    );
    if (claimed.modifiedCount !== 1) continue;

    try {
      const briefing = await getTodayBriefing(user);
      if (briefing.stories.length === 0) {
        counts.empty++;
        continue;
      }
      const link = links(user._id);
      const email = renderDigestEmail(briefing, user, link);
      await sendEmail({
        to: user.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        list: { unsubscribe: link.unsubscribeUrl },
        headers: { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      });
      counts.sent++;
    } catch (error) {
      counts.failed++;
      logger.error(`Digest failed for user ${user._id}: ${error.message}`);
      // Release the claim so a later run can retry.
      await User.updateOne({ _id: user._id, 'digest.lastSentDate': today }, { $unset: { 'digest.lastSentDate': 1 } });
    }
  }
  return counts;
}

module.exports = {
  sendDailyDigests,
  renderDigestEmail,
  unsubscribeToken,
  verifyUnsubscribeToken,
  isEmailConfigured
};
