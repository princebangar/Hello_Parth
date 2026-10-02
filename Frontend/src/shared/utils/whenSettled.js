/**
 * Runs background warm-up work (fetching the OTHER app's code, the next screens' code ...) only after the screen the
 * user opened has finished loading and had a moment to settle.
 *
 * These warm-ups used to start the instant the main thread had a free tick - which is right at the beginning, while the
 * network is idle waiting for the first screen's own files. They then downloaded and ran in parallel with it: on
 * a refresh the Taxi screen was fighting ~100 Food modules for the same connections and the same CPU, which is what kept
 * the skeleton up for seconds (worst in dev, where every module is its own request, and on slow phones).
 *
 * Returns a function that cancels the pending work (use it as an effect cleanup).
 */
const SETTLE_DELAY_MS = 2500;

export function whenAppSettled(task, { delay = SETTLE_DELAY_MS, timeout = 10000 } = {}) {
  if (typeof window === 'undefined') return () => {};

  // Data Saver: the user asked not to spend data on things they have not opened.
  try {
    if (navigator.connection?.saveData) return () => {};
  } catch {
    /* ignore */
  }

  let cancelled = false;
  let timer = null;
  let idleId = null;

  const start = () => {
    timer = window.setTimeout(() => {
      if (cancelled) return;
      const run = () => {
        if (!cancelled) task();
      };
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(run, { timeout });
      } else {
        run();
      }
    }, delay);
  };

  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
  }

  return () => {
    cancelled = true;
    window.removeEventListener('load', start);
    if (timer !== null) window.clearTimeout(timer);
    if (idleId !== null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
  };
}
