// Web: modules/Taxi/modules/user/components/LocationMapSection.jsx — the old Taxi home map with a centre pickup pin
// (drag the map to move the pin, "Update" to refresh GPS). Not rendered by the web Home today (LocationDetector took
// its place); converted for parity. Mobile layout only (the lg: desktop header is not drawn).
// Native: the persistent Google map -> AppMap (react-native-maps) starting on the saved camera of persistentMap.js; dragstart / dragend / idle ->
// onPanDrag / onRegionChangeComplete; tilesloaded -> onMapLoaded; Geocoder -> @/lib/google geocodeLatLng.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle as SvgCircle, Line } from 'react-native-svg';
import { MapPin } from 'lucide-react-native';
import { AppMap, regionFor } from '@/native/ui/AppMap';
import { Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { GOOGLE_MAPS_API_KEY } from '@/config/env';
import { geocodeLatLng } from '@/lib/google';
import { getSavedLocation, saveLocation, LOCATION_UPDATED_EVENT } from '../services/locationStore';
import { useUserTheme, useUserPalette } from '../../../shared/context/UserThemeContext';
import { markLocationSessionFetched, hasLocationSessionFetched, locationPartsFromGoogleResult } from '@/shared/utils/sharedUserLocation';
import { watchBestPosition, pickBestGeocodeResult } from '../utils/preciseLocation';
import LocationOffDialog from './LocationOffDialog';
import { acquirePersistentMap, getPersistentMapCamera, hasPersistentMap, markPersistentMapReady, savePersistentMapRegion } from '../utils/persistentMap';

const HAS_VALID_GOOGLE_MAPS_KEY = Boolean(String(GOOGLE_MAPS_API_KEY || '').trim());
const DEFAULT_CENTER = { lat: 17.385, lon: 78.4867 };
const DEFAULT_ZOOM = 16;
const areCentersNearlyEqual = (first, second, threshold = 0.00001) =>
  Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold && Math.abs(Number(first?.lon ?? 0) - Number(second?.lon ?? 0)) < threshold;

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
];

const useLoop = (duration) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  return v;
};

const MapSkeleton = ({ isDark }) => {
  const pulse = useLoop(1600);
  const bob = useLoop(1400);
  const street = isDark ? colors.zinc[700] : colors.slate[400];
  return (
    <View style={[StyleSheet.absoluteFill, styles.skeleton, { backgroundColor: isDark ? '#0f172a' : colors.slate[300] }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.6 }]} pointerEvents="none">
        <View style={[styles.street, { left: '15%', top: 0, height: '100%', width: 3, backgroundColor: street, transform: [{ skewX: '-12deg' }] }]} />
        <View style={[styles.street, { left: '62%', top: 0, height: '100%', width: 5, backgroundColor: street, transform: [{ skewX: '6deg' }] }]} />
        <View style={[styles.street, { top: '30%', left: 0, height: 4, width: '100%', backgroundColor: street, transform: [{ skewY: '-3deg' }] }]} />
        <View style={[styles.street, { top: '70%', left: 0, height: 3, width: '100%', backgroundColor: street, transform: [{ skewY: '2deg' }] }]} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? alpha(colors.zinc[800], 0.4) : alpha(colors.slate[400], 0.25), opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] }) },
        ]}
      />
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>
          <MapPin size={26} color={isDark ? colors.zinc[500] : colors.slate[600]} strokeWidth={2} />
        </Animated.View>
        <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? colors.zinc[400] : colors.slate[700] }}>Loading map…</Text>
      </View>
    </View>
  );
};

