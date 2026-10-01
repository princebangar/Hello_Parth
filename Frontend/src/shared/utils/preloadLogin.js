// The /login screen is two lazy chunks (the auth routes, and the login form inside them). When someone logs out
// the route swaps to it, and that used to show an empty page / spinner for about a third of a second:
//   1. the chunks had to be downloaded, and
//   2. even when they were already cached, React shows the Suspense fallback for at least ~300 ms once it has
//      been shown (fallback throttling) - the "white flash" between the profile and the login page.
// Fix: download both chunks ahead of time, and hand them to React.lazy as an already-finished thenable so the
// login screen renders in the same frame as the route change and no fallback is ever shown.
// Food, Taxi and every forced sign-out share this.

const loaded = new Map();

const makeLoader = (key, importer) => () => {
  if (loaded.has(key)) {
    // React.lazy accepts any thenable; one that calls back at once lets it resolve without suspending.
    const module = loaded.get(key);
    return { then: (onFulfilled) => { onFulfilled(module); } };
  }
  return importer().then((module) => {
    loaded.set(key, module);
    return module;
  });
};

/** Loader for the auth routes - used by <AuthApp /> in the router. */
export const loadAuthApp = makeLoader('routes', () => import('../../modules/auth/routes'));
/** Loader for the login form - used by the auth routes. */
export const loadLoginPage = makeLoader('login', () => import('../../modules/auth/pages/Login'));

let preloadPromise = null;

/** Starts (once) and returns the login download. Never rejects: a failed preload just falls back to the normal lazy load. */
export const preloadAuthApp = () => {
  if (!preloadPromise) {
    preloadPromise = Promise.all([loadAuthApp(), loadLoginPage()]).catch(() => {
      preloadPromise = null;
    });
  }
  return preloadPromise;
};

/** Warms the login chunks when the browser is idle, so a later logout is instant. */
export const preloadAuthAppWhenIdle = () => {
  if (typeof window === 'undefined') return () => {};
  const run = () => {
    preloadAuthApp();
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 2000);
  return () => window.clearTimeout(id);
};
