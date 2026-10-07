/**
 * End-to-end API test of the daily briefing flow against a real MongoDB.
 * Uses an isolated test database and a fake Claude client (no cost, no network).
 * Skips automatically if MongoDB isn't running locally.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.NODE_ENV = 'test';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/veritas-daily-test';

const app = require('../src/app');
const llm = require('../src/services/llm');
const Article = require('../src/models/Article');
const Category = require('../src/models/Category');
const User = require('../src/models/User');
const Briefing = require('../src/models/Briefing');

let server;
let base;
let dbAvailable = false;

// Fake Claude: returns a summary and a question whose correct answer is "Right answer N"
let enrichCalls = 0;
llm.__setClientForTests({
  messages: {
    create: async (params) => {
      enrichCalls++;
      const n = enrichCalls;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: `Summary number ${n} describing what happened and why it matters.`,
            question: {
              text: `Question number ${n}: what happened in this story?`,
              options: [`Right answer ${n}`, `Wrong A ${n}`, `Wrong B ${n}`, `Wrong C ${n}`],
              correctIndex: 0,
              explanation: `The article states answer ${n}.`
            }
          })
        }]
      };
    }
  }
});

test.before(async () => {
  try {
    await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 2000 });
  } catch {
    return; // no local MongoDB: tests below skip themselves
  }
  // Safety: never run destructive setup against a non-test database.
  assert.match(mongoose.connection.name, /-test$/, 'refusing to run against a non-test database');
  dbAvailable = true;

  await Promise.all([Article.deleteMany({}), User.deleteMany({}), Briefing.deleteMany({})]);
  await Category.initializeDefaults();
  await Briefing.syncIndexes();

  const cats = Object.fromEntries((await Category.find().lean()).map((c) => [c.slug, c._id]));
  const now = Date.now();
  const seed = [
    ['Parliament passes new data protection bill', 'The Hindu', 88, 'politics'],
    ['Startup raises funding for battery recycling plant', 'Mint', 86, 'technology'],
    ['New exoplanet found in habitable zone of nearby star', 'Reuters', 84, 'science'],
    ['Monsoon rainfall above normal in southern states', 'NDTV', 83, 'environment'],
    ['Central bank holds key interest rate steady', 'BBC News', 82, 'business'],
    ['Hospitals expand free screening for diabetes', 'The Hindu', 80, 'health'],
    ['Election commission announces dates for state polls', 'Reuters', 79, 'politics']
  ];
  await Article.insertMany(seed.map(([title, source, score, cat], i) => ({
    title,
    description: `${title}. Officials shared details on ${i + 1} key points.`,
    content: `According to officials, ${title.toLowerCase()}.`,
    url: `http://127.0.0.1/test-article-${i}`, // page fetch is blocked by the SSRF guard -> feed text
    publishedAt: new Date(now - (i + 1) * 3600e3),
    source: { name: source },
    categories: [cats[cat]],
    filteringMetadata: { overallScore: score, credibility: { overallScore: 80 } },
    curation: { status: 'approved' },
    isActive: true
  })));

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
});

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function signUp(email) {
  const res = await call('POST', '/api/auth/register', { body: { name: 'Test Reader', email, password: 'test-password-123' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

test('full flow: sign up -> onboarding -> briefing -> quick check -> streak', async (t) => {
  if (!dbAvailable) return t.skip('MongoDB not available');

  const { token, user } = await signUp('reader1@veritas.test');
  assert.equal(user.onboarded, false, 'new users start un-onboarded');
  assert.equal(user.password, undefined, 'never expose the password hash');

  // Briefing is blocked until topics are chosen
  const early = await call('GET', '/api/briefing/today', { token });
  assert.equal(early.status, 409);
  assert.equal(early.body.code, 'ONBOARDING_REQUIRED');

  // Onboarding
  const prefs = await call('PUT', '/api/me/preferences', { token, body: { topics: ['science', 'health'], digestOptIn: true } });
  assert.equal(prefs.status, 200);
  assert.equal(prefs.body.data.onboarded, true);
  assert.deepEqual(prefs.body.data.preferences, { topics: ['science', 'health'], digestOptIn: true });

  // Today's briefing
  const today = await call('GET', '/api/briefing/today', { token });
  assert.equal(today.status, 200, JSON.stringify(today.body));
  const b = today.body.data;
  assert.equal(b.stories.length, 5);
  assert.deepEqual(b.stories.slice(0, 2).map((s) => s.title), [
    'New exoplanet found in habitable zone of nearby star',
    'Hospitals expand free screening for diabetes'
  ], 'chosen topics come first');
  assert.ok(b.stories.every((s) => s.summary.startsWith('Summary number')));
  assert.equal(b.quiz.total, 3);
  assert.equal(b.streak.current, 0);

  // Answers must not leak before answering
  for (const q of b.quiz.questions) {
    assert.equal(q.correctIndex, undefined, 'correct answer must be hidden');
    assert.equal(q.explanation, undefined);
  }

  // Same briefing on reload, no extra AI calls
  const callsBefore = enrichCalls;
  const again = await call('GET', '/api/briefing/today', { token });
  assert.deepEqual(again.body.data.stories.map((s) => s.id), b.stories.map((s) => s.id));
  assert.equal(enrichCalls, callsBefore, 'reloading must not regenerate content');

  // Answer: q0 correct, q1 wrong, q2 correct
  const answers = [];
  for (const q of b.quiz.questions) {
    const right = q.options.findIndex((o) => o.startsWith('Right answer'));
    const choice = q.index === 1 ? (right + 1) % 4 : right;
    const res = await call('POST', '/api/briefing/today/answers', { token, body: { index: q.index, choice } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    answers.push(res.body.data);
  }
  assert.deepEqual(answers.map((a) => a.correct), [true, false, true]);
  assert.equal(answers[1].correctIndex, b.quiz.questions[1].options.findIndex((o) => o.startsWith('Right answer')));
  assert.ok(answers[1].explanation.length > 0);
  assert.equal(answers[2].completed, true);
  assert.equal(answers[2].correctCount, 2);
  assert.equal(answers[2].streak.current, 1);
  assert.equal(answers[2].streak.doneToday, true);

  // Re-answering cannot change the result or the streak
  const retry = await call('POST', '/api/briefing/today/answers', { token, body: { index: 1, choice: answers[1].correctIndex } });
  assert.equal(retry.body.data.alreadyAnswered, true);
  assert.equal(retry.body.data.correct, false);
  assert.equal(retry.body.data.streak.current, 1);

  // Profile + activity reflect it
  const me = await call('GET', '/api/me', { token });
  assert.equal(me.body.data.streak.current, 1);
  const activity = await call('GET', '/api/me/activity', { token });
  assert.equal(activity.body.data.length, 14);
  assert.deepEqual(activity.body.data.at(-1), { date: b.date, done: true, correct: 2, total: 3 });
});

test('double-submitting the last answer completes the briefing only once', async (t) => {
  if (!dbAvailable) return t.skip('MongoDB not available');
  const { token } = await signUp('reader2@veritas.test');
  await call('PUT', '/api/me/preferences', { token, body: { topics: ['politics'] } });
  const b = (await call('GET', '/api/briefing/today', { token })).body.data;

  await call('POST', '/api/briefing/today/answers', { token, body: { index: 0, choice: 0 } });
  await call('POST', '/api/briefing/today/answers', { token, body: { index: 1, choice: 0 } });
  const [r1, r2] = await Promise.all([
    call('POST', '/api/briefing/today/answers', { token, body: { index: 2, choice: 0 } }),
    call('POST', '/api/briefing/today/answers', { token, body: { index: 2, choice: 1 } })
  ]);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r1.body.data.choice, r2.body.data.choice, 'both see the single recorded answer');

  const me = (await call('GET', '/api/me', { token })).body.data;
  assert.equal(me.streak.current, 1, 'streak counted once');
  const stored = await Briefing.findOne({ date: b.date, user: me.id });
  assert.equal(stored.answers.length, 3);
});

test('input validation and limits', async (t) => {
  if (!dbAvailable) return t.skip('MongoDB not available');
  const { token } = await signUp('reader3@veritas.test');

  const tooMany = await call('PUT', '/api/me/preferences', { token, body: { topics: ['politics', 'science', 'health', 'sports'] } });
  assert.equal(tooMany.status, 403);
  assert.equal(tooMany.body.code, 'TOPIC_LIMIT');

  const unknown = await call('PUT', '/api/me/preferences', { token, body: { topics: ['astrology'] } });
  assert.equal(unknown.status, 400);

  const none = await call('PUT', '/api/me/preferences', { token, body: { topics: [] } });
  assert.equal(none.status, 400);

  await call('PUT', '/api/me/preferences', { token, body: { topics: ['science'] } });
  await call('GET', '/api/briefing/today', { token });
  for (const body of [{ index: 9, choice: 0 }, { index: 0, choice: 7 }, { index: 'x', choice: 0 }, {}]) {
    const res = await call('POST', '/api/briefing/today/answers', { token, body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }

  // Briefing endpoints require auth
  assert.equal((await call('GET', '/api/briefing/today')).status, 401);
});

test('Pro interest is recorded (fake door, nothing charged)', async (t) => {
  if (!dbAvailable) return t.skip('MongoDB not available');
  const { token } = await signUp('reader4@veritas.test');
  const first = await call('POST', '/api/me/pro-interest', { token, body: { source: 'verify-limit' } });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.joinedProWaitlist, true);
  await call('POST', '/api/me/pro-interest', { token, body: { source: 'nav' } });
  const stored = await User.findOne({ email: 'reader4@veritas.test' });
  assert.equal(stored.proInterest.count, 2);
  assert.equal(stored.proInterest.lastSource, 'nav');
  assert.ok(stored.proInterest.firstAt <= stored.proInterest.lastAt);
  assert.equal(stored.plan, 'free', 'joining the waitlist does not grant Pro');
});

// ---------------- auth regressions ----------------

test('sign-up accepts modern email domains (.info, .email, .tech)', async (t) => {
  if (!dbAvailable) return t.skip('MongoDB not available');
  for (const email of ['a@site.info', 'b@inbox.email', 'c@startup.tech', 'D.Mixed@Example.COM']) {
    const res = await call('POST', '/api/auth/register', { body: { name: 'X', email, password: 'test-password-123' } });
    assert.equal(res.status, 201, `${email}: ${JSON.stringify(res.body)}`);
  }
  // stored lowercase, and login is case-insensitive
  const login = await call('POST', '/api/auth/login', { body: { email: 'd.mixed@example.com', password: 'test-password-123' } });
  assert.equal(login.status, 200);
});

test('invalid sign-up details get a clear 400, not a server error', async (t) => {
  if (!dbAvailable) return t.skip('MongoDB not available');
  const bad = await call('POST', '/api/auth/register', { body: { name: 'X', email: 'not-an-email', password: 'test-password-123' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /valid email/i);
  const dup = await call('POST', '/api/auth/register', { body: { name: 'X', email: 'A@SITE.INFO', password: 'test-password-123' } });
  assert.equal(dup.status, 400);
  assert.match(dup.body.message, /already registered/i);
});

test('operator objects in auth fields are rejected (NoSQL injection)', async (t) => {
  if (!dbAvailable) return t.skip('MongoDB not available');
  const r1 = await call('POST', '/api/auth/login', { body: { email: { $ne: null }, password: 'anything' } });
  assert.equal(r1.status, 400);
  const r2 = await call('POST', '/api/auth/login', { body: { email: 'a@site.info', password: { $ne: null } } });
  assert.equal(r2.status, 400);
  const r3 = await call('POST', '/api/auth/register', { body: { name: 'X', email: { $gt: '' }, password: 'test-password-123' } });
  assert.equal(r3.status, 400);
});
