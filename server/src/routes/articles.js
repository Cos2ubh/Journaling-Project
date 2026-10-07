const express = require('express');
const router = express.Router();
const {
  getArticles,
  getArticle,
  getTrendingArticles,
  getCategories,
  getSources,
  getStats,
  searchArticles,
  getXNews,
  searchXNews,
  getXTrending,
  getIndianNews,
  fetchFreshIndianNews,
  getIndianSources
} = require('../controllers/articleController');
const { protect, admin } = require('../middleware/auth');
const { publicApiLimiter } = require('../middleware/rateLimiter');

// Public routes
router.get('/', getArticles);
router.get('/search', publicApiLimiter, searchArticles);
router.get('/trending', getTrendingArticles);
router.get('/categories', getCategories);
router.get('/sources', getSources);
router.get('/stats', getStats);

// X/Twitter routes
router.get('/x/news', getXNews);
router.get('/x/search', publicApiLimiter, searchXNews);
router.get('/x/trending', getXTrending);

// Indian news routes
router.get('/india', getIndianNews);
router.get('/india/sources', getIndianSources);
// Admin-only: triggers a live NewsAPI fetch plus AI processing
router.post('/india/fetch', protect, admin, fetchFreshIndianNews);

// Single article (keep at bottom to avoid conflicts)
router.get('/:id', getArticle);

module.exports = router;
