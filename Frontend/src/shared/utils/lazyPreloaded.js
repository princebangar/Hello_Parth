import { createElement, lazy } from 'react';
import { isChunkLoadError, reloadForNewVersion } from './chunkReload.js';

/**
 * Drop-in for React.lazy() that can be loaded BEFORE it is first rendered.
 *
 * React.lazy always suspends the first time a lazy component renders - even when its chunk was already downloaded -
 * and React then keeps the Suspense fallback on screen for at least ~300 ms (to avoid flicker). That is the skeleton /
 * spinner flash on a first click into a screen whose code is already in the browser (switching Food <-> Taxi, opening
 * the wallet ...).
 *
 * With `Component.preload()` (called while the app is idle) the module is fetched and remembered; from then on the
 * component renders directly - no suspension, no fallback. Without a preload it behaves exactly like React.lazy.
 */
export default function lazyPreloaded(loader) {
  let loadedComponent = null;
  let loading = null;

  const load = () => {
    if (!loading) {
      loading = loader()
        .then((mod) => {
          loadedComponent = mod?.default ?? mod;
          return mod;
        })
        .catch((error) => {
          loading = null; // let a later attempt retry (e.g. the network came back)
          // the file is gone from the server = a new version was published: load the new page
          if (isChunkLoadError(error)) reloadForNewVersion();
          throw error;
        });
    }
    return loading;
  };

  const Lazy = lazy(load);

  function LazyPreloaded(props) {
    return loadedComponent ? createElement(loadedComponent, props) : createElement(Lazy, props);
  }

  /** Fetch the module now. Resolves to the module; never rejects. */
  LazyPreloaded.preload = () => load().catch(() => null);

  return LazyPreloaded;
}
