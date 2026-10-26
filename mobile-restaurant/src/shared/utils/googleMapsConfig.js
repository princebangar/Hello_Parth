/**
 * One Google Maps configuration for the whole app.
 *
 * On the web this fed `@googlemaps/js-api-loader` (a singleton that must always get the same options). The app has no
 * JS SDK: maps are react-native-maps (key in app config) and the web services go through @/lib/google with the same
 * key. The exports stay so the screens that read them keep working.
 */

import { watchAndInstallPlacesCompat } from "../maps/placesCompat";

watchAndInstallPlacesCompat();

const sanitizeKey = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");

export const GOOGLE_MAPS_API_KEY = sanitizeKey(globalThis.__ENV__?.VITE_GOOGLE_MAPS_API_KEY);
export const GOOGLE_MAPS_LOADER_ID = "helloparth-google-maps";
export const GOOGLE_MAPS_VERSION = "3.64";
// A superset of what any screen needs; the same array instance is reused everywhere.
export const GOOGLE_MAPS_LIBRARIES = Object.freeze(["drawing", "geometry", "places", "routes"]);

/** Options the web passed to `new Loader(...)` (kept for callers that read the key from them). */
export const getLoaderOptions = (apiKey = GOOGLE_MAPS_API_KEY) => ({
  id: GOOGLE_MAPS_LOADER_ID,
  apiKey: sanitizeKey(apiKey) || GOOGLE_MAPS_API_KEY,
  version: GOOGLE_MAPS_VERSION,
  libraries: [...GOOGLE_MAPS_LIBRARIES],
});

/** Options the web passed to `useJsApiLoader(...)` (kept for callers that read the key from them). */
export const getJsApiLoaderOptions = (apiKey = GOOGLE_MAPS_API_KEY) => ({
  id: GOOGLE_MAPS_LOADER_ID,
  googleMapsApiKey: sanitizeKey(apiKey) || GOOGLE_MAPS_API_KEY,
  version: GOOGLE_MAPS_VERSION,
  libraries: [...GOOGLE_MAPS_LIBRARIES],
});
