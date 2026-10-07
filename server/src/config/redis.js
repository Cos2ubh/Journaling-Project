const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis = null;

const connectRedis = async () => {
  if (!process.env.REDIS_HOST) {
    logger.info('Redis not configured (REDIS_HOST empty) - caching disabled');
    return null;
  }

  let connectedOnce = false;
  let warned = false;

  const client = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    // Before the first successful connection: give up after 3 tries, so a missing
    // Redis doesn't retry (and log) forever. After that: keep reconnecting.
    retryStrategy: (times) => {
      if (!connectedOnce) return times > 3 ? null : times * 200;
      return Math.min(times * 200, 5000);
    }
  });

  client.on('ready', () => {
    connectedOnce = true;
    warned = false;
    logger.info('Redis connected');
  });

  // Log the first error of an outage once, not on every retry
  client.on('error', (err) => {
    if (!warned) {
      logger.warn('Redis connection error (caching disabled):', err.message);
      warned = true;
    }
  });

  try {
    await client.connect();
    await client.ping();
    redis = client;
    return redis;
  } catch (error) {
    logger.warn('Redis not available - caching disabled:', error.message);
    client.disconnect();
    redis = null;
    return null;
  }
};

const getRedis = () => redis;

// Cache helper functions
const cache = {
  async get(key) {
    if (!redis) return null;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Redis get error:', error.message);
      return null;
    }
  },

  async set(key, value, ttlSeconds = 300) {
    if (!redis) return false;
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return true;
    } catch (error) {
      logger.error('Redis set error:', error.message);
      return false;
    }
  },

  async del(key) {
    if (!redis) return false;
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error('Redis del error:', error.message);
      return false;
    }
  },

  async flush(pattern) {
    if (!redis) return false;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      return true;
    } catch (error) {
      logger.error('Redis flush error:', error.message);
      return false;
    }
  }
};

module.exports = { connectRedis, getRedis, cache };
