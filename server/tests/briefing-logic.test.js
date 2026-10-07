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

// ---------------- quality fixes found in the real-content run ----------------

const { matchCategories } = require('../src/utils/categorize');
const { trimToSentences } = require('../src/services/enrichment');

const CATS = [
  { _id: 'technology', keywords: ['tech', 'software', 'AI', 'app', 'digital'] },
  { _id: 'world', keywords: ['war', 'UN', 'treaty', 'country'] },
  { _id: 'health', keywords: ['vaccine', 'hospital', 'FDA'] }
];

test('tagging matches whole words, not fragments inside other words', () => {
  assert.deepEqual(matchCategories('Messi said he played against Benin and it happened in an award show', CATS), []);
  assert.deepEqual(matchCategories('Under the new fund rules', CATS), [], '"UN" must not match "under"/"fund"');
});

test('tagging still finds real matches, acronyms and plurals', () => {
  assert.deepEqual(matchCategories('New AI app launches', CATS), ['technology']);
  assert.deepEqual(matchCategories('The UN warns of war', CATS), ['world']);
  assert.deepEqual(matchCategories('Hospitals expand vaccines after FDA review', CATS), ['health']);
  assert.deepEqual(matchCategories('Countries sign treaty', CATS), ['world']);
});

test('acronym keywords are case-sensitive', () => {
  assert.deepEqual(matchCategories('the ai of it', CATS), []);
});

test('trimToSentences keeps whole sentences within the limit', () => {
  const text = 'One two three four. Five six seven eight. Nine ten eleven twelve.';
  assert.equal(trimToSentences(text, 8), 'One two three four. Five six seven eight.');
  assert.equal(trimToSentences(text, 100), text);
  assert.equal(trimToSentences('A very long single sentence without a stop', 3), 'A very long…');
});

test('a question whose right answer is far longer than the rest is rejected', () => {
  const tell = {
    text: 'Why did the attorneys ask for a different method?',
    options: ['It was unconstitutional', 'More time for appeals', 'Claimed innocence', 'They cited a platelet disorder and small veins that would make the injection painful and ineffective'],
    correctIndex: 3,
    explanation: 'The article says so.'
  };
  assert.equal(validateQuestion(tell), null);
  assert.ok(validateQuestion({ ...tell, options: ['Unconstitutional method', 'More time for appeals', 'Claimed innocence', 'A medical condition'] }));
});

test('trimToSentences does not split on decimals or mid-sentence abbreviations', () => {
  const text = 'Investment grew to $4.1 billion in 2025, up from $1.2 billion. U.S. officials welcomed it. A third sentence follows here.';
  assert.equal(
    trimToSentences(text, 15),
    'Investment grew to $4.1 billion in 2025, up from $1.2 billion. U.S. officials welcomed it.'
  );
});

// ---------------- Phase 3: digest email ----------------

const { renderDigestEmail, unsubscribeToken, verifyUnsubscribeToken, sendDailyDigests } = require('../src/services/digest');

test('digest email escapes third-party content and neutralises unsafe links', () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  const briefing = {
    stories: [
      { source: 'Evil <Source>', title: '<script>alert(1)</script> Headline', summary: 'A & B "quoted"', url: 'javascript:alert(1)', score: 81.6 },
      { source: 'Good', title: 'Normal story', summary: 'Fine.', url: 'https://example.com/a', score: null }
    ],
    quiz: { total: 3 }
  };
  const email = renderDigestEmail(briefing, { name: 'Asha Rao' }, { appUrl: 'https://app.example', unsubscribeUrl: 'https://api.example/u?token=t' });
  assert.ok(!email.html.includes('<script>'), 'title must be escaped');
  assert.ok(email.html.includes('&lt;script&gt;'));
  assert.ok(!email.html.includes('javascript:'), 'unsafe link must be removed');
  assert.ok(email.html.includes('href="https://example.com/a"'));
  assert.ok(email.html.includes('Good morning, Asha'));
  assert.ok(email.html.includes('Credibility 82/100'));
  assert.ok(email.html.includes('https://app.example/today'));
  assert.ok(email.html.includes('Unsubscribe'));
  assert.ok(email.text.includes('Unsubscribe: https://api.example/u?token=t'));
  assert.ok(email.subject.startsWith('Today: '));
});

