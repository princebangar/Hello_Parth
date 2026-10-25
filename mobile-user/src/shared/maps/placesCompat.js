// The OLD google.maps classes the web screens are written against (Geocoder, places.AutocompleteService,
// places.PlacesService, LatLng, LatLngBounds) — natively, on top of the Google web services in @/lib/google.
//
// On the web this file swapped the old Places classes for Places API (New) versions inside window.google. The app has
// no JS SDK and no window.google, so the same classes live in one namespace object, `googleMapsCompat`, shaped like
// window.google: `googleMapsCompat.maps.Geocoder`, `googleMapsCompat.maps.places.AutocompleteService`, ...
// Same methods, same callbacks (results, status), same result fields (geometry.location is a LatLng with lat()/lng()),
// so screen logic written for window.google keeps working when it is handed `googleMapsCompat` instead.
//
// Kept cheap like the web version: details ask only for the address / point / components, nearby search is ranked by
// popularity without rating fields, and the same questions are answered from memory (inside @/lib/google and here).
import { GOOGLE_MAPS_API_KEY, ANDROID_PACKAGE } from '@/config/env';
import { geocodeAddress, geocodeLatLng, nearbySearch as nearbySearchApi, newSessionToken, placeDetails } from '@/lib/google';

const AUTOCOMPLETE_CACHE_MS = 10 * 60 * 1000;
const autocompleteCache = new Map();

const remember = (map, key, value, max = 200) => {
  if (map.size >= max) map.delete(map.keys().next().value);
  map.set(key, value);
};

const statusFromError = (error) => {
  const text = String(error?.message || error || '').toLowerCase();
  if (text.includes('quota') || text.includes('rate')) return 'OVER_QUERY_LIMIT';
  if (text.includes('not authorized') || text.includes('denied') || text.includes('blocked') || text.includes('api key') || text.includes('permission')) return 'REQUEST_DENIED';
  if (text.includes('invalid')) return 'INVALID_REQUEST';
  return 'UNKNOWN_ERROR';
};

// ------------------------------------------------------------------ LatLng / LatLngBounds
const readLat = (p) => (typeof p?.lat === 'function' ? p.lat() : Number(p?.lat ?? p?.latitude));
const readLng = (p) => (typeof p?.lng === 'function' ? p.lng() : Number(p?.lng ?? p?.longitude ?? p?.lon));

export class LatLng {
  constructor(lat, lng) {
    if (lat && typeof lat === 'object') {
      this._lat = readLat(lat);
      this._lng = readLng(lat);
    } else {
      this._lat = Number(lat);
      this._lng = Number(lng);
    }
  }

  lat() {
    return this._lat;
  }

  lng() {
    return this._lng;
  }

  equals(other) {
    return Boolean(other) && readLat(other) === this._lat && readLng(other) === this._lng;
  }

  toJSON() {
    return { lat: this._lat, lng: this._lng };
  }

  toString() {
    return `(${this._lat}, ${this._lng})`;
  }
}

export class LatLngBounds {
  constructor(sw, ne) {
    this._south = Infinity;
    this._west = Infinity;
    this._north = -Infinity;
    this._east = -Infinity;
    if (sw) this.extend(sw);
    if (ne) this.extend(ne);
  }

  extend(point) {
    const lat = readLat(point);
    const lng = readLng(point);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return this;
    this._south = Math.min(this._south, lat);
    this._north = Math.max(this._north, lat);
    this._west = Math.min(this._west, lng);
    this._east = Math.max(this._east, lng);
    return this;
  }

  isEmpty() {
    return !Number.isFinite(this._south);
  }

  getSouthWest() {
    return new LatLng(this._south, this._west);
  }

  getNorthEast() {
    return new LatLng(this._north, this._east);
  }

  getCenter() {
    return new LatLng((this._south + this._north) / 2, (this._west + this._east) / 2);
  }

  contains(point) {
    const lat = readLat(point);
    const lng = readLng(point);
    return lat >= this._south && lat <= this._north && lng >= this._west && lng <= this._east;
  }

  toJSON() {
    return { north: this._north, south: this._south, east: this._east, west: this._west };
  }
}

const toLatLngObject = (location) => (location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))
  ? new LatLng(location.lat, location.lng)
  : null);

