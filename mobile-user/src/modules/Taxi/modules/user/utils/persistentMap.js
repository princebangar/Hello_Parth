/**
 * One map "instance" per screen (Taxi user home, driver home) that outlives the screen.
 *
 * Web: the Google map lived in a detached <div> that was put back when the home screen mounted again, so its tiles,
 * centre and zoom were simply there (no "Loading map..." placeholder on every visit).
 * Native: a react-native-maps view cannot be detached and re-attached, so what outlives the screen is the map's state:
 * its last camera (centre + zoom) and whether it has drawn its tiles once. A remounted <AppMap> starts on the saved
 * camera (`initialRegion={regionFor(center, zoom)}`) and a screen can skip its placeholder when `ready` is true.
 *
 * Same exports as the web (`host` arguments are accepted and ignored), plus small helpers to save the camera / ready
 * flag from the map's events:
 *   const { center, zoom, ready } = acquirePersistentMap(null, { center, zoom });
 *   <AppMap onMapLoaded={() => markPersistentMapReady()} onRegionChangeComplete={(r) => savePersistentMapRegion(r)} />
 */
const instances = new Map(); // name -> { center: { lat, lng }, zoom, options, ready }
const DEFAULT_NAME = 'taxi-home';

export const hasPersistentMap = (name = DEFAULT_NAME) => instances.has(name);

/** The saved state of the persistent map, creating it the first time. `reused` tells whether it already existed. */
// eslint-disable-next-line no-unused-vars
export function acquirePersistentMap(host, { center, zoom, options } = {}, name = DEFAULT_NAME) {
  let shared = instances.get(name);
  let reused = true;

  // A map that was left before it drew its first tiles starts fresh (web: it stayed grey when put back).
  if (shared && !shared.ready) {
    instances.delete(name);
    shared = null;
  }

  if (!shared) {
    shared = { center, zoom, options, ready: false };
    instances.set(name, shared);
    reused = false;
  } else if (options) {
    shared.options = options;
  }

  return {
    map: null,
    reused,
    ready: Boolean(shared.ready),
    center: shared.center || center,
    zoom: shared.zoom ?? zoom,
    options: shared.options,
  };
}

/** The map drew its first tiles (react-native-maps `onMapLoaded`). */
export function markPersistentMapReady(name = DEFAULT_NAME) {
  const shared = instances.get(name);
  if (shared) shared.ready = true;
}

/** Remember where the map is (centre { lat, lng } + Google zoom level). */
export function savePersistentMapCamera({ center, zoom } = {}, name = DEFAULT_NAME) {
  const shared = instances.get(name);
  if (!shared) return;
  if (center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng))) {
    shared.center = { lat: Number(center.lat), lng: Number(center.lng) };
  }
  if (Number.isFinite(Number(zoom))) shared.zoom = Number(zoom);
}

/** Same, from a react-native-maps Region ({ latitude, longitude, latitudeDelta, longitudeDelta }). */
export function savePersistentMapRegion(region, name = DEFAULT_NAME) {
  if (!region) return;
  const zoom = Number(region.longitudeDelta) > 0 ? Math.log2(360 / Number(region.longitudeDelta)) : undefined;
  savePersistentMapCamera({ center: { lat: region.latitude, lng: region.longitude }, zoom }, name);
}

export const getPersistentMapCamera = (name = DEFAULT_NAME) => {
  const shared = instances.get(name);
  return shared ? { center: shared.center, zoom: shared.zoom, ready: Boolean(shared.ready) } : null;
};

/** Web: took the map's <div> out of the page. Native: nothing to detach - the saved state is kept for the next visit. */
// eslint-disable-next-line no-unused-vars
export function releasePersistentMap(host, name = DEFAULT_NAME) {}

/** Drops one map (or all of them) for good (logout). */
export function resetPersistentMap(name) {
  const names = name ? [name] : [...instances.keys()];
  names.forEach((key) => instances.delete(key));
}
