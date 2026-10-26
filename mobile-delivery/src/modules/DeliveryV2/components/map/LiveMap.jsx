// Web: components/map/LiveMap.jsx — the Feed's Google map: the rider (MapRider.png turned by the GPS heading), the
// remaining route to the restaurant (pickup phase) or the customer (drop phase) from the Routes API with a straight-line
// fallback and the same throttle (5 s / 20 s / 60 s by distance), the destination pin, the zone outlines
// (zoneAPI.getPublicZones), and one re-frame per order / trip phase. Same props.
// Native: react-native-maps (AppMap, Google provider) with the web's map style; the route comes from
// @/lib/google computeRoute (Routes v2, the same API the web called through importLibrary('routes')); distances use the
// haversine helper instead of google.maps.geometry. Markers are native views: the cutlery / rider images (same
// /assets/images URLs as the web, loaded from the site) and the customer pin drawn from CUSTOMER_PIN_SVG with
// react-native-svg. onMapLoad gets a small object with the web map methods DeliveryHomeV2 uses (panTo, setZoom,
// getZoom, setOptions, fitBounds). The map is built only after the brand splash (useSplashDone): before that the
// Feed shows MapLoadingOverlay (native), which stays until the first tiles are drawn. Not reproduced: the web map's heading / 45° tilt props (ignored by the web's raster
// map too) and the 0.5 s CSS glide of the rider marker between GPS points.
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AppMap, Marker, Polygon, Polyline, regionFor } from '@/native/ui/AppMap';
import { AppImage } from '@/native/ui';
import { useSplashDone } from '@/native/splashState';
import { computeRoute } from '@/lib/google';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { zoneAPI } from '@food/api';
import { CUSTOMER_PIN_SVG } from '@/modules/DeliveryV2/components/map/map.icons';
import { getHaversineDistance } from '@/modules/DeliveryV2/utils/geo';
import MapLoadingOverlay from '@/modules/DeliveryV2/components/map/MapLoadingOverlay';

const mapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
];
const MARKER_OVERLAP_HIDE_METERS = 40;
const DESTINATION_MARKER_Z_INDEX = 20;
// web /assets/images/*.{webp,png}, bundled (no network wait before the markers show)
const RESTAURANT_MARKER_URL = require('../../../../assets/public/images/cutlery_icon.webp');
const RIDER_MARKER_URL = require('../../../../assets/public/images/MapRider.png');

const toCoord = (p) => ({ latitude: p.lat, longitude: p.lng });

function distanceBetweenMeters(a, b) {
  if (!a || !b) return Infinity;
  const d = getHaversineDistance(a.lat, a.lng, b.lat, b.lng);
  return Number.isFinite(d) ? d : Infinity;
}

function toLatLngLiteral(point) {
  if (!point) return null;
  const lat = point.lat ?? point.latitude;
  const lng = point.lng ?? point.longitude;
  return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;
}

/** Normalize the Routes API result / fallback into the shape LiveMap already uses. */
function buildDirectionsResult(pathPoints, encoded = null) {
  const overview_path = (pathPoints || []).map(toLatLngLiteral).filter(Boolean);
  if (!overview_path.length) return null;
  return { routes: [{ overview_path, overview_polyline: encoded || null }] };
}

async function computeDrivingRoute(origin, destination) {
  const route = await computeRoute(
    { lat: origin.lat, lng: origin.lng },
    { lat: destination.lat, lng: destination.lng },
    { travelMode: 'DRIVE' },
  );
  const path = route?.coordinates;
  if (!path?.length) {
    throw new Error('No route path returned');
  }
  return buildDirectionsResult(path, route.encodedPolyline);
}

const SINGLE_POINT_ZOOM = 15;

/** A marker drawn from an image URL: tracks view changes until the image has loaded (Android snapshots the view). */
function ImageMarker({ coordinate, size, anchor, zIndex, rotation, flat, uri }) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const settle = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTracksViewChanges(false), 300);
  };
  return (
    <Marker
      coordinate={coordinate}
      anchor={anchor}
      zIndex={zIndex}
      rotation={rotation}
      flat={flat}
      tracksViewChanges={tracksViewChanges}
      tappable={false}
    >
      <View style={{ width: size, height: size }}>
        <AppImage src={uri} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} onLoad={settle} onError={settle} />
      </View>
    </Marker>
  );
}

function CustomerPinMarker({ coordinate }) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracksViewChanges(false), 500);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      zIndex={DESTINATION_MARKER_Z_INDEX}
      tracksViewChanges={tracksViewChanges}
      tappable={false}
    >
      <SvgXml xml={CUSTOMER_PIN_SVG} width={44} height={44} />
    </Marker>
  );
}

