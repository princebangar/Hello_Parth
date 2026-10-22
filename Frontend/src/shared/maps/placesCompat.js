// The OLD Places classes (AutocompleteService, PlacesService) on top of Places API (New).
//
// Google no longer lets a new project switch on the old "Places API", so `new google.maps.places.AutocompleteService()` and
// `PlacesService` answer REQUEST_DENIED and every address search / nearby list stays empty. The screens (ride, parcel,
// intercity, Food address picker) are written against those two classes, so instead of rewriting each of them the two
// classes are replaced ONCE here by versions with the same methods, callbacks and result fields that call the new API
// (AutocompleteSuggestion / Place). Nothing else in the app changes.
//
// Kept cheap on purpose (Google bills per request and per field):
//  - a suggestion remembers its PlacePrediction, so the details call that follows is part of the same autocomplete
//    session (typing is then not billed per key stroke);
//  - details ask only for the address and the point (no name / rating / photos: those cost more);
//  - nearby search is ranked by popularity and asks no rating (a rating field alone moves it to the dearest tier);
//  - the same autocomplete / nearby question is answered from memory for a while.

const AUTOCOMPLETE_CACHE_MS = 10 * 60 * 1000;
const NEARBY_CACHE_MS = 60 * 60 * 1000;
const PREDICTION_MEMORY_MAX = 300;

const predictionMemory = new Map(); // placeId -> PlacePrediction (keeps the session link for toPlace())
const autocompleteCache = new Map();
const nearbyCache = new Map();

const remember = (map, key, value, max = 200) => {
  if (map.size >= max) map.delete(map.keys().next().value);
  map.set(key, value);
};

