/**
 * Filter Pipeline Service
 * Orchestrates multi-layer filtering for articles
 */

const { analyzeKeywords } = require('./keywordFilter');
const { getSourceCredibility } = require('./credibilityService');
const { analyzeWithAI, isAIAvailable } = require('./aiAnalyzer');
const Category = require('../models/Category');
const logger = require('../utils/logger');

const {
  WEIGHTS,
  PASSING_THRESHOLD,
  calculateOverallScore,
  determineCurationStatus
} = require('./scoring');

/**
 * Process an article through the filtering pipeline
 * @param {Object} article - Article document (mongoose model)
 * @returns {Object} Updated article with filtering metadata
 */
async function processArticle(article) {
  try {
    // Layer 1: Keyword-based filtering
    const keywordResults = analyzeKeywords({
      title: article.title,
      description: article.description,
      content: article.content
    });

    article.filteringMetadata.keywordFilter = {
      passed: keywordResults.passed,
      flaggedKeywords: keywordResults.flaggedKeywords,
      clickbaitScore: keywordResults.clickbaitScore,
      sensationalismScore: keywordResults.sensationalismScore,
      score: keywordResults.score
    };

    // Layer 2: Source credibility
    const credibilityResults = await getSourceCredibility(article.source.name);
    article.filteringMetadata.credibility = {
      sourceRating: credibilityResults.sourceRating,
      biasRating: credibilityResults.biasRating,
      factualReporting: credibilityResults.factualReporting,
      overallScore: credibilityResults.overallScore
    };

    // Layer 3: AI Analysis (uses heuristics if OpenAI not configured)
    const aiResults = await analyzeWithAI(article);
    article.filteringMetadata.aiAnalysis = {
      qualityScore: aiResults.qualityScore,
      biasScore: aiResults.biasScore,
      credibilityScore: aiResults.credibilityScore,
      sentiment: aiResults.sentiment,
      isOpinion: aiResults.isOpinion,
      isFactual: aiResults.isFactual,
      analyzedAt: aiResults.analyzedAt,
      model: aiResults.model
    };

    // Layer 4: Calculate overall score
    const overallScore = calculateOverallScore(article);
    article.filteringMetadata.overallScore = overallScore;
    article.filteringMetadata.isPassing = overallScore >= PASSING_THRESHOLD;
    article.filteringMetadata.filterVersion = '1.0';

    // Auto-categorize article
    const categoryIds = await Category.categorizeArticle(
      article.title,
      article.description
    );
    article.categories = categoryIds;

    // Set curation status based on score
    article.curation.status = determineCurationStatus(overallScore);

    logger.info(`Processed article: "${article.title.substring(0, 50)}..." - Score: ${overallScore}`);

    return article;
  } catch (error) {
    logger.error(`Error processing article through pipeline:`, error);
    throw error;
  }
}

/**
 * Batch process multiple articles
 * @param {Array} articles - Array of article documents
 * @returns {Array} Processed articles
 */
async function processArticles(articles) {
  const processed = [];

  for (const article of articles) {
    try {
      const processedArticle = await processArticle(article);
      processed.push(processedArticle);
    } catch (error) {
      logger.error(`Failed to process article: ${article.title}`, error);
    }
  }

  return processed;
}

/**
 * Reprocess all articles (useful after filter updates)
 * @param {Object} options - Processing options
 */
async function reprocessAllArticles(options = {}) {
  const Article = require('../models/Article');
  const { batchSize = 100 } = options;

  let processed = 0;
  let skip = 0;

  while (true) {
    const articles = await Article.find({})
      .skip(skip)
      .limit(batchSize);

    if (articles.length === 0) break;

    for (const article of articles) {
      await processArticle(article);
      await article.save();
      processed++;
    }

    skip += batchSize;
    logger.info(`Reprocessed ${processed} articles...`);
  }

  logger.info(`Finished reprocessing ${processed} articles`);
  return processed;
}

module.exports = {
  processArticle,
  processArticles,
  calculateOverallScore,
  reprocessAllArticles,
  WEIGHTS,
  PASSING_THRESHOLD
};
