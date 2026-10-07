/**
 * LLM provider (Claude via the Anthropic API).
 *
 * Every AI call in the app goes through this module, so changing the model or
 * provider later only touches this file.
 *
 * Config (server/.env):
 *   ANTHROPIC_API_KEY  - required to enable AI; without it callers use heuristics
 *   ANTHROPIC_MODEL    - optional override (default: Claude Haiku 4.5, fast and cheap)
 */

const AnthropicSDK = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

const Anthropic = AnthropicSDK.default || AnthropicSDK;

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const PAUSE_MS = 15 * 60 * 1000; // back-off after account-level failures

let client = null;
let pausedUntil = 0;
let pauseReason = null;

if (process.env.ANTHROPIC_API_KEY) {
  client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 2,   // SDK retries 429/5xx with backoff
    timeout: 30000
  });
  logger.info(`Claude client initialized (model: ${getModelName()})`);
} else {
  logger.warn('ANTHROPIC_API_KEY not set. AI features will use heuristic fallbacks.');
}

function getModelName() {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/** True when a client exists and the circuit breaker isn't open. */
function isAvailable() {
  return client !== null && Date.now() >= pausedUntil;
}

/**
 * Errors that will keep failing no matter how often we retry (bad key, no credits).
 * For these we pause all AI calls instead of failing on every single article.
 */
function isAccountLevelError(error) {
  const status = error?.status;
  const message = String(error?.message || '');
  return status === 401 || status === 403 || /credit balance/i.test(message);
}

function tripBreaker(error) {
  pausedUntil = Date.now() + PAUSE_MS;
  const reason = error?.status === 401 ? 'invalid API key'
    : error?.status === 403 ? 'permission denied'
    : 'insufficient credits';
  if (pauseReason !== reason) {
    logger.error(`Claude API unavailable (${reason}). Pausing AI calls for 15 minutes; using heuristics meanwhile.`);
  }
  pauseReason = reason;
}

/**
 * Send a prompt and return the text reply.
 * Throws if AI is unavailable or the call fails - callers decide the fallback.
 */
async function complete({ system, prompt, maxTokens = 400, temperature = 0.3 }) {
  if (!isAvailable()) {
    throw new Error(client ? `AI paused: ${pauseReason}` : 'AI not configured');
  }

  try {
    const response = await client.messages.create({
      model: getModelName(),
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }]
    });

    pauseReason = null;
    return (response.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
  } catch (error) {
    if (isAccountLevelError(error)) tripBreaker(error);
    throw error;
  }
}

/**
 * Extract a JSON object from model output. Tolerates ```json fences and
 * stray text around the object.
 */
function parseJSON(text) {
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Model response was not valid JSON');
  }
}

/** Like complete(), but parses the reply as a JSON object. */
async function completeJSON(options) {
  const text = await complete(options);
  return parseJSON(text);
}

// --- test hooks (not used by app code) ---
function __setClientForTests(fakeClient) {
  client = fakeClient;
  pausedUntil = 0;
  pauseReason = null;
}

module.exports = {
  complete,
  completeJSON,
  parseJSON,
  isAvailable,
  getModelName,
  __setClientForTests
};
