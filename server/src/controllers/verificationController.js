/**
 * Verification Controller
 * Handles manual news verification requests from users
 */

const axios = require('axios');
const cheerio = require('cheerio');
const Article = require('../models/Article');
const { analyzeWithAI } = require('../services/aiAnalyzer');
const { analyzeForMisinformation, extractClaims, crossReferenceWithSources } = require('../services/factChecker');
const { getSourceCredibility } = require('../services/credibilityService');
const logger = require('../utils/logger');
const { assertSafeUrl, safeRequestOptions } = require('../utils/urlSafety');

/**
 * Domain to Source Name Mapping
 */
const DOMAIN_TO_SOURCE = {
  'thehindu.com': 'The Hindu',
  'indianexpress.com': 'The Indian Express',
  'hindustantimes.com': 'Hindustan Times',
  'indiatoday.in': 'India Today',
  'ndtv.com': 'NDTV',
  'timesofindia.indiatimes.com': 'Times of India',
  'economictimes.indiatimes.com': 'The Economic Times',
  'business-standard.com': 'Business Standard',
  'livemint.com': 'Mint',
  'thewire.in': 'The Wire',
  'scroll.in': 'Scroll.in',
  'thequint.com': 'The Quint',
  'theprint.in': 'The Print',
  'reuters.com': 'Reuters',
  'bbc.com': 'BBC News',
  'bbc.co.uk': 'BBC News',
  'cnn.com': 'CNN',
  'nytimes.com': 'The New York Times',
  'washingtonpost.com': 'The Washington Post',
  'theguardian.com': 'The Guardian',
  'aljazeera.com': 'Al Jazeera English',
  'apnews.com': 'Associated Press',
  'npr.org': 'NPR',
  'pbs.org': 'PBS',
  'bloomberg.com': 'Bloomberg',
  'wsj.com': 'Wall Street Journal',
  'ft.com': 'Financial Times',
  'economist.com': 'The Economist'
};

/**
 * Get proper source name from domain
 */
function getSourceNameFromDomain(domain) {
  const cleanDomain = domain.replace('www.', '').toLowerCase();
  return DOMAIN_TO_SOURCE[cleanDomain] || cleanDomain;
}

/**
 * Extract keywords from text
 */
function extractKeywords(text, minLength = 4) {
  // Remove common words and extract significant terms
  const commonWords = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'were', 'will', 'would', 'could', 'should', 'there', 'their', 'what', 'when', 'where', 'which', 'while', 'after', 'before', 'about', 'also', 'into', 'than', 'them', 'these', 'those', 'through', 'during', 'each', 'other', 'some', 'such', 'only', 'same', 'said', 'says', 'very', 'more', 'most', 'many']);

  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= minLength && !commonWords.has(word));

  // Count frequency
  const frequency = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  // Get top keywords
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/**
 * Find corroborating sources
 */
async function findCorroboratingSources(keywords, excludeUrl) {
  try {
    // Build search query from keywords
    const searchRegex = keywords.map(kw => `(?=.*${kw})`).join('');

    // Search for similar articles
    const articles = await Article.find({
      url: { $ne: excludeUrl },
      $or: keywords.map(keyword => ({
        $or: [
          { title: { $regex: keyword, $options: 'i' } },
          { description: { $regex: keyword, $options: 'i' } }
        ]
      })),
      isActive: true,
      'curation.status': 'approved'
    })
    .sort({ 'filteringMetadata.overallScore': -1, publishedAt: -1 })
    .limit(5)
    .lean();

    return articles.map(article => ({
      title: article.title,
      source: article.source?.name,
      url: article.url,
      score: article.filteringMetadata?.overallScore || 0,
      publishedAt: article.publishedAt,
      matchedKeywords: keywords.filter(kw =>
        article.title?.toLowerCase().includes(kw) ||
        article.description?.toLowerCase().includes(kw)
      )
    }));
  } catch (error) {
    logger.error('Error finding corroborating sources:', error);
    return [];
  }
}

/**
 * Fetch article content from URL with full content extraction
 */
