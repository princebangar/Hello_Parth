import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import io from 'socket.io-client';
import { Navigation } from 'lucide-react-native';
import { API_BASE_URL } from '@food/api/config';
import bikeLogo from '@food/assets/bikelogo.png';
import { subscribeOrderTracking } from '@food/realtimeTracking';
import { calculateDistance, decodePolyline } from '@food/utils/liveTrackingPolyline';
import { computeRoute } from '@/lib/google';
import { AppMap, Marker, Polyline, regionFor, toLatLng } from '@/native/ui/AppMap';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors, radius, shadow } from '@/theme';

const debugLog = (...args) => console.log('[DeliveryTrackingMap]', ...args);

// Same POI / transit hiding as the web map options
const MAP_STYLE = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// The web's inline RESTAURANT_PIN_SVG / CUSTOMER_PIN_SVG (image fallbacks)
function PinSvg({ fill }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 24 24">
      <Path
        fill={fill}
        d="M12 2C8.13 2 5 5.13 5 9c0 4.17 4.42 9.92 6.24 12.11.4.48 1.08.48 1.52 0C14.58 18.92 19 13.17 19 9c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5 14.5 7.62 14.5 9 13.38 11.5 12 11.5z"
      />
      <SvgCircle cx="12" cy="9" r="3" fill="#FFFFFF" />
    </Svg>
  );
}

/**
 * Given a full route path (array of {lat,lng}) and rider's current position,
 * returns the index of the closest path point to the rider (spherical distance).
 */
function findClosestPointIndex(path, riderLatLng) {
  if (!path || path.length === 0 || !riderLatLng) return 0;
  let minDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < path.length; i++) {
    const pt = path[i];
    const dist = calculateDistance(pt.lat, pt.lng, riderLatLng.lat, riderLatLng.lng);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }
  return closestIdx;
}

/**
 * Normalise a path point to a plain {lat, lng} object
 */
function normPt(pt) {
  if (!pt) return null;
  if (Array.isArray(pt) && pt.length >= 2) {
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const lat = typeof pt.lat === 'function' ? pt.lat() : Number(pt.lat ?? pt.latitude);
  const lng = typeof pt.lng === 'function' ? pt.lng() : Number(pt.lng ?? pt.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

// Pulsing ring (motion.div animate scale [1,2] opacity [0.5,0], 2s, infinite)
function PulseRing({ color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulse,
        {
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
        },
      ]}
    />
  );
}

// Restaurant / customer pin: round image with a coloured ring and a small pointer, tip on the coordinate.
function PinMarker({ coordinate, image, borderColor, pulseColor, fallbackFill, pulsing }) {
  const [failed, setFailed] = useState(false);
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    if (pulsing) {
      setTracks(true);
      return undefined;
    }
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 1500);
    return () => clearTimeout(id);
  }, [pulsing, image, failed]);
  const showImage = Boolean(image) && !failed;
  return (
    <Marker coordinate={toLatLng(coordinate)} anchor={{ x: 0.5, y: PIN_ANCHOR_Y }} tracksViewChanges={tracks} zIndex={20}>
      <View style={styles.pinBox}>
        {pulsing ? <PulseRing color={pulseColor} /> : null}
        <View style={[styles.pinCircle, { borderColor }]}>
          {showImage ? (
            <AppImage src={image} style={styles.pinImage} contentFit="contain" onError={() => setFailed(true)} />
          ) : (
            <View style={styles.pinImage}>
              <PinSvg fill={fallbackFill} />
            </View>
          )}
        </View>
        <View style={[styles.pinPointer, { borderTopColor: borderColor }]} />
      </View>
    </Marker>
  );
}

