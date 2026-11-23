// Google Play "prominent disclosure": before Android's location permission prompt the app must explain, in its own
// screen, what location it collects, what for, and that it is also collected with the app closed or not in use.
// Every place that requests location permission awaits requestLocationDisclosure() first; the screen itself is
// LocationDisclosureHost (mounted once in the root layout).
//
// - "Continue" is remembered, so the explanation is shown once (Android's own prompt still follows when needed).
// - "Not now" is not remembered: the next time location is needed it is explained again. Passive requests (a map
//   asking for the position) do not show it again in the same run after "Not now"; going Online always does.

const ACCEPTED_KEY = 'delivery_location_disclosure_v1';

let host = null; // (resolve) => void, set by LocationDisclosureHost
let pending = null; // Promise<boolean> while the screen is up or waiting for the host
let pendingResolve = null;
let declinedThisRun = false;
let shown = false; // the explanation screen is on screen (the incoming-order popup waits for it)
const shownListeners = new Set();

/** LocationDisclosureHost reports when its screen opens / closes. */
export function setLocationDisclosureShown(value) {
  if (shown === value) return;
  shown = value;
  shownListeners.forEach((fn) => fn());
}
export function subscribeLocationDisclosureShown(fn) {
  shownListeners.add(fn);
  return () => shownListeners.delete(fn);
}
export const isLocationDisclosureShown = () => shown;

const wasAccepted = () => {
  try {
    return localStorage.getItem(ACCEPTED_KEY) === 'accepted';
  } catch {
    return false;
  }
};

const finish = (accepted) => {
  if (accepted) {
    try {
      localStorage.setItem(ACCEPTED_KEY, 'accepted');
    } catch {
      // storage blocked: the explanation is simply shown again next time
    }
  } else {
    declinedThisRun = true;
  }
  const resolve = pendingResolve;
  pending = null;
  pendingResolve = null;
  resolve?.(accepted);
};

/** Called by LocationDisclosureHost on mount (fn) and unmount (null). Shows a request that came in before it mounted. */
export function registerLocationDisclosureHost(fn) {
  host = fn;
  if (host && pendingResolve) host(finish);
}

/**
 * Resolves true once the rider has seen and accepted the location explanation (at once if they already did).
 * { passive: true } for requests the rider did not start themselves (a map wanting the position).
 */
export function requestLocationDisclosure({ passive = false } = {}) {
  if (wasAccepted()) return Promise.resolve(true);
  if (passive && declinedThisRun) return Promise.resolve(false);
  if (pending) return pending;
  pending = new Promise((resolve) => {
    pendingResolve = resolve;
  });
  if (host) host(finish);
  return pending;
}
