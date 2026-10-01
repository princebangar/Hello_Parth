// Admin pages are lazy chunks, so the first click on each sidebar item used to wait for that page's file
// (and in dev, for Vite to compile it). This quietly loads them one at a time while the browser is idle,
// so by the time you click, the page is already there.
//
// Usage inside the admin layout:  useEffect(() => warmAdminPages(import.meta.glob('../pages/**/*.jsx')), [])
// `import.meta.glob` (without `eager`) gives { filePath: () => import(filePath) }; those imports resolve to the
// very same chunks the router's lazy() calls use, so nothing is downloaded twice.
export function warmAdminPages(loaders = {}, { delayMs = 1500, priority = /dashboard|AdminHome/i, skip = /\/auth\// } = {}) {
  if (typeof window === 'undefined') return () => {};
  // Respect "Data Saver" and very slow connections.
  const connection = navigator.connection;
  if (connection && (connection.saveData || /(^|-)2g$/.test(String(connection.effectiveType || '')))) {
    return () => {};
  }

  const entries = Object.entries(loaders).filter(([path]) => !skip.test(path));
  entries.sort(([a], [b]) => Number(priority.test(b)) - Number(priority.test(a)));
  const queue = entries.map(([, load]) => load);

  let cancelled = false;
  let timer = null;

  const loadNext = () => {
    if (cancelled) return;
    const next = queue.shift();
    if (!next) return;
    Promise.resolve()
      .then(next)
      .catch(() => {})
      .finally(schedule);
  };

  function schedule() {
    if (cancelled || queue.length === 0) return;
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(loadNext, { timeout: 3000 });
    } else {
      timer = window.setTimeout(loadNext, 80);
    }
  }

  timer = window.setTimeout(schedule, delayMs);

  return () => {
    cancelled = true;
    if (timer) window.clearTimeout(timer);
  };
}
