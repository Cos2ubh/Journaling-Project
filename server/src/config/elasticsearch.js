const { Client } = require('@elastic/elasticsearch');
const logger = require('../utils/logger');

let esClient = null;

const connectElasticsearch = async () => {
  if (!process.env.ELASTICSEARCH_URL) {
    logger.info('Elasticsearch not configured (ELASTICSEARCH_URL empty) - using MongoDB text search');
    return null;
  }

  try {
    esClient = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: process.env.ELASTICSEARCH_API_KEY ? {
        apiKey: process.env.ELASTICSEARCH_API_KEY
      } : undefined,
      maxRetries: 3,
      requestTimeout: 30000
    });

    // Test connection
    const health = await esClient.cluster.health();
    logger.info(`Elasticsearch connected - Cluster: ${health.cluster_name}, Status: ${health.status}`);

    // Create articles index if it doesn't exist
    await createArticlesIndex();

    return esClient;
  } catch (error) {
    logger.warn('Elasticsearch not available - search disabled:', error.message);
    esClient = null;
    return null;
  }
};

const createArticlesIndex = async () => {
  if (!esClient) return;

  const indexName = 'articles';

  try {
    const exists = await esClient.indices.exists({ index: indexName });

    if (!exists) {
      await esClient.indices.create({
        index: indexName,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                news_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'stop', 'snowball']
                }
              }
            }
          },
          mappings: {
            properties: {
              title: {
                type: 'text',
                analyzer: 'news_analyzer',
                fields: { keyword: { type: 'keyword' } }
              },
              description: { type: 'text', analyzer: 'news_analyzer' },
              content: { type: 'text', analyzer: 'news_analyzer' },
              source: { type: 'keyword' },
              author: { type: 'keyword' },
              url: { type: 'keyword' },
              publishedAt: { type: 'date' },
              categories: { type: 'keyword' },
              filterScore: { type: 'float' },
              curationStatus: { type: 'keyword' },
              createdAt: { type: 'date' }
            }
          }
        }
      });
      logger.info('Elasticsearch articles index created');
    }
  } catch (error) {
    logger.error('Error creating Elasticsearch index:', error.message);
  }
};

const getElasticsearch = () => esClient;

// Search helper functions
const search = {
  async indexArticle(article) {
    if (!esClient) return false;
    try {
      await esClient.index({
        index: 'articles',
        id: article._id.toString(),
        body: {
          title: article.title,
          description: article.description,
          content: article.content,
          source: article.source?.name,
          author: article.author,
          url: article.url,
          publishedAt: article.publishedAt,
          categories: article.categories?.map(c => c.name) || [],
          filterScore: article.filterScore,
          curationStatus: article.curation?.status,
          createdAt: article.createdAt
        }
      });
      return true;
    } catch (error) {
      logger.error('Elasticsearch index error:', error.message);
      return false;
    }
  },

  async searchArticles(query, options = {}) {
    if (!esClient) return { hits: [], total: 0 };

    const {
      from = 0,
      size = 20,
      categories = [],
      sources = [],
      minScore = 0,
      dateFrom = null,
      dateTo = null
    } = options;

    try {
      const must = [
        {
          multi_match: {
            query,
            fields: ['title^3', 'description^2', 'content'],
            fuzziness: 'AUTO'
          }
        }
      ];

      const filter = [];

      if (categories.length > 0) {
        filter.push({ terms: { categories } });
      }

      if (sources.length > 0) {
        filter.push({ terms: { source: sources } });
      }

      if (minScore > 0) {
        filter.push({ range: { filterScore: { gte: minScore } } });
      }

      if (dateFrom || dateTo) {
        const dateRange = { range: { publishedAt: {} } };
        if (dateFrom) dateRange.range.publishedAt.gte = dateFrom;
        if (dateTo) dateRange.range.publishedAt.lte = dateTo;
        filter.push(dateRange);
      }

      const result = await esClient.search({
        index: 'articles',
        body: {
          from,
          size,
          query: {
            bool: {
              must,
              filter
            }
          },
          sort: [
            { _score: 'desc' },
            { publishedAt: 'desc' }
          ],
          highlight: {
            fields: {
              title: {},
              description: {},
              content: { fragment_size: 150 }
            }
          }
        }
      });

      return {
        hits: result.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          ...hit._source,
          highlights: hit.highlight
        })),
        total: result.hits.total.value
      };
    } catch (error) {
      logger.error('Elasticsearch search error:', error.message);
      return { hits: [], total: 0 };
    }
  },

  async deleteArticle(id) {
    if (!esClient) return false;
    try {
      await esClient.delete({ index: 'articles', id: id.toString() });
      return true;
    } catch (error) {
      logger.error('Elasticsearch delete error:', error.message);
      return false;
    }
  },

  async bulkIndex(articles) {
    if (!esClient || !articles.length) return false;
    try {
      const operations = articles.flatMap(article => [
        { index: { _index: 'articles', _id: article._id.toString() } },
        {
          title: article.title,
          description: article.description,
          content: article.content,
          source: article.source?.name,
          author: article.author,
          url: article.url,
          publishedAt: article.publishedAt,
          categories: article.categories?.map(c => c.name) || [],
          filterScore: article.filterScore,
          curationStatus: article.curation?.status,
          createdAt: article.createdAt
        }
      ]);

      const result = await esClient.bulk({ body: operations, refresh: true });
      logger.info(`Elasticsearch bulk indexed ${articles.length} articles`);
      return !result.errors;
    } catch (error) {
      logger.error('Elasticsearch bulk index error:', error.message);
      return false;
    }
  }
};

module.exports = { connectElasticsearch, getElasticsearch, search };
