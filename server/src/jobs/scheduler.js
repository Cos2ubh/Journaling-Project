/**
 * Background Job Scheduler
 * Manages scheduled tasks for news fetching and processing
 */

const cron = require('node-cron');
const { fetchAndStoreNews, fetchAndStoreIndianNews } = require('../services/newsAggregator');
const { initializeDefaultSources } = require('../services/credibilityService');
const { detectViralStories, verifyViralNews } = require('../services/factChecker');
const Category = require('../models/Category');
const Article = require('../models/Article');
const ViralNews = require('../models/ViralNews');
const logger = require('../utils/logger');

// Store active jobs for management
const activeJobs = {};

/**
 * Initialize scheduled jobs
 */
function initializeJobs() {
  logger.info('Initializing scheduled jobs...');

  // Job: Fetch US/International news every hour
  // Cron expression: '0 * * * *' = at minute 0 of every hour
  activeJobs.fetchNews = cron.schedule('0 * * * *', async () => {
    logger.info('[CRON] Starting hourly news fetch...');
    try {
      const results = await fetchAndStoreNews();
      logger.info(`[CRON] Hourly fetch complete: ${results.stored} new articles`);
    } catch (error) {
      logger.error('[CRON] Error in hourly news fetch:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  // Job: Fetch Indian news every hour (offset by 30 minutes)
  // Cron expression: '30 * * * *' = at minute 30 of every hour
  activeJobs.fetchIndianNews = cron.schedule('30 * * * *', async () => {
    logger.info('[CRON] Starting hourly Indian news fetch...');
    try {
      const results = await fetchAndStoreIndianNews();
      logger.info(`[CRON] Indian news fetch complete: ${results.stored} new articles`);
    } catch (error) {
      logger.error('[CRON] Error in Indian news fetch:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });

  // Job: Cleanup old articles (runs daily at midnight)
  // Keeps articles from the last 30 days
  activeJobs.cleanup = cron.schedule('0 0 * * *', async () => {
    logger.info('[CRON] Starting daily cleanup...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await Article.deleteMany({
        publishedAt: { $lt: thirtyDaysAgo },
        'curation.status': { $ne: 'approved' } // Keep manually approved articles
      });

      logger.info(`[CRON] Cleanup complete: Removed ${result.deletedCount} old articles`);
    } catch (error) {
      logger.error('[CRON] Error in daily cleanup:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  // Job: Viral news detection and verification (every 2 hours)
  // Off by default: the feature is hidden in the UI and each run spends API quota.
  if (process.env.ENABLE_VIRAL_DETECTION === 'true') activeJobs.viralDetection = cron.schedule('15 */2 * * *', async () => {
    logger.info('[CRON] Starting viral news detection...');
    try {
      // Detect new viral stories
      const viralStories = await detectViralStories();
      logger.info(`[CRON] Detected ${viralStories.length} new viral stories`);

      // Auto-verify high-virality unverified stories
      const unverified = await ViralNews.find({
        'verification.status': 'unverified',
        'virality.score': { $gte: 50 }
      }).limit(5);

      for (const story of unverified) {
        try {
          await verifyViralNews(story._id);
          logger.info(`[CRON] Auto-verified: ${story.title.substring(0, 50)}...`);
        } catch (err) {
          logger.error(`[CRON] Failed to verify story ${story._id}:`, err.message);
        }
      }
    } catch (error) {
      logger.error('[CRON] Error in viral detection:', error);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  logger.info('Scheduled jobs initialized:');
  logger.info('  - News fetch (US/Intl): Every hour at :00 UTC');
  logger.info('  - News fetch (India): Every hour at :30 IST');
  logger.info(`  - Viral detection: ${activeJobs.viralDetection ? 'Every 2 hours at :15' : 'disabled (set ENABLE_VIRAL_DETECTION=true)'}`);
  logger.info('  - Cleanup: Daily at 00:00 UTC');
}

/**
 * Run initial setup tasks
 */
async function runInitialSetup() {
  logger.info('Running initial setup...');

  try {
    // Initialize default categories
    await Category.initializeDefaults();
    logger.info('Default categories initialized');

    // Initialize default source ratings
    await initializeDefaultSources();
    logger.info('Default source ratings initialized');

    // Skip the startup fetch if we already fetched in the last hour.
    // Without this, every nodemon restart spends NewsAPI quota.
    const newest = await Article.findOne().sort({ createdAt: -1 }).select('createdAt').lean();
    const minutesSinceLastFetch = newest ? (Date.now() - new Date(newest.createdAt).getTime()) / 60000 : Infinity;

    // Fetch initial news (if API key is configured)
    if (process.env.NEWSAPI_KEY && minutesSinceLastFetch < 60) {
      logger.info(`Skipping initial fetch: news was fetched ${Math.round(minutesSinceLastFetch)} min ago`);
    } else if (process.env.NEWSAPI_KEY) {
      logger.info('Fetching initial news batch...');
      const results = await fetchAndStoreNews({ category: 'general' });
      logger.info(`Initial fetch complete: ${results.stored} articles stored`);

      // Also fetch Indian news
      logger.info('Fetching initial Indian news batch...');
      const indianResults = await fetchAndStoreIndianNews();
      logger.info(`Initial Indian fetch complete: ${indianResults.stored} articles stored`);
    } else {
      logger.warn('NewsAPI key not configured. Skipping initial fetch.');
      logger.warn('Set NEWSAPI_KEY in .env to enable news fetching.');
    }
  } catch (error) {
    logger.error('Error in initial setup:', error);
  }
}

/**
 * Manually trigger a news fetch
 * @param {Object} options - Fetch options
 */
async function triggerNewsFetch(options = {}) {
  logger.info('[MANUAL] Triggering news fetch...');
  try {
    const results = await fetchAndStoreNews(options);
    logger.info(`[MANUAL] Fetch complete: ${results.stored} new articles`);
    return results;
  } catch (error) {
    logger.error('[MANUAL] Error in news fetch:', error);
    throw error;
  }
}

/**
 * Stop all scheduled jobs
 */
function stopAllJobs() {
  logger.info('Stopping all scheduled jobs...');
  for (const [name, job] of Object.entries(activeJobs)) {
    job.stop();
    logger.info(`  - Stopped: ${name}`);
  }
}

/**
 * Get status of all jobs
 */
function getJobsStatus() {
  return Object.entries(activeJobs).map(([name, job]) => ({
    name,
    running: job.running || false
  }));
}

module.exports = {
  initializeJobs,
  runInitialSetup,
  triggerNewsFetch,
  stopAllJobs,
  getJobsStatus
};
