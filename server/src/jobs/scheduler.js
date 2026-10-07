/**
 * In-process job scheduler.
 *
 * Used for local development. In production on a free host the server sleeps,
 * so cron schedules here would silently skip; there, set ENABLE_CRON=false and
 * trigger the same tasks via the protected /api/internal/jobs endpoint instead.
 *
 * Schedules are configurable. Defaults keep NewsAPI usage near 72 requests/day
 * (7 categories + 2 India requests, every 3 hours), within the free tier.
 */

const cron = require('node-cron');
const { initializeDefaultSources } = require('../services/credibilityService');
const Category = require('../models/Category');
const Article = require('../models/Article');
const logger = require('../utils/logger');
const { runTask, listTasks } = require('./tasks');

const activeJobs = {};

const SCHEDULES = {
  'fetch-news': { cron: process.env.FETCH_SCHEDULE || '0 */3 * * *', timezone: 'UTC' },
  'fetch-india': { cron: process.env.FETCH_INDIA_SCHEDULE || '30 */3 * * *', timezone: 'UTC' },
  enrich: { cron: process.env.ENRICH_SCHEDULE || '45 */3 * * *', timezone: 'UTC' },
  // 07:00 in APP_TIMEZONE (default India)
  digest: { cron: process.env.DIGEST_SCHEDULE || '0 7 * * *', timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata' },
  cleanup: { cron: '0 0 * * *', timezone: 'UTC' },
  viral: { cron: '15 */2 * * *', timezone: 'UTC', enabled: () => process.env.ENABLE_VIRAL_DETECTION === 'true' }
};

/** Add or override a schedule (used by later features, e.g. the daily digest). */
function addSchedule(name, schedule) {
  SCHEDULES[name] = schedule;
}

function initializeJobs() {
  if (process.env.ENABLE_CRON === 'false') {
    logger.info('In-process cron disabled (ENABLE_CRON=false); jobs run via /api/internal/jobs');
    return;
  }

  for (const [name, schedule] of Object.entries(SCHEDULES)) {
    if (schedule.enabled && !schedule.enabled()) continue;
    if (!listTasks().includes(name)) continue;
    activeJobs[name] = cron.schedule(schedule.cron, async () => {
      try {
        await runTask(name);
      } catch {
        // runTask already logged the failure
      }
    }, { timezone: schedule.timezone });
  }

  logger.info('Scheduled jobs: ' + Object.keys(activeJobs)
    .map((name) => `${name} (${SCHEDULES[name].cron} ${SCHEDULES[name].timezone})`)
    .join(', '));
}

/**
 * Startup tasks: seed categories and source ratings, and fetch news if the
 * database is stale (skipped if anything was stored in the last hour, so dev
 * restarts don't spend API quota).
 */
async function runInitialSetup() {
  logger.info('Running initial setup...');
  try {
    await Category.initializeDefaults();
    await initializeDefaultSources();
    logger.info('Default categories and source ratings initialized');

    if (!process.env.NEWSAPI_KEY) {
      logger.warn('NEWSAPI_KEY not set. Skipping news fetching.');
      return;
    }

    const newest = await Article.findOne().sort({ createdAt: -1 }).select('createdAt').lean();
    const minutes = newest ? (Date.now() - new Date(newest.createdAt).getTime()) / 60000 : Infinity;
    if (minutes < 60) {
      logger.info(`Skipping initial fetch: news was fetched ${Math.round(minutes)} min ago`);
      return;
    }

    await runTask('fetch-news', { categories: ['general'] });
    await runTask('fetch-india');
  } catch (error) {
    logger.error('Error in initial setup:', error);
  }
}

/** Manually trigger a news fetch (kept for compatibility). */
async function triggerNewsFetch(options = {}) {
  return runTask('fetch-news', options.category ? { categories: [options.category] } : {});
}

function stopAllJobs() {
  for (const [name, job] of Object.entries(activeJobs)) {
    job.stop();
    logger.info(`Stopped job: ${name}`);
  }
}

function getJobsStatus() {
  return Object.keys(activeJobs).map((name) => ({ name, schedule: SCHEDULES[name].cron }));
}

module.exports = {
  initializeJobs,
  runInitialSetup,
  triggerNewsFetch,
  stopAllJobs,
  getJobsStatus,
  addSchedule,
  SCHEDULES
};
