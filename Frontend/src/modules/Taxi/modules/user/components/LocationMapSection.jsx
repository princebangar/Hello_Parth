import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation } from 'lucide-react';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { getSavedLocation, saveLocation, LOCATION_UPDATED_EVENT } from '../services/locationStore';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import { markLocationSessionFetched, hasLocationSessionFetched, locationPartsFromGoogleResult } from '@/shared/utils/sharedUserLocation';
import { watchBestPosition, pickBestGeocodeResult } from '../utils/preciseLocation';
import { acquirePersistentMap, hasPersistentMap, releasePersistentMap } from '../utils/persistentMap';

const DEFAULT_CENTER = { lat: 17.385, lon: 78.4867 };
const DEFAULT_ZOOM = 16;
const areCentersNearlyEqual = (first, second, threshold = 0.00001) => (
  Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold &&
  Math.abs(Number(first?.lon ?? 0) - Number(second?.lon ?? 0)) < threshold
);

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }]
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }]
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }]
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }]
  }
];

const LocationMapSection = () => {
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const [coords, setCoords] = useState(null);
  const [centerCoords, setCenterCoords] = useState(DEFAULT_CENTER);
  const [status, setStatusState] = useState('idle');
  const setStatus = (newStatus) => {
    setStatusState(newStatus);
    try {
      window.dispatchEvent(new CustomEvent('helloparth:location-status', { detail: newStatus }));
    } catch (e) {
      console.error(e);
    }
  };
  const [isDragging, setIsDragging] = useState(false);
  const [map, setMap] = useState(null);
  const [tilesLoaded, setTilesLoaded] = useState(() => hasPersistentMap());
  const mapHostRef = useRef(null);
  const isDraggingRef = useRef(false);
  const requestedLocationRef = useRef(false);
  const { isLoaded, loadError } = useBaseGoogleMapsLoader();
  const [address, setAddress] = useState(() => getSavedLocation()?.address || '');

  useEffect(() => {
    const handleUpdate = () => {
      const saved = getSavedLocation();
      setAddress(saved?.address || '');
      if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') {
        const nextCoords = { lat: saved.lat, lon: saved.lon };
        setCoords(nextCoords);
        setCenterCoords(nextCoords);
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
    setCenterCoords(next);
    setStatus('ready');
    const previous = getSavedLocation();
    const moved = !Number.isFinite(previous?.lat) || !Number.isFinite(previous?.lon)
      || Math.abs(previous.lat - next.lat) > 0.0005
      || Math.abs(previous.lon - next.lon) > 0.0005;
    saveLocation({
      ...next,
      // The old address belongs to the old spot — the new one arrives after reverse geocoding.
      // (Keeping it made the pickup show a place the user had already left.)
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

  // The GPS fix can arrive before the Google Maps script has loaded, and then the address was never looked up
  // (the pickup stayed blank or kept an old place). Resolve it as soon as the script is ready.
  const addressLookupKeyRef = useRef('');
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
      if (geocodeStatus === 'OK' && results?.[0]?.formatted_address) {
        persistAddress(results[0]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, coords, address]);

  useEffect(() => {
    const saved = getSavedLocation();
    if (typeof saved?.lat === 'number' && typeof saved?.lon === 'number') {
      persistCoords({ lat: saved.lat, lon: saved.lon }, { touch: false });
    }

    const hasSavedFix = typeof saved?.lat === 'number' && typeof saved?.lon === 'number';

    // The location is taken ONCE per app session (by whichever app opens first - Taxi or Food) and then stays put,
    // also while the user hops between Taxi and Food, until the user changes it (Update button, dragging the pin,
    // picking an address). Remounting this screen must not fetch GPS again or move the pin.
    const shouldRefreshCurrentLocation = !hasSavedFix || !hasLocationSessionFetched();

    if (shouldRefreshCurrentLocation && !requestedLocationRef.current) {
      requestedLocationRef.current = true;
      // Silent when a saved fix is already on screen (a new session only re-checks it quietly).
      requestLocation({ silent: hasSavedFix });
    }
  }, []);

  useEffect(() => {
    if (coords && map) {
      map.panTo({ lat: coords.lat, lng: coords.lon });
      map.setZoom(DEFAULT_ZOOM);
    }
  }, [coords, map]);

  const requestLocation = ({ silent = false } = {}) => {
    if (!navigator.geolocation) {
      if (!silent) setStatus('error');
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
      if (map) {
        map.panTo({ lat: next.lat, lng: next.lon });
        map.setZoom(DEFAULT_ZOOM);
      }

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

    // The first fix shows at once; the pin and the address are then refined while the GPS settles (a few seconds at
    // most) - so inside an office block the pin ends up on the building, not on a Wi-Fi guess 200 m away.
    const reportFailure = (error) => {
      if (error?.code === 1) {
        // Permission denied: do not ask again on every return to this screen.
        if (silent) markLocationSessionFetched();
        if (!silent) setStatus('denied');
        return;
      }
      // Fall back to a coarse (network) fix before giving up.
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        () => {
          // A silent background refresh failing shouldn't blow away an
          // already-good "ready" state with an error one (and is not retried on every return either).
          if (silent) markLocationSessionFetched();
          if (!silent) setStatus('error');
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    };
    watchBestPosition(handleSuccess, reportFailure, { maxWaitMs: 10000 });
  };

  const helperText = (() => {
    if (status === 'loading') return 'Pinning your current location...';
    if (status === 'denied') return 'Location permission denied. Tap to try again.';
    if (status === 'error') return 'Unable to fetch location. Tap to retry.';
    if (isDragging) return 'Move the map to set the pin.';
    if (status === 'ready') return 'Drag the map to fine-tune. Tap Update to refresh GPS.';
    return 'Pin your current location, then adjust by dragging.';
  })();

  const mapOptions = useMemo(() => ({
    disableDefaultUI: true,
    zoomControl: false,
    clickableIcons: false,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    gestureHandling: 'greedy',
    styles: theme === 'dark' ? darkMapStyle : undefined,
  }), [theme]);

  const handleDragStart = () => {
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    if (!map) {
      return;
    }

    const center = map.getCenter();
    if (!center) {
      return;
    }

    persistCoords({ lat: center.lat(), lon: center.lng() });
    if (window.google?.maps?.Geocoder) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode(
        { location: { lat: center.lat(), lng: center.lng() } },
        (results, geocodeStatus) => {
          if (geocodeStatus === 'OK' && results?.[0]?.formatted_address) {
            persistAddress(results[0]);
          }
        },
      );
    }
  };

  const handleIdle = () => {
    if (!map) {
      return;
    }

    const center = map.getCenter();
    if (!center) {
      return;
    }

    const next = { lat: center.lat(), lon: center.lng() };

    if (areCentersNearlyEqual(centerCoords, next)) {
      return;
    }

    setCenterCoords(next);

    if (!isDraggingRef.current && status === 'ready') {
      saveLocation(next);
    }
  };

  // The listeners are attached once per mount but must always run the latest handlers (they read current state).
  const handlersRef = useRef({});
  handlersRef.current = { onDragStart: handleDragStart, onDragEnd: handleDragEnd, onIdle: handleIdle };

  // The map can go into the page as soon as Google's script is loaded - and when the persistent map already exists
  // there is nothing to wait for (useJsApiLoader only reports isLoaded one render after mounting).
  const mapsReady = HAS_VALID_GOOGLE_MAPS_KEY
    && !loadError
    && Boolean(window.google?.maps)
    && (isLoaded || hasPersistentMap());

  // Put the persistent map into this screen's host div (the first time it is created, later it is simply re-used).
  // A layout effect: the map is in place before the browser paints, so coming back shows it straight away.
  useLayoutEffect(() => {
    if (!mapsReady || !mapHostRef.current) {
      return undefined;
    }

    const host = mapHostRef.current;
    const saved = getSavedLocation();
    const startCenter = Number.isFinite(saved?.lat) && Number.isFinite(saved?.lon)
      ? { lat: saved.lat, lng: saved.lon }
      : { lat: centerCoords.lat, lng: centerCoords.lon };

    const { map: persistentMap, reused } = acquirePersistentMap(host, {
      center: startCenter,
      zoom: DEFAULT_ZOOM,
      options: mapOptions,
    });
    setMap(persistentMap);
    if (reused) {
      setTilesLoaded(true);
    }

    const listeners = [
      persistentMap.addListener('tilesloaded', () => setTilesLoaded(true)),
      persistentMap.addListener('dragstart', () => handlersRef.current.onDragStart?.()),
      persistentMap.addListener('dragend', () => handlersRef.current.onDragEnd?.()),
      persistentMap.addListener('idle', () => handlersRef.current.onIdle?.()),
    ];

    return () => {
      listeners.forEach((listener) => listener.remove());
      releasePersistentMap(host);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsReady]);

  // Theme switch: light / dark map styling.
  useEffect(() => {
    if (map) {
      map.setOptions(mapOptions);
    }
  }, [map, mapOptions]);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="w-full lg:px-5"
    >
      {/* Search Header for Desktop */}
      <div className="hidden lg:flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Map</p>
          <h3 className="mt-0.5 flex items-baseline gap-1 text-[16px] font-semibold text-slate-900">
            <span className="truncate">Pin your location</span>
            <span className="inline-flex" aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="inline-block"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{
                    duration: 1.05,
                    delay: dot * 0.18,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  .
                </motion.span>
              ))}
            </span>
          </h3>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{helperText}</p>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={requestLocation}
          className="inline-flex items-center gap-2.5 rounded-full border border-white/60 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow-[0_8px_16px_-4px_rgba(15,23,42,0.1)] transition-all active:shadow-inner"
        >
          <div className="relative">
            <Navigation
              size={14}
              strokeWidth={2.8}
              className={`transition-colors ${status === 'loading' ? 'animate-pulse text-yellow-500' : 'text-slate-500'}`}
            />
            {coords && (
              <motion.span
                layoutId="active-dot"
                className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>
          <span className="uppercase tracking-wider">{coords ? 'Update' : 'Pin'}</span>
        </motion.button>
      </div>

      <div className="relative w-full lg:rounded-[20px] lg:bg-[linear-gradient(135deg,rgba(234,179,8,0.40)_0%,rgba(250,204,21,0.22)_50%,rgba(251,146,60,0.16)_100%)] lg:p-[1px] lg:shadow-[0_0_0_1px_rgba(234,179,8,0.10),0_10px_22px_rgba(15,23,42,0.06)]">
        <motion.div
          aria-hidden="true"
          className="hidden lg:block pointer-events-none absolute inset-0 z-0 rounded-[20px] blur-xl"
          animate={{ opacity: [0.14, 0.26, 0.14] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'linear-gradient(135deg, rgba(234,179,8,0.22) 0%, rgba(250,204,21,0.14) 52%, rgba(251,146,60,0.10) 100%)',
          }}
        />

        <div className={`relative z-10 overflow-hidden lg:rounded-[19px] border-b lg:border ${isDark ? 'border-zinc-800 bg-[#0f172a]' : 'border-slate-200 bg-[#F7F8FB]'}`}>
          <div className="relative h-[220px] lg:h-[480px] w-full">
            {!HAS_VALID_GOOGLE_MAPS_KEY && (
              <div className="flex h-full w-full items-center justify-center px-5 text-center">
                <div>
                  <p className={`text-[12px] font-semibold ${isDark ? 'text-white' : 'text-[#0B1220]'}`}>Google Maps key missing</p>
                  <p className={`mt-1 text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-[#64748B]'}`}>Add `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.</p>
                </div>
              </div>
            )}

            {HAS_VALID_GOOGLE_MAPS_KEY && loadError && (
              <div className="flex h-full w-full items-center justify-center px-5 text-center">
                <div>
                  <p className={`text-[12px] font-semibold ${isDark ? 'text-white' : 'text-[#0B1220]'}`}>Map failed to load</p>
                  <p className={`mt-1 text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-[#64748B]'}`}>Check your Google Maps browser key restrictions.</p>
                </div>
              </div>
            )}

            {/* Skeleton overlay — stays up (on top of the map) until Google's
                own tiles have actually painted, not just until the SDK
                script has loaded. The map div itself renders white/blank
                for a beat between those two moments otherwise. */}
            {HAS_VALID_GOOGLE_MAPS_KEY && !loadError && !tilesLoaded && (
              <div className={`absolute inset-0 z-30 flex h-full w-full items-center justify-center overflow-hidden transition-opacity duration-300 ${isDark ? 'bg-[#0f172a]' : 'bg-slate-300'}`}>
                {/* Skeleton "streets" so the placeholder reads as a map, not a blank block.
                    Darker greys in light mode — the base itself is already pale. */}
                <div className="absolute inset-0 opacity-60" aria-hidden="true">
                  <div className={`absolute left-[15%] top-0 h-full w-[3px] -skew-x-12 ${isDark ? 'bg-zinc-700' : 'bg-slate-400'}`} />
                  <div className={`absolute left-[62%] top-0 h-full w-[5px] skew-x-6 ${isDark ? 'bg-zinc-700' : 'bg-slate-400'}`} />
                  <div className={`absolute top-[30%] left-0 h-[4px] w-full -skew-y-3 ${isDark ? 'bg-zinc-700' : 'bg-slate-400'}`} />
                  <div className={`absolute top-[70%] left-0 h-[3px] w-full skew-y-2 ${isDark ? 'bg-zinc-700' : 'bg-slate-400'}`} />
                </div>
                <motion.div
                  className={`absolute inset-0 ${isDark ? 'bg-zinc-800/40' : 'bg-slate-400/25'}`}
                  animate={{ opacity: [0.2, 0.5, 0.2] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  aria-hidden="true"
                />
                <div className="relative flex flex-col items-center gap-1.5">
                  <motion.div
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <MapPin size={26} className={isDark ? 'text-zinc-500' : 'text-slate-600'} strokeWidth={2} />
                  </motion.div>
                  <span className={`text-[11px] font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-700'}`}>Loading map…</span>
                </div>
              </div>
            )}

            {/* The map itself is a persistent instance (utils/persistentMap.js) that is put into this div, so coming
                back from Food shows the same map at once instead of building a new one. */}
            {HAS_VALID_GOOGLE_MAPS_KEY && !loadError && (
              <div ref={mapHostRef} className="h-full w-full" />
            )}

            {/* The Pinpoint */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2">
              <motion.div
                initial={false}
                animate={{
                  scale: isDragging ? [1, 1.22, 1.15] : 1,
                  opacity: isDragging ? 0.28 : 0.55,
                  y: isDragging ? 7 : 0,
                }}
                className="absolute left-1/2 top-0 h-[3px] w-3.5 -translate-x-1/2 rounded-[100%] bg-slate-900/30 blur-[1.5px]"
              />

              <motion.div
                initial={false}
                animate={{
                  y: isDragging ? -20 : 0,
                  scale: isDragging ? 1.06 : 1,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 25,
                }}
                className="relative flex flex-col items-center -translate-y-1/2"
              >
                <div className="absolute -top-10 bg-[#FFB300] text-slate-950 text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-white/20 select-none whitespace-nowrap">
                  Pickup point
                </div>

                <div className="w-[1.5px] h-3.5 bg-slate-900/60" />

                <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-[0_3px_10px_rgba(0,0,0,0.2)] flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                </div>
              </motion.div>
            </div>


            {/* Floating locator target button (Mobile only) */}
            <button
              type="button"
              onClick={requestLocation}
              className="block lg:hidden absolute right-4 bottom-28 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/80 border border-white/10 text-white shadow-lg active:scale-95 transition-transform"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={status === 'loading' ? 'animate-pulse text-yellow-500' : 'text-white'}>
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
              </svg>
            </button>

            {!coords && status !== 'loading' && (
              <button
                type="button"
                onClick={requestLocation}
                className="absolute bottom-2 left-2 z-20 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-[11px] font-medium text-slate-700 shadow-sm active:scale-[0.99]"
              >
                Use my location
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default LocationMapSection;
