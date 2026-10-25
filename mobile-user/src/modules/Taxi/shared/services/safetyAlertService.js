// User SOS (POST /users/sos). The web file also held the driver SOS (driver registrationService); the user app has no
// driver code, so only the user part is kept. Location comes from navigator.geolocation (expo-location via webCompat).
import api from '../api/axiosInstance';
import { getCurrentRide } from '../../modules/user/services/currentRideService';
import { withUserAuth } from '../../modules/user/services/authService';

const cleanString = (value = '') => String(value || '').trim();

const readCoordinatePair = (...sources) => {
  for (const source of sources) {
    if (Array.isArray(source) && source.length >= 2) {
      const [lng, lat] = source;
      if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
        return [Number(lng), Number(lat)];
      }
    }

    const nestedCoords = source?.coordinates;
    if (Array.isArray(nestedCoords) && nestedCoords.length >= 2) {
      const [lng, lat] = nestedCoords;
      if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
        return [Number(lng), Number(lat)];
      }
    }

    const lat = Number(source?.lat ?? source?.latitude);
    const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [Number(lng), Number(lat)];
    }
  }

  return null;
};

const readBrowserLocation = () =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.longitude, position.coords.latitude]),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 30000,
      },
    );
  });

export const triggerUserSosAlert = async (extra = {}) => {
  const ride = getCurrentRide() || {};
  // Where the rider is right now beats where the trip started.
  const location =
    await readBrowserLocation()
    || readCoordinatePair(ride?.pickupCoords, ride?.pickupLocation, ride?.dropCoords, ride?.dropLocation);

  const payload = {
    rideId: cleanString(ride?.rideId),
    deliveryId: cleanString(ride?.deliveryId),
    serviceType: cleanString(ride?.serviceType || ride?.type || 'general').toLowerCase(),
    tripCode: cleanString(ride?.rideId),
    pickupAddress: cleanString(ride?.pickup),
    dropAddress: cleanString(ride?.drop),
    vehicleLabel: cleanString(ride?.vehicle?.name || ride?.vehicleLabel || ride?.driver?.vehicleType),
    locationLabel: cleanString(ride?.pickup || ride?.drop),
    location: location ? { coordinates: location } : null,
    ...extra,
  };

  const response = await api.post('/users/sos', payload, withUserAuth());
  return response?.data?.data || response?.data || null;
};
