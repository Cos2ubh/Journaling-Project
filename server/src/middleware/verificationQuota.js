const User = require('../models/User');
const { dayKey } = require('../utils/dates');

/**
 * Free plan: N story checks per day (default 5). Pro and admins are unlimited.
 * - Atomic: concurrent requests can't push a user past the limit.
 * - Only successful checks count: if the verification fails, the slot is refunded.
 * - When the limit is hit, the client shows the Pro waitlist (fake-door test).
 */
const freeDailyLimit = () => Number(process.env.FREE_DAILY_VERIFICATIONS || 5);

async function verificationQuota(req, res, next) {
  const user = req.user;
  if (!user || user.role === 'admin' || user.plan === 'pro') return next();

  const limit = freeDailyLimit();
  const today = dayKey();
  let used;

  // First check of a new day: reset the counter to 1.
  const reset = await User.updateOne(
    { _id: user._id, 'usage.date': { $ne: today } },
    { $set: { 'usage.date': today, 'usage.verifications': 1 } }
  );

  if (reset.modifiedCount === 1) {
    used = 1;
  } else {
    // Same day: take a slot only if one is left.
    const updated = await User.findOneAndUpdate(
      { _id: user._id, 'usage.date': today, 'usage.verifications': { $lt: limit } },
      { $inc: { 'usage.verifications': 1 } },
      { new: true, projection: { usage: 1 } }
    );
    if (!updated) {
      return res.status(429).json({
        success: false,
        code: 'DAILY_LIMIT',
        limit,
        message: `You've used today's ${limit} free story checks. They reset tomorrow.`
      });
    }
    used = updated.usage.verifications;
  }

  res.set('X-Checks-Remaining', String(Math.max(0, limit - used)));

  // Refund the slot if the check itself fails.
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      User.updateOne(
        { _id: user._id, 'usage.date': today, 'usage.verifications': { $gt: 0 } },
        { $inc: { 'usage.verifications': -1 } }
      ).catch(() => {});
    }
  });

  return next();
}

/** Checks left today for display (null = unlimited). */
function checksLeftToday(user) {
  if (!user || user.role === 'admin' || user.plan === 'pro') return null;
  const used = user.usage?.date === dayKey() ? user.usage.verifications || 0 : 0;
  return Math.max(0, freeDailyLimit() - used);
}

module.exports = { verificationQuota, checksLeftToday, freeDailyLimit };