test('unsubscribe tokens only work for their purpose', () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  const jwt = require('jsonwebtoken');
  assert.equal(verifyUnsubscribeToken(unsubscribeToken('user123')), 'user123');
  assert.equal(verifyUnsubscribeToken('garbage'), null);
  assert.equal(verifyUnsubscribeToken(undefined), null);
  const loginToken = jwt.sign({ id: 'user123', sub: 'user123' }, process.env.JWT_SECRET);
  assert.equal(verifyUnsubscribeToken(loginToken), null, 'a login token must not unsubscribe');
  const forged = jwt.sign({ sub: 'user123', purpose: 'unsubscribe' }, 'wrong-secret');
  assert.equal(verifyUnsubscribeToken(forged), null);
});

test('digest job skips cleanly when SMTP is not configured', async () => {
  const saved = { h: process.env.SMTP_HOST, u: process.env.SMTP_USER, p: process.env.SMTP_PASS };
  delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
  try {
    const result = await sendDailyDigests();
    assert.equal(result.skipped, 'smtp-not-configured');
    assert.equal(result.sent, 0);
  } finally {
    if (saved.h !== undefined) process.env.SMTP_HOST = saved.h;
    if (saved.u !== undefined) process.env.SMTP_USER = saved.u;
    if (saved.p !== undefined) process.env.SMTP_PASS = saved.p;
  }
});

// ---------------- visual review: headline suffixes ----------------
const { stripSourceSuffix } = require('../src/utils/headline');

test('outlet suffixes are stripped from headlines, real headline text is kept', () => {
  assert.equal(stripSourceSuffix('Lionel Messi prepares for his final match for Argentina - AP News', 'Associated Press'), 'Lionel Messi prepares for his final match for Argentina');
  assert.equal(stripSourceSuffix('Pediatricians renew their call for a ban on raw milk - The Washington Post', 'The Washington Post'), 'Pediatricians renew their call for a ban on raw milk');
  assert.equal(stripSourceSuffix('Markets rally as inflation cools | Reuters', 'Reuters'), 'Markets rally as inflation cools');
  // Not an outlet: lowercase tail, colon, or too-short head stay as they are
  assert.equal(stripSourceSuffix('Cyclone nears the coast - live updates', 'NDTV'), 'Cyclone nears the coast - live updates');
  assert.equal(stripSourceSuffix('Irdai overhaul could hit revenue by 70%: IBAI', 'Business Standard'), 'Irdai overhaul could hit revenue by 70%: IBAI');
  assert.equal(stripSourceSuffix('Q&A - BBC', 'BBC News'), 'Q&A - BBC');
  assert.equal(stripSourceSuffix('No suffix in this headline at all', 'Mint'), 'No suffix in this headline at all');
});

// ---------------- Pro waitlist report ----------------
const { waitlistRows, summarize, toCsv, csvCell } = require('../src/utils/waitlistReport');

const wl = [
  { name: 'A', email: 'a@x.io', proInterest: { firstAt: new Date('2026-10-02'), lastSource: 'verify-limit', reason: 'checks', count: 2 } },
  { name: 'B', email: 'b@x.io', proInterest: { firstAt: new Date('2026-10-01'), lastSource: 'nav', reason: 'other', note: '=HYPERLINK("http://evil")' } },
  { name: 'C', email: 'c@x.io', proInterest: { firstAt: new Date('2026-10-03'), lastSource: 'topic-limit', leftAt: new Date('2026-10-04') } },
  { name: 'D', email: 'd@x.io', proInterest: { firstAt: new Date('2026-10-05'), lastSource: 'nav' } },
  { name: 'E', email: 'e@x.io' }
];

test('waitlist includes people who joined and did not leave, oldest first', () => {
  assert.deepEqual(waitlistRows(wl).map((r) => r.email), ['b@x.io', 'a@x.io', 'd@x.io']);
});

test('waitlist summary counts sources, reasons and leavers', () => {
  const s = summarize(wl);
  assert.equal(s.onList, 3);
  assert.equal(s.left, 1);
  assert.equal(s.answered, 2);
  assert.deepEqual(s.bySource, { 'Header button': 2, 'Hit check limit': 1 });
  assert.deepEqual(s.byReason, { 'Something else': 1, 'Checking forwards': 1, 'No answer': 1 });
});

test('CSV cells that would run as spreadsheet formulas are neutralised', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+44 20'), "'+44 20");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('has, comma'), '"has, comma"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
});

test('CSV export has a header and one row per person on the list', () => {
  const csv = toCsv(waitlistRows(wl)).trim().split('\n');
  assert.equal(csv[0], 'email,name,joined_at,came_from,wants_pro_for,note,pro_clicks');
  assert.equal(csv.length, 4);
  assert.ok(csv[1].includes("'=HYPERLINK"), 'formula in note is escaped');
});
