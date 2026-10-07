import { useEffect, useRef, useState } from 'react';

/** True when the user asked the OS to reduce motion. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Becomes true once the element scrolls into view (and stays true).
 * Returns [ref, inView]. Starts true when motion is reduced or unsupported.
 */
export function useInView({ threshold = 0.25, rootMargin = '0px 0px -10% 0px' } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (inView || !ref.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, { threshold, rootMargin });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [inView, threshold, rootMargin]);

  return [ref, inView];
}

/**
 * Counts from 0 up to `target` once `start` is true.
 * Jumps straight to the value when reduced motion is on.
 */
export function useCountUp(target, { start = true, duration = 900, delay = 0 } = {}) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (!start || typeof target !== 'number') return undefined;
    let frame;
    let begin;
    const step = (now) => {
      if (prefersReducedMotion() || duration <= 0) {
        setValue(target);
        return;
      }
      if (begin === undefined) begin = now + delay;
      const t = Math.min(1, Math.max(0, (now - begin) / duration));
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, start, duration, delay]);

  return value;
}
