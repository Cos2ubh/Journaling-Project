const rateLimit = require('express-rate-limit');

const build = (options) =>
  rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...options
  });

// Login / register: 10 failed attempts per 15 minutes per IP.
// Successful logins are not counted, so normal users are never throttled.
const authLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many attempts. Please try again in 15 minutes.'
  }
});

// Forgot / reset password: each request can trigger an email, so keep it tight.
const passwordResetLimiter = build({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again later.'
  }
});

// Public endpoints that do non-trivial work (text analysis, search).
const publicApiLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.'
  }
});

// Authenticated verification (fetches external URLs and calls OpenAI).
const verificationLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: {
    success: false,
    message: 'Verification limit reached. Please try again in a few minutes.'
  }
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  publicApiLimiter,
  verificationLimiter
};
