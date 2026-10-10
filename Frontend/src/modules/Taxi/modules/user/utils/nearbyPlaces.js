// Shared "places near the rider" helpers for the Taxi user app (ride + parcel location pickers).
// Nothing here is a fixed city list: popular places come from Google Places around the rider's own
// pickup, typed searches are limited to that neighbourhood, and the same place is never listed twice.

// Popular places are looked up around the pickup and cached per ~1 km cell.
const POPULAR_RADIUS_METERS = 12000;
const POPULAR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const POPULAR_PLACE_TYPES = ['shopping_mall', 'tourist_attraction', 'train_station', 'bus_station', 'airport', 'hindu_temple', 'park'];
const POPULAR_PER_TYPE = 3;
export const POPULAR_MAX_RESULTS = 10;
// The list on screen stays short: a handful of well-known places, not a scroll of every nearby shop.
const POPULAR_SHOWN = 6;
// Below this the list looks broken, so it is topped up with the nearest places of any kind.
export const POPULAR_MIN_RESULTS = 4;
// Ratings a place needs to count as "popular"; the bar drops only when too few places clear it.
const POPULAR_RATING_TIERS = [1000, 300, 100, 50, 20];

// Typed searches are limited to a box of about +-33 km around the pickup, so results never come from another state.
export const SEARCH_BOX_DEGREES = 0.3;
export const SEARCH_MAX_DISTANCE_METERS = 45000;

const toRadians = (deg) => (deg * Math.PI) / 180;

// a / b are [lng, lat] pairs
export const distanceBetweenKm = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const [lng1, lat1, lng2, lat2] = [Number(a[0]), Number(a[1]), Number(b[0]), Number(b[1])];
  if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return null;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export const formatDistance = (km) => {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
};

// Words that only describe the kind of spot ("Rajwada", "Rajwada Chowk" and "Rajwada Palace" are one place).
const GENERIC_PLACE_WORDS = new Set([
  'chowk', 'chauk', 'chauraha', 'chouraha', 'chaurah', 'square', 'sq', 'circle', 'crossing', 'junction',
  'road', 'rd', 'marg', 'gate', 'naka', 'palace', 'market', 'bazar', 'bazaar', 'the',
  'mall', 'area', 'shopping', 'stop', 'ibus',
]);

export const placeKey = (title) => {
  const words = String(title || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((word) => !GENERIC_PLACE_WORDS.has(word));
  return (meaningful.length ? meaningful : words).join(' ');
};

/**
 * Keeps the first (best ranked) entry of every real place; later ones that only spell it differently are dropped.
 * Items look like { title, address, placeId?, coords? }.
 */
export const dedupePlaces = (list) => {
  const kept = [];
  const keys = new Set();
  const placeIds = new Set();
  const addresses = new Set();
  const wordCount = (value) => value.split(' ').length;

  list.forEach((item) => {
    const key = placeKey(item?.title || item?.address);
    const address = String(item?.address || '').trim().toLowerCase();
    if (!key) return;
    if (keys.has(key)) return;
    // "Nexus Indore Central" and "Nexus Indore Central Earlier TI Next" are the same place.
    const extendsKnownName = [...keys].some((known) => (
      (key.startsWith(`${known} `) && wordCount(known) >= 3) || (known.startsWith(`${key} `) && wordCount(key) >= 3)
    ));
    if (extendsKnownName) return;
    if (item.placeId && placeIds.has(item.placeId)) return;
    if (address && addresses.has(address)) return;

    const closeSameName = Array.isArray(item.coords) && kept.some((other) => {
      if (!Array.isArray(other.coords)) return false;
      const otherKey = placeKey(other.title);
      const sameName = otherKey === key || otherKey.startsWith(`${key} `) || key.startsWith(`${otherKey} `);
      return sameName && (distanceBetweenKm(item.coords, other.coords) ?? Infinity) < 0.25;
    });
    if (closeSameName) return;

    keys.add(key);
    if (item.placeId) placeIds.add(item.placeId);
    if (address) addresses.add(address);
    kept.push(item);
  });

  return kept;
};

// Most popular spots of each kind near the pickup, shown nearest first.
export const rankPopularPlaces = (places, originCoords) => {
  const nearbyPlaces = places
    .map((place) => ({ ...place, distanceKm: distanceBetweenKm(originCoords, place.coords) }))
    .filter((place) => Number.isFinite(place.distanceKm));

  // Places whose address ends in a different city than most results (badly tagged listings) are dropped.
  const cityOf = (place) => String(place.address || '').split(',').pop().trim().toLowerCase();
  const cityCounts = new Map();
  nearbyPlaces.forEach((place) => cityCounts.set(cityOf(place), (cityCounts.get(cityOf(place)) || 0) + 1));
  const [mainCity, mainCityCount] = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const withDistance = mainCity && mainCityCount / nearbyPlaces.length >= 0.6
    ? nearbyPlaces.filter((place) => cityOf(place) === mainCity)
    : nearbyPlaces;

  let pool = [];
  for (const minRatings of POPULAR_RATING_TIERS) {
    pool = withDistance.filter((place) => place.ratingCount >= minRatings);
    if (pool.length >= POPULAR_MAX_RESULTS) break;
  }
  // Unrated places are used only when almost nothing has ratings (a very small town).
  if (pool.length < 3) pool = withDistance;

  const byType = new Map();
  pool.forEach((place) => {
    byType.set(place.type, [...(byType.get(place.type) || []), place]);
  });

  const picked = [];
  byType.forEach((group) => {
    group.sort((a, b) => b.ratingCount - a.ratingCount);
    picked.push(...group.slice(0, POPULAR_PER_TYPE));
  });

  let ranked = dedupePlaces(picked.sort((a, b) => b.ratingCount - a.ratingCount))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, POPULAR_MAX_RESULTS);

  if (ranked.length < POPULAR_MIN_RESULTS) {
    const nearest = [...withDistance].sort((a, b) => a.distanceKm - b.distanceKm);
    ranked = dedupePlaces([...ranked, ...nearest]).slice(0, POPULAR_MIN_RESULTS);
  }

  return ranked.slice(0, POPULAR_SHOWN).map((place) => ({ ...place, distanceLabel: formatDistance(place.distanceKm) }));
};