// { north, south, east, west } | LatLngBounds -> Places API (New) rectangle
const toRectangle = (bounds) => {
  const b = typeof bounds?.toJSON === 'function' ? bounds.toJSON() : bounds;
  if (!b || ![b.north, b.south, b.east, b.west].every((v) => Number.isFinite(Number(v)))) return null;
  return {
    rectangle: {
      low: { latitude: Number(b.south), longitude: Number(b.west) },
      high: { latitude: Number(b.north), longitude: Number(b.east) },
    },
  };
};

const toCircle = (center, radius) => {
  const lat = readLat(center);
  const lng = readLng(center);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(Number(radius) || 5000, 50000) } };
};

// legacy `types` -> primary types of the new API (an empty list = no filter)
const primaryTypesFor = (types) => {
  const list = Array.isArray(types) ? types : types ? [types] : [];
  const out = new Set();
  list.forEach((type) => {
    if (type === '(cities)') ['locality', 'administrative_area_level_3'].forEach((t) => out.add(t));
    else if (type === '(regions)') ['locality', 'sublocality', 'postal_code', 'administrative_area_level_1', 'administrative_area_level_2'].forEach((t) => out.add(t));
    else if (type === 'address') ['street_address', 'premise', 'subpremise'].forEach((t) => out.add(t));
    else if (type !== 'geocode' && type !== 'establishment') out.add(type);
  });
  return [...out].slice(0, 5);
};

