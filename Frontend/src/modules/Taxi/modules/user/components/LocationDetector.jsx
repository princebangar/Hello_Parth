import React, { useEffect, useRef, useState } from 'react';
import { useBaseGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { getSavedLocation, saveLocation, LOCATION_UPDATED_EVENT } from '../services/locationStore';
import { markLocationSessionFetched, hasLocationSessionFetched, locationPartsFromGoogleResult } from '@/shared/utils/sharedUserLocation';
import { watchBestPosition, pickBestGeocodeResult } from '../utils/preciseLocation';
import LocationOffDialog from './LocationOffDialog';

/**
 * Finds the rider's current location for the Taxi home screen - no map is drawn.
 *
 * This is the location work the home map used to do while it was on screen: the GPS fix is taken once per app
 * session (by whichever app opens first, Taxi or Food), saved, and its address looked up so the header and the
 * pickup show it. It also reports its progress through the `helloparth:location-status` event and opens the
 * "turn on location" dialog when the permission is denied or GPS is off.
 */
const LocationDetector = () => {
  const [coords, setCoords] = useState(null);
  // 'denied' | 'off' while the 'turn on location' dialog is open
  const [locationOffReason, setLocationOffReason] = useState(null);
  const requestedLocationRef = useRef(false);
  const addressLookupKeyRef = useRef('');
  const { isLoaded } = useBaseGoogleMapsLoader();
  const [address, setAddress] = useState(() => getSavedLocation()?.address || '');

  const setStatus = (status) => {
    try {
      window.dispatchEvent(new CustomEvent('helloparth:location-status', { detail: status }));
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const handleUpdate = () => {
      const saved = getSavedLocation();
      setAddress(saved?.address || '');
      if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') {
        setCoords({ lat: saved.lat, lon: saved.lon });
        setStatus('ready');
      }
    };
    window.addEventListener(LOCATION_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(LOCATION_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const persistCoords = (next, { touch = true } = {}) => {
    setCoords(next);
    setStatus('ready');
    const previous = getSavedLocation();
    const moved = !Number.isFinite(previous?.lat) || !Number.isFinite(previous?.lon)
      || Math.abs(previous.lat - next.lat) > 0.0005
      || Math.abs(previous.lon - next.lon) > 0.0005;
    saveLocation({
      ...next,
      // The old address belongs to the old spot - the new one arrives after reverse geocoding.
      ...(moved ? { address: '' } : {}),
      // Showing an already-saved fix again must not make it look freshly detected.
      ...(touch ? { updatedAt: Date.now() } : {}),
    });
  };

  // `result` is a Google geocoder result: the full address stays as the pickup text, and area / state / pincode
  // are kept as well so Food can show the same spot with its short label.
  const persistAddress = (result) => {
    const full = String(result?.formatted_address || '').trim();
    if (!full) return;
    const parts = locationPartsFromGoogleResult(result);
    saveLocation({
      address: full,
      ...(parts.area ? { area: parts.area } : {}),
      ...(parts.state ? { state: parts.state } : {}),
      ...(parts.pincode ? { pincode: parts.pincode } : {}),
    });
  };

  // The GPS fix can arrive before the Google Maps script has loaded, and then the address was never looked up.
  // Resolve it as soon as the script is ready.
  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.Geocoder || !coords || address) {
      return;
    }
    const key = `${Number(coords.lat).toFixed(5)},${Number(coords.lon).toFixed(5)}`;
    if (addressLookupKeyRef.current === key) {
      return;
    }
    addressLookupKeyRef.current = key;

    new window.google.maps.Geocoder().geocode({ location: { lat: coords.lat, lng: coords.lon } }, (results, geocodeStatus) => {
      if (geocodeStatus === 'OK' && pickBestGeocodeResult(results)) {
        persistAddress(pickBestGeocodeResult(results));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, coords, address]);

  const requestLocation = ({ silent = false } = {}) => {
    if (!navigator.geolocation) {
      if (!silent) {
        setStatus('error');
        setLocationOffReason('off');
      }
      return;
    }

    if (!silent) setStatus('loading');

    const handleSuccess = (position) => {
      const next = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };

      // This app session now has its GPS fix: Food (and a later visit to this screen) will use it as it is.
      markLocationSessionFetched();
      persistCoords(next);

      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat: next.lat, lng: next.lon } }, (results, geocodeStatus) => {
          const best = geocodeStatus === 'OK' ? pickBestGeocodeResult(results) : null;
          if (best) {
            try {
              persistAddress(best);
            } catch {
              // ignore
            }
          }
        });
      }
    };

    // The first fix shows at once; the position and the address are then refined while the GPS settles.
    const reportFailure = (error) => {
      if (error?.code === 1) {
        // Permission denied: do not ask again on every return to this screen.
        if (silent) markLocationSessionFetched();
        if (!silent) {
          setStatus('denied');
          setLocationOffReason('denied');
        }
        return;
      }
      // Fall back to a coarse (network) fix before giving up.
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        () => {
          // A silent background refresh failing must not blow away an already-good state (and is not retried on every return).
          if (silent) markLocationSessionFetched();
          if (!silent) {
            setStatus('error');
            setLocationOffReason('off');
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    };
    watchBestPosition(handleSuccess, reportFailure, { maxWaitMs: 10000 });
  };

  useEffect(() => {
    const saved = getSavedLocation();
    const hasSavedFix = typeof saved?.lat === 'number' && typeof saved?.lon === 'number';
    if (hasSavedFix) {
      persistCoords({ lat: saved.lat, lon: saved.lon }, { touch: false });
    }

    // The location is taken ONCE per app session and then stays put, also while the user hops between Taxi and
    // Food, until the user changes it (picking an address). Remounting this screen must not fetch GPS again.
    const shouldRefreshCurrentLocation = !hasSavedFix || !hasLocationSessionFetched();

    if (shouldRefreshCurrentLocation && !requestedLocationRef.current) {
      requestedLocationRef.current = true;
      // Silent when a saved fix is already on screen (a new session only re-checks it quietly).
      requestLocation({ silent: hasSavedFix });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LocationOffDialog
      open={Boolean(locationOffReason)}
      reason={locationOffReason}
      onClose={() => setLocationOffReason(null)}
      onRetry={() => {
        setLocationOffReason(null);
        requestLocation();
      }}
    />
  );
};

export default LocationDetector;