/**
 * Popular places around [lng, lat], nearest first: [{ title, address, coords, placeId, distanceLabel }].
 * `google` is window.google, `placesService` a google.maps.places.PlacesService. Results are cached per ~1 km cell.
 */
export const loadPopularPlaces = async (google, placesService, originCoords) => {
  if (!google?.maps?.places || !placesService || !Array.isArray(originCoords) || originCoords.length !== 2) {
    return [];
  }
  const [lng, lat] = originCoords.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [];
  }

  const cacheKey = `taxi:popular:v2:${lat.toFixed(2)},${lng.toFixed(2)}`;
  try {
    const cached = JSON.parse(window.localStorage.getItem(cacheKey) || 'null');
    if (cached && Array.isArray(cached.places) && Date.now() - Number(cached.at) < POPULAR_CACHE_TTL_MS) {
      return rankPopularPlaces(cached.places, originCoords);
    }
  } catch {
    // ignore a broken cache entry
  }

  const origin = new google.maps.LatLng(lat, lng);
  const searchType = (type) => new Promise((resolve) => {
    placesService.nearbySearch({ location: origin, radius: POPULAR_RADIUS_METERS, type }, (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !Array.isArray(results)) {
        resolve([]);
        return;
      }
      resolve(results
        .filter((place) => place?.geometry?.location && place?.name)
        .map((place) => ({
          title: place.name,
          address: place.vicinity || place.formatted_address || place.name,
          coords: [place.geometry.location.lng(), place.geometry.location.lat()],
          placeId: place.place_id,
          ratingCount: Number(place.user_ratings_total || 0),
          type,
        })));
    });
  });

  const places = (await Promise.all(POPULAR_PLACE_TYPES.map(searchType))).flat();
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), places }));
  } catch {
    // storage full / blocked — the list still works, it just isn't cached
  }
  return rankPopularPlaces(places, originCoords);
};

/**
 * Extra Places-autocomplete request fields that keep a typed search near `origin` ({ lat, lng }):
 * ranks by distance from it and never returns places outside about +-33 km.
 */
