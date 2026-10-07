/**
 * SSRF protection for server-side fetches of user-supplied URLs.
 *
 * Blocks requests to private, loopback, link-local (incl. cloud metadata at
 * 169.254.169.254) and other non-public addresses. The check runs at three levels:
 *   1. assertSafeUrl()  - protocol, credentials, obvious internal hostnames, literal IPs
 *   2. safeLookup()     - validates the IP a hostname actually resolves to, at connect
 *                         time (defeats DNS rebinding and "evil.com -> 127.0.0.1")
 *   3. beforeRedirect   - re-validates every redirect hop
 */

const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');

const blocklist = new net.BlockList();

// IPv4 non-public ranges
[
  ['0.0.0.0', 8],        // "this" network
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // carrier-grade NAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local, cloud metadata
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4]       // reserved
].forEach(([addr, prefix]) => blocklist.addSubnet(addr, prefix, 'ipv4'));

// IPv6 non-public ranges (IPv4-mapped addresses are checked against the IPv4 rules above)
blocklist.addAddress('::', 'ipv6');
blocklist.addAddress('::1', 'ipv6');
[
  ['fc00::', 7],   // unique local
  ['fe80::', 10],  // link-local
  ['ff00::', 8]    // multicast
].forEach(([addr, prefix]) => blocklist.addSubnet(addr, prefix, 'ipv6'));

const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain'];

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.code = 'ESSRF';
  }
}

function isBlockedIp(ip) {
  const family = net.isIPv6(ip) ? 'ipv6' : 'ipv4';
  return blocklist.check(ip, family);
}

function assertSafeHost(hostname, protocol) {
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  }

  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');

  if (!host) {
    throw new UnsafeUrlError('URL has no hostname');
  }

  if (host === 'localhost' || BLOCKED_HOSTNAME_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError('URL points to an internal hostname');
  }

  if (net.isIP(host) && isBlockedIp(host)) {
    throw new UnsafeUrlError('URL points to a non-public IP address');
  }
}

/**
 * Validate a user-supplied URL string. Returns the parsed URL or throws UnsafeUrlError.
 */
function assertSafeUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError('URLs with embedded credentials are not allowed');
  }

  assertSafeHost(parsed.hostname, parsed.protocol);
  return parsed;
}

/**
 * dns.lookup replacement that refuses to connect to non-public addresses.
 * Handles both the single-result and { all: true } call styles.
 */
function safeLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);

    const resolved = Array.isArray(address) ? address : [{ address, family }];
    const bad = resolved.find((r) => isBlockedIp(r.address));

    if (bad) {
      return callback(new UnsafeUrlError('Hostname resolves to a non-public IP address'));
    }

    return callback(null, address, family);
  });
}

/**
 * Axios options that make a request SSRF-safe. Spread into axios.get/post config.
 */
function safeRequestOptions({ maxRedirects = 3, maxContentLength = 5 * 1024 * 1024 } = {}) {
  return {
    httpAgent: new http.Agent({ lookup: safeLookup }),
    httpsAgent: new https.Agent({ lookup: safeLookup }),
    maxRedirects,
    maxContentLength,
    maxBodyLength: maxContentLength,
    beforeRedirect: (options) => {
      assertSafeHost(options.hostname, options.protocol);
    }
  };
}

module.exports = {
  UnsafeUrlError,
  isBlockedIp,
  assertSafeUrl,
  safeLookup,
  safeRequestOptions
};