async function fetchArticleFromURL(url) {
  try {
    // Block SSRF: reject internal/private targets before and during the request
    assertSafeUrl(url);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 15000,
      ...safeRequestOptions()
    });

    const $ = cheerio.load(response.data);

    // Extract title (try multiple selectors)
    let title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('h1').first().text() ||
                $('title').text() ||
                'Untitled';
    title = title.trim().replace(/\s+/g, ' ');

    // Extract description
    let description = $('meta[property="og:description"]').attr('content') ||
                     $('meta[name="description"]').attr('content') ||
                     $('meta[name="twitter:description"]').attr('content') ||
                     '';
    description = description.trim();

    // Extract full article content
    // Try common article selectors
    let content = '';
    const articleSelectors = [
      'article',
      '.article-content',
      '.story-content',
      '.post-content',
      '.entry-content',
      'div[itemprop="articleBody"]',
      '.content-body',
      'main p'
    ];

    for (const selector of articleSelectors) {
      const el = $(selector);
      if (el.length > 0) {
        content = el.text().trim();
        if (content.length > 200) break; // Found substantial content
      }
    }

    // Fallback: get all paragraph text
    if (content.length < 200) {
      content = $('p').map((i, el) => $(el).text()).get().join(' ').trim();
    }

    // Clean up content
    content = content.replace(/\s+/g, ' ').substring(0, 5000); // Limit to 5000 chars

    // Extract domain/source
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    const sourceName = getSourceNameFromDomain(domain);

    // Extract publish date
    let publishedAt = $('meta[property="article:published_time"]').attr('content') ||
                      $('meta[name="publish-date"]').attr('content') ||
                      $('time').attr('datetime');

    logger.info(`Extracted article: ${title.substring(0, 50)}... (${content.length} chars)`);

    return {
      title,
      description: description || content.substring(0, 300),
      url,
      source: { name: sourceName, url: urlObj.origin },
      content: content || description,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      contentLength: content.length
    };
  } catch (error) {
    logger.error('Error fetching URL:', error.message);
    throw new Error('Unable to fetch article from URL. Please check if the URL is valid and accessible.');
  }
}

/**
 * Search for articles by keywords
 */
async function searchArticlesByKeywords(keywords) {
  try {
    const searchQuery = keywords.trim();

    // Search in existing articles
    const articles = await Article.find({
      $or: [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ],
      isActive: true
    })
      .sort({ publishedAt: -1 })
      .limit(10)
      .lean();

    return articles;
  } catch (error) {
    logger.error('Error searching articles:', error.message);
    return [];
  }
}

/**
 * Verify news by URL
 */