export const nearbyAutocompleteRequest = (google, origin) => {
  if (!google?.maps?.LatLng || !origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    return {};
  }
  return {
    origin: new google.maps.LatLng(origin.lat, origin.lng),
    locationRestriction: {
      north: origin.lat + SEARCH_BOX_DEGREES,
      south: origin.lat - SEARCH_BOX_DEGREES,
      east: origin.lng + SEARCH_BOX_DEGREES,
      west: origin.lng - SEARCH_BOX_DEGREES,
    },
  };
};

/** Drops autocomplete predictions Google reports as far away (only possible when `origin` was sent). */
export const keepNearbyPredictions = (predictions) => predictions.filter((prediction) => (
  !Number.isFinite(prediction.distance_meters) || prediction.distance_meters <= SEARCH_MAX_DISTANCE_METERS
));

// ---- Which "Vijay Nagar" is this? ----------------------------------------------------------------------------
// Google lists several areas under one name (the small "Vijay Nagar" at Bhawarkua, pincode 452001, and the big one,
// 452010). An area result therefore gets the best-known landmark at its centre ("Near Bhawarkua Square"), so two
// areas with the same name can be told apart. Each area costs two geocoder calls once, then it is cached on the device.
const AREA_TYPES = ['sublocality', 'sublocality_level_1', 'sublocality_level_2', 'sublocality_level_3', 'neighborhood'];
const LANDMARK_TYPES = ['transit_station', 'point_of_interest', 'establishment', 'neighborhood'];
const AREA_HINT_CACHE_PREFIX = 'taxi:areahint:v1:';
const MAX_AREA_LOOKUPS = 5;

export const isAreaPlace = (types) => Array.isArray(types) && types.some((type) => AREA_TYPES.includes(type));

// "QV8V+97M UMT GARDEN" -> "UMT GARDEN"; plot numbers, bare numbers and plus codes are not landmarks.
const landmarkNameOf = (formattedAddress, areaTitle = '') => {
  const name = String(formattedAddress || '').split(',')[0].trim().replace(/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s*/, '').trim();
  if (name.length < 4 || !/[a-z]{3}/i.test(name)) return '';
  if (/^\d|\bplot\b|\bno\.?\s*\d/i.test(name)) return '';
  if (areaTitle && name.toLowerCase().includes(String(areaTitle).trim().toLowerCase())) return '';
  return name;
};

const readHintCache = (placeId) => {
  try {
    const value = window.localStorage.getItem(AREA_HINT_CACHE_PREFIX + placeId);
    return value === null ? undefined : value;
  } catch {
    return undefined;
  }
};

const writeHintCache = (placeId, hint) => {
  try {
    window.localStorage.setItem(AREA_HINT_CACHE_PREFIX + placeId, hint);
  } catch {
    // storage full / blocked - the hint still shows this time
  }
};

const geocode = (geocoder, request) => new Promise((resolve) => {
  geocoder.geocode(request, (results, status) => resolve(status === 'OK' && Array.isArray(results) ? results : []));
});

/**
 * { [placeId]: 'Bhawarkua Square' } for the area-type items (`{ placeId, title, types }`) of a result list.
 * Items that are not areas, or have no recognisable landmark, are left out.
 */
export const loadAreaHints = async (google, items) => {
  const hints = {};
  if (!google?.maps?.Geocoder || !Array.isArray(items)) return hints;
  const areas = items.filter((item) => item?.placeId && isAreaPlace(item.types)).slice(0, MAX_AREA_LOOKUPS);
  if (areas.length === 0) return hints;

  const geocoder = new google.maps.Geocoder();
  await Promise.all(areas.map(async (area) => {
    const cached = readHintCache(area.placeId);
    if (cached !== undefined) {
      if (cached) hints[area.placeId] = cached;
      return;
    }
    const centre = (await geocode(geocoder, { placeId: area.placeId }))[0]?.geometry?.location;
    if (!centre) return;
    const around = await geocode(geocoder, { location: centre });
    const landmark = around
      .filter((result) => (result.types || []).some((type) => LANDMARK_TYPES.includes(type)))
      .map((result) => landmarkNameOf(result.formatted_address, area.title))
      .find(Boolean) || '';
    writeHintCache(area.placeId, landmark);
    if (landmark) hints[area.placeId] = landmark;
  }));
  return hints;
};

// "Vijay Nagar" + "Bhawarkua Square" -> "Vijay Nagar, near Bhawarkua Square"
export const withAreaHint = (title, hint) => (hint ? `${title}, near ${hint}` : title);
