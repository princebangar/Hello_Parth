// Google Maps web services over HTTPS — the native replacement for the google.maps JS SDK the web loads
// (Geocoder, Places AutocompleteSuggestion / Place, Routes). Same project key as the web (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).
// Checked against this key: Geocoding API, Places API (New) and Routes API v2 answer; the legacy Directions API is off.
import { ANDROID_PACKAGE, GOOGLE_MAPS_API_KEY } from '@/config/env';

const baseHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
  'X-Android-Package': ANDROID_PACKAGE,
});

const cache = new Map();
const cached = async (key, ms, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = await fn();
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
  return value;
};

const fail = async (res) => {
  let msg = `${res.status}`;
  try {
    const body = await res.json();
    msg = body?.error?.message || body?.error_message || msg;
  } catch {
    // keep status
  }
  const err = new Error(msg);
  err.status = res.status;
  throw err;
};

// ------------------------------------------------------------------ Geocoding
/** -> [{ formatted_address, place_id, address_components, geometry: { location: { lat, lng } }, types }] */
export async function geocodeLatLng(lat, lng, { language = 'en' } = {}) {
  const key = `rev:${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  return cached(key, 10 * 60 * 1000, async () => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=${language}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) await fail(res);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') throw new Error(data.error_message || data.status);
    return data.results || [];
  });
}

export async function geocodeAddress(address, { region = 'in', language = 'en' } = {}) {
  return cached(`fwd:${address}`, 10 * 60 * 1000, async () => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=${region}&language=${language}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) await fail(res);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') throw new Error(data.error_message || data.status);
    return data.results || [];
  });
}

// ------------------------------------------------------------------ Places (New)
export const newSessionToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * -> [{ place_id, description, structured_formatting: { main_text, secondary_text }, types, distanceMeters }]
 * (the shape of the old AutocompletePrediction the web screens read)
 */
export async function autocomplete(input, { lat, lng, radius = 50000, sessionToken, country = 'in', types } = {}) {
  const text = String(input || '').trim();
  if (!text) return [];
  const body = { input: text, includedRegionCodes: country ? [country] : undefined, sessionToken };
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radius, 50000) } };
    body.origin = { latitude: lat, longitude: lng };
  }
  if (types?.length) body.includedPrimaryTypes = types;
  const key = `ac:${text}:${lat?.toFixed?.(3)}:${lng?.toFixed?.(3)}:${(types || []).join(',')}`;
  return cached(key, 10 * 60 * 1000, async () => {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: baseHeaders(), body: JSON.stringify(body) });
    if (!res.ok) await fail(res);
    const data = await res.json();
    return (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => ({
        place_id: p.placeId,
        description: p.text?.text || '',
        structured_formatting: { main_text: p.structuredFormat?.mainText?.text || p.text?.text || '', secondary_text: p.structuredFormat?.secondaryText?.text || '' },
        types: p.types || [],
        distance_meters: p.distanceMeters,
      }));
  });
}

/** -> { place_id, name, formatted_address, geometry: { location: { lat, lng } }, address_components } */
export async function placeDetails(placeId, { sessionToken, fields = ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'] } = {}) {
  return cached(`pd:${placeId}`, 60 * 60 * 1000, async () => {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${sessionToken ? `?sessionToken=${sessionToken}` : ''}`;
    const res = await fetch(url, { headers: { ...baseHeaders(), 'X-Goog-FieldMask': fields.join(',') } });
    if (!res.ok) await fail(res);
    const p = await res.json();
    return {
      place_id: p.id,
      name: p.displayName?.text || '',
      formatted_address: p.formattedAddress || '',
      geometry: { location: { lat: p.location?.latitude, lng: p.location?.longitude } },
      address_components: (p.addressComponents || []).map((c) => ({ long_name: c.longText, short_name: c.shortText, types: c.types || [] })),
    };
  });
}

/** Nearby places around a point (ranked by popularity, like the web's placesCompat). */
export async function nearbySearch({ lat, lng, radius = 1500, types, maxResults = 10 } = {}) {
  const key = `nb:${lat?.toFixed?.(3)}:${lng?.toFixed?.(3)}:${radius}:${(types || []).join(',')}`;
  return cached(key, 60 * 60 * 1000, async () => {
    const body = {
      maxResultCount: maxResults,
      rankPreference: 'POPULARITY',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    };
    if (types?.length) body.includedPrimaryTypes = types;
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { ...baseHeaders(), 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types' },
      body: JSON.stringify(body),
    });
    if (!res.ok) await fail(res);
    const data = await res.json();
    return (data.places || []).map((p) => ({
      place_id: p.id,
      name: p.displayName?.text || '',
      vicinity: p.formattedAddress || '',
      formatted_address: p.formattedAddress || '',
      geometry: { location: { lat: p.location?.latitude, lng: p.location?.longitude } },
      types: p.types || [],
    }));
  });
}

// ------------------------------------------------------------------ Routes API v2
/** Google encoded polyline -> [{ latitude, longitude }] (react-native-maps coordinates) */
export function decodePolyline(encoded = '') {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

const toWaypoint = (p) => ({ location: { latLng: { latitude: Number(p.lat ?? p.latitude), longitude: Number(p.lng ?? p.longitude) } } });

/**
 * origin/destination: { lat, lng }. -> { distanceMeters, durationSeconds, coordinates: [{latitude, longitude}], encodedPolyline }
 * travelMode: DRIVE | TWO_WHEELER
 */
export async function computeRoute(origin, destination, { waypoints = [], travelMode = 'DRIVE' } = {}) {
  const key = `rt:${travelMode}:${[origin, ...waypoints, destination].map((p) => `${Number(p.lat ?? p.latitude).toFixed(4)},${Number(p.lng ?? p.longitude).toFixed(4)}`).join('|')}`;
  return cached(key, 2 * 60 * 1000, async () => {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { ...baseHeaders(), 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
      body: JSON.stringify({
        origin: toWaypoint(origin),
        destination: toWaypoint(destination),
        intermediates: waypoints.map(toWaypoint),
        travelMode,
      }),
    });
    if (!res.ok) await fail(res);
    const data = await res.json();
    const r = data.routes?.[0];
    if (!r) return null;
    const encodedPolyline = r.polyline?.encodedPolyline || '';
    return {
      distanceMeters: r.distanceMeters || 0,
      durationSeconds: parseInt(String(r.duration || '0').replace('s', ''), 10) || 0,
      encodedPolyline,
      coordinates: decodePolyline(encodedPolyline),
    };
  });
}
