const { visibleStreak } = require('../services/streak');
const { dayKey } = require('./dates');

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
    joinedProWaitlist: Boolean(user.proInterest?.firstAt)
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

module.exports = { publicUser, sendError };
