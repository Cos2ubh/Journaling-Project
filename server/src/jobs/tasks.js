/**
 * Background tasks, shared by:
 *   - the in-process scheduler (jobs/scheduler.js) for local development
 *   - the CLI runner (scripts/runJob.js):  npm run job -- fetch-news
 *   - the protected HTTP trigger used by scheduled CI in production
 *
 * Each task returns a small summary object that gets logged.
 */

const { fetchAndStoreNews, fetchAndStoreIndianNews } = require('../services/newsAggregator');
const Article = require('../models/Article');
const logger = require('../utils/logger');

const ALL_CATEGORIES = ['general', 'technology', 'business', 'science', 'health', 'sports', 'entertainment'];

const TASKS = {
  /** Fetch international news. One NewsAPI request per category. */
  'fetch-news': async ({ categories = ALL_CATEGORIES } = {}) => {
    let fetched = 0;
    let stored = 0;
    for (const category of categories) {
      const result = await fetchAndStoreNews({ category });
      fetched += result?.fetched || 0;
      stored += result?.stored || 0;
    }
    return { categories: categories.length, fetched, stored };
  },

  /** Fetch Indian news (2 NewsAPI requests). */
  'fetch-india': async () => {
    const result = await fetchAndStoreIndianNews();
    return { fetched: result?.fetched || 0, stored: result?.stored || 0 };
  },

  /** Delete non-approved articles older than 30 days. */
  cleanup: async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600e3);
    const result = await Article.deleteMany({
      publishedAt: { $lt: cutoff },
      'curation.status': { $ne: 'approved' }
    });
    return { deleted: result.deletedCount };
  },

  /**
   * Pre-generate summaries + questions for the best recent stories, so users
   * don't wait on the AI when they open their briefing. Capped to control cost.
   */
  enrich: async ({ limit = 15 } = {}) => {
    const { enrichArticle, MAX_ATTEMPTS } = require('../services/enrichment');
    const docs = await Article.find({
      isActive: true,
      'curation.status': 'approved',
      publishedAt: { $gte: new Date(Date.now() - 48 * 3600e3) },
      'enrichment.status': { $ne: 'done' },
      $or: [{ 'enrichment.attempts': { $lt: MAX_ATTEMPTS } }, { 'enrichment.attempts': { $exists: false } }]
    })
      .sort({ 'filteringMetadata.overallScore': -1 })
      .limit(Number(limit));

    const counts = { considered: docs.length, done: 0, fallback: 0, failed: 0, withQuestion: 0 };
    for (const article of docs) {
      const result = await enrichArticle(article);
      counts[result?.status] = (counts[result?.status] || 0) + 1;
      if (result?.question?.text) counts.withQuestion++;
    }
    return counts;
  },

  /** Re-run topic tagging on recent articles (no API cost). */
  recategorize: async ({ days = 7 } = {}) => {
    const Category = require('../models/Category');
    const docs = await Article.find({ publishedAt: { $gte: new Date(Date.now() - Number(days) * 24 * 3600e3) } })
      .select('title description categories');
    let changed = 0;
    let untagged = 0;
    for (const doc of docs) {
      const next = await Category.categorizeArticle(doc.title, doc.description);
      if (next.length === 0) untagged++;
      const before = (doc.categories || []).map(String).sort().join(',');
      if (before !== next.map(String).sort().join(',')) {
        await Article.updateOne({ _id: doc._id }, { $set: { categories: next } });
        changed++;
      }
    }
    return { checked: docs.length, changed, untagged };
  },

  /** Detect and auto-verify viral stories (hidden feature). */
  viral: async () => {
    const { detectViralStories, verifyViralNews } = require('../services/factChecker');
    const ViralNews = require('../models/ViralNews');
    const detected = await detectViralStories();
    const unverified = await ViralNews.find({
      'verification.status': 'unverified',
      'virality.score': { $gte: 50 }
    }).limit(5);
    let verified = 0;
    for (const story of unverified) {
      try {
        await verifyViralNews(story._id);
        verified++;
      } catch (err) {
        logger.error(`[job:viral] Failed to verify ${story._id}: ${err.message}`);
      }
    }
    return { detected: detected.length, verified };
  }
};

function listTasks() {
  return Object.keys(TASKS);
}

function registerTask(name, fn) {
  TASKS[name] = fn;
}

async function runTask(name, options = {}) {
  const task = TASKS[name];
  if (!task) {
    throw new Error(`Unknown task "${name}". Available: ${listTasks().join(', ')}`);
  }
  const startedAt = Date.now();
  logger.info(`[job:${name}] started`);
  try {
    const summary = await task(options);
    logger.info(`[job:${name}] finished in ${Math.round((Date.now() - startedAt) / 1000)}s ${JSON.stringify(summary)}`);
    return summary;
  } catch (error) {
    logger.error(`[job:${name}] failed: ${error.message}`);
    throw error;
  }
}

module.exports = { runTask, listTasks, registerTask, ALL_CATEGORIES };
