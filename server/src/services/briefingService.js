/**
 * Daily briefing: build it, read it, answer the quick check, keep the streak.
 */

const Article = require('../models/Article');
const Briefing = require('../models/Briefing');
const User = require('../models/User');
const { selectStories } = require('./briefingSelector');
const { enrichArticle, fallbackSummary } = require('./enrichment');
const { applyActivity, visibleStreak } = require('./streak');
const { dayKey, lastNDayKeys } = require('../utils/dates');
const logger = require('../utils/logger');

const STORY_COUNT = 5;
const QUIZ_SIZE = 3;
// Look at the last 2 days first; widen to a week if there isn't enough credible news.
const WINDOWS_HOURS = [48, 24 * 7];

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- building ----------

async function findCandidates() {
  let docs = [];
  for (const hours of WINDOWS_HOURS) {
    docs = await Article.find({
      isActive: true,
      'curation.status': 'approved',
      publishedAt: { $gte: new Date(Date.now() - hours * 3600e3) }
    })
      .sort({ 'filteringMetadata.overallScore': -1, publishedAt: -1 })
      .limit(150)
      .populate('categories', 'slug name');
    if (docs.length >= STORY_COUNT * 2) break;
  }
  return docs;
}

async function buildBriefing(user, date) {
  const topics = user.preferences?.topics || [];
  const candidates = await findCandidates();
  const stories = selectStories(candidates, { topics, count: STORY_COUNT });

  // Enrich in parallel; failures fall back to the article's own description.
  await Promise.allSettled(stories.map((article) => enrichArticle(article)));

  const questions = stories
    .filter((a) => a.enrichment?.question?.text && a.enrichment.question.options?.length === 4)
    .slice(0, QUIZ_SIZE)
    .map((a) => ({
      article: a._id,
      text: a.enrichment.question.text,
      options: [...a.enrichment.question.options],
      correctIndex: a.enrichment.question.correctIndex,
      explanation: a.enrichment.question.explanation
    }));

  try {
    return await Briefing.create({
      user: user._id,
      date,
      topics,
      articles: stories.map((a) => a._id),
      questions
    });
  } catch (error) {
    if (error.code === 11000) {
      // Another request created it first: use theirs.
      return Briefing.findOne({ user: user._id, date });
    }
    throw error;
  }
}

// ---------- view model (what the client sees) ----------

function storyView(article) {
  const meta = article.filteringMetadata || {};
  return {
    id: article._id,
    title: article.title,
    url: article.url,
    image: article.urlToImage || null,
    source: article.source?.name || 'Unknown',
    publishedAt: article.publishedAt,
    score: meta.overallScore ?? null,
    sourceScore: meta.credibility?.overallScore ?? null,
    summary: article.enrichment?.summary || fallbackSummary(article),
    topics: (article.categories || []).filter((c) => c && c.slug).map((c) => ({ slug: c.slug, name: c.name }))
  };
}

/** Correct answers and explanations are only included for questions already answered. */
function quizView(briefing) {
  const questions = briefing.questions.map((q, index) => {
    const answer = briefing.answers.find((a) => a.index === index);
    const base = { index, text: q.text, options: q.options, articleId: q.article, answered: Boolean(answer) };
    return answer
      ? { ...base, choice: answer.choice, correct: answer.correct, correctIndex: q.correctIndex, explanation: q.explanation }
      : base;
  });
  return {
    total: questions.length,
    questions,
    completed: Boolean(briefing.completedAt),
    correctCount: briefing.correctCount ?? briefing.answers.filter((a) => a.correct).length
  };
}

async function briefingView(briefing, user, today) {
  await briefing.populate({ path: 'articles', populate: { path: 'categories', select: 'slug name' } });
  return {
    date: briefing.date,
    stories: briefing.articles.filter(Boolean).map(storyView),
    quiz: quizView(briefing),
    streak: visibleStreak(user.streak, today)
  };
}

// ---------- public API ----------

async function getTodayBriefing(user) {
  const today = dayKey();
  let briefing = await Briefing.findOne({ user: user._id, date: today });
  if (!briefing) {
    const started = Date.now();
    briefing = await buildBriefing(user, today);
    logger.info(`Built briefing for user ${user._id} (${briefing.articles.length} stories, ${briefing.questions.length} questions) in ${Date.now() - started}ms`);
  }
  return briefingView(briefing, user, today);
}

