/**
 * One Google Map instance per screen (Taxi user home, driver home) that outlives the screen.
 *
 * The home screen unmounts whenever the user goes to Food (or any other screen). Mounting a brand-new map on the way
 * back means a fresh set of tiles, and the "Loading map..." placeholder shows again every time. Instead the map lives
 * in its own detached <div>: leaving the screen only takes that div out of the page, coming back puts the very same
 * div (with its tiles, centre and zoom) back in - the map is simply there.
 */
const instances = new Map(); // name -> { node, map }
const DEFAULT_NAME = 'taxi-home';

export const hasPersistentMap = (name = DEFAULT_NAME) => instances.has(name);

/** Puts the persistent map inside `host`, creating it the first time. `reused` tells whether it already existed. */
export function acquirePersistentMap(host, { center, zoom, options }, name = DEFAULT_NAME) {
  const maps = window.google.maps;
  let shared = instances.get(name);
  let reused = true;

  // A map that was detached before it drew its first tiles stays grey when it is put back: start a fresh one.
  if (shared && !shared.ready) {
    instances.delete(name);
    shared = null;
  }

  if (!shared) {
    const node = document.createElement('div');
    node.style.width = '100%';
    node.style.height = '100%';
    shared = { node, map: new maps.Map(node, { center, zoom, ...options }), ready: false };
    const created = shared;
    maps.event.addListenerOnce(created.map, 'tilesloaded', () => {
      created.ready = true;
    });
    instances.set(name, shared);
    reused = false;
  }

  host.appendChild(shared.node);
  if (reused) {
    maps.event.trigger(shared.map, 'resize');
    shared.map.setOptions(options);
  }
  return { map: shared.map, reused };
}

/** Takes the map out of the page (it keeps living for the next visit). */
export function releasePersistentMap(host, name = DEFAULT_NAME) {
  const shared = instances.get(name);
  if (shared && shared.node.parentNode === host) {
    host.removeChild(shared.node);
  }
}

/** Drops one map (or all of them) for good (logout). */
export function resetPersistentMap(name) {
  const names = name ? [name] : [...instances.keys()];
  names.forEach((key) => {
    const shared = instances.get(key);
    if (shared?.node?.parentNode) {
      shared.node.parentNode.removeChild(shared.node);
    }
    instances.delete(key);
  });
}
