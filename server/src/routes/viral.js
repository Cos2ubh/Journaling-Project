const express = require('express');
const router = express.Router();
const {
  getTrendingViralNews,
  getViralNewsById,
  getFakeNews,
  getVerifiedNews,
  getUnverifiedNews,
  runViralDetection,
  verifyStory,
  addFactCheck,
  analyzeText,
  getFactCheckers,
  getViralStats
} = require('../controllers/viralNewsController');
const { protect, admin } = require('../middleware/auth');
const { publicApiLimiter } = require('../middleware/rateLimiter');

// Public routes - Reading viral news
// NOTE: all fixed paths must be declared before '/:id'
router.get('/', getTrendingViralNews);
router.get('/trending', getTrendingViralNews); // alias used by the client and documented in the README
router.get('/stats', getViralStats);
router.get('/fake', getFakeNews);
router.get('/verified', getVerifiedNews);
router.get('/unverified', getUnverifiedNews);
router.get('/factcheckers', getFactCheckers);

// Public analysis (cheap, heuristic only) - rate limited
router.post('/analyze', publicApiLimiter, analyzeText);

// Admin-only: these spend API quota and change verification verdicts
router.post('/detect', protect, admin, runViralDetection);

// Single viral news
router.get('/:id', getViralNewsById);
router.post('/:id/verify', protect, admin, verifyStory);
router.post('/:id/factcheck', protect, admin, addFactCheck);

module.exports = router;
