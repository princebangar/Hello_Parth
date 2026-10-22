// One quick, accurate "where am I" for Food and Taxi (drop-in for navigator.geolocation.getCurrentPosition).
//
// getCurrentPosition hands back the FIRST fix, which on a phone is often a coarse Wi-Fi / tower guess (100 m - 1 km off) -
// that is why the location was exact one time and wrong the next. This asks for a cached fix and a live GPS watch at the
// same time and answers with the first fix that is tight (<= GOOD_METERS) at once; a looser fix is kept only while GPS
// gets a short chance to sharpen it, then the best one so far is used. Same callbacks and options as getCurrentPosition.
const GOOD_METERS = 40;
const OK_METERS = 150;
const SETTLE_MS = 2500;

const accuracyOf = (position) => (Number.isFinite(position?.coords?.accuracy) ? position.coords.accuracy : Infinity);

export function getFastAccuratePosition(onSuccess, onError, options = {}) {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
  if (!geo) {
    onError?.({ code: 2, message: 'Geolocation unavailable' });
    return;
  }

  const timeoutMs = Number(options.timeout) > 0 ? Number(options.timeout) : 10000;
  const maximumAge = Number(options.maximumAge) >= 0 ? Number(options.maximumAge) : 0;
  let best = null;
  let done = false;
  let watchId = null;
  let settleTimer = null;
  let deadlineTimer = null;
  let lastError = null;

  const finish = (position, error) => {
    if (done) return;
    done = true;
    if (watchId !== null) geo.clearWatch(watchId);
    window.clearTimeout(settleTimer);
    window.clearTimeout(deadlineTimer);
    if (position) onSuccess?.(position);
    else onError?.(error || { code: 3, message: 'Timeout expired' });
  };

  const consider = (position) => {
    if (done || !position?.coords) return;
    if (!best || accuracyOf(position) < accuracyOf(best)) best = position;
    if (accuracyOf(best) <= GOOD_METERS) {
      finish(best);
      return;
    }
    // a usable fix: give GPS a moment to sharpen it, then take the best one
    if (!settleTimer && accuracyOf(best) <= OK_METERS) {
      settleTimer = window.setTimeout(() => finish(best), SETTLE_MS);
    }
  };

  const fail = (error) => {
    lastError = error;
    // permission denied cannot get better: report it at once unless some fix already arrived
    if (error?.code === 1 && !best) finish(null, error);
  };

  deadlineTimer = window.setTimeout(() => finish(best, lastError || { code: 3, message: 'Timeout expired' }), timeoutMs);

  // 1) a recent cached fix (instant when the phone has one), 2) live GPS
  geo.getCurrentPosition(consider, fail, { enableHighAccuracy: true, maximumAge: Math.min(maximumAge, 30000), timeout: timeoutMs });
  watchId = geo.watchPosition(consider, fail, { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs });
}