/** Record a day of activity on the user's streak (at most once per day). */
async function recordActivity(userId, today) {
  const user = await User.findById(userId).select('streak');
  const next = applyActivity(user?.streak || {}, today);
  if (next.extended) {
    await User.updateOne(
      { _id: userId, 'streak.lastActiveDate': { $ne: today } },
      { $set: { streak: { current: next.current, longest: next.longest, lastActiveDate: today } } }
    );
  }
  return { ...visibleStreak(next, today), extended: next.extended };
}

async function completeIfFinished(briefing, userId, today) {
  if (briefing.completedAt || briefing.answers.length < briefing.questions.length) return null;
  const correctCount = briefing.answers.filter((a) => a.correct).length;
  // Atomic: only the first request to finish the quiz completes it and touches the streak.
  const result = await Briefing.updateOne(
    { _id: briefing._id, completedAt: null },
    { $set: { completedAt: new Date(), correctCount } }
  );
  if (result.modifiedCount !== 1) return null;
  return recordActivity(userId, today);
}

async function answerQuestion(user, index, choice) {
  const today = dayKey();
  const briefing = await Briefing.findOne({ user: user._id, date: today });
  if (!briefing) throw new HttpError(404, "Today's briefing hasn't been created yet. Open it first.", 'NO_BRIEFING');

  if (!Number.isInteger(index) || index < 0 || index >= briefing.questions.length) {
    throw new HttpError(400, 'That question does not exist.', 'BAD_QUESTION');
  }
  const question = briefing.questions[index];
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
    throw new HttpError(400, 'Pick one of the four options.', 'BAD_CHOICE');
  }

  // Atomic first-answer-wins: a second submit for the same question changes nothing.
  const pushed = await Briefing.updateOne(
    { _id: briefing._id, 'answers.index': { $ne: index } },
    { $push: { answers: { index, choice, correct: choice === question.correctIndex, answeredAt: new Date() } } }
  );

  const fresh = await Briefing.findById(briefing._id);
  const streak = await completeIfFinished(fresh, user._id, today);
  const answer = fresh.answers.find((a) => a.index === index);

  return {
    index,
    choice: answer.choice,
    correct: answer.correct,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    alreadyAnswered: pushed.modifiedCount === 0,
    completed: Boolean(streak) || Boolean(fresh.completedAt),
    correctCount: fresh.answers.filter((a) => a.correct).length,
    total: fresh.questions.length,
    streak: streak || visibleStreak((await User.findById(user._id).select('streak'))?.streak, today)
  };
}

/** For days with no quiz (AI unavailable): reading the briefing counts for the streak. */
async function completeWithoutQuiz(user) {
  const today = dayKey();
  const briefing = await Briefing.findOne({ user: user._id, date: today });
  if (!briefing) throw new HttpError(404, "Today's briefing hasn't been created yet.", 'NO_BRIEFING');
  if (briefing.questions.length > 0) {
    throw new HttpError(400, "Answer today's quick check to finish the briefing.", 'QUIZ_REQUIRED');
  }
  const streak = await completeIfFinished(briefing, user._id, today);
  return { completed: true, streak: streak || visibleStreak((await User.findById(user._id).select('streak'))?.streak, today) };
}

/** Last `days` days with whether the briefing was finished (oldest first). */
async function getActivity(user, days = 14) {
  const keys = lastNDayKeys(dayKey(), days);
  const done = await Briefing.find({ user: user._id, date: { $in: keys }, completedAt: { $ne: null } }).select('date correctCount questions');
  const byDate = new Map(done.map((b) => [b.date, b]));
  return keys.map((date) => ({
    date,
    done: byDate.has(date),
    correct: byDate.get(date)?.correctCount ?? null,
    total: byDate.get(date)?.questions?.length ?? null
  }));
}

module.exports = {
  getTodayBriefing,
  answerQuestion,
  completeWithoutQuiz,
  getActivity,
  recordActivity,
  HttpError,
  STORY_COUNT,
  QUIZ_SIZE
};
