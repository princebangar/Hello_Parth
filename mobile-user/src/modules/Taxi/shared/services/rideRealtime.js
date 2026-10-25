import { getDatabase, onValue as onRealtimeValue, ref } from 'firebase/database';
import { ensureFirebaseInitialized } from '@food/firebase';
const FIREBASE_DATABASE_URL = String(globalThis.__ENV__.VITE_FIREBASE_DATABASE_URL || '').trim().replace(/\/$/, '');

export const HAS_FIREBASE_RIDE_DB = FIREBASE_DATABASE_URL.length > 0;
let firebaseRideAccessDenied = false;

const rideUrl = (rideId) => `${FIREBASE_DATABASE_URL}/taxiRides/${encodeURIComponent(String(rideId))}.json`;


const toCoordsArray = (value, fallback = null) => {
  if (Array.isArray(value) && value.length >= 2) {
    const [lng, lat] = value;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return [Number(lng), Number(lat)];
    }
  }

  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude ?? value?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return [lng, lat];
  }

  return fallback;
};

export const pointSnapshot = (value, fallbackAddress = '') => {
  const coordinates = toCoordsArray(value, null);

  if (!coordinates) {
    return null;
  }

  return {
    coordinates,
    lng: coordinates[0],
    lat: coordinates[1],
    address: String(value?.address || fallbackAddress || ''),
    updatedAt: new Date().toISOString(),
  };
};

const mergeByPath = (target, path, data) => {
  if (!path || path === '/') {
    return data;
  }

  const segments = String(path).split('/').filter(Boolean);
  const next = { ...(target || {}) };
  let cursor = next;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    cursor[key] = typeof cursor[key] === 'object' && cursor[key] !== null ? { ...cursor[key] } : {};
    cursor = cursor[key];
  }

  cursor[segments[segments.length - 1]] = data;
  return next;
};

export const createRideRealtimeSnapshot = ({
  rideId,
  pickup,
  drop,
  fare,
  status = 'searching',
  userId = '',
  driverId = '',
  driver = null,
}) => ({
  rideId: String(rideId),
  pickup: pointSnapshot(pickup),
  drop: pointSnapshot(drop),
  fare: Number(fare || 0),
  status,
  userId: userId ? String(userId) : '',
  driverId: driverId ? String(driverId) : '',
  driver: driver || null,
  driverLocation: null,
  updatedAt: new Date().toISOString(),
});

const writeJson = async (rideId, method, payload) => {
  if (!HAS_FIREBASE_RIDE_DB || !rideId || firebaseRideAccessDenied) {
    return null;
  }

  const response = await fetch(rideUrl(rideId), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    firebaseRideAccessDenied = true;
    return null;
  }

  if (!response.ok) {
    throw new Error(`Firebase ride sync failed (${response.status})`);
  }

  return response.json().catch(() => null);
};

export const seedRideRealtime = (payload) => writeJson(payload.rideId, 'PUT', createRideRealtimeSnapshot(payload));

export const patchRideRealtime = (rideId, payload) =>
  writeJson(rideId, 'PATCH', {
    ...payload,
    updatedAt: new Date().toISOString(),
  });

export const pushDriverLocationRealtime = (rideId, location, extra = {}) =>
  patchRideRealtime(rideId, {
    driverLocation: {
      ...pointSnapshot(location),
      heading: Number.isFinite(Number(extra.heading)) ? Number(extra.heading) : null,
      speed: Number.isFinite(Number(extra.speed)) ? Number(extra.speed) : null,
      updatedAt: new Date().toISOString(),
    },
  });

// The web read this path as a Firebase REST event stream (EventSource), which React Native does not have. The app
// listens to the same path (taxiRides/<rideId>) with the Firebase SDK's onValue, which delivers the full current state.
export const subscribeRideRealtime = (rideId, onValue, onError) => {
  if (!HAS_FIREBASE_RIDE_DB || !rideId || firebaseRideAccessDenied) {
    return () => {};
  }

  const firebaseApp = ensureFirebaseInitialized({ enableAuth: false, enableRealtimeDb: true });
  const db = firebaseApp ? getDatabase(firebaseApp) : null;
  if (!db) return () => {};

  const unsubscribe = onRealtimeValue(
    ref(db, 'taxiRides/' + String(rideId)),
    (snapshot) => {
      try {
        onValue(snapshot.val());
      } catch (error) {
        onError?.(error);
      }
    },
    (error) => {
      firebaseRideAccessDenied = true;
      onError?.(error);
    },
  );

  return () => {
    unsubscribe();
  };
};
