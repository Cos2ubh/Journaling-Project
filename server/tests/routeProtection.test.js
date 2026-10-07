const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.NODE_ENV = 'test';

const app = require('../src/app');

let server;
let base;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const request = async (method, path, { headers = {}, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.status;
};

// These endpoints previously accepted anonymous requests.
const LOCKED_DOWN = [
  ['POST', '/api/viral/detect'],
  ['POST', '/api/viral/507f1f77bcf86cd799439011/verify'],
  ['POST', '/api/viral/507f1f77bcf86cd799439011/factcheck'],
  ['POST', '/api/articles/india/fetch'],
  ['POST', '/api/verification/url'],
  ['POST', '/api/verification/keywords']
];

for (const [method, path] of LOCKED_DOWN) {
  test(`${method} ${path} rejects anonymous requests with 401`, async () => {
    assert.equal(await request(method, path, { body: {} }), 401);
  });
}

test('a garbage bearer token is rejected with 401', async () => {
  const status = await request('POST', '/api/viral/detect', {
    headers: { Authorization: 'Bearer not-a-real-token' },
    body: {}
  });
  assert.equal(status, 401);
});

test('health endpoint stays public', async () => {
  assert.equal(await request('GET', '/health'), 200);
});

test('unknown routes return 404', async () => {
  assert.equal(await request('GET', '/api/does-not-exist'), 404);
});

test('public analyze endpoint still works without auth (and validates input)', async () => {
  assert.equal(await request('POST', '/api/viral/analyze', { body: {} }), 400);
});
