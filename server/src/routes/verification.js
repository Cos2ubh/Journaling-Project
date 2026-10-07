/**
 * Verification Routes
 * Routes for manual news verification
 */

const express = require('express');
const router = express.Router();
const { verifyByURL, verifyByKeywords } = require('../controllers/verificationController');
const { protect } = require('../middleware/auth');
const { verificationLimiter } = require('../middleware/rateLimiter');
const { verificationQuota } = require('../middleware/verificationQuota');

// All verification routes require authentication
router.use(protect);
router.use(verificationLimiter);
router.use(verificationQuota); // free plan: N checks/day

/**
 * POST /api/verification/url
 * Verify news by providing a URL
 */
router.post('/url', verifyByURL);

/**
 * POST /api/verification/keywords
 * Search and verify news by keywords
 */
router.post('/keywords', verifyByKeywords);

module.exports = router;
