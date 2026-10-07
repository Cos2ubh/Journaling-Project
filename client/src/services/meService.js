import api from './api';

const meService = {
  get: async () => (await api.get('/me')).data.data,
  updatePreferences: async (prefs) => (await api.put('/me/preferences', prefs)).data.data,
  joinProWaitlist: async (source) => (await api.post('/me/pro-interest', { source })).data.data,
  getActivity: async () => (await api.get('/me/activity')).data.data,
  getTopics: async () => (await api.get('/articles/categories')).data.data
};

export default meService;