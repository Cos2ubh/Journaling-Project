const { visibleStreak } = require('../services/streak');
const { dayKey } = require('./dates');
const { checksLeftToday } = require('../middleware/verificationQuota');

/** On the Pro waitlist = joined at some point and hasn't left since. */
function onProWaitlist(user) {
  return Boolean(user?.proInterest?.firstAt) && !user.proInterest.leftAt;
}

/** The user fields the client is allowed to see. One shape everywhere. */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan || 'free',
    onboarded: Boolean(user.onboardingCompletedAt),
    preferences: {
      topics: user.preferences?.topics || [],
      digestOptIn: Boolean(user.preferences?.digestOptIn)
    },
    streak: visibleStreak(user.streak || {}, dayKey()),
    joinedProWaitlist: onProWaitlist(user),
    proWaitlist: onProWaitlist(user)
      ? { joinedAt: user.proInterest.firstAt, reason: user.proInterest.reason || null }
      : null,
    checksLeftToday: checksLeftToday(user)   // null = unlimited
  };
}

/** Consistent error responses for controllers. */
function sendError(res, error, logger) {
  if (error && error.status && error.status < 500) {
    return res.status(error.status).json({ success: false, message: error.message, code: error.code });
  }
  if (logger) logger.error(error?.stack || error);
  return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
}

module.exports = { publicUser, sendError, onProWaitlist };
