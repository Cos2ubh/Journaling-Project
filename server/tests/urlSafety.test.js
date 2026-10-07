const test = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeUrl, isBlockedIp, safeLookup } = require('../src/utils/urlSafety');

const blocked = (url) => assert.throws(() => assertSafeUrl(url), { code: 'ESSRF' }, `should block ${url}`);
const allowed = (url) => assert.doesNotThrow(() => assertSafeUrl(url), `should allow ${url}`);

test('blocks loopback and localhost', () => {
  blocked('http://127.0.0.1/');
  blocked('http://127.0.0.1:5000/admin');
  blocked('http://localhost:5000/health');
  blocked('http://foo.localhost/');
  blocked('http://[::1]/');
});

test('blocks private RFC1918 ranges', () => {
  blocked('http://10.0.0.5/');
  blocked('http://192.168.1.1/');
  blocked('http://172.16.0.1/');
  blocked('http://172.31.255.255/');
});

test('blocks cloud metadata endpoint', () => {
  blocked('http://169.254.169.254/latest/meta-data/');
});

test('blocks encoded / obfuscated IP forms (URL parser normalises them)', () => {
  blocked('http://2130706433/');        // decimal 127.0.0.1
  blocked('http://0x7f.0.0.1/');        // hex
  blocked('http://017700000001/');      // octal
  blocked('http://[::ffff:127.0.0.1]/'); // IPv4-mapped IPv6
});

test('blocks internal-looking hostnames', () => {
  blocked('http://service.internal/');
  blocked('http://printer.local/');
});

test('blocks non-http protocols', () => {
  blocked('file:///etc/passwd');
  blocked('ftp://example.com/file');
  blocked('gopher://example.com/');
});

test('blocks embedded credentials and invalid URLs', () => {
  blocked('http://user:pass@example.com/');
  blocked('not a url');
  blocked('');
});

test('allows normal public URLs', () => {
  allowed('https://www.thehindu.com/news/article123.ece');
  allowed('http://example.com/story');
  allowed('https://8.8.8.8/');
});

test('isBlockedIp range edges', () => {
  assert.equal(isBlockedIp('172.15.255.255'), false); // just below 172.16/12
  assert.equal(isBlockedIp('172.16.0.0'), true);
  assert.equal(isBlockedIp('172.32.0.0'), false);     // just above 172.31
  assert.equal(isBlockedIp('100.64.0.1'), true);      // CGNAT
  assert.equal(isBlockedIp('100.128.0.1'), false);
  assert.equal(isBlockedIp('8.8.8.8'), false);
  assert.equal(isBlockedIp('fe80::1'), true);
  assert.equal(isBlockedIp('fd00::1'), true);
  assert.equal(isBlockedIp('2606:4700:4700::1111'), false);
});

test('safeLookup refuses names that resolve to loopback (DNS-based SSRF)', (t, done) => {
  safeLookup('localhost', {}, (err) => {
    assert.ok(err, 'expected an error');
    assert.equal(err.code, 'ESSRF');
    done();
  });
});

test('safeLookup also works in { all: true } mode', (t, done) => {
  safeLookup('localhost', { all: true }, (err) => {
    assert.ok(err, 'expected an error');
    assert.equal(err.code, 'ESSRF');
    done();
  });
});
