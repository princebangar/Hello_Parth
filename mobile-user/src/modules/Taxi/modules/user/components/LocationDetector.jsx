// Web: modules/Taxi/modules/user/components/LocationDetector.jsx — finds the rider's current location for the Taxi home
// screen (no map). The GPS fix is taken once per app session (by whichever app opens first, Taxi or Food), saved, and
// its address looked up so the header and the pickup show it. Reports progress through `helloparth:location-status`
// and opens the "turn on location" dialog when the permission is denied or GPS is off.
// Native: navigator.geolocation is expo-location (webCompat); google.maps.Geocoder -> @/lib/google geocodeLatLng
// (same result shape), so the "wait for the Maps script" step is not needed.
import React, { useEffect, useRef, useState } from 'react';
import { geocodeLatLng } from '@/lib/google';
import { getSavedLocation, saveLocation, LOCATION_UPDATED_EVENT } from '../services/locationStore';
import { markLocationSessionFetched, hasLocationSessionFetched, locationPartsFromGoogleResult } from '@/shared/utils/sharedUserLocation';
import { watchBestPosition, pickBestGeocodeResult } from '../utils/preciseLocation';
import LocationOffDialog from './LocationOffDialog';

const LocationDetector = () => {
  const [coords, setCoords] = useState(null);
  // 'denied' | 'off' while the 'turn on location' dialog is open
  const [locationOffReason, setLocationOffReason] = useState(null);
  const requestedLocationRef = useRef(false);
  const addressLookupKeyRef = useRef('');
  const stopWatchRef = useRef(null);
  const mountedRef = useRef(true);
  const [address, setAddress] = useState(() => getSavedLocation()?.address || '');

  const setStatus = (status) => {
    try {
      window.dispatchEvent(new CustomEvent('helloparth:location-status', { detail: status }));
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
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
      mountedRef.current = false;
      window.removeEventListener(LOCATION_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      stopWatchRef.current?.();
    };
  }, []);

  const persistCoords = (next, { touch = true } = {}) => {
    if (mountedRef.current) setCoords(next);
    setStatus('ready');
    const previous = getSavedLocation();
    const moved =
      !Number.isFinite(previous?.lat) ||
      !Number.isFinite(previous?.lon) ||
      Math.abs(previous.lat - next.lat) > 0.0005 ||
      Math.abs(previous.lon - next.lon) > 0.0005;
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

  const lookupAddress = (lat, lon) => {
    geocodeLatLng(lat, lon)
      .then((results) => {
        const best = pickBestGeocodeResult(results);
        if (best) persistAddress(best);
      })
      .catch(() => {});
  };

  // A saved fix without an address (e.g. the lookup failed earlier): resolve it.
  useEffect(() => {
    if (!coords || address) {
      return;
    }
    const key = `${Number(coords.lat).toFixed(5)},${Number(coords.lon).toFixed(5)}`;
    if (addressLookupKeyRef.current === key) {
      return;
    }
    addressLookupKeyRef.current = key;
    lookupAddress(coords.lat, coords.lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, address]);

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
      addressLookupKeyRef.current = `${Number(next.lat).toFixed(5)},${Number(next.lon).toFixed(5)}`;
      lookupAddress(next.lat, next.lon);
    };

    // The first fix shows at once; the position and the address are then refined while the GPS settles.
    const reportFailure = (error) => {
      if (error?.code === 1) {
        // Permission denied: do not ask again on every return to this screen.
        if (silent) markLocationSessionFetched();
        if (!silent && mountedRef.current) {
          setStatus('denied');
          setLocationOffReason('denied');
        }
        return;
      }
      // Fall back to a coarse (network) fix before giving up.
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        () => {
          // A silent background refresh failing must not blow away an already-good state.
          if (silent) markLocationSessionFetched();
          if (!silent && mountedRef.current) {
            setStatus('error');
            setLocationOffReason('off');
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    };
    stopWatchRef.current?.();
    stopWatchRef.current = watchBestPosition(handleSuccess, reportFailure, { maxWaitMs: 10000 });
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