const LocationMapSection = () => {
  const { theme } = useUserTheme();
  const p = useUserPalette();
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
  // 'denied' | 'off' while the 'turn on location' dialog is open
  const [locationOffReason, setLocationOffReason] = useState(null);
  const [tilesLoaded, setTilesLoaded] = useState(() => hasPersistentMap() && Boolean(getPersistentMapCamera()?.ready));
  const mapRef = useRef(null);
  const isDraggingRef = useRef(false);
  const requestedLocationRef = useRef(false);
  const stopWatchRef = useRef(null);
  const [address, setAddress] = useState(() => getSavedLocation()?.address || '');
  // The map's last camera outlives the screen (utils/persistentMap.js), so coming back shows the same spot at once.
  const [initialRegion] = useState(() => {
    const saved = getSavedLocation();
    const start = Number.isFinite(saved?.lat) && Number.isFinite(saved?.lon) ? { lat: saved.lat, lng: saved.lon } : { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lon };
    const shared = acquirePersistentMap(null, { center: start, zoom: DEFAULT_ZOOM });
    return regionFor(shared.reused ? shared.center : start, shared.zoom ?? DEFAULT_ZOOM);
  });

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
      stopWatchRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistCoords = (next, { touch = true } = {}) => {
    setCoords(next);
    setCenterCoords(next);
    setStatus('ready');
    const previous = getSavedLocation();
    const moved =
      !Number.isFinite(previous?.lat) ||
      !Number.isFinite(previous?.lon) ||
      Math.abs(previous.lat - next.lat) > 0.0005 ||
      Math.abs(previous.lon - next.lon) > 0.0005;
    saveLocation({
      ...next,
      // The old address belongs to the old spot — the new one arrives after reverse geocoding.
      ...(moved ? { address: '' } : {}),
      // Showing an already-saved fix again must not make it look freshly detected.
      ...(touch ? { updatedAt: Date.now() } : {}),
    });
  };

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

  const addressLookupKeyRef = useRef('');
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

  const panTo = (next) => {
    mapRef.current?.animateToRegion?.(regionFor({ lat: next.lat, lng: next.lon }, DEFAULT_ZOOM), 300);
  };

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
      const next = { lat: position.coords.latitude, lon: position.coords.longitude };
      markLocationSessionFetched();
      persistCoords(next);
      panTo(next);
      addressLookupKeyRef.current = `${Number(next.lat).toFixed(5)},${Number(next.lon).toFixed(5)}`;
      lookupAddress(next.lat, next.lon);
    };

    const reportFailure = (error) => {
      if (error?.code === 1) {
        if (silent) markLocationSessionFetched();
        if (!silent) {
          setStatus('denied');
          setLocationOffReason('denied');
        }
        return;
      }
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        () => {
          if (silent) markLocationSessionFetched();
          if (!silent) {
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
    if (typeof saved?.lat === 'number' && typeof saved?.lon === 'number') {
      persistCoords({ lat: saved.lat, lon: saved.lon }, { touch: false });
    }
    const hasSavedFix = typeof saved?.lat === 'number' && typeof saved?.lon === 'number';
    const shouldRefreshCurrentLocation = !hasSavedFix || !hasLocationSessionFetched();
    if (shouldRefreshCurrentLocation && !requestedLocationRef.current) {
      requestedLocationRef.current = true;
      requestLocation({ silent: hasSavedFix });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (coords) panTo(coords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  const handlePanDrag = () => {
    if (isDraggingRef.current) return;
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleRegionChangeComplete = (region) => {
    savePersistentMapRegion(region);
    const next = { lat: region.latitude, lon: region.longitude };
    if (isDraggingRef.current) {
      // dragend
      isDraggingRef.current = false;
      setIsDragging(false);
      persistCoords(next);
      lookupAddress(next.lat, next.lon);
      return;
    }
    // idle
    if (areCentersNearlyEqual(centerCoords, next)) return;
    setCenterCoords(next);
    if (status === 'ready') saveLocation(next);
  };

  // pin animation (framer-motion animate on isDragging)
  const drag = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(drag, { toValue: isDragging ? 1 : 0, stiffness: 450, damping: 25, useNativeDriver: true }).start();
  }, [drag, isDragging]);
  const dotPulse = useLoop(2000);

  return (
    <View style={styles.section}>
      <View style={[styles.frame, { borderBottomColor: isDark ? colors.zinc[800] : p.border, backgroundColor: isDark ? '#0f172a' : '#F7F8FB' }]}>
        <View style={styles.mapBox}>
          {!HAS_VALID_GOOGLE_MAPS_KEY && (
            <View style={styles.center}>
              <Text style={[styles.msgTitle, { color: isDark ? p.textPrimary : '#0B1220' }]}>Google Maps key missing</Text>
              <Text style={[styles.msgBody, { color: isDark ? p.textSecondary : '#64748B' }]}>Add `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.</Text>
            </View>
          )}

          {HAS_VALID_GOOGLE_MAPS_KEY && (
            <AppMap
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={initialRegion}
              customMapStyle={isDark ? darkMapStyle : []}
              onMapLoaded={() => {
                markPersistentMapReady();
                setTilesLoaded(true);
              }}
              onPanDrag={handlePanDrag}
              onRegionChangeComplete={handleRegionChangeComplete}
              rotateEnabled={false}
              pitchEnabled={false}
            />
          )}

          {HAS_VALID_GOOGLE_MAPS_KEY && !tilesLoaded && <MapSkeleton isDark={isDark} />}

          {/* The Pinpoint */}
          <View pointerEvents="none" style={styles.pinWrap}>
            <Animated.View
              style={[
                styles.pinShadow,
                {
                  opacity: drag.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.28] }),
                  transform: [{ translateY: drag.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }) }, { scale: drag.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.pin,
                {
                  transform: [
                    { translateY: drag.interpolate({ inputRange: [0, 1], outputRange: [-17, -37] }) },
                    { scale: drag.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                  ],
                },
              ]}
            >
              <View style={styles.pinLabel}>
                <Text style={styles.pinLabelText}>Pickup point</Text>
              </View>
              <View style={styles.pinStem} />
              <View style={styles.pinHead}>
                <Animated.View style={[styles.pinCore, { opacity: dotPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }]} />
              </View>
            </Animated.View>
          </View>

          {/* Floating locator target button (Mobile) */}
          <Pressable
            onPress={() => requestLocation()}
            style={({ pressed }) => [styles.locator, { backgroundColor: p.cardBg, borderColor: p.border }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={status === 'loading' ? colors.yellow[500] : p.textPrimary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <SvgCircle cx="12" cy="12" r="10" />
              <SvgCircle cx="12" cy="12" r="3" />
              <Line x1="12" y1="1" x2="12" y2="3" />
              <Line x1="12" y1="21" x2="12" y2="23" />
              <Line x1="1" y1="12" x2="3" y2="12" />
              <Line x1="21" y1="12" x2="23" y2="12" />
            </Svg>
          </Pressable>

          {!coords && status !== 'loading' && (
            <Pressable
              onPress={() => requestLocation()}
              style={({ pressed }) => [styles.useMyLocation, { backgroundColor: p.cardBg, borderColor: p.border }, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Text style={[styles.useMyLocationText, { color: p.textSecondary }]}>Use my location</Text>
            </Pressable>
          )}
        </View>
      </View>
      <LocationOffDialog
        open={Boolean(locationOffReason)}
        reason={locationOffReason}
        onClose={() => setLocationOffReason(null)}
        onRetry={() => {
          setLocationOffReason(null);
          requestLocation();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  section: { width: '100%' },
  frame: { position: 'relative', zIndex: 10, overflow: 'hidden', borderBottomWidth: 1 },
  mapBox: { position: 'relative', height: 220, width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  msgTitle: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  msgBody: { marginTop: 4, fontSize: 11, fontWeight: '500', textAlign: 'center' },
  skeleton: { zIndex: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  street: { position: 'absolute' },
  pinWrap: { position: 'absolute', left: '50%', top: '50%', zIndex: 20, width: 0, alignItems: 'center' },
  pinShadow: { position: 'absolute', top: 0, height: 3, width: 14, borderRadius: 999, backgroundColor: alpha(colors.slate[900], 0.3) },
  pin: { alignItems: 'center', width: 140 },
  pinLabel: {
    position: 'absolute',
    top: -40,
    backgroundColor: '#FFB300',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha('#ffffff', 0.2),
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  pinLabelText: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#0b1220' },
  pinStem: { width: 1.5, height: 14, backgroundColor: alpha(colors.slate[900], 0.6) },
  pinHead: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.blue[500],
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  pinCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ffffff' },
  locator: { position: 'absolute', right: 16, bottom: 112, zIndex: 20, height: 40, width: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  useMyLocation: { position: 'absolute', bottom: 8, left: 8, zIndex: 20, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  useMyLocationText: { fontSize: 11, fontWeight: '500' },
});

export default LocationMapSection;