exports.verifyByURL = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.startsWith('http')) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid URL starting with http:// or https://'
      });
    }

    logger.info(`Verifying URL: ${url}`);

    // Fetch article content
    const articleData = await fetchArticleFromURL(url);

    // Check if article already exists in database
    const existingArticle = await Article.findOne({ url }).lean();
    if (existingArticle && existingArticle.filteringMetadata) {
      return res.json({
        success: true,
        source: 'database',
        verification: {
          title: existingArticle.title,
          source: existingArticle.source,
          url: existingArticle.url,
          publishedAt: existingArticle.publishedAt,
          overallScore: existingArticle.filteringMetadata.overallScore,
          credibilityScore: existingArticle.filteringMetadata.credibility?.overallScore || 50,
          qualityScore: existingArticle.filteringMetadata.aiAnalysis?.qualityScore || 50,
          biasScore: existingArticle.filteringMetadata.aiAnalysis?.biasScore || 0,
          isFactual: existingArticle.filteringMetadata.aiAnalysis?.isFactual,
          sentiment: existingArticle.filteringMetadata.aiAnalysis?.sentiment,
          status: existingArticle.curation?.status || 'unknown',
          recommendation: generateRecommendation(existingArticle.filteringMetadata)
        }
      });
    }

    // Extract keywords from content for cross-referencing
    const fullText = `${articleData.title} ${articleData.content || articleData.description}`;
    const keywords = extractKeywords(fullText);

    // Find corroborating sources
    logger.info(`Extracted keywords: ${keywords.join(', ')}`);
    const corroboratingSources = await findCorroboratingSources(keywords, url);
    logger.info(`Found ${corroboratingSources.length} corroborating sources`);

    // Perform fresh analysis
    const [aiAnalysis, misinfoAnalysis, sourceCredibility] = await Promise.all([
      analyzeWithAI(articleData),
      Promise.resolve(analyzeForMisinformation(articleData.title, articleData.description)),
      getSourceCredibility(articleData.source.name)
    ]);

    // Extract claims
    const claims = extractClaims(fullText);

    // Calculate cross-verification confidence
    const verificationConfidence = corroboratingSources.length > 0 ?
      Math.min(100, 50 + (corroboratingSources.length * 10)) : 0;

    const avgCorroboratingScore = corroboratingSources.length > 0 ?
      corroboratingSources.reduce((sum, s) => sum + s.score, 0) / corroboratingSources.length : 0;

    // Calculate overall score (with cross-verification boost)
    const sourceScore = sourceCredibility?.overallScore || 50;
    let overallScore = Math.round(
      (aiAnalysis.qualityScore * 0.30) +
      (aiAnalysis.credibilityScore * 0.30) +
      (sourceScore * 0.25) +
      (verificationConfidence * 0.15) // Boost from corroboration
    );

    // Bonus if high-quality sources corroborate
    if (corroboratingSources.length >= 2 && avgCorroboratingScore >= 70) {
      overallScore = Math.min(100, overallScore + 10);
    }

    const verification = {
      title: articleData.title,
      source: articleData.source,
      url: articleData.url,
      overallScore,
      credibilityScore: aiAnalysis.credibilityScore,
      qualityScore: aiAnalysis.qualityScore,
      biasScore: aiAnalysis.biasScore,
      isFactual: aiAnalysis.isFactual,
      sentiment: aiAnalysis.sentiment,
      sourceCredibility: sourceScore,
      contentLength: articleData.contentLength,
      misinformation: {
        type: misinfoAnalysis.type,
        flags: misinfoAnalysis.flags,
        riskScore: misinfoAnalysis.riskScore
      },
      claims: claims.slice(0, 5), // Top 5 claims
      crossVerification: {
        sourcesFound: corroboratingSources.length,
        confidence: verificationConfidence,
        corroboratingSources: corroboratingSources.slice(0, 3), // Top 3
        keywords: keywords.slice(0, 5) // Top 5 keywords
      },
      recommendation: generateRecommendation({
        overallScore,
        aiAnalysis,
        credibility: { overallScore: sourceScore },
        misinformation: misinfoAnalysis,
        crossVerification: {
          sourcesFound: corroboratingSources.length,
          avgScore: avgCorroboratingScore
        }
      })
    };

    res.json({
      success: true,
      source: 'fresh_analysis',
      verification
    });

  } catch (error) {
    logger.error('Error verifying URL:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify URL'
    });
  }
};

/**
 * Verify news by keywords
 */
exports.verifyByKeywords = async (req, res) => {
  try {
    const { keywords } = req.body;

    if (!keywords || keywords.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please provide keywords (at least 3 characters)'
      });
    }

    logger.info(`Searching for: ${keywords}`);

    // Search for related articles
    const articles = await searchArticlesByKeywords(keywords);

    if (articles.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: 'No articles found matching your keywords. Try different search terms.',
        articles: []
      });
    }

    // Analyze the search results
    const avgScore = articles.reduce((sum, a) => sum + (a.filteringMetadata?.overallScore || 0), 0) / articles.length;
    const highCredibilitySources = articles.filter(a => (a.filteringMetadata?.credibility?.overallScore || 0) >= 70).length;
    const lowCredibilitySources = articles.filter(a => (a.filteringMetadata?.credibility?.overallScore || 0) < 50).length;

    // Analyze misinformation patterns across articles
    const misinfoTypes = articles.map(a => {
      const analysis = analyzeForMisinformation(a.title, a.description);
      return analysis.type;
    }).filter(t => t !== 'none');

    const verification = {
      keywords,
      articlesFound: articles.length,
      averageScore: Math.round(avgScore),
      sourcesAnalysis: {
        highCredibility: highCredibilitySources,
        lowCredibility: lowCredibilitySources,
        total: articles.length
      },
      misinformationFlags: [...new Set(misinfoTypes)],
      articles: articles.slice(0, 5).map(a => ({
        id: a._id,
        title: a.title,
        source: a.source?.name,
        url: a.url,
        publishedAt: a.publishedAt,
        score: a.filteringMetadata?.overallScore || 0,
        credibilityScore: a.filteringMetadata?.credibility?.overallScore || 0
      })),
      recommendation: generateKeywordRecommendation({
        avgScore,
        articlesCount: articles.length,
        highCredibilitySources,
        lowCredibilitySources,
        misinfoTypes
      })
    };

    res.json({
      success: true,
      found: true,
      verification
    });

  } catch (error) {
    logger.error('Error verifying keywords:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify keywords'
    });
  }
};

