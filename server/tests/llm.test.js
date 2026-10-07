const test = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../src/services/llm');
const { analyzeWithAI } = require('../src/services/aiAnalyzer');

const article = {
  title: 'Parliament passes new data protection bill',
  source: { name: 'The Hindu' },
  description: 'The bill sets rules for how companies handle personal data.',
  content: 'According to officials, the law takes effect next year.'
};

/** Fake Anthropic client: returns `reply` (string) or throws `error`, and records calls. */
function fakeClient({ reply, error } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        if (error) throw error;
        return { content: [{ type: 'text', text: reply }] };
      }
    }
  };
}

const goodReply = JSON.stringify({
  qualityScore: 82, biasScore: -5, credibilityScore: 77,
  sentiment: 'neutral', isOpinion: false, isFactual: true
});

// --- parseJSON ---

test('parseJSON handles plain, fenced, and wrapped JSON', () => {
  assert.deepEqual(llm.parseJSON('{"a":1}'), { a: 1 });
  assert.deepEqual(llm.parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(llm.parseJSON('Here you go: {"a":1} hope that helps'), { a: 1 });
});

test('parseJSON throws on non-JSON', () => {
  assert.throws(() => llm.parseJSON('no json here'));
});

// --- complete ---

test('complete sends model, system and max_tokens, and joins text blocks', async () => {
  const fake = {
    calls: [],
    messages: {
      create: async (p) => {
        fake.calls.push(p);
        return { content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }] };
      }
    }
  };
  llm.__setClientForTests(fake);

  const text = await llm.complete({ system: 'sys', prompt: 'hi', maxTokens: 50 });
  assert.equal(text, 'Hello world');
  assert.equal(fake.calls[0].model, llm.getModelName());
  assert.equal(fake.calls[0].system, 'sys');
  assert.equal(fake.calls[0].max_tokens, 50);
  assert.deepEqual(fake.calls[0].messages, [{ role: 'user', content: 'hi' }]);
});

// --- analyzeWithAI ---

test('analyzeWithAI returns Claude scores and the model name', async () => {
  llm.__setClientForTests(fakeClient({ reply: goodReply }));
  const result = await analyzeWithAI(article);
  assert.equal(result.qualityScore, 82);
  assert.equal(result.credibilityScore, 77);
  assert.equal(result.biasScore, -5);
  assert.equal(result.model, llm.getModelName());
});

test('analyzeWithAI keeps a real 0 score (regression: used to become 50)', async () => {
  llm.__setClientForTests(fakeClient({ reply: JSON.stringify({ qualityScore: 0, credibilityScore: 0 }) }));
  const result = await analyzeWithAI(article);
  assert.equal(result.qualityScore, 0);
  assert.equal(result.credibilityScore, 0);
});

test('analyzeWithAI clamps out-of-range values and sanitises sentiment', async () => {
  llm.__setClientForTests(fakeClient({
    reply: JSON.stringify({ qualityScore: 500, biasScore: -999, credibilityScore: 'abc', sentiment: 'furious' })
  }));
  const result = await analyzeWithAI(article);
  assert.equal(result.qualityScore, 100);
  assert.equal(result.biasScore, -100);
  assert.equal(result.credibilityScore, 50);
  assert.equal(result.sentiment, 'neutral');
});

test('analyzeWithAI wraps the article in tags and warns the model it is untrusted', async () => {
  const fake = fakeClient({ reply: goodReply });
  llm.__setClientForTests(fake);
  await analyzeWithAI(article);
  assert.match(fake.calls[0].messages[0].content, /<article>[\s\S]*<\/article>/);
  assert.match(fake.calls[0].system, /untrusted/i);
});

test('analyzeWithAI falls back to heuristics on a transient error', async () => {
  llm.__setClientForTests(fakeClient({ error: Object.assign(new Error('overloaded'), { status: 529 }) }));
  const result = await analyzeWithAI(article);
  assert.equal(result.model, 'heuristic-v1');
  assert.equal(llm.isAvailable(), true, 'transient errors must not trip the breaker');
});

test('analyzeWithAI falls back to heuristics when the reply is not JSON', async () => {
  llm.__setClientForTests(fakeClient({ reply: 'Sorry, I cannot help with that.' }));
  const result = await analyzeWithAI(article);
  assert.equal(result.model, 'heuristic-v1');
});

// --- circuit breaker ---

test('low credit balance pauses AI calls instead of failing on every article', async () => {
  const fake = fakeClient({
    error: Object.assign(new Error('Your credit balance is too low to access the Anthropic API.'), { status: 400 })
  });
  llm.__setClientForTests(fake);

  const first = await analyzeWithAI(article);
  assert.equal(first.model, 'heuristic-v1');
  assert.equal(llm.isAvailable(), false, 'breaker should be open');

  const second = await analyzeWithAI(article);
  assert.equal(second.model, 'heuristic-v1');
  assert.equal(fake.calls.length, 1, 'no further API calls while paused');
});

test('an invalid API key (401) also pauses AI calls', async () => {
  llm.__setClientForTests(fakeClient({ error: Object.assign(new Error('invalid x-api-key'), { status: 401 }) }));
  await analyzeWithAI(article);
  assert.equal(llm.isAvailable(), false);
});

test('without a client, AI is unavailable and heuristics are used', async () => {
  llm.__setClientForTests(null);
  assert.equal(llm.isAvailable(), false);
  const result = await analyzeWithAI(article);
  assert.equal(result.model, 'heuristic-v1');
});
