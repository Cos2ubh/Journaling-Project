import { useEffect, useState } from 'react';
import { getFeatureFlag, onFeatureFlags } from '../services/analytics';

/**
 * Read a PostHog feature flag / experiment variant.
 * Returns `fallback` when analytics is disabled or the flag isn't loaded yet,
 * so the app always renders a sensible default (the control experience).
 */
export function useFeatureFlag(key, fallback) {
  const [value, setValue] = useState(() => getFeatureFlag(key) ?? fallback);

  useEffect(() => {
    return onFeatureFlags(() => {
      const next = getFeatureFlag(key);
      setValue(next ?? fallback);
    });
  }, [key, fallback]);

  return value;
}