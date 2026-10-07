import posthog from 'posthog-js';

/**
 * Product analytics (PostHog).
 *
 * - Fully optional: if VITE_POSTHOG_KEY is not set, every function here is a no-op,
 *   so local development and forks work without any configuration.
 * - Privacy: autocapture and session recording are OFF (they would record what people
 *   type into the verifier), and we never send the URL/text a user verifies - only
 *   its type and the resulting score.
 * - Password-reset links contain a secret token, and PostHog attaches the page URL to
 *   every event, so URLs are sanitised before anything leaves the browser.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let enabled = false;

const SENSITIVE_PATH = /\/reset-password\/[^/?#]+/i;

export const sanitizeUrl = (value) =>
  typeof value === 'string' ? value.replace(SENSITIVE_PATH, '/reset-password/:token') : value;

export function initAnalytics() {
  if (enabled || !KEY) return;

  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false, // we send our own sanitised page_viewed events
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: 'identified_only',
    respect_dnt: true,
    before_send: (event) => {
      if (event?.properties) {
        for (const key of ['$current_url', '$pathname', '$referrer', '$initial_referrer']) {
          if (event.properties[key]) {
            event.properties[key] = sanitizeUrl(event.properties[key]);
          }
        }
      }
      return event;
    }
  });

  enabled = true;
}

export function track(event, properties = {}) {
  if (!enabled) return;
  posthog.capture(event, properties);
}

// Identify by internal id only - no email or name is sent.
export function identifyUser(user) {
  if (!enabled || !user) return;
  const id = user.id || user._id;
  if (id) posthog.identify(String(id), { role: user.role });
}

export function resetAnalytics() {
  if (!enabled) return;
  posthog.reset();
}

// Bucket a 0-100 score so dashboards can group results without exposing raw inputs.
export function scoreBand(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'unknown';
  if (score >= 80) return 'high';
  if (score >= 60) return 'good';
  if (score >= 40) return 'mixed';
  return 'low';
}
