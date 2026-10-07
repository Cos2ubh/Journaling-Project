import { useState, useEffect, useCallback } from 'react';
import {
  getTrendingViral,
  getFakeNews,
  getViralStats
} from '../services/viralService';

/**
 * Hook for fetching trending viral news
 */
export const useTrendingViral = (limit = 5) => {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getTrendingViral(limit);
      setStories(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch trending stories');
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  return { stories, loading, error, refresh: fetchStories };
};

/**
 * Hook for fetching fake/misleading news
 */
export const useFakeNews = (limit = 5) => {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getFakeNews(limit);
      setStories(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch fake news');
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  return { stories, loading, error, refresh: fetchStories };
};

/**
 * Hook for viral news statistics
 */
export const useViralStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getViralStats();
      setStats(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch viral stats');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refresh: fetchStats };
};

export default {
  useTrendingViral,
  useFakeNews,
  useViralStats
};