const statusFromError = (error) => {
  const text = String(error?.message || error || '').toLowerCase();
  if (text.includes('quota') || text.includes('rate')) return 'OVER_QUERY_LIMIT';
  if (text.includes('not authorized') || text.includes('denied') || text.includes('blocked') || text.includes('api key')) return 'REQUEST_DENIED';
  if (text.includes('invalid')) return 'INVALID_REQUEST';
  return 'UNKNOWN_ERROR';
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
  const lat = typeof point?.lat === 'function' ? point.lat() : point?.lat;
  const lng = typeof point?.lng === 'function' ? point.lng() : point?.lng;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}` : '';
};

const boundsKey = (bounds) => {
  if (!bounds) return '';
  if (typeof bounds.toJSON === 'function') return JSON.stringify(bounds.toJSON());
  return JSON.stringify(bounds);
};

export function installPlacesCompat(google = typeof window !== 'undefined' ? window.google : null) {
  const places = google?.maps?.places;
  if (!places || places.__helloParthCompat) return;
  if (!places.AutocompleteSuggestion || !places.Place) return; // the library is not there yet: retried on the next call

  class CompatAutocompleteService {
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

        const newRequest = { input };
        if (request.sessionToken) newRequest.sessionToken = request.sessionToken;
        if (countries.length) newRequest.includedRegionCodes = countries.slice(0, 15);
        if (primaryTypes.length) newRequest.includedPrimaryTypes = primaryTypes;
        if (origin) newRequest.origin = origin;
        if (request.locationRestriction) newRequest.locationRestriction = request.locationRestriction;
        if (request.locationBias) newRequest.locationBias = request.locationBias;
        else if (request.bounds) newRequest.locationBias = request.bounds;
        else if (request.location && request.radius) newRequest.locationBias = { center: request.location, radius: Number(request.radius) };
        if (request.language) newRequest.language = request.language;
        if (request.region) newRequest.region = request.region;

        const { suggestions = [] } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(newRequest);
        const predictions = suggestions
          .map((suggestion) => suggestion.placePrediction)
          .filter(Boolean)
          .map((prediction) => {
            remember(predictionMemory, prediction.placeId, prediction, PREDICTION_MEMORY_MAX);
            const description = prediction.text?.text ?? String(prediction.text || '');
            return {
              place_id: prediction.placeId,
              description,
              structured_formatting: {
                main_text: prediction.mainText?.text || description.split(',')[0],
                secondary_text: prediction.secondaryText?.text || '',
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

  class CompatPlacesService {
    // eslint-disable-next-line no-unused-vars
    constructor(attributionNode) {}

    getDetails(request = {}, callback) {
      const run = async () => {
        const wanted = new Set();
        (request.fields || ['formatted_address', 'geometry']).forEach((field) => {
          if (field === 'geometry' || field === 'geometry.location') { wanted.add('location'); wanted.add('viewport'); }
          else if (field === 'formatted_address') wanted.add('formattedAddress');
          else if (field === 'address_components') wanted.add('addressComponents');
          else if (field === 'types') wanted.add('types');
          else if (field === 'vicinity') wanted.add('shortFormattedAddress');
          // 'name' is NOT asked: it is a dearer field and the screens already have the title from the suggestion
        });
        if (!wanted.size) wanted.add('formattedAddress');

        const prediction = predictionMemory.get(request.placeId);
        const place = prediction?.toPlace ? prediction.toPlace() : new places.Place({ id: request.placeId });
        await place.fetchFields({ fields: [...wanted] });

        const formatted = place.formattedAddress || '';
        return {
          place_id: place.id || request.placeId,
          name: formatted.split(',')[0] || '',
          formatted_address: formatted,
          vicinity: place.shortFormattedAddress || undefined,
          types: place.types || [],
          geometry: place.location ? { location: place.location, viewport: place.viewport || null } : undefined,
          address_components: (place.addressComponents || []).map((component) => ({
            long_name: component.longText,
            short_name: component.shortText,
            types: component.types || [],
          })),
        };
      };

      return run().then(
        (result) => { callback?.(result, 'OK'); return result; },
        (error) => { callback?.(null, statusFromError(error)); return null; },
      );
    }

    nearbySearch(request = {}, callback) {
      const run = async () => {
        const center = request.location;
        const lat = typeof center?.lat === 'function' ? center.lat() : center?.lat;
        const lng = typeof center?.lng === 'function' ? center.lng() : center?.lng;
        const types = [].concat(request.type || request.types || []).slice(0, 5);
        const cacheKey = JSON.stringify([Number(lat).toFixed(3), Number(lng).toFixed(3), request.radius, types, request.keyword || '']);
        const cached = nearbyCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.results;

        const { places: found = [] } = await places.Place.searchNearby({
          // displayName / location / address only: no rating or review fields (they are billed at a higher tier)
          fields: ['displayName', 'location', 'formattedAddress', 'shortFormattedAddress', 'id'],
          locationRestriction: { center: { lat: Number(lat), lng: Number(lng) }, radius: Math.min(Number(request.radius) || 5000, 50000) },
          ...(types.length ? { includedPrimaryTypes: types } : {}),
          rankPreference: places.SearchNearbyRankPreference?.POPULARITY || 'POPULARITY',
          maxResultCount: 20,
        });
        const results = found.map((place) => ({
          place_id: place.id,
          name: place.displayName,
          vicinity: place.shortFormattedAddress || place.formattedAddress || '',
          formatted_address: place.formattedAddress || '',
          geometry: { location: place.location },
          types,
        }));
        remember(nearbyCache, cacheKey, { results, expiresAt: Date.now() + NEARBY_CACHE_MS });
        return results;
      };

      return run().then(
        (results) => { callback?.(results, results.length ? 'OK' : 'ZERO_RESULTS', null); return results; },
        (error) => { callback?.(null, statusFromError(error), null); return null; },
      );
    }
  }


  // The OLD search-box widget `new places.Autocomplete(input, options)` (used by the restaurant onboarding and the admin
  // zone / restaurant pages). The old widget is just as unavailable on a new project, so this one draws the same
  // `.pac-container` dropdown under the input, searches through the service above, and keeps `getPlace()` and the
  // `place_changed` listener the pages already use.
  const WIDGET_STYLE_ID = 'hp-pac-style';
  const ensureWidgetStyle = () => {
    if (document.getElementById(WIDGET_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = WIDGET_STYLE_ID;
    style.textContent = [
      '.pac-container.hp-pac{position:fixed;z-index:999999;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.15);overflow:hidden;font-family:inherit;pointer-events:auto}',
      '.pac-container.hp-pac:empty{display:none!important}',
      '.pac-container.hp-pac .pac-item{padding:8px 12px;cursor:pointer;font-size:13px;color:#6b7280;border-top:1px solid #f3f4f6;line-height:1.35}',
      '.pac-container.hp-pac .pac-item:first-child{border-top:0}',
      '.pac-container.hp-pac .pac-item:hover,.pac-container.hp-pac .pac-item-selected{background:#f3f4f6}',
      '.pac-container.hp-pac .pac-item-query{color:#111827;font-size:13px;font-weight:500;margin-right:6px}',
    ].join('');
    document.head.appendChild(style);
  };

  class CompatAutocompleteWidget {
    constructor(input, options = {}) {
      this.input = input;
      this.options = { ...options };
      this.listeners = { place_changed: [] };
      this.place = {};
      this.items = [];
      this.active = -1;
      this.timer = null;
      this.requestId = 0;
      this.service = new CompatAutocompleteService();
      this.details = new CompatPlacesService();
      this.sessionToken = null;
      if (!input || typeof document === 'undefined') return;

      ensureWidgetStyle();
      this.box = document.createElement('div');
      this.box.className = 'pac-container hp-pac';
      document.body.appendChild(this.box);
      input.setAttribute('autocomplete', 'off');

      this.onInput = () => {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.search(), 250);
      };
      this.onKey = (event) => {
        if (!this.items.length) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          this.active = (this.active + step + this.items.length) % this.items.length;
          this.paint();
        } else if (event.key === 'Enter' && this.active >= 0) {
          event.preventDefault();
          this.choose(this.items[this.active]);
        } else if (event.key === 'Escape') {
          this.close();
        }
      };
      this.onBlur = () => window.setTimeout(() => this.close(), 150);
      this.onMove = () => this.placeBox();
      input.addEventListener('input', this.onInput);
      input.addEventListener('keydown', this.onKey);
      input.addEventListener('blur', this.onBlur);
      window.addEventListener('resize', this.onMove);
      window.addEventListener('scroll', this.onMove, true);
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

    placeBox() {
      if (!this.box || !this.input) return;
      if (!this.input.isConnected) { this.destroy(); return; } // the page removed its input: clean up after it
      const rect = this.input.getBoundingClientRect();
      this.box.style.left = `${rect.left}px`;
      this.box.style.top = `${rect.bottom + 2}px`;
      this.box.style.width = `${rect.width}px`;
    }

    async search() {
      const text = String(this.input.value || '').trim();
      if (text.length < 2) { this.close(); return; }
      if (!this.sessionToken && places.AutocompleteSessionToken) this.sessionToken = new places.AutocompleteSessionToken();
      const id = ++this.requestId;
      await this.service.getPlacePredictions({
        input: text,
        componentRestrictions: this.options.componentRestrictions,
        types: this.options.types,
        bounds: this.options.bounds,
        sessionToken: this.sessionToken || undefined,
      }, (predictions) => {
        if (id !== this.requestId) return; // a newer key stroke already asked again
        this.items = predictions || [];
        this.active = -1;
        this.paint();
      });
    }

    paint() {
      if (!this.box) return;
      this.box.textContent = '';
      this.items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = `pac-item${index === this.active ? ' pac-item-selected' : ''}`;
        const main = document.createElement('span');
        main.className = 'pac-item-query';
        main.textContent = item.structured_formatting?.main_text || item.description;
        row.appendChild(main);
        const rest = item.structured_formatting?.secondary_text;
        if (rest) row.appendChild(document.createTextNode(rest));
        row.addEventListener('mousedown', (event) => { event.preventDefault(); this.choose(item); });
        this.box.appendChild(row);
      });
      this.placeBox();
    }

    close() {
      this.items = [];
      this.active = -1;
      if (this.box) this.box.textContent = '';
    }

    async choose(item) {
      this.close();
      this.input.value = item.description;
      const result = await this.details.getDetails({
        placeId: item.place_id,
        fields: ['geometry', 'formatted_address', 'address_components'],
      });
      this.sessionToken = null; // the pick ends the billing session
      if (!result) return;
      this.place = { ...result, name: item.structured_formatting?.main_text || result.name };
      (this.listeners.place_changed || []).slice().forEach((fn) => {
        try { fn(); } catch (error) { console.error(error); }
      });
    }

    destroy() {
      window.clearTimeout(this.timer);
      try {
        this.input?.removeEventListener('input', this.onInput);
        this.input?.removeEventListener('keydown', this.onKey);
        this.input?.removeEventListener('blur', this.onBlur);
        window.removeEventListener('resize', this.onMove);
        window.removeEventListener('scroll', this.onMove, true);
        this.box?.remove();
      } catch { /* already gone */ }
    }
  }

  try {
    places.Autocomplete = CompatAutocompleteWidget;
    places.AutocompleteService = CompatAutocompleteService;
    places.PlacesService = CompatPlacesService;
    places.__helloParthCompat = true;
  } catch {
    // a frozen namespace: the screens keep the old classes (they work on a key that still has the old API)
  }
}

// Safety net for any screen that builds the old classes before it called installPlacesCompat itself: look for the Places
// library for up to a minute after the app starts and swap the classes as soon as it is there.
let watching = false;
export function watchAndInstallPlacesCompat() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    installPlacesCompat();
    if (window.google?.maps?.places?.__helloParthCompat || tries > 600) window.clearInterval(timer);
  }, 100);
}

// `new places.Autocomplete(input, options)` for the admin / onboarding search boxes: makes sure the replacement is in
// place first (the screens can reach this a moment before the watcher above has swapped the class).
export function createPlacesAutocomplete(input, options) {
  installPlacesCompat();
  return new window.google.maps.places.Autocomplete(input, options);
}