const roundPoint = (point) => {
  const lat = readLat(point);
  const lng = readLng(point);
  return Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(3)},${lng.toFixed(3)}` : '';
};

const boundsKey = (bounds) => {
  if (!bounds) return '';
  if (typeof bounds.toJSON === 'function') return JSON.stringify(bounds.toJSON());
  return JSON.stringify(bounds);
};

// Geocoder results keep the old JS-SDK shape, with geometry.location as a LatLng.
const withLatLngGeometry = (result) => ({
  ...result,
  geometry: result?.geometry ? { ...result.geometry, location: toLatLngObject(result.geometry.location) } : undefined,
});

// ------------------------------------------------------------------ Geocoder
async function geocodeWithBounds(address, bounds, region) {
  const b = typeof bounds?.toJSON === 'function' ? bounds.toJSON() : bounds;
  const boundsParam = b ? `&bounds=${b.south},${b.west}|${b.north},${b.east}` : '';
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}${boundsParam}&region=${region || 'in'}&language=en&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') throw new Error(data.error_message || data.status);
  return data.results || [];
}

export class Geocoder {
  geocode(request = {}, callback) {
    const run = async () => {
      if (request.placeId) {
        const place = await placeDetails(request.placeId, { fields: ['id', 'formattedAddress', 'location', 'addressComponents'] });
        if (!place?.geometry?.location || !Number.isFinite(Number(place.geometry.location.lat))) return [];
        return [{
          place_id: place.place_id || request.placeId,
          formatted_address: place.formatted_address,
          address_components: place.address_components,
          geometry: place.geometry,
          types: [],
        }];
      }
      if (request.location) {
        return geocodeLatLng(readLat(request.location), readLng(request.location));
      }
      if (request.address) {
        if (request.bounds) return geocodeWithBounds(String(request.address), request.bounds, request.region);
        return geocodeAddress(String(request.address), request.region ? { region: request.region } : undefined);
      }
      return [];
    };

    return run().then(
      (results) => {
        const mapped = (results || []).map(withLatLngGeometry);
        const status = mapped.length ? 'OK' : 'ZERO_RESULTS';
        try {
          callback?.(mapped, status);
        } catch (callbackError) {
          console.error(callbackError);
        }
        return { results: mapped };
      },
      (error) => {
        try {
          callback?.([], statusFromError(error));
        } catch (callbackError) {
          console.error(callbackError);
        }
        if (!callback) throw error;
        return { results: [] };
      },
    );
  }
}

// ------------------------------------------------------------------ places
export class AutocompleteSessionToken {
  constructor() {
    this.token = newSessionToken();
  }

  toString() {
    return this.token;
  }
}

const sessionTokenOf = (token) => (token ? String(token) : undefined);

async function fetchAutocompleteSuggestions(body) {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY, 'X-Android-Package': ANDROID_PACKAGE },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || String(res.status));
  return data.suggestions || [];
}

export class AutocompleteService {
  getPlacePredictions(request = {}, callback) {
    const run = async () => {
      const input = String(request.input || '').trim();
      if (!input) return { predictions: [], status: 'ZERO_RESULTS' };

      const countries = [].concat(request.componentRestrictions?.country || []).map((code) => String(code).toLowerCase()).filter(Boolean);
      const primaryTypes = primaryTypesFor(request.types);
      const origin = request.origin || null;
      const cacheKey = JSON.stringify([
        input.toLowerCase(), countries, primaryTypes, roundPoint(origin), boundsKey(request.locationRestriction),
        boundsKey(request.bounds), boundsKey(request.locationBias), roundPoint(request.location),
      ]);
      const cached = autocompleteCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return { predictions: cached.predictions, status: cached.predictions.length ? 'OK' : 'ZERO_RESULTS' };

      const body = { input };
      const sessionToken = sessionTokenOf(request.sessionToken);
      if (sessionToken) body.sessionToken = sessionToken;
      if (countries.length) body.includedRegionCodes = countries.slice(0, 15);
      if (primaryTypes.length) body.includedPrimaryTypes = primaryTypes;
      if (origin && Number.isFinite(readLat(origin))) body.origin = { latitude: readLat(origin), longitude: readLng(origin) };
      const restriction = request.locationRestriction ? (request.locationRestriction.center ? toCircle(request.locationRestriction.center, request.locationRestriction.radius) : toRectangle(request.locationRestriction)) : null;
      if (restriction) body.locationRestriction = restriction;
      let bias = null;
      if (request.locationBias) bias = request.locationBias.center ? toCircle(request.locationBias.center, request.locationBias.radius) : toRectangle(request.locationBias);
      else if (request.bounds) bias = toRectangle(request.bounds);
      else if (request.location && request.radius) bias = toCircle(request.location, request.radius);
      if (bias && !restriction) body.locationBias = bias;
      if (request.language) body.languageCode = request.language;
      if (request.region) body.regionCode = request.region;

      const suggestions = await fetchAutocompleteSuggestions(body);
      const predictions = suggestions
        .map((suggestion) => suggestion.placePrediction)
        .filter(Boolean)
        .map((prediction) => {
          const description = prediction.text?.text || '';
          return {
            place_id: prediction.placeId,
            description,
            structured_formatting: {
              main_text: prediction.structuredFormat?.mainText?.text || description.split(',')[0],
              secondary_text: prediction.structuredFormat?.secondaryText?.text || '',
            },
            types: Array.isArray(prediction.types) ? prediction.types : [],
            distance_meters: Number.isFinite(prediction.distanceMeters) ? prediction.distanceMeters : undefined,
            terms: [],
            matched_substrings: [],
          };
        });
      remember(autocompleteCache, cacheKey, { predictions, expiresAt: Date.now() + AUTOCOMPLETE_CACHE_MS });
      return { predictions, status: predictions.length ? 'OK' : 'ZERO_RESULTS' };
    };

    const promise = run().catch((error) => ({ predictions: [], status: statusFromError(error), error }));
    return promise.then((result) => {
      try {
        callback?.(result.predictions, result.status);
      } catch (callbackError) {
        console.error(callbackError);
      }
      return { predictions: result.predictions };
    });
  }

  getQueryPredictions(request, callback) {
    return this.getPlacePredictions(request, callback);
  }
}

export class PlacesService {
  // eslint-disable-next-line no-unused-vars
  constructor(attributionNode) {}

  getDetails(request = {}, callback) {
    const run = async () => {
      const place = await placeDetails(request.placeId, {
        sessionToken: sessionTokenOf(request.sessionToken),
        // 'name' (displayName) is NOT asked: it is a dearer field and the screens already have the title
        fields: ['id', 'formattedAddress', 'location', 'addressComponents'],
      });
      const formatted = place?.formatted_address || '';
      const location = toLatLngObject(place?.geometry?.location);
      return {
        place_id: place?.place_id || request.placeId,
        name: formatted.split(',')[0] || '',
        formatted_address: formatted,
        vicinity: undefined,
        types: [],
        geometry: location ? { location, viewport: null } : undefined,
        address_components: place?.address_components || [],
      };
    };

    return run().then(
      (result) => { callback?.(result, 'OK'); return result; },
      (error) => { callback?.(null, statusFromError(error)); return null; },
    );
  }

  nearbySearch(request = {}, callback) {
    const run = async () => {
      const lat = readLat(request.location);
      const lng = readLng(request.location);
      const types = [].concat(request.type || request.types || []).slice(0, 5);
      const found = await nearbySearchApi({
        lat,
        lng,
        radius: Math.min(Number(request.radius) || 5000, 50000),
        types,
        maxResults: 20,
      });
      return (found || []).map((place) => ({
        place_id: place.place_id,
        name: place.name,
        vicinity: place.vicinity || place.formatted_address || '',
        formatted_address: place.formatted_address || '',
        geometry: { location: toLatLngObject(place.geometry?.location) },
        types,
      })).filter((place) => place.geometry.location);
    };

    return run().then(
      (results) => { callback?.(results, results.length ? 'OK' : 'ZERO_RESULTS', null); return results; },
      (error) => { callback?.(null, statusFromError(error), null); return null; },
    );
  }
}

export const PlacesServiceStatus = Object.freeze({
  OK: 'OK',
  ZERO_RESULTS: 'ZERO_RESULTS',
  OVER_QUERY_LIMIT: 'OVER_QUERY_LIMIT',
  REQUEST_DENIED: 'REQUEST_DENIED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  NOT_FOUND: 'NOT_FOUND',
});

// The old search-box widget `new places.Autocomplete(input, options)` drew a DOM dropdown under an <input>. Natively
// there is no input element to attach to, so this is the same object without the drawing: a screen feeds it the typed
// text (`search(text, onPredictions)`), shows the predictions itself and calls `choose(prediction)`; `getPlace()` and
// the `place_changed` listener behave as before.
class CompatAutocompleteWidget {
  constructor(_input, options = {}) {
    this.options = { ...options };
    this.listeners = { place_changed: [] };
    this.place = {};
    this.requestId = 0;
    this.service = new AutocompleteService();
    this.details = new PlacesService();
    this.sessionToken = null;
  }

  addListener(name, handler) {
    (this.listeners[name] = this.listeners[name] || []).push(handler);
    return { remove: () => { this.listeners[name] = (this.listeners[name] || []).filter((fn) => fn !== handler); } };
  }

  getPlace() { return this.place; }
  setBounds(bounds) { this.options.bounds = bounds; }
  getBounds() { return this.options.bounds || null; }
  setComponentRestrictions(restrictions) { this.options.componentRestrictions = restrictions; }
  setTypes(types) { this.options.types = types; }
  setFields(fields) { this.options.fields = fields; }
  setOptions(options = {}) { this.options = { ...this.options, ...options }; }

  async search(text, onPredictions) {
    const value = String(text || '').trim();
    if (value.length < 2) {
      onPredictions?.([]);
      return [];
    }
    if (!this.sessionToken) this.sessionToken = new AutocompleteSessionToken();
    const id = ++this.requestId;
    let out = [];
    await this.service.getPlacePredictions({
      input: value,
      componentRestrictions: this.options.componentRestrictions,
      types: this.options.types,
      bounds: this.options.bounds,
      sessionToken: this.sessionToken,
    }, (predictions) => {
      if (id !== this.requestId) return; // a newer key stroke already asked again
      out = predictions || [];
      onPredictions?.(out);
    });
    return out;
  }

  async choose(item) {
    const result = await this.details.getDetails({
      placeId: item.place_id,
      sessionToken: this.sessionToken,
      fields: ['geometry', 'formatted_address', 'address_components'],
    });
    this.sessionToken = null; // the pick ends the billing session
    if (!result) return null;
    this.place = { ...result, name: item.structured_formatting?.main_text || result.name };
    (this.listeners.place_changed || []).slice().forEach((fn) => {
      try { fn(); } catch (error) { console.error(error); }
    });
    return this.place;
  }

  destroy() {
    this.listeners = { place_changed: [] };
  }
}

/** window.google look-alike: hand this to code written for window.google. */
export const googleMapsCompat = Object.freeze({
  maps: Object.freeze({
    LatLng,
    LatLngBounds,
    Geocoder,
    GeocoderStatus: Object.freeze({ OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' }),
    TravelMode: Object.freeze({ DRIVING: 'DRIVING', TWO_WHEELER: 'TWO_WHEELER' }),
    places: Object.freeze({
      AutocompleteService,
      PlacesService,
      PlacesServiceStatus,
      AutocompleteSessionToken,
      Autocomplete: CompatAutocompleteWidget,
      __helloParthCompat: true,
    }),
  }),
});

/** Web: swapped the old classes inside window.google. Native: the classes are always there; returns the namespace. */
export function installPlacesCompat() {
  return googleMapsCompat;
}

/** Web: watched for the Places library to appear. Native: nothing to wait for. */
export function watchAndInstallPlacesCompat() {
  return googleMapsCompat;
}

/** `new places.Autocomplete(input, options)` (headless natively, see CompatAutocompleteWidget). */
export function createPlacesAutocomplete(input, options) {
  return new CompatAutocompleteWidget(input, options);
}

export default googleMapsCompat;