export const LiveMap = ({ onMapClick, onMapLoad, onPathReceived, onPolylineReceived, zoom = 12 }) => {
  const riderLocation = useDeliveryStore((state) => state.riderLocation);
  const activeOrder = useDeliveryStore((state) => state.getFocusedOrder());
  const tripStatus = useDeliveryStore((state) => state.getFocusedTripStatus());
  const splashDone = useSplashDone();
  // native: the new map view is black until its first tiles are drawn -> MapLoadingOverlay until onMapLoaded
  // (8 s at most, e.g. no network: the map's own grey grid then shows like the web)
  const [tilesLoaded, setTilesLoaded] = useState(false);
  useEffect(() => {
    if (!splashDone || tilesLoaded) return undefined;
    const t = setTimeout(() => setTilesLoaded(true), 8000);
    return () => clearTimeout(t);
  }, [splashDone, tilesLoaded]);

  const [directions, setDirections] = useState(null);
  const [map, setMapInternal] = useState(null);
  const [zones, setZones] = useState([]);
  const [lastDirectionsAt, setLastDirectionsAt] = useState(0);
  const routeFetchInFlightRef = useRef(false);
  const mapViewRef = useRef(null);
  const zoomRef = useRef(zoom);

  // the web map methods DeliveryHomeV2 calls on onMapLoad's instance
  const mapApi = useMemo(() => ({
    panTo: (p) => {
      const c = toLatLngLiteral(p);
      if (c) mapViewRef.current?.animateCamera?.({ center: toCoord(c) }, { duration: 400 });
    },
    setZoom: (z) => {
      zoomRef.current = z;
      mapViewRef.current?.animateCamera?.({ zoom: z }, { duration: 300 });
    },
    getZoom: () => zoomRef.current,
    // web: gestureHandling 'greedy' (one-finger pan on a touch screen) — the native map always pans with one finger
    setOptions: () => {},
    fitBounds: (points, padding) => {
      const coords = (points || []).map(toLatLngLiteral).filter(Boolean).map(toCoord);
      if (!coords.length) return;
      // one point (only the rider, no order): fitToCoordinates zoomed in to the maximum — a bare white map with the
      // bike (Prince, 26 Oct). Centre on it at street level instead.
      const same = coords.every((c) => Math.abs(c.latitude - coords[0].latitude) < 1e-5 && Math.abs(c.longitude - coords[0].longitude) < 1e-5);
      if (same) {
        zoomRef.current = SINGLE_POINT_ZOOM;
        mapViewRef.current?.animateCamera?.({ center: coords[0], zoom: SINGLE_POINT_ZOOM }, { duration: 400 });
        return;
      }
      mapViewRef.current?.fitToCoordinates?.(coords, { edgePadding: padding, animated: true });
    },
  }), []);

  const handleMapLoad = () => {
    setMapInternal(mapApi);
    if (onMapLoad) onMapLoad(mapApi);
  };

  useEffect(() => {
    setLastDirectionsAt(0);
    setDirections(null);
  }, [tripStatus, activeOrder?._id]);

  const parsePoint = useCallback((raw) => {
    if (!raw) return null;
    const lat = parseFloat(raw.lat ?? raw.latitude);
    const lng = parseFloat(raw.lng ?? raw.longitude);
    return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;
  }, []);

  const restaurantPoint = useMemo(() => parsePoint(activeOrder?.restaurantLocation), [activeOrder?.restaurantLocation, parsePoint]);
  const customerPoint = useMemo(() => parsePoint(activeOrder?.customerLocation), [activeOrder?.customerLocation, parsePoint]);

  const targetLocation = useMemo(() => {
    if (!activeOrder) return null;
    let rawLoc = null;
    if (tripStatus === 'PICKING_UP' || tripStatus === 'REACHED_PICKUP') {
      rawLoc = activeOrder.restaurantLocation;
    } else if (tripStatus === 'PICKED_UP' || tripStatus === 'REACHED_DROP') {
      rawLoc = activeOrder.customerLocation;
    }
    if (!rawLoc) return null;
    return parsePoint(rawLoc);
  }, [activeOrder, tripStatus, parsePoint]);

  const parsedRiderLocation = useMemo(() => {
    if (!riderLocation) return null;
    const lat = parseFloat(riderLocation.lat || riderLocation.latitude);
    const lng = parseFloat(riderLocation.lng || riderLocation.longitude);
    return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng, heading: parseFloat(riderLocation.heading || 0) } : null;
  }, [riderLocation]);

  useEffect(() => {
    if (!map || typeof zoom !== 'number') return;
    const currentZoom = map.getZoom();
    if (currentZoom !== zoom) map.setZoom(zoom);
  }, [zoom, map]);

  const routeThrottleMs = useMemo(() => {
    if (!parsedRiderLocation || !targetLocation) return 20000;
    const dist = distanceBetweenMeters(parsedRiderLocation, targetLocation);
    if (dist > 2000) return 60000;
    if (dist > 500) return 20000;
    return 5000;
  }, [parsedRiderLocation, targetLocation]);

  // Routes API (new) — legacy Directions is off on the Google project
  useEffect(() => {
    if (!splashDone) return undefined;
    if (!parsedRiderLocation || !targetLocation) return undefined;

    const now = Date.now();
    if (directions && now - lastDirectionsAt < routeThrottleMs) return undefined;
    if (routeFetchInFlightRef.current) return undefined;

    let cancelled = false;
    routeFetchInFlightRef.current = true;

    (async () => {
      try {
        const result = await computeDrivingRoute(parsedRiderLocation, targetLocation);
        if (cancelled || !result) return;
        setDirections(result);
        setLastDirectionsAt(Date.now());
        const encoded = result.routes?.[0]?.overview_polyline;
        if (encoded && onPolylineReceived) onPolylineReceived(encoded);
      } catch (err) {
        console.warn('[LiveMap] Routes API failed, using straight-line fallback:', err?.message || err);
        if (cancelled) return;
        const fallback = buildDirectionsResult([
          { lat: parsedRiderLocation.lat, lng: parsedRiderLocation.lng },
          { lat: targetLocation.lat, lng: targetLocation.lng },
        ]);
        if (fallback) {
          setDirections(fallback);
          setLastDirectionsAt(Date.now());
        }
      } finally {
        routeFetchInFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    splashDone,
    parsedRiderLocation?.lat,
    parsedRiderLocation?.lng,
    targetLocation?.lat,
    targetLocation?.lng,
    routeThrottleMs,
    lastDirectionsAt,
    directions,
    onPolylineReceived,
  ]);

  useEffect(() => {
    if (directions && onPathReceived) {
      const path = directions.routes[0]?.overview_path;
      if (path) {
        const simplePath = path.map((p) => ({
          lat: p.lat || p.latitude,
          lng: p.lng || p.longitude,
        }));
        onPathReceived(simplePath);
      }
    }
  }, [directions, onPathReceived]);

  useEffect(() => {
    (async () => {
      try {
        const response = await zoneAPI.getPublicZones();
        if (response?.data?.success && response.data.data?.zones) {
          const formattedZones = response.data.data.zones.map((zone) => ({
            ...zone,
            paths: (zone.coordinates || []).map((coord) => ({ lat: coord.latitude, lng: coord.longitude })),
          })).filter((z) => z.paths.length >= 3);
          setZones(formattedZones);
        }
      } catch (err) { /* zones are decoration only */ }
    })();
  }, []);

  const lastCenteredPosRef = useRef(null);
  const framedTripKeyRef = useRef(null);

  // Re-frame map only when the focused order or trip phase changes — never on poll/GPS ticks
  useEffect(() => {
    framedTripKeyRef.current = null;
  }, [activeOrder?._id, tripStatus]);

  useEffect(() => {
    if (!map) return;

    const hasAnchors = restaurantPoint || customerPoint;
    if (!hasAnchors && !parsedRiderLocation) return;

    const frameKey = `${activeOrder?._id || 'none'}:${tripStatus || 'idle'}`;
    if (framedTripKeyRef.current === frameKey) return;

    const bounds = [];
    if (restaurantPoint) bounds.push(restaurantPoint);
    if (customerPoint) bounds.push(customerPoint);
    if (parsedRiderLocation) bounds.push(parsedRiderLocation);

    map.fitBounds(bounds, { top: 70, right: 70, bottom: 120, left: 70 });
    framedTripKeyRef.current = frameKey;

    if (parsedRiderLocation) {
      lastCenteredPosRef.current = parsedRiderLocation;
    }
  }, [map, parsedRiderLocation, restaurantPoint, customerPoint, activeOrder?._id, tripStatus]);

  const remainingPath = useMemo(() => {
    if (!directions || !parsedRiderLocation) return [];

    const fullPath = directions.routes[0].overview_path;
    if (!fullPath || fullPath.length === 0) return [];

    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < fullPath.length; i++) {
      const distance = distanceBetweenMeters(parsedRiderLocation, fullPath[i]);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    let startIndex = closestIndex;
    if (closestIndex < fullPath.length - 1) {
      const distToCurrent = distanceBetweenMeters(parsedRiderLocation, fullPath[closestIndex]);
      const distToNext = distanceBetweenMeters(parsedRiderLocation, fullPath[closestIndex + 1]);
      const segmentLen = distanceBetweenMeters(fullPath[closestIndex], fullPath[closestIndex + 1]);

      if (distToNext < segmentLen && distToNext < distToCurrent) {
        startIndex = closestIndex + 1;
      }
    }

    const riderPoint = { lat: parsedRiderLocation.lat, lng: parsedRiderLocation.lng };
    return [riderPoint, ...fullPath.slice(startIndex)];
  }, [directions, parsedRiderLocation]);

  const showRestaurantMarker = useMemo(() => {
    if (!restaurantPoint) return false;
    // Pickup phase only — don't clutter with restaurant pin after pickup
    if (tripStatus !== 'PICKING_UP' && tripStatus !== 'REACHED_PICKUP') return false;
    if (!parsedRiderLocation) return true;
    return distanceBetweenMeters(parsedRiderLocation, restaurantPoint) > MARKER_OVERLAP_HIDE_METERS;
  }, [restaurantPoint, parsedRiderLocation, tripStatus]);

  const showCustomerMarker = useMemo(() => {
    if (!customerPoint) return false;
    // Drop phase only — green pin is customer destination, not shown while going to restaurant
    if (tripStatus !== 'PICKED_UP' && tripStatus !== 'REACHED_DROP') return false;
    if (!parsedRiderLocation) return true;
    return distanceBetweenMeters(parsedRiderLocation, customerPoint) > MARKER_OVERLAP_HIDE_METERS;
  }, [customerPoint, parsedRiderLocation, tripStatus]);

  const defaultCenter = useMemo(() => ({ lat: 22.7196, lng: 75.8577 }), []);
  // Keep the initial region stable so GPS / poll updates never move the camera and fight manual pan/zoom
  const seedCenterRef = useRef(null);
  if (!seedCenterRef.current) {
    seedCenterRef.current = parsedRiderLocation || targetLocation || defaultCenter;
  }
  const initialRegion = useMemo(() => regionFor(seedCenterRef.current, zoom), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!splashDone) {
    return (
      <View style={styles.wrap}>
        <MapLoadingOverlay loaded={false} />
      </View>
    );
  }

  return (
    <View collapsable={false} style={styles.wrap}>
      <AppMap
        ref={mapViewRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={mapStyles}
        rotateEnabled
        pitchEnabled
        moveOnMarkerPress={false}
        onMapReady={handleMapLoad}
        onMapLoaded={() => setTilesLoaded(true)}
        onRegionChangeComplete={(region) => {
          // keeps getZoom() in step with pinch zoom (web: map.getZoom())
          if (region?.longitudeDelta) {
            zoomRef.current = Math.round(Math.log2(360 / region.longitudeDelta) * 100) / 100;
          }
        }}
        onPress={(e) => {
          const c = e?.nativeEvent?.coordinate;
          if (c) onMapClick?.(c.latitude, c.longitude);
        }}
      >
        {/* Single active route line (no separate traveled + remaining double polyline) */}
        {remainingPath.length > 0 ? (
          <Polyline
            coordinates={remainingPath.map(toCoord)}
            strokeColor="rgba(59,130,246,0.9)"
            strokeWidth={8}
            zIndex={12}
          />
        ) : null}

        {showRestaurantMarker ? (
          <ImageMarker
            coordinate={toCoord(restaurantPoint)}
            size={48}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={DESTINATION_MARKER_Z_INDEX}
            uri={RESTAURANT_MARKER_URL}
          />
        ) : null}

        {showCustomerMarker ? <CustomerPinMarker coordinate={toCoord(customerPoint)} /> : null}

        {parsedRiderLocation ? (
          // Bottom-center anchor: bike sits on the GPS point; destination pin can sit above it
          <ImageMarker
            coordinate={toCoord(parsedRiderLocation)}
            size={72}
            anchor={{ x: 0.5, y: 0.88 }}
            zIndex={999}
            rotation={parsedRiderLocation.heading || 0}
            flat
            uri={RIDER_MARKER_URL}
          />
        ) : null}

        {zones.map((zone) => (
          <Polygon
            key={zone._id}
            coordinates={zone.paths.map(toCoord)}
            fillColor="rgba(34,197,94,0.03)"
            strokeColor="rgba(34,197,94,0.1)"
            strokeWidth={1}
            zIndex={1}
            tappable={false}
          />
        ))}
      </AppMap>
      <MapLoadingOverlay loaded={tilesLoaded} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, zIndex: 0, overflow: 'hidden' },
});

export default LiveMap;
