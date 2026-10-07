const test = require('node:test');
const assert = require('node:assert/strict');
const { dayKey, previousDayKey, lastNDayKeys } = require('../src/utils/dates');
const { applyActivity, visibleStreak } = require('../src/services/streak');
const { selectStories, isNearDuplicate } = require('../src/services/briefingSelector');
const {
  validateQuestion, shuffleQuestion, fallbackSummary, truncateWords, enrichArticle
} = require('../src/services/enrichment');
const llm = require('../src/services/llm');

// ---------------- dates ----------------

test('dayKey uses the app timezone (IST is ahead of UTC)', () => {
  // 20:00 UTC on Oct 7 is already Oct 8 in India
  assert.equal(dayKey(new Date('2026-10-07T20:00:00Z'), 'Asia/Kolkata'), '2026-10-08');
  assert.equal(dayKey(new Date('2026-10-07T20:00:00Z'), 'UTC'), '2026-10-07');
});

test('previousDayKey handles month, year and leap-day boundaries', () => {
  assert.equal(previousDayKey('2026-10-01'), '2026-09-30');
  assert.equal(previousDayKey('2027-01-01'), '2026-12-31');
  assert.equal(previousDayKey('2028-03-01'), '2028-02-29');
  assert.equal(previousDayKey('2027-03-01'), '2027-02-28');
});

test('lastNDayKeys returns oldest first', () => {
  assert.deepEqual(lastNDayKeys('2026-10-02', 3), ['2026-09-30', '2026-10-01', '2026-10-02']);
});

// ---------------- streak ----------------

test('first ever activity starts a streak of 1', () => {
  const s = applyActivity({}, '2026-10-07');
  assert.deepEqual(s, { current: 1, longest: 1, lastActiveDate: '2026-10-07', extended: true });
});

test('consecutive day extends the streak and the longest record', () => {
  const s = applyActivity({ current: 4, longest: 4, lastActiveDate: '2026-10-06' }, '2026-10-07');
  assert.equal(s.current, 5);
  assert.equal(s.longest, 5);
  assert.equal(s.extended, true);
});

test('same day twice does not double count', () => {
  const s = applyActivity({ current: 3, longest: 7, lastActiveDate: '2026-10-07' }, '2026-10-07');
  assert.equal(s.current, 3);
  assert.equal(s.extended, false);
});

test('a missed day resets to 1 but keeps the longest', () => {
  const s = applyActivity({ current: 9, longest: 9, lastActiveDate: '2026-10-04' }, '2026-10-07');
  assert.equal(s.current, 1);
  assert.equal(s.longest, 9);
});

test('streak continues across New Year', () => {
  assert.equal(applyActivity({ current: 2, longest: 2, lastActiveDate: '2026-12-31' }, '2027-01-01').current, 3);
});

test('visibleStreak shows 0 once a day was missed, without losing the record', () => {
  assert.deepEqual(visibleStreak({ current: 5, longest: 8, lastActiveDate: '2026-10-05' }, '2026-10-07'), { current: 0, longest: 8, doneToday: false });
  assert.deepEqual(visibleStreak({ current: 5, longest: 8, lastActiveDate: '2026-10-06' }, '2026-10-07'), { current: 5, longest: 8, doneToday: false });
  assert.deepEqual(visibleStreak({ current: 6, longest: 8, lastActiveDate: '2026-10-07' }, '2026-10-07'), { current: 6, longest: 8, doneToday: true });
});

// ---------------- story selection ----------------

const art = (title, source, score, cats = []) => ({
  title, source: { name: source }, categories: cats.map((slug) => ({ slug })), filteringMetadata: { overallScore: score }
});

test('near-duplicate headlines are detected, different stories are not', () => {
  assert.equal(isNearDuplicate('RBI keeps repo rate unchanged at 6.5% - Reuters', 'RBI keeps repo rate unchanged at 6.5 percent - Mint'), true);
  assert.equal(isNearDuplicate('RBI keeps repo rate unchanged', 'India wins second Test against Australia'), false);
});

test('selectStories ranks by score and caps stories per source', () => {
  const picked = selectStories([
    art('Story one about budget deficit', 'Reuters', 90),
    art('Story two about rainfall season', 'Reuters', 89),
    art('Story three about chip exports', 'Reuters', 88),
    art('Story four about vaccine trial', 'BBC News', 70)
  ], { count: 3, maxPerSource: 2 });
  assert.deepEqual(picked.map((p) => p.filteringMetadata.overallScore), [90, 89, 70]);
});

test('selectStories never includes two versions of the same event', () => {
  const picked = selectStories([
    art('Cyclone makes landfall in Odisha, thousands evacuated', 'NDTV', 90),
    art('Cyclone makes landfall in Odisha; thousands evacuated', 'The Hindu', 88),
    art('Parliament passes data protection bill', 'Mint', 75)
  ], { count: 3 });
  assert.equal(picked.length, 2);
});

test('selectStories puts the user topics first, then fills with the best of the rest', () => {
  const picked = selectStories([
    art('Top politics story on election results', 'A', 95, ['politics']),
    art('Science story about new exoplanet', 'B', 70, ['science']),
    art('Second politics story on cabinet reshuffle', 'C', 90, ['politics']),
    art('Health story about clinic funding', 'D', 65, ['health'])
  ], { topics: ['science', 'health'], count: 3 });
  assert.deepEqual(picked.map((p) => p.categories[0].slug), ['science', 'health', 'politics']);
});

test('selectStories returns what it can when candidates are scarce', () => {
  assert.equal(selectStories([art('Only story here today', 'A', 80)], { count: 5 }).length, 1);
  assert.equal(selectStories([], { count: 5 }).length, 0);
});