/**
 * Generate recommendation based on verification results
 */
function generateRecommendation(metadata) {
  const score = metadata.overallScore || 0;
  const misinfoType = metadata.misinformation?.type || metadata.aiAnalysis?.misinformation?.type;
  const crossVerif = metadata.crossVerification || {};
  const sourcesFound = crossVerif.sourcesFound || 0;

  // Priority: Check for misinformation flags
  if (misinfoType && misinfoType !== 'none') {
    return `⚠️ Warning: This article shows signs of ${misinfoType.replace(/_/g, ' ')}. Exercise caution before sharing.`;
  }

  // Consider cross-verification
  if (sourcesFound >= 3 && score >= 70) {
    return `✅ Highly Credible: Verified by ${sourcesFound} other trusted sources. This appears to be reliable reporting with strong corroboration.`;
  }

  if (sourcesFound >= 2 && score >= 60) {
    return `✓ Credible: Found ${sourcesFound} corroborating sources. This story has good cross-verification from multiple outlets.`;
  }

  if (sourcesFound === 1 && score >= 60) {
    return `✓ Reasonably Credible: Found 1 corroborating source. Consider checking additional sources for important details.`;
  }

  // No corroboration or low score
  if (sourcesFound === 0 && score >= 70) {
    return `⚠️ Limited Corroboration: While the source appears credible, we couldn't find other sources covering this story. It may be breaking news or exclusive reporting.`;
  }

  if (score >= 60) {
    return `⚠️ Moderate Credibility: Limited cross-verification available. Review the source carefully and verify key claims independently.`;
  }

  if (score >= 40) {
    return `⚠️ Mixed Signals: This article has credibility concerns and limited corroboration. Verify important claims with multiple trusted sources.`;
  }

  return `❌ Low Credibility: Strong recommendation to verify with multiple established news sources before trusting this information.`;
}

/**
 * Generate recommendation for keyword search results
 */
function generateKeywordRecommendation({ avgScore, articlesCount, highCredibilitySources, lowCredibilitySources, misinfoTypes }) {
  if (misinfoTypes.length > articlesCount / 2) {
    return '🚨 High misinformation risk: Many articles about this topic show problematic patterns. Verify carefully with trusted sources.';
  }

  if (highCredibilitySources >= articlesCount * 0.7) {
    return `✅ Well-covered topic: Found ${articlesCount} articles, most from credible sources. This appears to be legitimate news.`;
  }

  if (lowCredibilitySources >= articlesCount * 0.7) {
    return `⚠️ Low credibility sources: Most articles are from sources with credibility concerns. Verify with established news outlets.`;
  }

  if (avgScore >= 70) {
    return `✓ Generally reliable: ${articlesCount} articles found with good average credibility (${Math.round(avgScore)}/100).`;
  } else if (avgScore >= 50) {
    return `⚠️ Mixed credibility: ${articlesCount} articles found with varying quality. Cross-check important details.`;
  } else {
    return `❌ Low credibility: Articles about this topic show concerning patterns. Treat with skepticism.`;
  }
}
