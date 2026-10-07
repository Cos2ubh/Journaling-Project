/**
 * Feature flags (build-time). Hidden features stay in the codebase but out of the UI
 * so the product stays focused. Enable with VITE_FEATURE_<NAME>=true in client/.env.
 */
export const FEATURES = {
  viral: import.meta.env.VITE_FEATURE_VIRAL === 'true'
};