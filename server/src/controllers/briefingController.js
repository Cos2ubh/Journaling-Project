const logger = require('../utils/logger');
const { sendError } = require('../utils/publicUser');
const briefingService = require('../services/briefingService');

// @desc    Today's briefing (created on first request of the day)
// @route   GET /api/briefing/today
exports.getToday = async (req, res) => {
  try {
    if (!req.user.onboardingCompletedAt) {
      return res.status(409).json({ success: false, message: 'Pick your topics first.', code: 'ONBOARDING_REQUIRED' });
    }
    res.json({ success: true, data: await briefingService.getTodayBriefing(req.user) });
  } catch (error) {
    sendError(res, error, logger);
  }
};

// @desc    Answer one quick-check question (first answer counts)
// @route   POST /api/briefing/today/answers   { index, choice }
exports.answer = async (req, res) => {
  try {
    const index = Number(req.body?.index);
    const choice = Number(req.body?.choice);
    res.json({ success: true, data: await briefingService.answerQuestion(req.user, index, choice) });
  } catch (error) {
    sendError(res, error, logger);
  }
};

// @desc    Finish a briefing that has no quick check (counts for the streak)
// @route   POST /api/briefing/today/done
exports.done = async (req, res) => {
  try {
    res.json({ success: true, data: await briefingService.completeWithoutQuiz(req.user) });
  } catch (error) {
    sendError(res, error, logger);
  }
};
