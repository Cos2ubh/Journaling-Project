import api from './api';

/**
 * Viral News Service
 * Handles all viral news related API calls
 */

// Get trending viral stories
export const getTrendingViral = async (limit = 10) => {
  const response = await api.get('/viral/trending', { params: { limit } });
  return response.data;
};

// Get fake/misleading news
export const getFakeNews = async (limit = 10) => {
  const response = await api.get('/viral/fake', { params: { limit } });
  return response.data;
};

// Get verified true stories
export const getVerifiedNews = async (limit = 10) => {
  const response = await api.get('/viral/verified', { params: { limit } });
  return response.data;
};

// Get unverified stories
export const getUnverifiedNews = async (limit = 10) => {
  const response = await api.get('/viral/unverified', { params: { limit } });
  return response.data;
};

// Get viral news stats
export const getViralStats = async () => {
  const response = await api.get('/viral/stats');
  return response.data;
};

// Analyze text for misinformation
export const analyzeText = async (title, content = '') => {
  const response = await api.post('/viral/analyze', { title, content });
  return response.data;
};

// Get fact checker sources
export const getFactCheckers = async () => {
  const response = await api.get('/viral/factcheckers');
  return response.data;
};

// Trigger viral detection manually
export const runViralDetection = async () => {
  const response = await api.post('/viral/detect');
  return response.data;
};

export default {
  getTrendingViral,
  getFakeNews,
  getVerifiedNews,
  getUnverifiedNews,
  getViralStats,
  analyzeText,
  getFactCheckers,
  runViralDetection
};