// ---------------- enrichment helpers ----------------

const goodQ = { text: 'What did the central bank decide?', options: ['Kept rates unchanged', 'Raised rates', 'Cut rates', 'Paused trading'], correctIndex: 0, explanation: 'The article says rates were held.' };

test('validateQuestion accepts a well-formed question', () => {
  assert.deepEqual(validateQuestion(goodQ), goodQ);
});

test('validateQuestion rejects malformed questions', () => {
  assert.equal(validateQuestion(null), null);
  assert.equal(validateQuestion({ ...goodQ, options: goodQ.options.slice(0, 3) }), null, '3 options');
  assert.equal(validateQuestion({ ...goodQ, options: ['A', 'a', 'B', 'C'] }), null, 'duplicate options');
  assert.equal(validateQuestion({ ...goodQ, options: ['A', '', 'B', 'C'] }), null, 'empty option');
  assert.equal(validateQuestion({ ...goodQ, correctIndex: 4 }), null, 'index out of range');
  assert.equal(validateQuestion({ ...goodQ, correctIndex: '1.5' }), null, 'non-integer index');
  assert.equal(validateQuestion({ ...goodQ, explanation: '' }), null, 'no explanation');
  assert.equal(validateQuestion({ ...goodQ, text: 'Why?' }), null, 'too short');
});

test('shuffleQuestion moves options but keeps the right answer right', () => {
  // Deterministic seeded LCG (integer state), so the test is repeatable
  let state = 42;
  const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const positions = new Set();
  for (let i = 0; i < 40; i++) {
    const s = shuffleQuestion(goodQ, rand);
    assert.equal(s.options[s.correctIndex], 'Kept rates unchanged');
    assert.deepEqual([...s.options].sort(), [...goodQ.options].sort());
    positions.add(s.correctIndex);
  }
  assert.ok(positions.size >= 3, 'correct answer should land in different slots');
});

test('fallbackSummary trims the description and strips the NewsAPI "[+N chars]" tail', () => {
  const s = fallbackSummary({ title: 'T', description: 'Officials said the plan starts in May. [+2311 chars]' });
  assert.equal(s, 'Officials said the plan starts in May.');
  assert.equal(truncateWords('one two three four', 2), 'one two…');
});

// ---------------- enrichArticle with a fake model ----------------

function fakeArticle(extra = {}) {
  return {
    _id: 'a1',
    title: 'RBI keeps repo rate unchanged',
    description: 'The central bank held rates steady.',
    content: 'According to the statement the committee voted to hold.',
    url: 'http://127.0.0.1/blocked-by-ssrf-guard', // page fetch is refused; falls back to feed text
    source: { name: 'The Hindu' },
    saved: 0,
    async save() { this.saved++; },
    ...extra
  };
}

function fakeClient(reply, onCall) {
  return {
    messages: {
      create: async (params) => {
        if (onCall) onCall(params);
        if (reply instanceof Error) throw reply;
        return { content: [{ type: 'text', text: reply }] };
      }
    }
  };
}

test('enrichArticle stores a summary and a validated, shuffled question', async () => {
  llm.__setClientForTests(fakeClient(JSON.stringify({ summary: 'The RBI held its key rate steady, citing easing inflation.', question: goodQ })));
  const a = fakeArticle();
  const e = await enrichArticle(a);
  assert.equal(e.status, 'done');
  assert.equal(e.textSource, 'feed');
  assert.equal(e.question.options[e.question.correctIndex], 'Kept rates unchanged');
  assert.equal(a.saved, 1);
});

test('enrichArticle keeps the summary but drops an invalid question', async () => {
  llm.__setClientForTests(fakeClient(JSON.stringify({ summary: 'The RBI held its key rate steady this week.', question: { text: 'Bad?', options: ['x'] } })));
  const e = await enrichArticle(fakeArticle());
  assert.equal(e.status, 'done');
  assert.equal(e.question, null);
});

test('enrichArticle does not call the model again once done', async () => {
  let calls = 0;
  llm.__setClientForTests(fakeClient('{}', () => calls++));
  const e = await enrichArticle(fakeArticle({ enrichment: { status: 'done', summary: 'cached' } }));
  assert.equal(e.summary, 'cached');
  assert.equal(calls, 0);
});

test('enrichArticle gives up after repeated failures', async () => {
  let calls = 0;
  llm.__setClientForTests(fakeClient(new Error('boom'), () => calls++));
  const a = fakeArticle();
  await enrichArticle(a);
  await enrichArticle(a);
  await enrichArticle(a);
  assert.equal(calls, 2, 'stops after MAX_ATTEMPTS');
  assert.equal(a.enrichment.status, 'failed');
  assert.ok(a.enrichment.summary.length > 0, 'still has a fallback summary');
});

test('enrichArticle uses a fallback summary when AI is not configured', async () => {
  llm.__setClientForTests(null);
  const e = await enrichArticle(fakeArticle());
  assert.equal(e.status, 'fallback');
  assert.equal(e.summary, 'The central bank held rates steady.');
  assert.equal(e.question, null);
});

test('the enrichment prompt marks the article as untrusted data', async () => {
  let params;
  llm.__setClientForTests(fakeClient(JSON.stringify({ summary: 'The RBI held its key rate steady this week.', question: null }), (p) => { params = p; }));
  await enrichArticle(fakeArticle());
  assert.match(params.system, /untrusted/i);
  assert.match(params.messages[0].content, /<article>[\s\S]*<\/article>/);
});
