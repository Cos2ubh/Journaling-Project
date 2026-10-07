const Category = require('../models/Category');
const User = require('../models/User');
const logger = require('../utils/logger');
const { publicUser, sendError } = require('../utils/publicUser');
const { getActivity, HttpError } = require('../services/briefingService');
const { verifyUnsubscribeToken } = require('../services/digest');

const TOPIC_LIMITS = { free: 3, pro: 10 };
const PRO_SOURCES = new Set(['verify-limit', 'topic-limit', 'nav', 'settings', 'briefing']);

// @desc    Current user (profile, preferences, streak)
// @route   GET /api/me
exports.getMe = async (req, res) => {
  res.json({ success: true, data: publicUser(req.user) });
};

// @desc    Save topics + digest preference; completes onboarding on first save
// @route   PUT /api/me/preferences
exports.updatePreferences = async (req, res) => {
  try {
    const { topics, digestOptIn } = req.body || {};
    const update = {};

    if (topics !== undefined) {
      if (!Array.isArray(topics) || topics.some((t) => typeof t !== 'string')) {
        throw new HttpError(400, 'Topics must be a list of topic names.', 'BAD_TOPICS');
      }
      const unique = [...new Set(topics.map((t) => t.trim().toLowerCase()))];
      if (unique.length === 0) throw new HttpError(400, 'Pick at least one topic.', 'NO_TOPICS');

      const limit = TOPIC_LIMITS[req.user.plan] || TOPIC_LIMITS.free;
      if (unique.length > limit) {
        throw new HttpError(403, `The free plan includes up to ${limit} topics.`, 'TOPIC_LIMIT');
      }

      const valid = await Category.find({ slug: { $in: unique }, isActive: true }).select('slug').lean();
      if (valid.length !== unique.length) {
        const known = new Set(valid.map((c) => c.slug));
        throw new HttpError(400, `Unknown topic: ${unique.filter((t) => !known.has(t)).join(', ')}`, 'BAD_TOPICS');
      }
      update['preferences.topics'] = unique;
    }

    if (digestOptIn !== undefined) {
      update['preferences.digestOptIn'] = digestOptIn === true;
    }

    if (Object.keys(update).length === 0) {
      throw new HttpError(400, 'Nothing to update.', 'EMPTY_UPDATE');
    }

    if (!req.user.onboardingCompletedAt && update['preferences.topics']) {
      update.onboardingCompletedAt = new Date();
    }

    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true });
    res.json({ success: true, data: publicUser(user) });
  } catch (error) {
    sendError(res, error, logger);
  }
};

// @desc    Fake-door test: record interest in Pro (no payment, nothing is sold)
// @route   POST /api/me/pro-interest
exports.registerProInterest = async (req, res) => {
  try {
    const source = PRO_SOURCES.has(req.body?.source) ? req.body.source : 'unknown';
    const now = new Date();
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: { 'proInterest.lastAt': now, 'proInterest.lastSource': source },
        $inc: { 'proInterest.count': 1 },
        // $min sets firstAt when missing and keeps the earliest value otherwise
        $min: { 'proInterest.firstAt': now }
      },
      { new: true }
    );
    res.json({ success: true, data: publicUser(user) });
  } catch (error) {
    sendError(res, error, logger);
  }
};

// @desc    Last 14 days: finished the briefing or not
// @route   GET /api/me/activity
exports.getActivity = async (req, res) => {
  try {
    res.json({ success: true, data: await getActivity(req.user, 14) });
  } catch (error) {
    sendError(res, error, logger);
  }
};

// @desc    Unsubscribe from the morning email via the signed link in the email.
//          GET = link click (shows a page); POST = one-click from mail apps (RFC 8058).
// @route   GET|POST /api/me/unsubscribe?token=...   (public: authorised by the token)
exports.unsubscribe = async (req, res) => {
  const userId = verifyUnsubscribeToken(req.query.token);
  const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:Georgia,serif;max-width:520px;margin:15vh auto;padding:0 24px;color:#111;line-height:1.5">
<h1 style="font-weight:500">${title}</h1><p>${body}</p></body></html>`;

  if (!userId) {
    return res.status(400).type('html').send(page('This link has expired', `Turn off the morning email in <a href="${appUrl}/settings">Settings</a> instead.`));
  }
  try {
    await User.updateOne({ _id: userId }, { $set: { 'preferences.digestOptIn': false } });
    logger.info(`User ${userId} unsubscribed from the digest`);
    if (req.method === 'POST') return res.status(200).json({ success: true });
    return res.type('html').send(page("You're unsubscribed", `You won't get the morning email any more. Your briefing is still in the app, and you can turn the email back on in <a href="${appUrl}/settings">Settings</a>.`));
  } catch (error) {
    logger.error(error);
    return res.status(500).type('html').send(page('Something went wrong', 'Try the link again in a minute.'));
  }
};
