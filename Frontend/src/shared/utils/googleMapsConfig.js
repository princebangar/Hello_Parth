/**
 * One Google Maps loader configuration for the whole app.
 *
 * `@googlemaps/js-api-loader` is a singleton: once any screen has loaded Maps, a second `new Loader(...)` /
 * `useJsApiLoader(...)` with *different* options (id, version, libraries, key) throws
 * "Loader must not be called again with different options" and the page falls into the error screen.
 * Every screen (Taxi, Food, Delivery, admin) must therefore take its options from here, never write its own.
 */

const sanitizeKey = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");

export const GOOGLE_MAPS_API_KEY = sanitizeKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
export const GOOGLE_MAPS_LOADER_ID = "helloparth-google-maps";
export const GOOGLE_MAPS_VERSION = "3.64";
// A superset of what any screen needs; the same array instance is reused everywhere.
export const GOOGLE_MAPS_LIBRARIES = Object.freeze(["drawing", "geometry", "places", "routes"]);

/** Options for `new Loader(...)` from @googlemaps/js-api-loader. */
export const getLoaderOptions = (apiKey = GOOGLE_MAPS_API_KEY) => ({
  id: GOOGLE_MAPS_LOADER_ID,
  apiKey: sanitizeKey(apiKey) || GOOGLE_MAPS_API_KEY,
  version: GOOGLE_MAPS_VERSION,
  libraries: [...GOOGLE_MAPS_LIBRARIES],
});

/** Options for `useJsApiLoader(...)` from @react-google-maps/api. */
export const getJsApiLoaderOptions = (apiKey = GOOGLE_MAPS_API_KEY) => ({
  id: GOOGLE_MAPS_LOADER_ID,
  googleMapsApiKey: sanitizeKey(apiKey) || GOOGLE_MAPS_API_KEY,
  version: GOOGLE_MAPS_VERSION,
  libraries: [...GOOGLE_MAPS_LIBRARIES],
});
