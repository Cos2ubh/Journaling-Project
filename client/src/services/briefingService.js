import api from './api';

const briefingService = {
  getToday: async () => (await api.get('/briefing/today')).data.data,
  answer: async (index, choice) => (await api.post('/briefing/today/answers', { index, choice })).data.data,
  finishWithoutQuiz: async () => (await api.post('/briefing/today/done')).data.data
};

export default briefingService;