const DeliveryTrackingMap = ({
  orderId,
  orderTrackingIds = [],
  restaurantCoords,
  customerCoords,
  order = null,
  onEtaUpdate = null,
}) => {
  const isTakeaway = order?.orderType === 'takeaway';
  const [map, setMap] = useState(null);
  const mapRef = useRef(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [currentEta, setCurrentEta] = useState(null);
  const [fullRoutePath, setFullRoutePath] = useState(null);
  const [cloudPolyline, setCloudPolyline] = useState(null);

  const [smoothLocation, setSmoothLocation] = useState(null);
  const socketRef = useRef(null);
  const interpStateRef = useRef({ lastPos: null, nextPos: null, startTime: 0, durationMs: 1500 });
  const lastUpdateAtRef = useRef(0);
  const lastSmoothSetRef = useRef(0);
  const baselineRequestedRef = useRef(false);
  const onEtaUpdateRef = useRef(onEtaUpdate);
  onEtaUpdateRef.current = onEtaUpdate;

  const trackingIds = useMemo(() => {
    const ids = [orderId, ...(Array.isArray(orderTrackingIds) ? orderTrackingIds : [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    return [...new Set(ids)];
  }, [orderId, orderTrackingIds]);

  const backendUrl = useMemo(() => {
    return (API_BASE_URL || '').replace(/\/api\/v1\/?$/i, '').replace(/\/api\/?$/i, '');
  }, []);

  // 1. Initial State from Order Payload
  useEffect(() => {
    const loc = order?.deliveryState?.currentLocation;
    if (loc && !riderLocation) {
      const lat = typeof loc.lat === 'number' ? loc.lat : Array.isArray(loc.coordinates) ? Number(loc.coordinates[1]) : null;
      const lng = typeof loc.lng === 'number' ? loc.lng : Array.isArray(loc.coordinates) ? Number(loc.coordinates[0]) : null;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setRiderLocation({ lat, lng, heading: loc.bearing || loc.heading || 0 });
      }
    }
  }, [order, riderLocation]);

  // 2. Core Data Sync (Socket + Firebase)
  useEffect(() => {
    if (!trackingIds.length) return undefined;

    // A. FIREBASE FALLBACK
    const unsubs = trackingIds.map((id) =>
      subscribeOrderTracking(id, (data) => {
        const lat = Number(data?.lat ?? data?.boy_lat);
        const lng = Number(data?.lng ?? data?.boy_lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setRiderLocation((prev) => ({
            lat,
            lng,
            heading: Number(data?.heading ?? data?.bearing ?? prev?.heading ?? 0),
          }));
        }
        if (data?.polyline) {
          debugLog('Received Cloud Polyline for live path');
          setCloudPolyline(data.polyline);
        }
        if (data?.eta) {
          debugLog('Received real-time ETA:', data.eta);
          setCurrentEta(data.eta);
          if (onEtaUpdateRef.current) onEtaUpdateRef.current(data.eta);
        }
      }),
    );

    // B. SOCKET.IO REALTIME
    const token = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken') || '';
    socketRef.current = io(backendUrl, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    socketRef.current.on('connect', () => {
      trackingIds.forEach((id) => socketRef.current?.emit('join-tracking', id));
    });

    socketRef.current.on('location-update', (data) => {
      const dataOrderId = data?.orderId || data?.order_id || data?.trackingId || data?.order?.id || data?.order?._id;
      const matchedId = dataOrderId
        ? trackingIds.find((id) => String(id) === String(dataOrderId))
        : trackingIds.length === 1
          ? trackingIds[0]
          : null;
      const lat = Number(data?.lat ?? data?.boy_lat ?? data?.location?.lat ?? data?.location?.coordinates?.[1]);
      const lng = Number(data?.lng ?? data?.boy_lng ?? data?.location?.lng ?? data?.location?.coordinates?.[0]);
      if (data && matchedId && Number.isFinite(lat) && Number.isFinite(lng)) {
        const nextPos = {
          lat,
          lng,
          heading: Number(data?.heading ?? data?.bearing ?? data?.location?.heading ?? 0),
        };
        const now = Date.now();
        const delta = Math.max(300, Math.min(now - (lastUpdateAtRef.current || now), 4000));
        lastUpdateAtRef.current = now;

        interpStateRef.current = {
          lastPos: interpStateRef.current.nextPos || nextPos,
          nextPos,
          startTime: now,
          durationMs: delta,
        };

        setRiderLocation(nextPos);
      }
    });

    return () => {
      unsubs.forEach((u) => u?.());
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [trackingIds, backendUrl]);

  // 3. Smooth Animation Loop (glide between socket fixes)
  useEffect(() => {
    let frame;
    const update = () => {
      const { lastPos, nextPos, startTime, durationMs } = interpStateRef.current;
      if (lastPos && nextPos) {
        const duration = Math.max(600, durationMs || 1500);
        const elapsed = Date.now() - startTime;
        const raw = Math.min(elapsed / duration, 1);
        const progress = raw * raw * (3 - 2 * raw); // easeInOut

        const lat = lastPos.lat + (nextPos.lat - lastPos.lat) * progress;
        const lng = lastPos.lng + (nextPos.lng - lastPos.lng) * progress;

        let lastHead = lastPos.heading || 0;
        let nextHead = nextPos.heading || 0;
        if (Math.abs(nextHead - lastHead) > 180) {
          if (nextHead > lastHead) lastHead += 360;
          else nextHead += 360;
        }
        const heading = lastHead + (nextHead - lastHead) * progress;

        const now = Date.now();
        if ((now - lastSmoothSetRef.current >= 33 && raw < 1) || (raw >= 1 && lastSmoothSetRef.current < startTime + duration)) {
          lastSmoothSetRef.current = now;
          setSmoothLocation({ lat, lng, heading: heading % 360 });
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  // 4. When cloudPolyline updates: decode & store as fullRoutePath
  useEffect(() => {
    if (!cloudPolyline) return;
    try {
      const decoded = decodePolyline(typeof cloudPolyline === 'string' ? cloudPolyline : cloudPolyline.points || '');
      const plain = decoded.map(normPt).filter(Boolean);
      if (plain.length > 1) {
        setFullRoutePath(plain);
        debugLog(`Cloud polyline decoded: ${plain.length} points`);
      }
    } catch (e) {
      debugLog('Cloud polyline decode error:', e);
    }
  }, [cloudPolyline]);

  const displayRiderLocation = smoothLocation || riderLocation;

  const tripStatus = order?.status || order?.orderStatus || 'pending';
  const isOrderPickedUp = ['picked_up', 'out_for_delivery', 'delivered'].includes(String(tripStatus).toLowerCase());

  const normRestCoords = useMemo(() => normPt(restaurantCoords), [restaurantCoords]);
  const normCustCoords = useMemo(() => normPt(customerCoords), [customerCoords]);

  // 5. Smart camera: fit bounds
  const lastCameraUpdateRef = useRef({ time: 0, status: null });
  useEffect(() => {
    if (!map || !normRestCoords || !normCustCoords) return;

    const now = Date.now();
    const statusChanged = lastCameraUpdateRef.current.status !== isOrderPickedUp;
    const timeSinceLastUpdate = now - lastCameraUpdateRef.current.time;
    if (!statusChanged && timeSinceLastUpdate < 15000) return;

    lastCameraUpdateRef.current = { time: now, status: isOrderPickedUp };

    const pts = [normRestCoords, normCustCoords];
    if (riderLocation) pts.push(riderLocation);
    mapRef.current?.fitToCoordinates(pts.map(toLatLng), {
      edgePadding: { top: 100, bottom: 120, left: 60, right: 60 },
      animated: true,
    });
    debugLog(`[Camera] Focusing on ${isOrderPickedUp ? 'Delivery' : 'Pickup'} leg`);
  }, [map, riderLocation, normRestCoords, normCustCoords, isOrderPickedUp]);

  // 6. Baseline route (Routes API), only once and only when the server did not already send a polyline.
  useEffect(() => {
    if (fullRoutePath || cloudPolyline || baselineRequestedRef.current) return undefined;
    if (!normRestCoords || !normCustCoords) return undefined;
    baselineRequestedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const route = await computeRoute(
          { lat: normRestCoords.lat, lng: normRestCoords.lng },
          { lat: normCustCoords.lat, lng: normCustCoords.lng },
          { travelMode: 'DRIVE' },
        );
        if (cancelled) return;
        const plain = (route?.coordinates || []).map(normPt).filter(Boolean);
        if (plain.length > 1) {
          setFullRoutePath(plain);
          debugLog(`Baseline route stored: ${plain.length} points`);
        }
        const millis = Number(route?.durationSeconds) * 1000;
        if (Number.isFinite(millis) && millis > 0 && !currentEta) {
          const mins = Math.max(1, Math.round(millis / 60000));
          const durationText = mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} mins` : `${mins} mins`;
          setCurrentEta(durationText);
          if (onEtaUpdateRef.current) onEtaUpdateRef.current(durationText);
        }
      } catch (error) {
        baselineRequestedRef.current = false;
        console.error('[DeliveryTrackingMap] Baseline route (Routes API) failed:', error?.message || error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullRoutePath, cloudPolyline, normRestCoords?.lat, normRestCoords?.lng, normCustCoords?.lat, normCustCoords?.lng]);

  /**
   * SPLIT POLYLINE LOGIC:
   *   - traveledPath: restaurant -> nearest point to rider (dashed grey)
   *   - remainingPath: nearest point -> destination (solid colored)
   */
  const { traveledPath, remainingPath } = useMemo(() => {
    if (!fullRoutePath || fullRoutePath.length < 2) {
      if (normRestCoords && normCustCoords) {
        return { traveledPath: [], remainingPath: [normRestCoords, normCustCoords] };
      }
      return { traveledPath: [], remainingPath: [] };
    }
    if (isTakeaway || !displayRiderLocation) {
      return { traveledPath: [], remainingPath: fullRoutePath };
    }

    const splitIdx = findClosestPointIndex(fullRoutePath, displayRiderLocation);
    const traveled = [...fullRoutePath.slice(0, splitIdx + 1), { lat: displayRiderLocation.lat, lng: displayRiderLocation.lng }];
    const remaining = [{ lat: displayRiderLocation.lat, lng: displayRiderLocation.lng }, ...fullRoutePath.slice(splitIdx + 1)];
    return { traveledPath: traveled, remainingPath: remaining };
  }, [fullRoutePath, displayRiderLocation, normRestCoords, normCustCoords, isTakeaway]);

  const remainingColor = isOrderPickedUp ? '#3b82f6' : '#22c55e';

  const center = useMemo(() => {
    if (isOrderPickedUp) return normCustCoords || { lat: 0, lng: 0 };
    return normRestCoords || { lat: 0, lng: 0 };
  }, [isOrderPickedUp, normRestCoords, normCustCoords]);

  const initialRegion = useMemo(() => {
    return regionFor(center, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rider glide: the web eases the marker transform (0.2s linear)
  const riderCoord = displayRiderLocation ? toLatLng(displayRiderLocation) : null;
  const hasRider = Boolean(riderCoord);
  // custom marker bitmaps: keep re-rendering until the rider image has loaded
  const [riderTracks, setRiderTracks] = useState(true);
  useEffect(() => {
    if (!hasRider) return undefined;
    setRiderTracks(true);
    const id = setTimeout(() => setRiderTracks(false), 2000);
    return () => clearTimeout(id);
  }, [hasRider]);

  // Arrival badge enter animation (x: -20 -> 0, opacity 0 -> 1)
  const showBadge = Boolean(riderLocation && currentEta && !isTakeaway);
  const badgeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(badgeAnim, { toValue: showBadge ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  }, [showBadge, badgeAnim]);

  const restaurantImage = order?.restaurantLogo || order?.restaurantId?.logo || order?.restaurantId?.profileImage || null;
  const customerImage = order?.customerImage || order?.userId?.profileImage || order?.userId?.avatar || null;

  return (
    <View style={styles.wrap}>
      <AppMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onMapReady={() => setMap(mapRef.current)}
        customMapStyle={MAP_STYLE}
        zoomControlEnabled
        rotateEnabled={false}
      >
        {/* TRAVELED PATH: dashed grey (already covered by driver) */}
        {traveledPath.length > 1 && (
          <Polyline
            coordinates={traveledPath.map(toLatLng)}
            strokeColor={alpha('#9ca3af', 0.85)}
            strokeWidth={5}
            lineDashPattern={[12, 10]}
            zIndex={6}
          />
        )}

        {/* REMAINING PATH: solid colored (driver's upcoming route) */}
        {remainingPath.length > 1 && (
          <Polyline coordinates={remainingPath.map(toLatLng)} strokeColor={alpha(remainingColor, 0.95)} strokeWidth={6} zIndex={8} />
        )}

        {/* RESTAURANT PIN */}
        {normRestCoords && (
          <PinMarker
            coordinate={normRestCoords}
            image={restaurantImage}
            borderColor="#DC2626"
            pulseColor={alpha('#DC2626', 0.5)}
            fallbackFill="#FF6B35"
            pulsing={!isOrderPickedUp}
          />
        )}

        {/* CUSTOMER PIN */}
        {normCustCoords && (
          <PinMarker
            coordinate={normCustCoords}
            image={customerImage}
            borderColor={colors.green[500]}
            pulseColor={alpha(colors.green[500], 0.5)}
            fallbackFill="#10B981"
            pulsing={isOrderPickedUp}
          />
        )}

        {/* RIDER MARKER */}
        {riderCoord && !isTakeaway && (
          <Marker
            coordinate={riderCoord}
            anchor={{ x: 0.5, y: 0.5 }}
            flat
            rotation={displayRiderLocation.heading || 0}
            tracksViewChanges={riderTracks}
            zIndex={30}
          >
            <View style={styles.rider}>
              <AppImage src="/assets/images/MapRider.png" fallback={bikeLogo} style={styles.riderImg} contentFit="contain" transition={0} />
            </View>
          </Marker>
        )}
      </AppMap>

      {/* LIVE ARRIVAL BADGE */}
      {showBadge ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.badgePos,
            {
              opacity: badgeAnim,
              transform: [{ translateX: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            },
          ]}
        >
          <View style={styles.badge}>
            <LinearGradient
              pointerEvents="none"
              colors={[alpha('#ffffff', 0.2), 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View>
              <Text style={styles.badgeLabel}>ARRIVAL</Text>
              <View style={styles.badgeRow}>
                <Text style={styles.badgeEta}>{currentEta}</Text>
                <View style={styles.badgeIcons}>
                  <View style={styles.badgeDot} />
                  <Navigation size={12} color={colors.white} style={{ transform: [{ rotate: '45deg' }] }} />
                </View>
              </View>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
};

const PIN_BOX = 128; // room for the pulse ring (64px scaled x2)
const PIN_ANCHOR_Y = (PIN_BOX / 2 + 26) / PIN_BOX; // pointer tip on the coordinate

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  pinBox: { width: PIN_BOX, height: PIN_BOX, alignItems: 'center', justifyContent: 'center' },
  pulse: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    top: PIN_BOX / 2 - 32,
    left: PIN_BOX / 2 - 32,
  },
  pinCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    padding: 4,
    backgroundColor: colors.white,
    borderWidth: 2,
    overflow: 'hidden',
    marginTop: 8,
    ...shadow.xl,
  },
  pinImage: { width: '100%', height: '100%', borderRadius: 999, backgroundColor: colors.gray[50] },
  pinPointer: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  rider: { width: 64, height: 64 },
  riderImg: { width: 64, height: 64 },
  badgePos: { position: 'absolute', top: 16, left: 16, zIndex: 150 },
  badge: {
    backgroundColor: alpha('#DC2626', 0.95),
    borderRadius: radius['2xl'],
    padding: 12,
    borderWidth: 1,
    borderColor: alpha(colors.orange[400], 0.5),
    minWidth: 90,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: 'rgb(249,115,22)',
    shadowOpacity: 0.4,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  badgeLabel: { fontSize: 9, color: alpha('#ffffff', 0.8), fontWeight: '900', letterSpacing: 1.8, marginBottom: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badgeEta: { fontSize: 20, lineHeight: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.5 },
  badgeIcons: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
});

export default DeliveryTrackingMap;
