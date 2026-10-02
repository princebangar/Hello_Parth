/**
 * One Google Map instance for the Taxi home screen that outlives the screen.
 *
 * The home screen unmounts whenever the user goes to Food (or any other screen). Mounting a brand-new map on the way
 * back means a fresh set of tiles, and the "Loading map..." placeholder shows again every time. Instead the map lives
 * in its own detached <div>: leaving the screen only takes that div out of the page, coming back puts the very same
 * div (with its tiles, centre and zoom) back in - the map is simply there.
 */
let shared = null; // { node, map }

export const hasPersistentMap = () => shared !== null;

/** Puts the persistent map inside `host`, creating it the first time. `reused` tells whether it already existed. */
export function acquirePersistentMap(host, { center, zoom, options }) {
  const maps = window.google.maps;
  let reused = true;

  if (!shared) {
    const node = document.createElement('div');
    node.style.width = '100%';
    node.style.height = '100%';
    shared = { node, map: new maps.Map(node, { center, zoom, ...options }) };
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
export function releasePersistentMap(host) {
  if (shared && shared.node.parentNode === host) {
    host.removeChild(shared.node);
  }
}

/** Drops the map for good (logout). */
export function resetPersistentMap() {
  if (shared?.node?.parentNode) {
    shared.node.parentNode.removeChild(shared.node);
  }
  shared = null;
}
