// Building-level "where am I" and road distances.
//
// A phone's first GPS fix is often a coarse Wi-Fi / mobile-tower guess (100 m - 1 km off, worse inside an office
// block). The helpers here keep listening for a few seconds until the fix is tight, then the address is looked up
// from the most specific Google result (a building / street address, never a bare plus code).

const GOOD_ACCURACY_METERS = 30;
const DEFAULT_MAX_WAIT_MS = 9000;
const GEO_ERROR_PERMISSION_DENIED = 1;

/**
 * Keeps listening and calls `onFix(position)` for the first fix and again for every clearly better one. Stops by itself
 * once the fix is within `targetAccuracy` metres or after `maxWaitMs`. Returns a function that stops it early.
 * `onError` is only called when no fix at all arrived.
 */
export const watchBestPosition = (onFix, onError, { targetAccuracy = GOOD_ACCURACY_METERS, maxWaitMs = DEFAULT_MAX_WAIT_MS } = {}) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError?.({ code: 2, message: 'Geolocation unavailable' });
    return () => {};
  }

  let best = null;
  let watchId = null;
  let timer = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (timer) window.clearTimeout(timer);
  };

  const accuracyOf = (position) => (Number.isFinite(position?.coords?.accuracy) ? position.coords.accuracy : Infinity);

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (stopped) return;
      if (!best || accuracyOf(position) < accuracyOf(best) * 0.9) {
        best = position;
        onFix(position);
      }
      if (accuracyOf(best) <= targetAccuracy) stop();
    },
    (error) => {
      if (stopped) return;
      if (error?.code === GEO_ERROR_PERMISSION_DENIED || !best) {
        stop();
        if (!best) onError?.(error);
      }
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
  );

  timer = window.setTimeout(() => {
    const hadFix = Boolean(best);
    stop();
    if (!hadFix) onError?.({ code: 3, message: 'Timeout expired' });
  }, maxWaitMs);

  return stop;
};

/** Promise form: resolves with the most exact fix reached within the wait (or rejects when there was none). */
export const getBestPosition = (options = {}) => new Promise((resolve, reject) => {
  let latest = null;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const stop = watchBestPosition(
    (position) => {
      latest = position;
      if (Number.isFinite(position?.coords?.accuracy) && position.coords.accuracy <= (options.targetAccuracy ?? GOOD_ACCURACY_METERS)) {
        resolve(position);
      }
    },
    (error) => reject(error),
    options,
  );
  // watchBestPosition stops on its own at the deadline; hand over whatever was the best by then.
  window.setTimeout(() => {
    stop();
    if (latest) resolve(latest);
  }, maxWaitMs + 50);
});

/**
 * Drops the part of an address that only says where inside a building ("Block, 3rd floor, Corporate House, 307 B,
 * Regal Circle" -> "Corporate House, 307 B, Regal Circle"): floor / room / suite / unit parts and a lone
 * "Block" / "Tower" / "Wing" word. A driver or rider needs the ground location, not the storey.
 */
export const cleanGroundAddress = (address) => {
  const text = String(address || '').trim();
  if (!text) return text;
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const isInsideBuildingPart = (part) =>
    /\b(floor|flr|basement|mezzanine)\b/i.test(part)
    || /^(room|suite|unit|flat|office|shop|cabin)\b/i.test(part)
    || /^(block|tower|wing)$/i.test(part);
  const kept = parts.filter((part) => !isInsideBuildingPart(part));
  return (kept.length ? kept : parts).join(', ');
};

/** A saved "recent place" with its floor / unit words removed (its short name follows the cleaned address). */
export const cleanRecentPlace = (item = {}) => {
  const address = cleanGroundAddress(item.address);
  const oldFirst = String(item.address || '').split(',')[0].trim();
  const name = !item.name || item.name === oldFirst ? address.split(',')[0].trim() : cleanGroundAddress(item.name);
  return { ...item, address, name };
};

const INSIDE_BUILDING_TYPES = ['subpremise', 'floor', 'room'];

/**
 * From a Geocoder response, the first readable address. Google lists the most specific result first; skipped are a
 * bare plus code ("J675+HJ6, ...") and results that point to a spot inside a building (subpremise / floor / room).
 * The address that comes back never names a floor.
 */
export const pickBestGeocodeResult = (results) => {
  const list = Array.isArray(results) ? results.filter((result) => result?.formatted_address) : [];
  if (list.length === 0) return null;
  const isPlusCode = (result) => (result.types || []).includes('plus_code') || /^[A-Z0-9]{4}\+[A-Z0-9]{2,}/.test(result.formatted_address);
  const isInside = (result) => (result.types || []).some((type) => INSIDE_BUILDING_TYPES.includes(type));
  const best = list.find((result) => !isPlusCode(result) && !isInside(result))
    || list.find((result) => !isPlusCode(result))
    || list[0];
  return { ...best, formatted_address: cleanGroundAddress(best.formatted_address) };
};

const toLatLng = (coords) => {
  const [lng, lat] = coords;
  return { lat: Number(lat), lng: Number(lng) };
};

const MAX_ROAD_LOOKUPS = 10;

/**
 * Driving distance in metres from `originCoords` ([lng, lat]) to each destination - the distance a car covers on
 * the roads, which is what Google Maps shows, not the straight line. A destination is `{ coords: [lng, lat] }` or
 * `{ placeId }`. Resolves to an array of metres (null where Google has no road route), or null if the service is
 * unavailable altogether.
 *
 * Uses the Directions service, the one every Maps key has (the newer Routes API answers 403 unless it is switched
 * on for the key, and the Distance Matrix is deprecated and logs a warning on every call).
 */
export const loadRoadDistances = async (google, originCoords, destinations) => {
  if (!google?.maps?.DirectionsService || !Array.isArray(originCoords) || originCoords.length !== 2 || !destinations?.length) return null;
  const origin = toLatLng(originCoords);
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return null;

  const targets = destinations.slice(0, MAX_ROAD_LOOKUPS).map((item) => {
    if (Array.isArray(item?.coords) && item.coords.length === 2) return toLatLng(item.coords);
    if (item?.placeId) return { placeId: item.placeId };
    return null;
  });

  const service = new google.maps.DirectionsService();
  const lookups = targets.map((target) => new Promise((resolve) => {
    if (!target) {
      resolve(null);
      return;
    }
    service.route(
      { origin, destination: target, travelMode: google.maps.TravelMode.DRIVING },
      (response, status) => {
        const meters = Number(response?.routes?.[0]?.legs?.[0]?.distance?.value);
        resolve(status === 'OK' && Number.isFinite(meters) ? meters : null);
      },
    );
  }));
  const meters = await Promise.all(lookups);
  return destinations.map((_, index) => (index < meters.length ? meters[index] : null));
};
