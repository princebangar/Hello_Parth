import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import Svg, { Path } from 'react-native-svg';
import { ArrowLeft, Banknote, CreditCard, ChevronDown, Clock3, LoaderCircle, Eye, TicketPercent, CheckCircle2 } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { AppImage, Screen, Sheet, Text, TextInput } from '@/native/ui';
import { AppMap, Marker, Polyline, regionFor, toLatLng as toMapLatLng } from '@/native/ui/AppMap';
import { alpha, colors, makeStyles, sp, useTheme } from '@/theme';
import api from '../../../../shared/api/axiosInstance';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../../admin/utils/googleMaps';
import { computeDrivingRoute, sumComputedRouteLegs } from '../../../../shared/utils/googleRoutes';
import { userService } from '../../services/userService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import BikeIcon from '../../../../assets/icons/bike.png';
import AutoIcon from '../../../../assets/icons/auto.png';
import CarIcon from '../../../../assets/icons/car.png';
import PremiumIcon from '../../../../assets/icons/Premium.png';
import LuxuryIcon from '../../../../assets/icons/Luxury.png';
import SuvIcon from '../../../../assets/icons/SUV.png';
import TruckIcon from '../../../../assets/icons/truck.png';
import LcvIcon from '../../../../assets/icons/LCV.png';
import McvIcon from '../../../../assets/icons/mcv.png';
import HcvIcon from '../../../../assets/icons/hcv.png';
import { PendingCancellationDueNotice } from '../../components/CancellationFeeNotice';
import { getActiveSurgePercent } from '../../utils/surge';
import EhcvIcon from '../../../../assets/icons/ehcv.png';
import ScootyIcon from '../../../../assets/icons/scooty.png';
import HatchbackIcon from '../../../../assets/icons/Hatchback.png';
import BusIcon from '../../../../assets/icons/bus.png';
import MiniBusIcon from '../../../../assets/icons/mini_bus.png';

const toLatLng = (coords, fallback = { lat: 22.7196, lng: 75.8577 }) => {
  const [lng, lat] = coords || [];

  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return { lat: Number(lat), lng: Number(lng) };
  }

  return fallback;
};

const getDriverPosition = (driver) => toLatLng(driver?.location?.coordinates, null);

// A custom-view marker is drawn to a bitmap on Android: keep redrawing it for a moment (images load), then freeze it.
const useTrackViewChanges = (deps) => {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    setTrack(true);
    const timer = setTimeout(() => setTrack(false), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return track;
};

const CircleLocationMarker = ({ position, title, color, strokeColor = '#ffffff', size = 14 }) => {
  const tracks = useTrackViewChanges([color, strokeColor, size]);
  return (
    <Marker coordinate={toMapLatLng(position)} anchor={{ x: 0.5, y: 0.5 }} title={title} tracksViewChanges={tracks}>
      <View style={styles.circleMarkerPad} pointerEvents="none">
        <View
          style={[
            styles.circleMarker,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderColor: strokeColor },
          ]}
        />
      </View>
    </Marker>
  );
};

const getMarkerDimensionsForZoom = (zoom) => {
  const normalizedZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 13;

  if (normalizedZoom <= 10) {
    return { shell: 76, pulse: 52, icon: 42 };
  }

  if (normalizedZoom <= 11) {
    return { shell: 70, pulse: 48, icon: 38 };
  }

  if (normalizedZoom <= 12) {
    return { shell: 64, pulse: 44, icon: 35 };
  }

  if (normalizedZoom <= 13) {
    return { shell: 58, pulse: 40, icon: 32 };
  }

  return { shell: 54, pulse: 36, icon: 30 };
};

const normalizeHeading = (value) => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return ((numeric % 360) + 360) % 360;
};

const calculateHeadingBetween = (from, to) => {
  if (!from || !to) {
    return 0;
  }

  const angle = Math.atan2(Number(to.lat || 0) - Number(from.lat || 0), Number(to.lng || 0) - Number(from.lng || 0));
  return normalizeHeading((angle * 180) / Math.PI + 90);
};

// The vehicle icon turns to the driver's heading (marker rotation) and has a soft ring while the map is still.
const AnimatedVehicleMarker = React.memo(({ driver, iconUrl, isMapInteracting = false, mapZoom = 13 }) => {
  const position = getDriverPosition(driver);
  const markerDimensions = useMemo(() => getMarkerDimensionsForZoom(mapZoom), [mapZoom]);
  const tracks = useTrackViewChanges([iconUrl, markerDimensions.shell, isMapInteracting]);

  if (!position) {
    return null;
  }

  return (
    <Marker
      coordinate={toMapLatLng(position)}
      anchor={{ x: 0.5, y: 0.5 }}
      rotation={normalizeHeading(driver?.heading)}
      tracksViewChanges={tracks}
      title={driver?.name || 'Available driver'}
    >
      <View style={[styles.vehicleShell, { width: markerDimensions.shell, height: markerDimensions.shell }]} pointerEvents="none">
        {!isMapInteracting && (
          <View
            style={[
              styles.vehiclePulse,
              { width: markerDimensions.pulse, height: markerDimensions.pulse, borderRadius: markerDimensions.pulse / 2 },
            ]}
          />
        )}
        <View style={[styles.center, { width: markerDimensions.icon + 10, height: markerDimensions.icon + 10 }]}>
          <AppImage
            src={iconUrl || CarIcon}
            fallback={CarIcon}
            contentFit="contain"
            transition={0}
            style={{ width: markerDimensions.icon, height: markerDimensions.icon }}
          />
        </View>
      </View>
    </Marker>
  );
});

const buildFallbackRoute = (origin, destination) => {
  if (!origin || !destination) {
    return [];
  }

  const latDelta = destination.lat - origin.lat;
  const lngDelta = destination.lng - origin.lng;
  const bendScale = Math.abs(latDelta) > Math.abs(lngDelta) ? 0.28 : -0.28;
  const latBend = latDelta * bendScale;
  const lngBend = lngDelta * bendScale;

  return [
    origin,
    { lat: origin.lat + latDelta * 0.18, lng: origin.lng + lngDelta * 0.08 },
    { lat: origin.lat + latDelta * 0.36 + latBend, lng: origin.lng + lngDelta * 0.34 - lngBend },
    { lat: origin.lat + latDelta * 0.62 - latBend, lng: origin.lng + lngDelta * 0.58 + lngBend },
    { lat: origin.lat + latDelta * 0.84, lng: origin.lng + lngDelta * 0.9 },
    destination,
  ];
};

const getRouteCacheKey = (origin, destination, waypoints = []) => {
  const serializePoint = (point) =>
    point
      ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}`
      : '';

  const serializeWaypoint = (waypoint) => String(waypoint?.location || '').trim().toLowerCase();
  return [
    serializePoint(origin),
    serializePoint(destination),
    ...waypoints.map(serializeWaypoint),
  ].join('|');
};

const SpinIcon = ({ children }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  return <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>{children}</Animated.View>;
};

const VehicleMapPreview = React.memo(({ center, dropPosition, stops = [], drivers, selectedVehicle, isLoaded, loadError }) => {
  const s = useStyles();
  const P = taxiPalette(useTheme());
  const mapRef = useRef(null);
  const [routePath, setRoutePath] = useState([]);
  const [routeError, setRouteError] = useState('');
  const [isMapInteracting, setIsMapInteracting] = useState(false);
  const [mapZoom, setMapZoom] = useState(13);
  const [mapReady, setMapReady] = useState(false);
  const routeCacheRef = useRef(new Map());
  const waypointRequests = useMemo(
    () =>
      (Array.isArray(stops) ? stops : [])
        .map((stop) => String(stop || '').trim())
        .filter(Boolean)
        .map((stop) => ({ location: stop, stopover: true })),
    [stops],
  );

  useEffect(() => {
    if (!isLoaded || !dropPosition) {
      setRoutePath([]);
      setRouteError('');
      return;
    }

    const routeCacheKey = getRouteCacheKey(center, dropPosition, waypointRequests);
    const cachedRoute = routeCacheRef.current.get(routeCacheKey);
    if (cachedRoute) {
      setRoutePath(cachedRoute.routePath);
      setRouteError(cachedRoute.routeError);
      return;
    }

    let active = true;
    void (async () => {
      const result = await computeDrivingRoute({
        origin: center,
        destination: dropPosition,
        intermediates: waypointRequests,
      });

      if (!active) {
        return;
      }

      if (result.status === 'OK' && result.path.length) {
        routeCacheRef.current.set(routeCacheKey, {
          routePath: result.path,
          routeError: '',
        });
        setRoutePath(result.path);
        setRouteError('');
        return;
      }

      const fallbackRoute = buildFallbackRoute(center, dropPosition);
      const nextRouteError = result.status || 'Directions unavailable';
      routeCacheRef.current.set(routeCacheKey, {
        routePath: fallbackRoute,
        routeError: nextRouteError,
      });
      setRoutePath(fallbackRoute);
      setRouteError(nextRouteError);
    })();

    return () => {
      active = false;
    };
  }, [center, dropPosition, isLoaded, waypointRequests]);

  // The map is only a strip above the vehicle list: show the whole trip in it instead of a fixed zoom on the pickup.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !dropPosition) return;
    const points = [center, dropPosition, ...routePath].filter(Boolean).map(toMapLatLng);
    map.fitToCoordinates(points, { edgePadding: { top: 36, right: 36, bottom: 44, left: 36 }, animated: true });
  }, [mapReady, center, dropPosition, routePath]);

  const routeCoordinates = useMemo(() => routePath.map(toMapLatLng), [routePath]);

  if (!HAS_VALID_GOOGLE_MAPS_KEY) {
    return (
      <View style={s.mapState}>
        <View style={s.mapStateCard}>
          <Text style={s.mapStateTitle}>Google Maps key missing</Text>
          <Text style={s.mapStateText}>Set `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.</Text>
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={s.mapState}>
        <View style={s.mapStateCard}>
          <Text style={s.mapStateTitle}>Google Maps failed to load</Text>
          <Text style={s.mapStateText}>Check the browser key restrictions and reload.</Text>
        </View>
      </View>
    );
  }

  if (!isLoaded) {
    return (
      <View style={s.mapState}>
        <View style={s.mapLoadingPill}>
          <SpinIcon><LoaderCircle size={18} color={P.muted} /></SpinIcon>
          <Text style={s.mapLoadingText}>Loading map</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.fillHidden}>
      <AppMap
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(center, 13)}
        zoomControlEnabled
        onMapReady={() => {
          setMapZoom(13);
          setMapReady(true);
        }}
        onPanDrag={() => { if (!isMapInteracting) setIsMapInteracting(true); }}
        onRegionChangeComplete={(region) => {
          const zoom = Number(region?.longitudeDelta) > 0 ? Math.log2(360 / Number(region.longitudeDelta)) : 13;
          setMapZoom(Math.round(zoom));
          setIsMapInteracting(false);
        }}
      >
        <CircleLocationMarker
          position={center}
          title="Pickup"
          color="#f8e001"
          strokeColor="#111827"
          size={16}
        />
        {dropPosition && (
          <CircleLocationMarker
            position={dropPosition}
            title="Drop"
            color="#fb923c"
            strokeColor="#ffffff"
            size={14}
          />
        )}
        {routeCoordinates.length > 1 && (
          <Polyline coordinates={routeCoordinates} strokeColor={alpha('#111827', 0.85)} strokeWidth={4} />
        )}
        {drivers.slice(0, 8).map((driver, index) => (
          <AnimatedVehicleMarker
            key={driver.id || driver._id || index}
            driver={driver}
            iconUrl={selectedVehicle?.vehicleIconUrl || selectedVehicle?.icon || '/4_Taxi.png'}
            isMapInteracting={isMapInteracting}
            mapZoom={mapZoom}
          />
        ))}
      </AppMap>

      {routeError ? (
        <View pointerEvents="none" style={s.routeErrorBox}>
          <Text style={s.routeErrorKicker}>Route</Text>
          <Text style={s.routeErrorText}>Using fallback path while directions load.</Text>
        </View>
      ) : null}
    </View>
  );
});

const unwrap = (response) => response?.data?.data || response?.data || response;
const PAYMENT_OPTIONS = [
  { id: 'cash', stateValue: 'Cash', label: 'Cash', sub: 'Pay after ride', Icon: Banknote, bg: 'green50', color: colors.green[600] },
  { id: 'online', stateValue: 'Online Payment', label: 'Online Payment', sub: 'UPI, Cards or Wallets', Icon: CreditCard, bg: 'soft', color: colors.blue[600] },
];
const DEFAULT_AVAILABILITY = {
  drivers: [],
  totalDrivers: 0,
  closestDriverDistanceMeters: null,
  closestDriverEtaMinutes: null,
  allowedPaymentMethods: ['cash', 'online'],
};

const normalizeAllowedPaymentMethods = (value) => {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => String(item || '').trim().toLowerCase())
    .map((item) => (item === 'cash' ? 'cash' : item === 'online' ? 'online' : null))
    .filter(Boolean);

  return [...new Set(normalized)].length ? [...new Set(normalized)] : ['cash', 'online'];
};

const attachDriverMotionMetadata = (drivers = [], previousDrivers = []) => {
  const previousById = new Map(
    (Array.isArray(previousDrivers) ? previousDrivers : []).map((driver) => [String(driver?.id || driver?._id || ''), driver]),
  );

  return (Array.isArray(drivers) ? drivers : []).map((driver, index) => {
    const key = String(driver?.id || driver?._id || index);
    const previousDriver = previousById.get(key);
    const currentPosition = getDriverPosition(driver);
    const previousPosition = getDriverPosition(previousDriver);
    const derivedHeading = calculateHeadingBetween(previousPosition, currentPosition);
    const heading = Number.isFinite(Number(driver?.heading))
      ? normalizeHeading(driver.heading)
      : previousPosition && currentPosition
        ? derivedHeading
        : normalizeHeading(previousDriver?.heading ?? 90 + index * 16);

    return {
      ...driver,
      heading,
    };
  });
};

// eslint-disable-next-line no-unused-vars
const toPaymentStateValue = (methodId) => PAYMENT_OPTIONS.find((option) => option.id === methodId)?.stateValue || 'Cash';
const normalizeSelectedPaymentState = (value) => String(value || '').trim().toLowerCase() === 'cash' ? 'cash' : 'online';
const resolveRideTransportType = (...values) => {
  for (const value of values) {
    const normalized = String(value || '').trim().toLowerCase();

    if (!normalized) continue;
    if (normalized === 'both' || normalized === 'all') continue;
    return normalized;
  }

  return 'taxi';
};

const getVehicleTypes = (response) => {
  const data = unwrap(response);
  return data?.vehicle_types || data?.results || (Array.isArray(data) ? data : []);
};

const getTypeLabel = (type) => type?.name || type?.vehicle_type || type?.label || 'Vehicle';

const getIconValue = (type) => String(type?.icon_types || type?.vehicleIconType || type?.name || '').toLowerCase();

const getVehicleMapIcon = (type) => {
  const customIcon = String(type?.map_icon || type?.icon || type?.vehicleIconUrl || '').trim();
  if (customIcon) {
    return customIcon;
  }

  const value = getIconValue(type);

  if (value.includes('scooty')) {
    return '/scooty.png';
  }

  if (value.includes('car_5_seater')) {
    return '/Hatchback.png';
  }

  if (value.includes('car_7_seater')) {
    return '/SUV.png';
  }

  if (value.includes('mini_bus') || value.includes('minibus')) {
    return '/mini_bus.png';
  }

  if (value.includes('bus')) {
    return '/bus.png';
  }

  if (value.includes('bike')) {
    return '/1_Bike.png';
  }

  if (value.includes('auto')) {
    return '/2_AutoRickshaw.png';
  }

  if (value.includes('ehc')) {
    return '/ehcv.png';
  }

  if (value.includes('hcv')) {
    return '/hcv.png';
  }

  if (value.includes('lcv')) {
    return '/LCV.png';
  }

  if (value.includes('mcv')) {
    return '/mcv.png';
  }

  if (value.includes('truck')) {
    return '/truck.png';
  }

  if (value.includes('lux')) {
    return '/Luxury.png';
  }

  if (value.includes('premium')) {
    return '/Premium.png';
  }

  if (value.includes('suv')) {
    return '/SUV.png';
  }

  return '/4_Taxi.png';
};

const getVehiclePreviewImage = (type) => {
  const previewImage = String(type?.image || type?.preview_image || type?.previewImage || '').trim();
  if (previewImage) {
    return previewImage;
  }

  const value = getIconValue(type);

  if (value.includes('scooty')) return ScootyIcon;
  if (value.includes('car_5_seater')) return HatchbackIcon;
  if (value.includes('car_7_seater')) return SuvIcon;
  if (value.includes('mini_bus') || value.includes('minibus')) return MiniBusIcon;
  if (value.includes('bus')) return BusIcon;
  if (value.includes('bike')) return BikeIcon;
  if (value.includes('auto')) return AutoIcon;
  if (value.includes('ehc')) return EhcvIcon;
  if (value.includes('hcv')) return HcvIcon;
  if (value.includes('lcv')) return LcvIcon;
  if (value.includes('mcv')) return McvIcon;
  if (value.includes('truck')) return TruckIcon;
  if (value.includes('lux')) return LuxuryIcon;
  if (value.includes('premium')) return PremiumIcon;
  if (value.includes('suv')) return SuvIcon;

  return CarIcon;
};

const getCapacity = (type) => {
  const value = getIconValue(type);

  if (value.includes('scooty')) {
    return 1;
  }

  if (value.includes('bus') && !value.includes('mini')) {
    return 40;
  }

  if (value.includes('mini_bus') || value.includes('minibus')) {
    return 15;
  }

  if (value.includes('car_7_seater')) {
    return 7;
  }

  if (value.includes('car_5_seater')) {
    return 5;
  }

  if (value.includes('bike')) {
    return 1;
  }

  if (value.includes('auto')) {
    return 3;
  }

  if (value.includes('suv')) {
    return 6;
  }

  return 4;
};

const AVERAGE_CITY_SPEED_KMPH = 24;

const calculateDistanceMeters = (fromCoords, toCoords) => {
  const [fromLng, fromLat] = Array.isArray(fromCoords) ? fromCoords : [];
  const [toLng, toLat] = Array.isArray(toCoords) ? toCoords : [];

  if (![fromLng, fromLat, toLng, toLat].every((value) => Number.isFinite(Number(value)))) {
    return 0;
  }

  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const startLat = toRadians(fromLat);
  const endLat = toRadians(toLat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusMeters * c);
};

const estimateDurationMinutes = (distanceMeters = 0) => {
  if (!Number.isFinite(Number(distanceMeters)) || Number(distanceMeters) <= 0) {
    return 0;
  }

  const metersPerMinute = (AVERAGE_CITY_SPEED_KMPH * 1000) / 60;
  return Math.max(1, Math.round(Number(distanceMeters) / metersPerMinute));
};

// No Set Price for this vehicle in this area: there is no fare to show (0 = "Fare not set", the vehicle cannot be booked).
// It used to invent one (bike Rs 22, auto Rs 40...), which the server then refused at booking time.
const getFallbackVehicleEstimate = () => 0;

const getSetPriceRows = (response) => {
  const data = unwrap(response);
  return (data?.paginator?.data || data?.results || []).filter((row) => {
    const scope = String(row?.pricing_scope || 'ride').trim().toLowerCase();
    return scope === 'ride';
  });
};

const getSetPricePaginationMeta = (response) => {
  const data = unwrap(response);
  return {
    currentPage: Number(data?.current_page || data?.paginator?.current_page || 1) || 1,
    lastPage: Number(data?.last_page || data?.paginator?.last_page || 1) || 1,
  };
};

const normalizeId = (value) => String(value?._id || value?.id || value || '').trim();

const getZoneServiceLocationId = (zone) => normalizeId(
  zone?.service_location_id?._id
  || zone?.service_location_id?.id
  || zone?.service_location_id
  || zone?.service_location?._id
  || zone?.service_location?.id
  || zone?.service_location
  || '',
);

const getZoneId = (zone) => normalizeId(zone?._id || zone?.id || '');

const isZoneActive = (zone) => zone?.active !== false && Number(zone?.status ?? 1) !== 0 && String(zone?.status || '').toLowerCase() !== 'inactive';

const toZonePoint = (point) => {
  if (Array.isArray(point) && point.length >= 2) {
    const [lng, lat] = point;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return { lat: Number(lat), lng: Number(lng) };
    }
  }

  if (point && typeof point === 'object') {
    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.longitude ?? point.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
};

const normalizeZonePath = (zone) => {
  const source = Array.isArray(zone?.coordinates?.[0]) && Array.isArray(zone?.coordinates?.[0]?.[0])
    ? zone.coordinates[0]
    : zone?.coordinates;

  if (!Array.isArray(source)) {
    return [];
  }

  return source.map(toZonePoint).filter(Boolean);
};

const isPointInPolygon = (point, polygon) => {
  if (!point || polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersects = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const toFiniteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getRuleServiceLocationId = (rule) => normalizeId(
  rule?.service_location_id?._id
  || rule?.service_location_id?.id
  || rule?.service_location_id
  || rule?.zone?.service_location?._id
  || rule?.zone?.service_location?.id
  || rule?.zone?.service_location_id
  || '',
);

const getRuleZoneId = (rule) => normalizeId(
  rule?.zone_id?._id
  || rule?.zone_id?.id
  || rule?.zone_id
  || rule?.zone?._id
  || rule?.zone?.id
  || rule?.zone
  || '',
);

const sortPricingRules = (rules = []) => (
  [...rules].sort((first, second) => {
    const firstUpdatedAt = new Date(first?.updatedAt || first?.createdAt || 0).getTime();
    const secondUpdatedAt = new Date(second?.updatedAt || second?.createdAt || 0).getTime();
    return secondUpdatedAt - firstUpdatedAt;
  })
);

const isActiveRidePricingRule = (rule) => {
  const isActive = Number(rule?.active ?? 1) === 1 && String(rule?.status || 'active').toLowerCase() !== 'inactive';
  const scope = String(rule?.pricing_scope || 'ride').trim().toLowerCase();
  return isActive && scope === 'ride';
};

const matchesTransportType = (rule, transportType) => {
  const normalizedRuleTransport = String(rule?.transport_type || 'taxi').trim().toLowerCase();
  const normalizedTransportType = String(transportType || 'taxi').trim().toLowerCase() || 'taxi';

  return normalizedRuleTransport === normalizedTransportType
    || normalizedRuleTransport === 'both';
};

const findBestPricingRule = ({ rules, vehicleTypeId, zoneId, serviceLocationId, transportType }) => {
  const normalizedVehicleTypeId = normalizeId(vehicleTypeId);
  const normalizedZoneId = normalizeId(zoneId);
  const normalizedServiceLocationId = normalizeId(serviceLocationId);
  const normalizedTransportType = String(transportType || 'taxi').trim().toLowerCase() || 'taxi';

  const candidates = sortPricingRules(rules.filter((rule) => {
    const matchesVehicle = normalizeId(rule?.vehicle_type?._id || rule?.vehicle_type || rule?.type_id) === normalizedVehicleTypeId;
    return matchesVehicle && isActiveRidePricingRule(rule) && matchesTransportType(rule, normalizedTransportType);
  }));

  if (!candidates.length) {
    return null;
  }

  const exactTransportMatch = (rule) => String(rule?.transport_type || 'taxi').trim().toLowerCase() === normalizedTransportType;
  const exactZone = candidates.find((rule) => (
    normalizedZoneId
    && getRuleZoneId(rule) === normalizedZoneId
    && exactTransportMatch(rule)
  ));

  if (exactZone) {
    return exactZone;
  }

  const exactZoneAnyTransport = candidates.find((rule) => (
    normalizedZoneId && getRuleZoneId(rule) === normalizedZoneId
  ));

  if (exactZoneAnyTransport) {
    return exactZoneAnyTransport;
  }

  const exactServiceLocation = candidates.find((rule) => (
    normalizedServiceLocationId
    && getRuleServiceLocationId(rule) === normalizedServiceLocationId
    && exactTransportMatch(rule)
  ));

  if (exactServiceLocation) {
    return exactServiceLocation;
  }

  const exactServiceLocationAnyTransport = candidates.find((rule) => (
    normalizedServiceLocationId && getRuleServiceLocationId(rule) === normalizedServiceLocationId
  ));

  if (exactServiceLocationAnyTransport) {
    return exactServiceLocationAnyTransport;
  }

  const genericTransportMatch = candidates.find((rule) => (
    !getRuleServiceLocationId(rule) && !getRuleZoneId(rule) && exactTransportMatch(rule)
  ));

  if (genericTransportMatch) {
    return genericTransportMatch;
  }

  const genericBoth = candidates.find((rule) => !getRuleServiceLocationId(rule) && !getRuleZoneId(rule));
  if (genericBoth) {
    return genericBoth;
  }

  // Never borrow another zone's location-scoped price for this ride.
  if (normalizedServiceLocationId) {
    return null;
  }

  return candidates[0] || null;
};

const calculateEstimatedFare = ({ vehicle, pricingRule, distanceMeters, durationMinutes, surgePercent = 0 }) => {
  const fallbackFare = getFallbackVehicleEstimate(vehicle?.raw || vehicle);

  if (!pricingRule) {
    return fallbackFare;
  }

  const distanceKm = Math.max(0, Number(distanceMeters || 0) / 1000);
  const basePrice = toFiniteNumber(pricingRule.base_price, 0);
  const baseDistance = Math.max(0, toFiniteNumber(pricingRule.base_distance, 0));
  const pricePerDistance = toFiniteNumber(pricingRule.price_per_distance, 0);
  const timePrice = toFiniteNumber(pricingRule.time_price, 0);
  const serviceTax = toFiniteNumber(pricingRule.service_tax, 0);
  const isWithinBaseDistance = baseDistance > 0 && distanceKm <= baseDistance;
  const extraDistanceKm = Math.max(0, distanceKm - baseDistance);
  const subtotal = isWithinBaseDistance
    ? basePrice
    : basePrice + (extraDistanceKm * pricePerDistance) + (Math.max(0, Number(durationMinutes || 0)) * timePrice);

  if (subtotal <= 0) {
    return fallbackFare;
  }

  // Surge Pricing slot at the pickup time: % on the trip price, tax on top (the server checks the same).
  const surgedSubtotal = subtotal * (1 + Math.max(0, Number(surgePercent || 0)) / 100);
  const total = surgedSubtotal + (surgedSubtotal * serviceTax) / 100;
  return Math.max(0, Math.round(total));
};

const getDropTime = (minutesAway = 0) => {
  const safeMinutes = Math.max(6, Number(minutesAway) || 0);
  const date = new Date(Date.now() + safeMinutes * 60 * 1000);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatDistanceLabel = (distanceMeters) => {
  if (!Number.isFinite(Number(distanceMeters))) {
    return 'No distance yet';
  }

  const meters = Number(distanceMeters);

  if (meters < 1000) {
    return `${Math.max(50, Math.round(meters / 10) * 10)} m`;
  }

  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
};

const formatCurrency = (amount) => `₹${Math.round(Number(amount) || 0)}`;

const formatPromoSummary = (promo) => {
  const percent = Math.max(0, Number(promo?.discount_percentage || 0));
  const maxDiscount = Math.max(0, Number(promo?.maximum_discount_amount || 0));
  const minimumTripAmount = Math.max(0, Number(promo?.minimum_trip_amount || 0));

  const parts = [];
  if (percent > 0) {
    parts.push(`${percent}% off`);
  }
  if (maxDiscount > 0) {
    parts.push(`up to ${formatCurrency(maxDiscount)}`);
  }
  if (minimumTripAmount > 0) {
    parts.push(`min ${formatCurrency(minimumTripAmount)}`);
  }

  return parts.join(' • ') || 'Promo available';
};

const toConfiguredPositiveInteger = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
};

const clampPercentage = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, numeric));
};

const alignBidAmountToStep = ({ baseFare, amount, stepAmount, direction = 'up' }) => {
  const safeBaseFare = Math.max(0, Math.round(Number(baseFare || 0)));
  const safeStepAmount = toConfiguredPositiveInteger(stepAmount, 10);
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  const delta = safeAmount - safeBaseFare;

  if (delta === 0) {
    return safeBaseFare;
  }

  const absoluteDelta = Math.abs(delta);
  const rawSteps = absoluteDelta / safeStepAmount;
  const normalizedSteps = direction === 'down' ? Math.floor(rawSteps) : Math.ceil(rawSteps);
  return Math.max(0, safeBaseFare + (Math.sign(delta) * normalizedSteps * safeStepAmount));
};

const getBidFareBounds = (vehicle, stepCount) => {
  const baseFare = Math.max(0, Math.round(Number(vehicle?.price) || 0));
  const maxSteps = Math.max(0, Number(vehicle?.maxBidSteps) || 0);
  const safeStepCount = Math.min(
    maxSteps,
    Math.max(0, Number.isFinite(Number(stepCount)) ? Number(stepCount) : maxSteps),
  );
  const stepAmount = Math.max(0, Math.round(Number(vehicle?.bidStepAmount) || 0));

  return {
    min: baseFare,
    max: baseFare + (safeStepCount * stepAmount),
  };
};

const formatVehicleFare = (vehicle, stepCount) => {
  if (!(Number(vehicle?.price) > 0)) {
    return 'Fare not set';
  }

  if (!vehicle?.supportsBidding) {
    return formatCurrency(vehicle?.price);
  }

  const { min, max } = getBidFareBounds(vehicle, stepCount);
  return `${formatCurrency(min)}-${formatCurrency(max)}`;
};

const pad = (value) => String(value).padStart(2, '0');

const formatDateTimeInputValue = (date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Earliest pickup a rider may schedule: Admin > Transport Ride Settings > Schedule Ride: Minimum Minutes Ahead.
const getScheduleLeadMinutes = (settings) => {
  const value = Number(settings?.transportRide?.schedule_ride_min_minutes_ahead);
  return Number.isFinite(value) && value >= 0 ? value : 60;
};

const getMinScheduledDateTime = (leadMinutes = 60) => {
  const next = new Date(Date.now() + leadMinutes * 60 * 1000);
  return formatDateTimeInputValue(next);
};

// A scheduled time handed over in router state is an ISO (UTC) string; the picker needs LOCAL "YYYY-MM-DDTHH:mm".
// (Slicing the ISO string shifted the time by the UTC offset - 5 h 30 m in India.)
const toLocalDateTimeInput = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : formatDateTimeInputValue(parsed);
};

const getMaxScheduledDateTime = () => {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return formatDateTimeInputValue(nextWeek);
};

// "YYYY-MM-DDTHH:mm" (local) -> Date
const parseLocalDateTime = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!match) return new Date(value);
  const [, y, mo, d, h, mi] = match.map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
};

const formatScheduledDisplay = (value) => {
  if (!value) {
    return 'Pick date & time';
  }

  const parsed = parseLocalDateTime(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Pick date & time';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatAvailabilityLine = (availability) => {
  if (!availability?.totalDrivers) {
    return 'Not available right now';
  }

  const etaMinutes = availability.closestDriverEtaMinutes || 1;
  const dropTime = getDropTime(etaMinutes + 10);
  return `Closest driver ${formatDistanceLabel(availability.closestDriverDistanceMeters)} away - ${etaMinutes} mins away - Drop ${dropTime}`;
};

const formatDispatchLabel = (vehicle) => {
  if (vehicle?.supportsBidding) {
    return 'Bid or instant booking';
  }

  const dispatchType = String(vehicle?.dispatchType || '').toLowerCase();
  if (dispatchType === 'bidding') {
    return 'Bid booking';
  }

  return 'Instant booking';
};

// eslint-disable-next-line no-unused-vars
const getAvailabilityBadge = (availability) => {
  if (!availability?.totalDrivers) {
    return 'NOT AVAILABLE';
  }

  if ((availability.closestDriverEtaMinutes || Number.POSITIVE_INFINITY) <= 2) {
    return 'FASTEST';
  }

  if (availability.totalDrivers >= 5) {
    return 'POPULAR';
  }

  return null;
};

const getNormalizedCategory = (type) => {
  const cat = String(type?.category || '').trim().toLowerCase();
  if (cat) {
    if (cat.includes('car')) return 'car';
    if (cat.includes('bike') || cat.includes('scooty')) return 'bike';
    if (cat.includes('auto')) return 'auto';
    return cat;
  }

  const icon = String(type?.icon_types || '').trim().toLowerCase();
  if (icon.includes('bike') || icon.includes('scooty')) return 'bike';
  if (icon.includes('auto')) return 'auto';
  return 'car';
};

const normalizeVehicleType = (type, index) => {
  const id = String(type?._id || type?.id || type?.name || index);
  const dispatchType = String(type?.dispatch_type || 'normal').trim().toLowerCase();

  return {
    id,
    vehicleTypeId: type?._id || type?.id || '',
    transportType: String(type?.transport_type || 'taxi').trim().toLowerCase() || 'taxi',
    iconType: type?.icon_types || 'car',
    category: getNormalizedCategory(type),
    icon: getVehiclePreviewImage(type),
    vehicleIconUrl: getVehicleMapIcon(type),
    name: getTypeLabel(type),
    capacity: getCapacity(type),
    badge: null,
    badgeColor: 'bg-orange-50 text-orange-500 border-orange-100',
    sublabel: type?.short_description || type?.description || 'Available ride',
    preferences: Array.isArray(type?.preferences) ? type.preferences : [],
    price: getFallbackVehicleEstimate(type),
    dispatchType,
    supportsBidding: dispatchType === 'bidding' || dispatchType === 'both',
    bidStepAmount: 10,
    maxBidSteps: 5,
    raw: type,
  };
};

const createHistorySafeVehicle = (vehicle) => {
  if (!vehicle) {
    return null;
  }

  return {
    id: vehicle.id,
    vehicleTypeId: vehicle.vehicleTypeId,
    transportType: vehicle.transportType,
    iconType: vehicle.iconType,
    icon: vehicle.icon,
    vehicleIconUrl: vehicle.vehicleIconUrl,
    name: vehicle.name,
    capacity: vehicle.capacity,
    badge: vehicle.badge,
    badgeColor: vehicle.badgeColor,
    sublabel: vehicle.sublabel,
    preferences: Array.isArray(vehicle.preferences) ? vehicle.preferences.map(({ id, name }) => ({ id, name })) : [],
    price: vehicle.price,
    dispatchType: vehicle.dispatchType,
    supportsBidding: vehicle.supportsBidding,
    bidStepAmount: vehicle.bidStepAmount,
    maxBidSteps: vehicle.maxBidSteps,
  };
};

// animate-bounce (translateY -25% <-> 0, 1 s)
const ScrollIndicator = ({ show }) => {
  const s = useStyles();
  const P = taxiPalette(useTheme());
  const fade = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) setMounted(true);
    Animated.timing(fade, { toValue: show ? 1 : 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !show) setMounted(false);
    });
  }, [fade, show]);
  useEffect(() => {
    if (!mounted) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: 1, duration: 500, easing: Easing.bezier(0.8, 0, 1, 1), useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0, duration: 500, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bounce, mounted]);
  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.scrollIndicator, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }] }]}
    >
      <Animated.View style={[s.scrollIndicatorBubble, { transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }]}>
        <ChevronDown size={14} strokeWidth={3} color={P.secondary} />
      </Animated.View>
    </Animated.View>
  );
};

// animate-ping dot of the category pill
const PingDot = ({ halo, core }) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration: 1000, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [value]);
  return (
    <View style={styles.pingWrap}>
      <Animated.View
        style={[
          styles.pingDot,
          { backgroundColor: halo, opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }), transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] },
        ]}
      />
      <View style={[styles.pingDot, { backgroundColor: core }]} />
    </View>
  );
};

// framer-motion card entrance: opacity 0 -> 1, y 12 -> 0 (0.4 s, staggered 40 ms)
const VehicleCardEntrance = ({ index, style, children }) => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, { toValue: 1, duration: 400, delay: index * 40, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }).start();
  }, [index, value]);
  return (
    <Animated.View style={[style, { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
};

const PressScale = ({ scaleTo = 0.98, style, children, disabled, ...rest }) => (
  <Pressable disabled={disabled} {...rest} style={({ pressed }) => [style, pressed && !disabled ? { transform: [{ scale: scaleTo }] } : null]}>
    {children}
  </Pressable>
);

const SHEET_HEIGHTS = [0.42, 0.3, 0.12];

const SelectVehicle = () => {
  const s = useStyles();
  const t = useTheme();
  const P = taxiPalette(t);
  const insets = useSafeAreaInsets();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const queryVehicleType = searchParams.get('vehicleType') || '';
  const routeState = location.state || {};
  const [vehicles, setVehicles] = useState([]);
  const [availabilityByVehicleId, setAvailabilityByVehicleId] = useState({});
  const [selected, setSelected] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // Who is travelling: the person booking ("Myself") or someone else (name + number are sent to the driver)
  const [rideFor, setRideFor] = useState({ mode: 'self', name: '', phone: '' });
  const [showRideForModal, setShowRideForModal] = useState(false);
  const [rideForDraft, setRideForDraft] = useState({ mode: 'self', name: '', phone: '' });
  // What the rider asks for on the vehicle (the chips the admin set on the vehicle type)
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  // The vehicle sheet can be pulled up (more vehicles visible) or down (bigger map): 0 = map big, 1 = normal, 2 = sheet high
  const [sheetStep, setSheetStep] = useState(1);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [previewVehicleId, setPreviewVehicleId] = useState('');
  const [availablePromos, setAvailablePromos] = useState([]);
  const [isLoadingPromos, setIsLoadingPromos] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoFeedback, setPromoFeedback] = useState('');
  const [promoError, setPromoError] = useState('');
  const [applyingPromoCode, setApplyingPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  // The coupon the rider picked. It stays picked while they try other vehicles: on a vehicle whose fare it does not
  // cover (minimum fare) it is just not applied there, and it applies again on a vehicle that qualifies.
  const [chosenPromoCode, setChosenPromoCode] = useState('');
  const [rideMode, setRideMode] = useState(() => (location.state?.rideMode === 'schedule' ? 'schedule' : 'now'));
  const [scheduledAt, setScheduledAt] = useState(() => (
    (location.state?.scheduledAt && toLocalDateTimeInput(location.state.scheduledAt)) || getMinScheduledDateTime()
  ));
  const [scheduleError, setScheduleError] = useState('');
  const [bidStepCount, setBidStepCount] = useState(2);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  const [vehicleLoadError, setVehicleLoadError] = useState('');
  const [driverLoadError, setDriverLoadError] = useState('');
  const [pricingRules, setPricingRules] = useState([]);
  const [isLoadingPricingRules, setIsLoadingPricingRules] = useState(true);
  const [focusedField, setFocusedField] = useState('');
  const [tripMetrics, setTripMetrics] = useState(() => {
    if (
      Number.isFinite(Number(routeState?.estimatedDistanceMeters))
      && Number.isFinite(Number(routeState?.estimatedDurationMinutes))
    ) {
      return {
        distanceMeters: Number(routeState.estimatedDistanceMeters),
        durationMinutes: Number(routeState.estimatedDurationMinutes),
      };
    }

    if (!Array.isArray(routeState?.pickupCoords) || !Array.isArray(routeState?.dropCoords)) {
      return { distanceMeters: 0, durationMinutes: 0 };
    }

    const fallbackDistanceMeters = calculateDistanceMeters(routeState.pickupCoords, routeState.dropCoords);

    return {
      distanceMeters: fallbackDistanceMeters,
      durationMinutes: estimateDurationMinutes(fallbackDistanceMeters),
    };
  });
  const routeMetricsCacheRef = useRef(new Map());
  const [isResolvingTripMetrics, setIsResolvingTripMetrics] = useState(true);
  const [showScrollArrow, setShowScrollArrow] = useState(false);
  const scrollMetricsRef = useRef({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const availabilityHistoryRef = useRef({});
  const selectedVehicleIdRef = useRef('');
  const vehiclePickedByUserRef = useRef(false);
  const navigate = useNavigate();
  const { settings, hasBootstrapSettings } = useSettings();
  const pickup = routeState.pickup || '';
  const drop = routeState.drop || '';
  const pickupCoords = useMemo(
    () => (Array.isArray(routeState.pickupCoords) ? routeState.pickupCoords : null),
    [routeState.pickupCoords],
  );
  const dropCoords = useMemo(
    () => (Array.isArray(routeState.dropCoords) ? routeState.dropCoords : null),
    [routeState.dropCoords],
  );
  const hasCompleteRideContext = Boolean(pickup && drop && pickupCoords && dropCoords);
  const stops = useMemo(
    () => (Array.isArray(routeState.stops) ? routeState.stops : []),
    [routeState.stops],
  );
  const routeServiceLocationId = routeState.service_location_id || routeState.serviceLocationId || '';
  const routeZoneId = routeState.zone_id || routeState.zoneId || '';
  const hasCompleteRouteZoneContext = Boolean(routeServiceLocationId && routeZoneId);
  const [resolvedServiceLocationId, setResolvedServiceLocationId] = useState(routeServiceLocationId);
  const [resolvedZoneId, setResolvedZoneId] = useState(routeZoneId);
  const [isResolvingServiceLocation, setIsResolvingServiceLocation] = useState(!hasCompleteRouteZoneContext);
  const [hasLoadedAvailability, setHasLoadedAvailability] = useState(false);
  const serviceLocationId = hasCompleteRouteZoneContext
    ? (resolvedServiceLocationId || routeServiceLocationId || '')
    : resolvedServiceLocationId;
  const zoneId = hasCompleteRouteZoneContext
    ? (resolvedZoneId || routeZoneId || '')
    : resolvedZoneId;
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const pickupPosition = useMemo(() => toLatLng(pickupCoords), [pickupCoords]);
  const dropPosition = useMemo(() => toLatLng(dropCoords, null), [dropCoords]);
  const { isLoaded: isMapLoaded, loadError: mapLoadError } = useBaseGoogleMapsLoader();
  const scheduleLeadMinutes = getScheduleLeadMinutes(settings);
  const minScheduledAt = useMemo(() => getMinScheduledDateTime(scheduleLeadMinutes), [scheduleLeadMinutes]);
  const maxScheduledAt = useMemo(() => getMaxScheduledDateTime(), []);

  // Map strip height (42 / 30 / 12 % of the screen) with the web's 300 ms ease-out transition.
  const windowHeight = Dimensions.get('window').height;
  const mapHeight = useRef(new Animated.Value(windowHeight * SHEET_HEIGHTS[1])).current;
  useEffect(() => {
    Animated.timing(mapHeight, { toValue: windowHeight * SHEET_HEIGHTS[sheetStep], duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  }, [mapHeight, sheetStep, windowHeight]);

  // Pull handle: drag up / down a step, or tap to toggle normal <-> high (web: pointer events on the handle).
  const handlePan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderRelease: (_event, gesture) => {
      const delta = gesture.dy;
      const moved = Math.abs(delta) > 6;
      if (delta < -30) setSheetStep((step) => Math.min(2, step + 1));
      else if (delta > 30) setSheetStep((step) => Math.max(0, step - 1));
      else if (!moved) setSheetStep((step) => (step === 1 ? 2 : 1));
    },
  }), []);

  // Never fabricate a ride between fake default points — if pickup/drop state
  // is missing (e.g. a hard page reload wiped router state), send the user
  // back to pick a real location instead of silently booking the wrong trip.
  useEffect(() => {
    if (!hasCompleteRideContext) {
      // Keep the vehicle category the user tapped on Home so it is still applied once they pick the places.
      const selectedCategory = routeState.selectedCategory || queryVehicleType || undefined;
      navigate(`${routePrefix}/ride/select-location`, {
        replace: true,
        state: selectedCategory ? { selectedCategory } : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hasCompleteRouteZoneContext) {
      setResolvedServiceLocationId(routeServiceLocationId);
      setResolvedZoneId(routeZoneId);
      setIsResolvingServiceLocation(false);
      return;
    }

    setResolvedServiceLocationId('');
    setResolvedZoneId('');
    setIsResolvingServiceLocation(true);
  }, [hasCompleteRouteZoneContext, routeServiceLocationId, routeZoneId]);

  useEffect(() => {
    let active = true;

    const resolveServiceLocationFromPickup = async () => {
      if (hasCompleteRouteZoneContext) {
        if (active) {
          setIsResolvingServiceLocation(false);
        }
        return;
      }

      if (!Array.isArray(pickupCoords) || pickupCoords.length !== 2) {
        if (active) {
          setIsResolvingServiceLocation(false);
        }
        return;
      }

      if (active) {
        setIsResolvingServiceLocation(true);
      }

      try {
        const response = await api.get('/users/zones');
        if (!active) {
          return;
        }

        const payload = unwrap(response);
        const zones = payload?.results || payload?.zones || payload?.paginator?.data || (Array.isArray(payload) ? payload : []);
        const pickupPoint = { lat: Number(pickupCoords[1]), lng: Number(pickupCoords[0]) };
        const matchedZone = [...(Array.isArray(zones) ? zones : [])]
          .filter((zone) => isZoneActive(zone))
          .map((zone) => ({ zone, path: normalizeZonePath(zone) }))
          .filter(({ path }) => isPointInPolygon(pickupPoint, path))
          .sort((left, right) => {
            const leftUpdatedAt = new Date(left.zone?.updatedAt || left.zone?.createdAt || 0).getTime();
            const rightUpdatedAt = new Date(right.zone?.updatedAt || right.zone?.createdAt || 0).getTime();
            return rightUpdatedAt - leftUpdatedAt;
          })[0]?.zone;

        const nextZoneId = getZoneId(matchedZone);
        const nextServiceLocationId = getZoneServiceLocationId(matchedZone);
        setResolvedZoneId(nextZoneId || '');
        setResolvedServiceLocationId(nextServiceLocationId || '');
      } catch {
        if (active) {
          setResolvedServiceLocationId('');
          setResolvedZoneId('');
        }
      } finally {
        if (active) {
          setIsResolvingServiceLocation(false);
        }
      }
    };

    resolveServiceLocationFromPickup();

    return () => {
      active = false;
    };
  }, [hasCompleteRouteZoneContext, pickupCoords]);

  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = scrollMetricsRef.current;
    if (!clientHeight) return;
    const hasMore = scrollTop + clientHeight < scrollHeight - 8;
    setShowScrollArrow(hasMore);
  };

  useEffect(() => {
    if (!scheduledAt) {
      return;
    }

    if (scheduledAt < minScheduledAt) {
      setScheduledAt(minScheduledAt);
      return;
    }

    if (scheduledAt > maxScheduledAt) {
      setScheduledAt(maxScheduledAt);
    }
  }, [maxScheduledAt, minScheduledAt, scheduledAt]);

  useEffect(() => {
    let active = true;

    const loadVehicleTypes = async () => {
      setIsLoadingVehicles(true);
      setVehicleLoadError('');

      try {
        const response = await api.get('/users/vehicle-types');

        if (!active) {
          return;
        }

        // Only the category of this booking (URL / route state). A leftover localStorage value from an
        // earlier tile tap must not filter the list, or the other vehicle types vanish.
        const categoryFilter = String(queryVehicleType || routeState?.selectedCategory || '').trim().toLowerCase();
        let nextVehicles = getVehicleTypes(response)
          .filter((type) => {
            const isActive = type.active !== false && Number(type.status ?? 1) !== 0;
            const transportType = String(type.transport_type || 'taxi').toLowerCase();
            return isActive && (transportType === 'taxi' || transportType === 'both');
          })
          .map(normalizeVehicleType);

        if (categoryFilter) {
          nextVehicles = nextVehicles.filter((v) => {
            const vCat = v.category;
            if (categoryFilter === 'cab' && vCat === 'car') return true;
            if (categoryFilter === 'car' && vCat === 'cab') return true;
            return vCat === categoryFilter;
          });
        }

        const preselectedVehicle = nextVehicles[0] || null;

        setVehicles(nextVehicles);
        setSelected((current) => current || preselectedVehicle?.id || nextVehicles[0]?.id || '');
      } catch (err) {
        console.error('[SelectVehicle] Failed to load vehicles:', err);
        if (active) {
          setVehicleLoadError('Failed to load available vehicles for this area.');
        }
      } finally {
        if (active) {
          setIsLoadingVehicles(false);
        }
      }
    };

    loadVehicleTypes();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResolvingServiceLocation, queryVehicleType, routeState?.selectedCategory, resolvedZoneId, resolvedServiceLocationId, routeState.transportType, routeState.transport_type, routeState.serviceType, hasCompleteRouteZoneContext]);

  useEffect(() => {
    let active = true;

    const loadPricingRules = async () => {
      if (isResolvingServiceLocation) {
        return;
      }

      setIsLoadingPricingRules(true);

      try {
        const aggregatedRules = [];
        let page = 1;
        let lastPage = 1;
        const pricingTransportType = resolveRideTransportType(
          routeState.transport_type,
          routeState.transportType,
          'taxi',
        );

        do {
          const response = await api.get('/users/set-prices', {
            params: {
              scope: 'ride',
              page,
              limit: 100,
              ...(zoneId ? { zone_id: zoneId } : {}),
              ...(pricingTransportType ? { transport_type: pricingTransportType } : {}),
            },
          });

          if (!active) {
            return;
          }

          aggregatedRules.push(...getSetPriceRows(response));
          const pagination = getSetPricePaginationMeta(response);
          lastPage = pagination.lastPage;
          page += 1;
        } while (page <= lastPage);

        if (!active) {
          return;
        }

        setPricingRules(aggregatedRules);
      } catch {
        if (active) {
          setPricingRules([]);
        }
      } finally {
        if (active) {
          setIsLoadingPricingRules(false);
        }
      }
    };

    loadPricingRules();

    return () => {
      active = false;
    };
  }, [isResolvingServiceLocation, routeState.transportType, routeState.transport_type, zoneId]);

  useEffect(() => {
    const fallbackDistanceMeters = calculateDistanceMeters(pickupCoords, dropCoords);
    const fallbackDurationMinutes = estimateDurationMinutes(fallbackDistanceMeters);

    if (!dropPosition) {
      setIsResolvingTripMetrics(false);
      setTripMetrics({
        distanceMeters: fallbackDistanceMeters,
        durationMinutes: fallbackDurationMinutes,
      });
      return;
    }

    if (mapLoadError || !HAS_VALID_GOOGLE_MAPS_KEY) {
      setIsResolvingTripMetrics(false);
      setTripMetrics({
        distanceMeters: fallbackDistanceMeters,
        durationMinutes: fallbackDurationMinutes,
      });
      return;
    }

    if (!isMapLoaded) {
      setIsResolvingTripMetrics(true);
      return;
    }

    const waypointRequests = stops
      .map((stop) => String(stop || '').trim())
      .filter(Boolean)
      .map((stop) => ({ location: stop, stopover: true }));
    const routeCacheKey = getRouteCacheKey(pickupPosition, dropPosition, waypointRequests);
    const cachedMetrics = routeMetricsCacheRef.current.get(routeCacheKey);
    if (cachedMetrics) {
      setIsResolvingTripMetrics(false);
      setTripMetrics(cachedMetrics);
      return;
    }

    let active = true;
    setIsResolvingTripMetrics(true);
    void (async () => {
      const result = await computeDrivingRoute({
        origin: pickupPosition,
        destination: dropPosition,
        intermediates: waypointRequests,
      });

      if (!active) {
        return;
      }

      const totals = sumComputedRouteLegs(result.legs);
      const distanceMeters = toFiniteNumber(totals.distanceMeters, fallbackDistanceMeters);
      const durationMinutes = Math.max(
        1,
        Math.round(toFiniteNumber(totals.durationSeconds, fallbackDurationMinutes * 60) / 60),
      );

      if (result.status === 'OK' && result.legs.length) {
        routeMetricsCacheRef.current.set(routeCacheKey, { distanceMeters, durationMinutes });
        setIsResolvingTripMetrics(false);
        setTripMetrics({ distanceMeters, durationMinutes });
        return;
      }

      routeMetricsCacheRef.current.set(routeCacheKey, {
        distanceMeters: fallbackDistanceMeters,
        durationMinutes: fallbackDurationMinutes,
      });
      setIsResolvingTripMetrics(false);
      setTripMetrics({
        distanceMeters: fallbackDistanceMeters,
        durationMinutes: fallbackDurationMinutes,
      });
    })();

    return () => {
      active = false;
    };
  }, [dropCoords, dropPosition, isMapLoaded, mapLoadError, pickupCoords, pickupPosition, stops]);

  const pricedVehicles = useMemo(
    () =>
      vehicles.map((vehicle) => {
        const pricingRule = findBestPricingRule({
          rules: pricingRules,
          vehicleTypeId: vehicle.vehicleTypeId,
          zoneId,
          serviceLocationId,
          transportType: resolveRideTransportType(
            routeState.transport_type,
            routeState.transportType,
            vehicle.transportType,
          ),
        });

        const surgePercent = getActiveSurgePercent(pricingRule, rideMode === 'schedule' && scheduledAt ? parseLocalDateTime(scheduledAt) : new Date());
        const calculatedPrice = calculateEstimatedFare({
          vehicle,
          pricingRule,
          distanceMeters: tripMetrics.distanceMeters,
          durationMinutes: tripMetrics.durationMinutes,
          surgePercent,
        });

        // Dynamically scale max bidding steps to a realistic 15% of the actual calculated price
        const stepAmount = Number(vehicle.bidStepAmount || 10);
        const dynamicMaxBidSteps = Math.max(2, Math.round((calculatedPrice * 0.15) / stepAmount));

        return {
          ...vehicle,
          pricingRule,
          price: calculatedPrice,
          surgePercent,
          maxBidSteps: dynamicMaxBidSteps,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pricingRules, rideMode, scheduledAt, serviceLocationId, tripMetrics.distanceMeters, tripMetrics.durationMinutes, vehicles, zoneId],
  );

  const isFarePending = isResolvingTripMetrics || isLoadingPricingRules;

  const hasAvailabilityResults = Object.keys(availabilityByVehicleId).length > 0;

  const displayedVehicles = useMemo(() => {
    if (!hasLoadedAvailability) {
      return [];
    }

    if (!hasAvailabilityResults) {
      return pricedVehicles;
    }

    const rankedVehicles = pricedVehicles
      .map((vehicle, index) => ({
        ...vehicle,
        originalIndex: index,
        availability: availabilityByVehicleId[vehicle.id] || DEFAULT_AVAILABILITY,
      }))
      // Booking now: only vehicles with an online driver nearby are listed (offline / busy types stay hidden).
      // "Later" keeps every type, because the driver is matched at pickup time.
      .filter(({ availability }) => rideMode === 'schedule' || (availability.totalDrivers || 0) > 0)
      .sort((a, b) => {
        const aAvailable = (a.availability.totalDrivers || 0) > 0;
        const bAvailable = (b.availability.totalDrivers || 0) > 0;

        if (aAvailable !== bAvailable) {
          return aAvailable ? -1 : 1;
        }

        if (aAvailable && bAvailable) {
          const driverDelta = (b.availability.totalDrivers || 0) - (a.availability.totalDrivers || 0);
          if (driverDelta !== 0) return driverDelta;

          const etaDelta = (a.availability.closestDriverEtaMinutes || Number.POSITIVE_INFINITY)
            - (b.availability.closestDriverEtaMinutes || Number.POSITIVE_INFINITY);
          if (etaDelta !== 0) return etaDelta;
        }

        return a.originalIndex - b.originalIndex;
      })
      // eslint-disable-next-line no-unused-vars
      .map(({ originalIndex, availability, ...vehicle }) => vehicle);

    return rankedVehicles;
  }, [availabilityByVehicleId, hasAvailabilityResults, hasLoadedAvailability, pricedVehicles, rideMode]);

  const selectedVehicle = useMemo(() => pricedVehicles.find((v) => v.id === selected), [pricedVehicles, selected]);
  const previewVehicle = useMemo(
    () => pricedVehicles.find((vehicle) => vehicle.id === previewVehicleId) || null,
    [previewVehicleId, pricedVehicles],
  );
  const resolvedTransportType = useMemo(
    () => resolveRideTransportType(
      routeState.transport_type,
      routeState.transportType,
      selectedVehicle?.transportType,
    ),
    [routeState.transportType, routeState.transport_type, selectedVehicle?.transportType],
  );
  const appliedPromoDiscount = Math.max(0, Number(appliedPromo?.breakdown?.discount_amount || 0));
  const discountedSelectedFare = Math.max(
    0,
    Number(appliedPromo?.breakdown?.fare_after_discount ?? selectedVehicle?.price ?? 0),
  );
  // The coupon was validated for one fare; show the cut price on that vehicle's card only while it still matches
  // (right after picking another vehicle the old breakdown must not leak onto the new fare).
  const promoMatchesSelectedFare = Boolean(appliedPromo)
    && appliedPromoDiscount > 0
    && Math.round(Number(appliedPromo?.breakdown?.fare_before_discount)) === Math.round(Number(selectedVehicle?.price));
  const selectedAvailability = selectedVehicle ? (availabilityByVehicleId[selectedVehicle.id] || DEFAULT_AVAILABILITY) : DEFAULT_AVAILABILITY;
  const previewAvailability = previewVehicle ? (availabilityByVehicleId[previewVehicle.id] || DEFAULT_AVAILABILITY) : DEFAULT_AVAILABILITY;
  // A vehicle that is not in the list (no online driver any more) can never be booked.
  const isSelectedVehicleListed = Boolean(selectedVehicle) && displayedVehicles.some((vehicle) => vehicle.id === selectedVehicle.id);
  const canProceed = isSelectedVehicleListed && !isFarePending && Number(selectedVehicle?.price) > 0;
  // Every car (SUV, Sedan, ...) is booked as a "Car Taxi"; bike / auto keep their own name.
  const bookButtonName = selectedVehicle?.category === 'car' ? 'Car Taxi' : selectedVehicle?.name;
  // eslint-disable-next-line no-unused-vars
  const hasBookableVehicles = useMemo(
    () => displayedVehicles.length > 0,
    [displayedVehicles],
  );
  const shouldUseDriverBidding = Boolean(
    routeState.intercity ||
    routeState.serviceType === 'intercity' ||
    routeState.transport_type === 'intercity' ||
    routeState.transportType === 'intercity',
  );
  const bidRideSettings = settings?.bidRide || {};
  const selectedBidStepAmount = shouldUseDriverBidding
    ? toConfiguredPositiveInteger(
        bidRideSettings.bidding_amount_increase_or_decrease,
        Number(selectedVehicle?.bidStepAmount || 10),
      )
    : Number(selectedVehicle?.bidStepAmount || 10);
  const bidLowPercentage = clampPercentage(bidRideSettings.user_bidding_low_percentage, 10);
  const bidHighPercentage = clampPercentage(bidRideSettings.user_bidding_high_percentage, 20);
  const normalizedBidLowPercentage = Math.min(bidLowPercentage, bidHighPercentage);
  const normalizedBidHighPercentage = Math.max(bidLowPercentage, bidHighPercentage);
  const selectedBidFloorFare = shouldUseDriverBidding
    ? alignBidAmountToStep({
        baseFare: Number(selectedVehicle?.price || 0),
        amount: Number(selectedVehicle?.price || 0) * (1 + (normalizedBidLowPercentage / 100)),
        stepAmount: selectedBidStepAmount,
        direction: 'up',
      })
    : Number(selectedVehicle?.price || 0);
  const selectedBidCeilingMaxFare = shouldUseDriverBidding
    ? alignBidAmountToStep({
        baseFare: Number(selectedVehicle?.price || 0),
        amount: Number(selectedVehicle?.price || 0) * (1 + (normalizedBidHighPercentage / 100)),
        stepAmount: selectedBidStepAmount,
        direction: 'up',
      })
    : Number(selectedVehicle?.price || 0);
  const selectedBidSteps = shouldUseDriverBidding
    ? Math.max(0, Math.round((selectedBidCeilingMaxFare - selectedBidFloorFare) / selectedBidStepAmount))
    : Number(selectedVehicle?.maxBidSteps || 5);
  const selectedBidIncrement = (selectedVehicle?.supportsBidding ? bidStepCount : 0) * selectedBidStepAmount;
  const selectedBidCeiling = shouldUseDriverBidding
    ? selectedBidFloorFare + selectedBidIncrement
    : Number(selectedVehicle?.price || 0) + selectedBidIncrement;
  const allowedPaymentMethods = useMemo(
    () => normalizeAllowedPaymentMethods(selectedAvailability?.allowedPaymentMethods),
    [selectedAvailability?.allowedPaymentMethods],
  );
  // Online fare payment runs on Razorpay; hide it once the app knows Global admin switched Razorpay off.
  const onlinePaymentAvailable = !hasBootstrapSettings || settings.paymentGateway?.slug === 'razor_pay';
  const paymentOptions = useMemo(
    () => PAYMENT_OPTIONS.filter(
      (option) => allowedPaymentMethods.includes(option.id) && (option.id !== 'online' || onlinePaymentAvailable),
    ),
    [allowedPaymentMethods, onlinePaymentAvailable],
  );
  const onlineDrivers = selectedAvailability.drivers || [];

  useEffect(() => {
    if (!paymentOptions.length) {
      return;
    }

    const normalizedCurrent = normalizeSelectedPaymentState(paymentMethod);
    if (!paymentOptions.some((option) => option.id === normalizedCurrent)) {
      setPaymentMethod(paymentOptions[0].stateValue);
    }
  }, [paymentMethod, paymentOptions]);

  const clearAppliedPromo = (nextFeedback = '') => {
    setAppliedPromo(null);
    setChosenPromoCode('');
    setApplyingPromoCode('');
    setPromoError('');
    setPromoFeedback(nextFeedback);
  };

  const applyPromoCode = async (rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();

    if (!serviceLocationId) {
      setPromoError('Pickup zone is missing for this ride.');
      setPromoFeedback('');
      return false;
    }

    if (!selectedVehicle) {
      setPromoError('Select a vehicle before applying a coupon.');
      setPromoFeedback('');
      return false;
    }

    if (!code) {
      setPromoError('Enter a coupon code.');
      setPromoFeedback('');
      return false;
    }

    setApplyingPromoCode(code);
    setPromoError('');
    setPromoFeedback('');

    try {
      const response = await userService.validatePromo({
        code,
        fare: Number(selectedVehicle.price || 0),
        service_location_id: serviceLocationId,
        transport_type: resolvedTransportType,
      });
      const payload = unwrap(response);

      if (!payload?.eligible) {
        setAppliedPromo(null);
        setChosenPromoCode('');
        setPromoError(payload?.message || 'This coupon is not valid for this ride.');
        return false;
      }

      setAppliedPromo(payload);
      setChosenPromoCode(code);
      setPromoCodeInput(code);
      setPromoFeedback(`${code} applied. You save ${formatCurrency(payload?.breakdown?.discount_amount || 0)}.`);
      return true;
    } catch (error) {
      setAppliedPromo(null);
      setChosenPromoCode('');
      setPromoError(error?.response?.data?.message || error?.message || 'Could not apply this coupon right now.');
      return false;
    } finally {
      setApplyingPromoCode('');
    }
  };

  useEffect(() => {
    let active = true;

    const loadPromos = async () => {
      if (!serviceLocationId) {
        if (active) {
          setAvailablePromos([]);
          clearAppliedPromo('');
        }
        return;
      }

      setIsLoadingPromos(true);

      try {
        const response = await userService.getAvailablePromos({
          service_location_id: serviceLocationId,
          transport_type: resolvedTransportType,
          limit: 20,
        });

        if (!active) {
          return;
        }

        const promos = Array.isArray(unwrap(response)) ? unwrap(response) : [];
        setAvailablePromos(promos);

        if (chosenPromoCode) {
          const stillAvailable = promos.some((promo) => String(promo?.code || '').toUpperCase() === chosenPromoCode.toUpperCase());
          if (!stillAvailable) {
            clearAppliedPromo('Coupon removed because it does not apply in this zone.');
          }
        }
      } catch (_error) {
        if (active) {
          setAvailablePromos([]);
        }
      } finally {
        if (active) {
          setIsLoadingPromos(false);
        }
      }
    };

    loadPromos();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTransportType, serviceLocationId]);

  // A code chosen on the Promo page is applied here once a vehicle (and so a fare) is known.
  useEffect(() => {
    if (appliedPromo || !selectedVehicle || !serviceLocationId || !availablePromos) {
      return;
    }

    let pendingCode = '';
    try {
      pendingCode = String(window.sessionStorage.getItem('helloparth:pendingPromo') || '').trim();
    } catch {
      pendingCode = '';
    }
    if (!pendingCode) {
      return;
    }

    try {
      window.sessionStorage.removeItem('helloparth:pendingPromo');
    } catch {
      /* ignore */
    }
    setPromoCodeInput(pendingCode);
    void applyPromoCode(pendingCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicle?.id, selectedVehicle?.price, serviceLocationId]);

  useEffect(() => {
    if (!chosenPromoCode || !selectedVehicle) {
      return;
    }

    let active = true;

    const refreshAppliedPromo = async () => {
      try {
        const response = await userService.validatePromo({
          code: chosenPromoCode,
          fare: Number(selectedVehicle.price || 0),
          service_location_id: serviceLocationId,
          transport_type: resolvedTransportType,
        });
        const payload = unwrap(response);

        if (!active) {
          return;
        }

        if (!payload?.eligible) {
          // Not applied on THIS vehicle, but the coupon stays picked for the others.
          setAppliedPromo(null);
          setPromoFeedback('');
          setPromoError(`${chosenPromoCode} is not applied on ${selectedVehicle.name}: ${payload?.message || 'not valid for this fare'}.`);
          return;
        }

        setPromoError('');
        setPromoFeedback('');
        setAppliedPromo(payload);
      } catch (error) {
        if (active) {
          setAppliedPromo(null);
          setPromoFeedback('');
          setPromoError(error?.response?.data?.message || 'Could not check this coupon right now.');
        }
      }
    };

    refreshAppliedPromo();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenPromoCode, resolvedTransportType, selectedVehicle?.id, selectedVehicle?.price, serviceLocationId]);

  useEffect(() => {
    const timer = setTimeout(handleScroll, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedVehicles, tripMetrics]);

  useEffect(() => {
    setBidStepCount(0);
  }, [selected]);

  useEffect(() => {
    selectedVehicleIdRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!hasAvailabilityResults || !displayedVehicles.length) {
      return;
    }

    const hasDrivers = (id) => (availabilityByVehicleId[id]?.totalDrivers || 0) > 0;
    const firstAvailable = displayedVehicles.find((vehicle) => hasDrivers(vehicle.id)) || displayedVehicles[0];

    if (!firstAvailable) {
      return;
    }

    // The list preselects its first entry before availability is known; move off it to a vehicle
    // that actually has drivers, unless the rider already picked one themselves.
    // A selected vehicle that dropped out of the list (its last driver went offline) is replaced too.
    const isSelectedListed = displayedVehicles.some((vehicle) => vehicle.id === selected);
    if (!selected || !isSelectedListed || (!vehiclePickedByUserRef.current && !hasDrivers(selected) && hasDrivers(firstAvailable.id))) {
      setSelected(firstAvailable.id);
    }
  }, [availabilityByVehicleId, displayedVehicles, hasAvailabilityResults, rideMode, selected]);

  useEffect(() => {
    let active = true;
    let intervalId;

    if (isResolvingServiceLocation || !Array.isArray(pickupCoords)) {
      setHasLoadedAvailability(false);
      return undefined;
    }

    const fetchVehicleAvailabilities = async (vehicleSubset, { replace = false, silent = false } = {}) => {
      const fetchableVehicles = (Array.isArray(vehicleSubset) ? vehicleSubset : []).filter((vehicle) => vehicle?.vehicleTypeId);

      if (!fetchableVehicles.length) {
        if (replace) {
          availabilityHistoryRef.current = {};
          setAvailabilityByVehicleId({});
        }
        if (active) {
          setHasLoadedAvailability(true);
        }
        return;
      }

      if (!silent) {
        setIsLoadingDrivers(true);
      }
      setDriverLoadError('');

      try {
        const responses = await Promise.all(
          fetchableVehicles.map(async (vehicle) => {
            const response = await api.get('/rides/available-drivers', {
              params: {
                vehicleTypeId: vehicle.vehicleTypeId,
                vehicleIconType: vehicle.iconType,
                lng: pickupCoords[0],
                lat: pickupCoords[1],
                service_location_id: serviceLocationId,
                transport_type: vehicle.transportType || routeState.transport_type || routeState.transportType || 'taxi',
              },
            });

            return [vehicle.id, { ...DEFAULT_AVAILABILITY, ...unwrap(response) }];
          }),
        );

        if (!active) {
          return;
        }

        setAvailabilityByVehicleId((current) => {
          const base = replace ? {} : current;
          const nextEntries = { ...base };

          responses.forEach(([vehicleId, payload]) => {
            const previousDrivers = availabilityHistoryRef.current?.[vehicleId]?.drivers || current?.[vehicleId]?.drivers || [];
            nextEntries[vehicleId] = {
              ...payload,
              drivers: attachDriverMotionMetadata(payload?.drivers, previousDrivers),
            };
          });

          availabilityHistoryRef.current = nextEntries;
          return nextEntries;
        });
      } catch (error) {
        if (active) {
          if (replace) {
            availabilityHistoryRef.current = {};
            setAvailabilityByVehicleId({});
          }
          setDriverLoadError(error.message || 'Could not load online drivers.');
        }
      } finally {
        if (active) {
          if (!silent) {
            setIsLoadingDrivers(false);
          }
          setHasLoadedAvailability(true);
        }
      }
    };

    if (!vehicles.length) {
      availabilityHistoryRef.current = {};
      setAvailabilityByVehicleId({});
      setHasLoadedAvailability(false);
      return undefined;
    }

    setHasLoadedAvailability(false);
    fetchVehicleAvailabilities(vehicles, { replace: true });

    const pollSelectedVehicle = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const activeVehicle =
        vehicles.find((vehicle) => vehicle.id === selectedVehicleIdRef.current)
        || vehicles.find((vehicle) => vehicle.vehicleTypeId);

      if (!activeVehicle) {
        return;
      }

      fetchVehicleAvailabilities([activeVehicle], { silent: true });
    };

    intervalId = setInterval(pollSelectedVehicle, 8000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollSelectedVehicle();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResolvingServiceLocation, pickupCoords, routeState.transportType, routeState.transport_type, serviceLocationId, vehicles]);

  const isInitialVehicleResultsLoading =
    isLoadingVehicles ||
    isResolvingServiceLocation ||
    (vehicles.length > 0 && !hasLoadedAvailability && !driverLoadError);

  // Web: the hidden <input type="datetime-local" min max> opened with showPicker(). Natively: the date, then the time.
  const applyScheduledAt = (value) => {
    setScheduledAt(value);
    setRideMode('schedule');
    setScheduleError('');
  };

  const openSchedulePicker = () => {
    if (Platform.OS !== 'android') return;
    const minimumDate = parseLocalDateTime(minScheduledAt);
    const maximumDate = parseLocalDateTime(maxScheduledAt);
    const current = parseLocalDateTime(scheduledAt || minScheduledAt);
    DateTimePickerAndroid.open({
      value: Number.isNaN(current.getTime()) ? minimumDate : current,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (dateEvent, pickedDate) => {
        if (dateEvent?.type !== 'set' || !pickedDate) return;
        DateTimePickerAndroid.open({
          value: Number.isNaN(current.getTime()) ? minimumDate : current,
          mode: 'time',
          onChange: (timeEvent, pickedTime) => {
            if (timeEvent?.type !== 'set' || !pickedTime) return;
            const next = new Date(pickedDate);
            next.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            applyScheduledAt(formatDateTimeInputValue(next));
          },
        });
      },
    });
  };

  const openLocationEditor = () => {
    navigate(`${routePrefix}/ride/select-location`, {
      state: {
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        stops,
        service_location_id: serviceLocationId,
        zone_id: zoneId,
        selectedCategory: routeState.selectedCategory, // Forward category filter
      },
    });
  };

  const proceedToBooking = () => {
    if (!selectedVehicle) {
      return;
    }

    setShowBidModal(false);
    const baseFare = Number(selectedVehicle.price || 0);
    const finalFare = appliedPromo?.breakdown?.fare_after_discount ?? baseFare;
    const historySafeVehicle = createHistorySafeVehicle(selectedVehicle);

    navigate(`${routePrefix}/ride/searching`, {
      state: {
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        stops,
        zone_id: zoneId,
        service_location_id: serviceLocationId,
        transport_type: resolvedTransportType,
        vehicle: historySafeVehicle,
        vehicleTypeId: historySafeVehicle?.vehicleTypeId || '',
        vehicleIconType: historySafeVehicle?.iconType || '',
        vehicleIconUrl: historySafeVehicle?.vehicleIconUrl || historySafeVehicle?.icon || '',
        paymentMethod,
        fare: finalFare,
        baseFare,
        promo_code: appliedPromo?.promo?.code || '',
        promo: appliedPromo?.promo || null,
        promoBreakdown: appliedPromo?.breakdown || null,
        bookingMode: selectedVehicle.supportsBidding ? 'bidding' : 'normal',
        pricingNegotiationMode: selectedVehicle.supportsBidding
          ? shouldUseDriverBidding
            ? 'driver_bid'
            : 'user_increment_only'
          : 'none',
        bidStepAmount: selectedBidStepAmount,
        bidFloorFare: selectedBidFloorFare,
        bidCeilingMaxFare: selectedBidCeilingMaxFare,
        userMaxBidFare: selectedVehicle.supportsBidding && shouldUseDriverBidding ? selectedBidCeiling : finalFare,
        bidIncrement: selectedVehicle.supportsBidding && shouldUseDriverBidding ? selectedBidIncrement : 0,
        estimatedDistanceMeters: tripMetrics.distanceMeters,
        estimatedDurationMinutes: tripMetrics.durationMinutes,
        rideMode,
        preferences: selectedPreferences,
        bookedFor: rideFor.mode === 'other' && rideFor.name.trim() && rideFor.phone.trim()
          ? { name: rideFor.name.trim(), phone: rideFor.phone.trim() }
          : null,
        scheduledAt: rideMode === 'schedule' ? parseLocalDateTime(scheduledAt).toISOString() : null,
        allowedPaymentMethods,
        searchNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
  };

  const handleBook = () => {
    if (!selectedVehicle) {
      return;
    }

    if (rideMode === 'schedule') {
      const parsedSchedule = parseLocalDateTime(scheduledAt);

      if (!scheduledAt || Number.isNaN(parsedSchedule.getTime())) {
        setScheduleError('Choose a valid schedule date and time.');
        return;
      }

      if (parsedSchedule.getTime() <= Date.now() + 60 * 1000) {
        setScheduleError('Schedule time must be at least 1 minute ahead.');
        return;
      }

      // checked against the clock NOW, not when the page opened
      if (scheduledAt < getMinScheduledDateTime(scheduleLeadMinutes)) {
        setScheduleError(`Rides can be scheduled at least ${scheduleLeadMinutes} minutes ahead. Please pick a later time.`);
        return;
      }

      if (scheduledAt > maxScheduledAt) {
        setScheduleError('Advance booking is available for up to 7 days only.');
        return;
      }
    }

    setScheduleError('');

    if (selectedVehicle.supportsBidding && shouldUseDriverBidding) {
      setShowBidModal(true);
      return;
    }

    proceedToBooking();
  };

  if (!hasCompleteRideContext) {
    return (
      <Screen bg={P.card} style={s.center}>
        <SpinIcon><View style={s.bootSpinner} /></SpinIcon>
      </Screen>
    );
  }

  const category = routeState.selectedCategory ? String(routeState.selectedCategory).toLowerCase() : '';
  const categoryTone = category === 'bike'
    ? { border: colors.orange[100], text: colors.orange[600], halo: colors.orange[400], core: colors.orange[500] }
    : category === 'auto'
      ? { border: colors.emerald[100], text: colors.emerald[600], halo: colors.emerald[400], core: colors.emerald[500] }
      : { border: colors.blue[100], text: colors.blue[600], halo: colors.blue[400], core: colors.blue[500] };
  const filledStops = stops.filter((stop) => String(stop || '').trim());
  const previewCells = previewVehicle ? [
    {
      key: 'fare',
      label: 'Estimated fare',
      content: !isFarePending && !previewVehicle.supportsBidding && previewVehicle.id === selectedVehicle?.id && promoMatchesSelectedFare ? (
        <Text style={[s.previewValue, { color: colors.emerald[700] }]}>
          {formatCurrency(discountedSelectedFare)}
          <Text style={s.previewStruck}>{`  ${formatVehicleFare(previewVehicle)}`}</Text>
        </Text>
      ) : (
        <Text style={s.previewValue}>{isFarePending ? 'Calculating...' : formatVehicleFare(previewVehicle)}</Text>
      ),
    },
    { key: 'seats', label: 'Seats', content: <Text style={s.previewValue}>{previewVehicle.capacity}</Text> },
    { key: 'type', label: 'Booking type', content: <Text style={s.previewValueSm}>{formatDispatchLabel(previewVehicle)}</Text> },
    {
      key: 'availability',
      label: 'Availability',
      content: (
        <Text style={s.previewValueSm}>
          {rideMode === 'schedule'
            ? 'Can be scheduled'
            : previewAvailability.totalDrivers
              ? `${previewAvailability.totalDrivers} nearby`
              : 'Unavailable now'}
        </Text>
      ),
    },
  ] : [];

  return (
    <Screen bg={P.card} edges={[]} keyboard>
      {/* Header - a real bar instead of a button floating on the map, so it sits below the phone's status bar */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerRow}>
          <PressScale scaleTo={0.95} onPress={() => navigate(-1)} accessibilityLabel="Back" style={s.headerBack}>
            <ArrowLeft size={22} color={P.text} strokeWidth={3} />
          </PressScale>
          <View style={s.minW0}>
            <Text style={s.headerKicker}>Ride</Text>
            <Text style={s.headerTitle} numberOfLines={1}>Select Vehicle</Text>
          </View>
        </View>
      </View>

      {/* MAP STRIP */}
      <Animated.View style={[s.mapStrip, { height: mapHeight }]}>
        <VehicleMapPreview
          center={pickupPosition}
          dropPosition={dropPosition}
          stops={stops}
          drivers={onlineDrivers}
          selectedVehicle={selectedVehicle}
          isLoaded={isMapLoaded}
          loadError={mapLoadError}
        />
      </Animated.View>

      {/* BOTTOM SHEET */}
      <View style={s.sheet}>
        <View style={s.handleArea} {...handlePan.panHandlers} accessibilityRole="button" accessibilityLabel="Pull the vehicle list up or down">
          <View style={s.handleBar} />
        </View>

        <View style={s.routeBlock}>
          {routeState.selectedCategory ? (
            <View style={[s.categoryPill, { borderColor: categoryTone.border }]}>
              <PingDot halo={categoryTone.halo} core={categoryTone.core} />
              <Text style={[s.categoryText, { color: categoryTone.text }]}>Category: {routeState.selectedCategory}</Text>
            </View>
          ) : null}
          <View style={s.routeRow}>
            <View style={s.minW0}>
              <View style={s.routeInner}>
                <View style={s.routeDots}>
                  <View style={[s.routeDot, s.routeDotTop, { backgroundColor: '#7fc76d' }]} />
                  <View style={s.routeLine} />
                  <View style={[s.routeDot, { backgroundColor: '#d95c6a' }]} />
                </View>
                <View style={s.routeTexts}>
                  <Text style={s.routePickup} numberOfLines={1}>{pickup}</Text>
                  {filledStops.length > 0 ? (
                    <Text style={s.routeVia} numberOfLines={1}>Via {filledStops.join(' → ')}</Text>
                  ) : null}
                  <PressScale scaleTo={1} onPress={openLocationEditor} style={s.dropButton}>
                    <View style={s.minW0}>
                      <Text style={s.routeDrop} numberOfLines={1}>{drop}</Text>
                      {tripMetrics.distanceMeters > 0 && (
                        <View style={s.metricsRow}>
                          <View style={[s.metricChip, { backgroundColor: '#eff6ff', borderColor: '#dbeafe' }]}>
                            <Text style={[s.metricText, { color: colors.blue[600] }]}>{(tripMetrics.distanceMeters / 1000).toFixed(1)} km</Text>
                          </View>
                          <View style={[s.metricChip, { backgroundColor: '#f0fdf4', borderColor: '#dcfce7' }]}>
                            <Text style={[s.metricText, { color: colors.emerald[600] }]}>{tripMetrics.durationMinutes} mins</Text>
                          </View>
                        </View>
                      )}
                    </View>
                    <Text style={s.editText}>Edit</Text>
                  </PressScale>
                </View>
              </View>
            </View>
            <Pressable
              onPress={openSchedulePicker}
              style={[s.whenButton, rideMode === 'schedule' ? s.whenButtonOn : s.whenButtonOff]}
            >
              <Clock3 size={14} strokeWidth={2.2} color={rideMode === 'schedule' ? P.ink : P.secondary} />
              <Text style={[s.whenText, { color: rideMode === 'schedule' ? P.ink : P.secondary }]}>{rideMode === 'schedule' ? 'Later' : 'Now'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.listArea}>
          <ScrollView
            style={s.fill}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              scrollMetricsRef.current = { scrollTop: contentOffset.y, scrollHeight: contentSize.height, clientHeight: layoutMeasurement.height };
              handleScroll();
            }}
            onLayout={(event) => {
              scrollMetricsRef.current = { ...scrollMetricsRef.current, clientHeight: event.nativeEvent.layout.height };
            }}
            onContentSizeChange={(_w, height) => {
              scrollMetricsRef.current = { ...scrollMetricsRef.current, scrollHeight: height };
            }}
          >
            {isInitialVehicleResultsLoading && (
              <View style={s.loadingState}>
                <SpinIcon><LoaderCircle size={26} color={P.secondary} /></SpinIcon>
                <Text style={s.loadingText}>Finding available rides</Text>
              </View>
            )}

            {!isInitialVehicleResultsLoading && vehicleLoadError ? (
              <View style={[s.stateCard, { borderColor: colors.red[50] }]}>
                <Text style={s.errorTitle}>{vehicleLoadError}</Text>
                <Text style={s.stateSub}>Please try again later.</Text>
              </View>
            ) : null}

            {!isInitialVehicleResultsLoading && !vehicleLoadError && displayedVehicles.length === 0 && (
              <View style={s.stateCard}>
                {vehicles.length > 0 && rideMode !== 'schedule' ? (
                  <>
                    <Text style={s.stateTitle}>No drivers available nearby</Text>
                    <Text style={s.stateSub}>All drivers are offline or busy right now. Please try again in a moment.</Text>
                  </>
                ) : (
                  <>
                    <Text style={s.stateTitle}>No vehicles available</Text>
                    <Text style={s.stateSub}>Try changing your location or method.</Text>
                  </>
                )}
              </View>
            )}

            {!isInitialVehicleResultsLoading && !vehicleLoadError && displayedVehicles.map((v, i) => {
              const isSelected = selected === v.id;
              const availability = availabilityByVehicleId[v.id] || DEFAULT_AVAILABILITY;
              const isUnavailable = !availability.totalDrivers;
              const compactEta = Math.max(
                1,
                availability.closestDriverEtaMinutes || tripMetrics.durationMinutes || 1,
              );
              const fareLabel = isFarePending
                ? '...'
                : formatVehicleFare(v);
              // Coupon applied: the selected card shows the old fare struck through and the fare after the discount.
              const showPromoFare = isSelected && !isFarePending && !v.supportsBidding && promoMatchesSelectedFare;
              const sublabel = isUnavailable && rideMode !== 'schedule'
                ? `No nearby ${v.name.toLowerCase()} drivers`
                : v.sublabel;

              return (
                <VehicleCardEntrance key={v.id} index={i} style={[s.vehicleCard, isSelected ? s.vehicleCardSelected : s.vehicleCardIdle]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      vehiclePickedByUserRef.current = true;
                      setSelected(v.id);
                    }}
                    style={s.vehicleRow}
                  >
                    <View style={s.vehicleIconCol}>
                      <View style={s.vehicleIconBox}>
                        <AppImage src={v.icon} fallback={CarIcon} style={s.vehicleIcon} contentFit="contain" />
                      </View>
                      <Text style={s.vehicleEta}>{compactEta} min</Text>
                    </View>

                    <View style={s.minW0}>
                      <View style={s.vehicleTop}>
                        <View style={s.minW0}>
                          <Text style={s.vehicleName} numberOfLines={1}>{v.name}</Text>
                          <Text
                            style={[s.vehicleSub, { color: isUnavailable && rideMode !== 'schedule' ? colors.rose[500] : P.secondary }]}
                            numberOfLines={1}
                          >
                            {sublabel}
                          </Text>
                        </View>
                        <View style={s.vehicleRight}>
                          {showPromoFare ? (
                            <>
                              <Text style={s.fareStruck}>{fareLabel}</Text>
                              <Text style={[s.fare, s.fareDiscounted]}>{formatCurrency(discountedSelectedFare)}</Text>
                            </>
                          ) : (
                            <Text style={s.fare}>{fareLabel}</Text>
                          )}
                          {!isFarePending && Number(v.surgePercent) > 0 ? (
                            <View style={s.surgePill}>
                              <Text style={s.surgeText}>Surge +{v.surgePercent}%</Text>
                            </View>
                          ) : null}
                          {isSelected && (
                            <View style={s.eyeRow}>
                              <Pressable
                                hitSlop={6}
                                onPress={() => setPreviewVehicleId(v.id)}
                                style={s.eyeButton}
                                accessibilityLabel={`View details for ${v.name}`}
                              >
                                <Eye size={12} strokeWidth={2.4} color={P.muted} />
                              </Pressable>
                            </View>
                          )}
                        </View>
                      </View>

                      {isSelected && (
                        <View style={s.mt2}>
                          <Text style={s.availabilityText} numberOfLines={1}>
                            {rideMode === 'schedule'
                              ? `Scheduled for ${formatScheduledDisplay(scheduledAt)}`
                              : isUnavailable
                                ? 'Unavailable right now'
                                : formatAvailabilityLine(availability)}
                          </Text>
                          {driverLoadError ? (
                            <Text style={s.driverError}>{driverLoadError}</Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                  </Pressable>

                  {!isSelected && i < displayedVehicles.length - 1 && (
                    <View style={s.vehicleSeparator} />
                  )}
                </VehicleCardEntrance>
              );
            })}
          </ScrollView>
          <ScrollIndicator show={showScrollArrow} />
        </View>

        <View style={[s.footer, { paddingBottom: insets.bottom + 10 }]}>
          <View style={s.optionsBar}>
            <Pressable onPress={() => setShowPaymentModal(true)} style={[s.optionCell, s.optionDivider]}>
              <Banknote size={15} strokeWidth={2.2} color={colors.green[600]} />
              <Text style={s.optionText}>{paymentMethod === 'Cash' ? 'Cash' : 'Online'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowCouponModal(true)} style={[s.optionCell, s.optionDivider]}>
              <TicketPercent size={14} strokeWidth={2.3} color={appliedPromo ? colors.emerald[600] : P.muted} />
              <Text style={[s.optionText, appliedPromo && { color: colors.emerald[700] }]} numberOfLines={1}>
                {appliedPromo?.promo?.code || chosenPromoCode || (availablePromos.length ? `Coupon ${availablePromos.length}` : 'Coupon')}
              </Text>
            </Pressable>
            <Pressable onPress={() => { setRideForDraft(rideFor); setShowRideForModal(true); }} style={s.optionCell}>
              <View style={s.rideForDot}>
                <Text style={s.rideForDotText}>{rideFor.mode === 'other' ? '+' : '•'}</Text>
              </View>
              <Text style={[s.optionText, s.flexShrink]} numberOfLines={1}>{rideFor.mode === 'other' && rideFor.name ? rideFor.name : 'Myself'}</Text>
            </Pressable>
          </View>

          {(appliedPromo || promoError || promoFeedback) ? (
            <View style={[s.promoBox, { borderColor: promoError ? colors.rose[100] : colors.emerald[100] }]}>
              {appliedPromo && !promoError ? (
                <View style={s.promoRow}>
                  <View style={s.minW0}>
                    <Text style={s.promoApplied} numberOfLines={1}>{appliedPromo.promo?.code} applied for this zone</Text>
                    <Text style={s.promoSave}>
                      Save {formatCurrency(appliedPromoDiscount)}. Fare now {formatCurrency(discountedSelectedFare)}.
                    </Text>
                  </View>
                  <Pressable hitSlop={6} onPress={() => clearAppliedPromo('Coupon removed.')}>
                    <Text style={s.promoRemove}>Remove</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={[s.promoMessage, { color: promoError ? colors.rose[600] : colors.emerald[700] }]}>
                  {promoError || promoFeedback}
                </Text>
              )}
            </View>
          ) : null}

          {selectedVehicle && Array.isArray(selectedVehicle.preferences) && selectedVehicle.preferences.length > 0 ? (
            <View style={s.prefsWrap}>
              <Text style={s.prefsLabel}>Your preferences (optional)</Text>
              <View style={s.prefsRow}>
                {selectedVehicle.preferences.map((pref) => {
                  const active = selectedPreferences.includes(pref.name);
                  return (
                    <Pressable
                      key={pref.id || pref.name}
                      onPress={() => setSelectedPreferences((current) => (active ? current.filter((item) => item !== pref.name) : [...current, pref.name]))}
                      style={[s.prefChip, active ? s.prefChipOn : s.prefChipOff]}
                    >
                      <Text style={[s.prefChipText, { color: active ? P.ink : P.secondary }]}>{active ? '✓ ' : ''}{pref.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <PendingCancellationDueNotice style={s.mt3} />

          <PressScale
            disabled={!canProceed}
            onPress={handleBook}
            style={[s.bookButton, canProceed ? s.bookButtonOn : s.bookButtonOff]}
          >
            <Text style={[s.bookText, { color: canProceed ? '#ffffff' : P.secondary }]}>
              {isSelectedVehicleListed
                ? isFarePending
                  ? 'Calculating fare...'
                  : selectedVehicle.supportsBidding && shouldUseDriverBidding
                    ? `Request Bid for ${bookButtonName}`
                    : rideMode === 'schedule'
                      ? `Schedule ${bookButtonName}`
                      : `Book ${bookButtonName}`
                : 'Select Vehicle'}
            </Text>
          </PressScale>

          {rideMode === 'schedule' ? (
            scheduleError ? (
              <Text style={[s.scheduleNote, { color: colors.rose[500] }]}>{scheduleError}</Text>
            ) : (
              <Text style={[s.scheduleNote, { color: P.muted }]}>
                Scheduled for {formatScheduledDisplay(scheduledAt)}.
              </Text>
            )
          ) : null}
        </View>
      </View>

      {/* Vehicle details */}
      <Sheet open={Boolean(previewVehicle)} onClose={() => setPreviewVehicleId('')} style={s.modal}>
        {previewVehicle ? (
          <View style={s.modalBody8}>
            <View style={s.modalHandle} />
            <View style={s.previewTop}>
              <View style={s.flexShrink}>
                <Text style={[s.modalKicker, { color: P.accent }]}>Vehicle details</Text>
                <Text style={s.previewName}>{previewVehicle.name}</Text>
                <Text style={s.modalSub}>{previewVehicle.sublabel || 'Comfortable ride option for this route.'}</Text>
              </View>
              <View style={s.previewImageBox}>
                <AppImage src={previewVehicle.icon} fallback={CarIcon} style={s.previewImage} contentFit="contain" />
              </View>
            </View>

            <View style={s.previewGrid}>
              {[previewCells.slice(0, 2), previewCells.slice(2, 4)].map((row, rowIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <View key={rowIndex} style={s.previewGridRow}>
                  {row.map((cell) => (
                    <View key={cell.key} style={s.previewCell}>
                      <Text style={s.previewLabel}>{cell.label}</Text>
                      {cell.content}
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {Array.isArray(previewVehicle.preferences) && previewVehicle.preferences.length > 0 ? (
              <View style={s.mt4}>
                <Text style={s.previewLabelPlain}>Vehicle preferences</Text>
                <View style={s.previewPrefs}>
                  {previewVehicle.preferences.map((pref) => (
                    <View key={pref.id || pref.name} style={s.previewPref}>
                      {pref.icon ? <AppImage src={pref.icon} style={s.previewPrefIcon} contentFit="contain" /> : null}
                      <Text style={s.previewPrefText}>{pref.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={s.snapshot}>
              <Text style={[s.previewLabelPlain, { color: P.accent }]}>Trip snapshot</Text>
              <Text style={s.snapshotText}>
                {rideMode === 'schedule'
                  ? 'This vehicle can be reserved for a later trip at your chosen time.'
                  : previewAvailability.totalDrivers
                    ? formatAvailabilityLine(previewAvailability)
                    : 'No driver is currently online for this vehicle around your pickup.'}
              </Text>
            </View>

            <Pressable onPress={() => setPreviewVehicleId('')} style={s.closeButton}>
              <Text style={s.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>

      {/* Bid fare */}
      <Sheet open={Boolean(showBidModal && selectedVehicle?.supportsBidding && shouldUseDriverBidding)} onClose={() => setShowBidModal(false)} style={s.modal}>
        {selectedVehicle ? (
          <View style={s.modalBody10}>
            <View style={s.modalHandle} />
            <Text style={[s.modalKicker, { color: P.accent }]}>Bid fare</Text>
            <Text style={s.modalTitle}>Choose your max fare</Text>
            <Text style={s.modalSub}>Drivers can send offers up to this amount for {selectedVehicle.name}.</Text>

            <View style={s.bidBox}>
              <View style={s.bidHead}>
                <View style={s.flexShrink}>
                  <Text style={[s.previewLabelPlain, { color: P.accent }]}>Bid Range</Text>
                  <Text style={s.bidHint}>Adjust the fare ceiling inside the admin-configured bidding range.</Text>
                </View>
                <View style={s.alignEnd}>
                  <Text style={s.previewLabelPlain}>Max fare</Text>
                  <Text style={s.bidMax}>{formatCurrency(selectedBidCeiling)}</Text>
                </View>
              </View>

              <Slider
                style={s.slider}
                minimumValue={0}
                maximumValue={Math.max(0, selectedBidSteps)}
                step={1}
                value={Math.min(bidStepCount, selectedBidSteps)}
                onValueChange={(value) => setBidStepCount(Number(value || 0))}
                minimumTrackTintColor={colors.orange[500]}
                thumbTintColor={colors.orange[500]}
                maximumTrackTintColor={P.soft}
              />

              <View style={s.bidBounds}>
                <Text style={s.bidBoundText}>Floor {formatCurrency(selectedBidFloorFare)}</Text>
                <Text style={s.bidBoundText}>Ceiling {formatCurrency(selectedBidCeilingMaxFare)}</Text>
              </View>
            </View>

            <View style={s.bidActions}>
              <Pressable onPress={() => setShowBidModal(false)} style={s.bidCancel}>
                <Text style={s.bidCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={proceedToBooking} style={s.bidSend}>
                <Text style={s.bidSendText}>Send Bid</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Sheet>

      {/* Coupons */}
      <Sheet open={showCouponModal} onClose={() => setShowCouponModal(false)} style={s.modal}>
        <View style={s.modalBody8}>
          <View style={s.modalHandle} />
          <Text style={[s.modalKicker, { color: colors.emerald[500] }]}>Coupons</Text>
          <Text style={s.modalTitle}>Apply for this zone</Text>
          <Text style={s.modalSub}>Only coupons created for this service location show here.</Text>

          <View style={s.couponInputRow}>
            <TextInput
              value={promoCodeInput}
              onChangeText={(value) => {
                setPromoCodeInput(value.toUpperCase());
                setPromoError('');
                setPromoFeedback('');
              }}
              onFocus={() => setFocusedField('coupon')}
              onBlur={() => setFocusedField('')}
              autoCapitalize="characters"
              placeholder="Enter coupon code"
              style={[s.couponInput, focusedField === 'coupon' && s.inputFocused]}
            />
            <Pressable
              disabled={Boolean(applyingPromoCode) || !selectedVehicle}
              onPress={async () => {
                const applied = await applyPromoCode(promoCodeInput);
                if (applied) {
                  setShowCouponModal(false);
                }
              }}
              style={[s.applyButton, (Boolean(applyingPromoCode) || !selectedVehicle) && s.disabled60]}
            >
              <Text style={s.applyButtonText}>{applyingPromoCode ? 'Applying' : 'Apply'}</Text>
            </Pressable>
          </View>

          {(promoError || promoFeedback) ? (
            <Text style={[s.couponFeedback, { color: promoError ? colors.rose[500] : colors.emerald[600] }]}>
              {promoError || promoFeedback}
            </Text>
          ) : null}

          <ScrollView style={[s.couponList, { maxHeight: windowHeight * 0.46 }]} contentContainerStyle={s.gap2} keyboardShouldPersistTaps="handled">
            {isLoadingPromos ? (
              <View style={s.couponLoading}>
                <SpinIcon><LoaderCircle size={16} color={P.muted} /></SpinIcon>
                <Text style={s.couponLoadingText}>Loading available coupons</Text>
              </View>
            ) : availablePromos.length ? (
              availablePromos.map((promo) => {
                const isApplied = String(appliedPromo?.promo?.code || '').toUpperCase() === String(promo?.code || '').toUpperCase();

                return (
                  <View key={promo?._id || promo?.code} style={[s.promoCard, { borderColor: isApplied ? colors.emerald[200] : P.border }]}>
                    <View style={s.promoRow}>
                      <View style={s.minW0}>
                        <View style={s.promoCodeRow}>
                          <Text style={s.promoCode} numberOfLines={1}>{promo?.code}</Text>
                          {isApplied && <CheckCircle2 size={14} color={colors.emerald[600]} strokeWidth={2.6} />}
                        </View>
                        <Text style={s.promoSummary}>{formatPromoSummary(promo)}</Text>
                      </View>
                      <Pressable
                        disabled={Boolean(applyingPromoCode)}
                        onPress={async () => {
                          const applied = await applyPromoCode(promo?.code);
                          if (applied) {
                            setShowCouponModal(false);
                          }
                        }}
                        style={[s.useButton, isApplied ? s.useButtonApplied : s.useButtonIdle, Boolean(applyingPromoCode) && s.disabled60]}
                      >
                        <Text style={s.useButtonText}>
                          {applyingPromoCode === String(promo?.code || '').toUpperCase() ? 'Applying' : isApplied ? 'Applied' : 'Use'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={s.couponEmpty}>
                <Text style={s.couponLoadingText}>No coupons are active for this zone right now.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Sheet>

      {/* Who is travelling */}
      <Sheet open={showRideForModal} onClose={() => setShowRideForModal(false)} style={s.modal}>
        <View style={s.modalBody8}>
          <View style={[s.modalHandle, s.mb4]} />
          <Text style={s.modalTitle}>Who is travelling?</Text>
          <View style={s.rideForOptions}>
            {[{ id: 'self', label: 'Myself' }, { id: 'other', label: 'Someone else' }].map((option) => (
              <Pressable
                key={option.id}
                onPress={() => setRideForDraft((current) => ({ ...current, mode: option.id }))}
                style={[s.rideForOption, rideForDraft.mode === option.id ? s.rideForOptionOn : s.rideForOptionOff]}
              >
                <Text style={[s.rideForOptionText, { color: rideForDraft.mode === option.id ? P.ink : P.secondary }]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          {rideForDraft.mode === 'other' ? (
            <View style={s.rideForInputs}>
              <TextInput
                value={rideForDraft.name}
                onChangeText={(value) => setRideForDraft((current) => ({ ...current, name: value.slice(0, 40) }))}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField('')}
                placeholder="Passenger name"
                style={[s.rideForInput, focusedField === 'name' && s.inputFocused]}
              />
              <TextInput
                value={rideForDraft.phone}
                onChangeText={(value) => setRideForDraft((current) => ({ ...current, phone: value.replace(/\D/g, '').slice(-10) }))}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField('')}
                placeholder="Passenger mobile number"
                keyboardType="phone-pad"
                style={[s.rideForInput, focusedField === 'phone' && s.inputFocused]}
              />
              <Text style={s.rideForNote}>The driver sees this name and number, so they can call the person who is travelling.</Text>
            </View>
          ) : null}
          <Pressable
            disabled={rideForDraft.mode === 'other' && (!rideForDraft.name.trim() || rideForDraft.phone.length !== 10)}
            onPress={() => { setRideFor(rideForDraft.mode === 'other' ? rideForDraft : { mode: 'self', name: '', phone: '' }); setShowRideForModal(false); }}
            style={[s.doneButton, rideForDraft.mode === 'other' && (!rideForDraft.name.trim() || rideForDraft.phone.length !== 10) && s.disabled40]}
          >
            <Text style={s.doneButtonText}>Done</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* Payment */}
      <Sheet open={showPaymentModal} onClose={() => setShowPaymentModal(false)} style={s.modal}>
        <View style={s.modalBody10}>
          <View style={s.modalHandle} />
          <Text style={[s.modalKicker, { color: P.secondary }]}>Payment</Text>
          <Text style={[s.modalTitle, s.mb5]}>Select Method</Text>
          <View style={s.paymentList}>
            {paymentOptions.map(({ stateValue, label, sub, Icon, bg, color }) => (
              <PressScale
                key={stateValue}
                onPress={() => {
                  setPaymentMethod(stateValue);
                  setShowPaymentModal(false);
                }}
                style={[s.paymentOption, paymentMethod === stateValue ? s.paymentOptionOn : s.paymentOptionOff]}
              >
                <View style={[s.paymentIcon, { backgroundColor: bg === 'green50' ? colors.green[50] : P.soft }]}>
                  <Icon size={18} color={color} strokeWidth={2} />
                </View>
                <View style={s.flex1}>
                  <Text style={s.paymentLabel}>{label}</Text>
                  <Text style={s.paymentSub}>{sub}</Text>
                </View>
                {paymentMethod === stateValue && (
                  <View style={s.paymentCheck}>
                    <Svg width={8} height={6} viewBox="0 0 8 6" fill="none">
                      <Path d="M1 3L3 5L7 1" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>
                )}
              </PressScale>
            ))}
          </View>
        </View>
      </Sheet>
    </Screen>
  );
};

// Taxi customer palette (Taxi/index.css --user-* variables, light / dark). The `.user-app-theme` overrides map the
// screen's Tailwind classes onto it: bg-white / bg-slate-50 / bg-slate-950 -> card, tinted 50/100 backgrounds -> card-soft,
// text-slate-900 / text-white -> text, text-slate-400/600/700 -> secondary, text-slate-500 -> muted, light borders ->
// border, text-orange-500 -> accent, button.bg-slate-900 -> accent button with dark ink; font-black -> 700, bold -> 600.
const taxiPalette = (t) => (t.dark
  ? { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', secondary: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)', accent: '#FFC400', ink: '#0B1220' }
  : { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', secondary: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)', accent: '#FFC400', ink: '#0B1220' });

const themeShadow = { elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  circleMarkerPad: { padding: 6 },
  circleMarker: {
    borderWidth: 2, elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 3 },
  },
  vehicleShell: { alignItems: 'center', justifyContent: 'center' },
  vehiclePulse: { position: 'absolute', borderWidth: 1, borderColor: alpha(colors.emerald[500], 0.35), backgroundColor: alpha(colors.emerald[400], 0.1), opacity: 0.6 },
  pingWrap: { width: 6, height: 6, alignItems: 'center', justifyContent: 'center' },
  pingDot: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
});

const useStyles = makeStyles((t) => {
  const P = taxiPalette(t);
  return {
    fill: { flex: 1 },
    flex1: { flex: 1 },
    flexShrink: { flexShrink: 1 },
    minW0: { flex: 1, minWidth: 0 },
    center: { alignItems: 'center', justifyContent: 'center' },
    alignEnd: { alignItems: 'flex-end' },
    fillHidden: { flex: 1, overflow: 'hidden' },
    mt2: { marginTop: sp(2) },
    mt3: { marginTop: sp(3) },
    mt4: { marginTop: sp(4) },
    mb4: { marginBottom: sp(4) },
    mb5: { marginBottom: sp(5) },
    gap2: { gap: sp(2) },
    disabled60: { opacity: 0.6 },
    disabled40: { opacity: 0.4 },
    bootSpinner: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: colors.slate[300], borderTopColor: colors.slate[700] },

    // header
    header: {
      zIndex: 50, backgroundColor: P.card, borderBottomWidth: 1, borderBottomColor: P.border,
      elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 10 },
    },
    headerRow: { paddingHorizontal: sp(5), paddingVertical: sp(3.5), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
    headerBack: { padding: sp(2), marginLeft: -sp(2), borderRadius: 999 },
    headerKicker: { fontSize: 10, lineHeight: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: P.secondary },
    headerTitle: { marginTop: 2, fontSize: 20, lineHeight: 20, fontWeight: '600', color: P.text, letterSpacing: -0.5 },

    // map
    mapStrip: { width: '100%', backgroundColor: P.soft },
    mapState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: P.soft, paddingHorizontal: sp(6) },
    mapStateCard: { borderRadius: 18, backgroundColor: P.card, paddingHorizontal: sp(4), paddingVertical: sp(4), alignItems: 'center', ...themeShadow },
    mapStateTitle: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: P.text, textAlign: 'center' },
    mapStateText: { marginTop: sp(1), fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: P.muted, textAlign: 'center' },
    mapLoadingPill: { flexDirection: 'row', alignItems: 'center', gap: sp(2), borderRadius: 16, backgroundColor: P.card, paddingHorizontal: sp(4), paddingVertical: sp(3), ...themeShadow },
    mapLoadingText: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: P.secondary },
    routeErrorBox: {
      position: 'absolute', bottom: sp(8), left: sp(4), borderRadius: 12, borderWidth: 1, borderColor: colors.amber[100], backgroundColor: P.card,
      paddingHorizontal: sp(3), paddingVertical: sp(2), ...themeShadow,
    },
    routeErrorKicker: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: P.accent },
    routeErrorText: { fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: P.secondary },

    // sheet
    sheet: {
      zIndex: 40, marginTop: -20, flex: 1, minHeight: 0, overflow: 'hidden', borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: P.card,
      elevation: 16, shadowColor: '#0f172a', shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: -12 },
    },
    handleArea: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: sp(2.5) },
    handleBar: { height: 6, width: 48, borderRadius: 3, backgroundColor: P.soft },
    routeBlock: { borderBottomWidth: 1, borderBottomColor: P.border, paddingHorizontal: sp(4), paddingBottom: sp(3) },
    categoryPill: {
      alignSelf: 'flex-start', marginBottom: sp(2), flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1,
      paddingHorizontal: sp(2.5), paddingVertical: 2, backgroundColor: P.soft,
    },
    categoryText: { fontSize: 10.5, lineHeight: 15.75, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.525 },
    routeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: sp(3) },
    routeInner: { flexDirection: 'row', gap: sp(3) },
    routeDots: { width: 10, alignItems: 'center' },
    routeDot: { width: 10, height: 10, borderRadius: 5 },
    routeDotTop: { marginTop: 6 },
    routeLine: { marginVertical: 4, height: 24, width: 1, backgroundColor: P.soft },
    routeTexts: { flex: 1, minWidth: 0, gap: sp(3) },
    routePickup: { paddingTop: 2, fontSize: 13, lineHeight: 19.5, fontWeight: '500', color: P.secondary },
    routeVia: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: colors.amber[700] },
    dropButton: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, marginHorizontal: -4, paddingHorizontal: 4, paddingVertical: 4 },
    routeDrop: { fontSize: 13, lineHeight: 19.5, fontWeight: '500', color: P.secondary },
    metricsRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: sp(2) },
    metricChip: { borderWidth: 1, paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 8 },
    metricText: { fontSize: 10, lineHeight: 15, fontWeight: '600' },
    editText: { flexShrink: 0, marginTop: 2, fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: P.secondary },
    whenButton: { width: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 4, paddingVertical: sp(2) },
    whenButtonOn: { borderColor: colors.slate[900], backgroundColor: P.accent },
    whenButtonOff: { borderColor: P.border, backgroundColor: P.card },
    whenText: { marginTop: 4, fontSize: 10, lineHeight: 15, fontWeight: '500' },

    // list
    listArea: { flex: 1, minHeight: 0, overflow: 'hidden' },
    listContent: { paddingHorizontal: sp(3), paddingTop: sp(3), paddingBottom: sp(2), gap: sp(2.5) },
    loadingState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: sp(3) },
    loadingText: { fontSize: 11, lineHeight: 16.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1, color: P.secondary },
    stateCard: { borderRadius: 18, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, paddingHorizontal: sp(4), paddingVertical: sp(5), alignItems: 'center' },
    errorTitle: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: colors.red[500], textAlign: 'center' },
    stateTitle: { fontSize: 13, lineHeight: 19.5, fontWeight: '600', color: P.text, textAlign: 'center' },
    stateSub: { marginTop: sp(1), fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: P.secondary, textAlign: 'center' },
    vehicleCard: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, backgroundColor: P.card },
    vehicleCardSelected: {
      borderColor: P.border, elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 6 },
    },
    vehicleCardIdle: { borderColor: 'transparent' },
    vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingHorizontal: sp(3), paddingVertical: sp(3) },
    vehicleIconCol: { width: 52, flexShrink: 0, alignItems: 'center' },
    vehicleIconBox: { height: 36, width: '100%', alignItems: 'center', justifyContent: 'center' },
    vehicleIcon: { height: 32, width: 48 },
    vehicleEta: { marginTop: 4, fontSize: 10, lineHeight: 15, fontWeight: '500', color: P.muted },
    vehicleTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3) },
    vehicleName: { fontSize: 14, lineHeight: 17.5, fontWeight: '600', color: P.text },
    vehicleSub: { marginTop: 2, fontSize: 11, lineHeight: 16.5, fontWeight: '500' },
    vehicleRight: { flexShrink: 0, alignItems: 'flex-end' },
    fare: { fontSize: 20, lineHeight: 20, fontWeight: '600', color: P.text, textAlign: 'right' },
    fareStruck: { fontSize: 12, lineHeight: 12, fontWeight: '500', color: P.secondary, textDecorationLine: 'line-through', textAlign: 'right' },
    fareDiscounted: { marginTop: 4, color: colors.emerald[700] },
    surgePill: { marginTop: 4, borderRadius: 999, backgroundColor: P.soft, paddingHorizontal: sp(2), paddingVertical: 2 },
    surgeText: { fontSize: 10, lineHeight: 15, fontWeight: '600', color: colors.orange[600] },
    eyeRow: { marginTop: 4, flexDirection: 'row', justifyContent: 'flex-end', gap: sp(2) },
    eyeButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: P.border, backgroundColor: P.card },
    availabilityText: { fontSize: 11, lineHeight: 16.5, fontWeight: '500', color: P.muted },
    driverError: { marginTop: 4, fontSize: 10, lineHeight: 15, fontWeight: '500', color: colors.rose[500] },
    vehicleSeparator: { marginLeft: 68, borderBottomWidth: 1, borderBottomColor: P.border },
    scrollIndicator: { position: 'absolute', bottom: sp(3), left: 0, right: 0, zIndex: 50, alignItems: 'center' },
    scrollIndicatorBubble: {
      width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, alignItems: 'center', justifyContent: 'center',
      elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 4 },
    },

    // footer
    footer: { borderTopWidth: 1, borderTopColor: P.border, backgroundColor: P.card, paddingHorizontal: sp(3), paddingTop: sp(2.5) },
    optionsBar: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, overflow: 'hidden' },
    optionCell: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2), paddingHorizontal: sp(3), paddingVertical: sp(2.5) },
    optionDivider: { borderRightWidth: 1, borderRightColor: P.border },
    optionText: { fontSize: 12, lineHeight: 18, fontWeight: '500', color: P.secondary },
    rideForDot: { width: 16, height: 16, flexShrink: 0, borderRadius: 8, backgroundColor: P.soft, alignItems: 'center', justifyContent: 'center' },
    rideForDotText: { fontSize: 10, lineHeight: 12, color: P.secondary },
    promoBox: { marginTop: sp(2), borderRadius: 12, borderWidth: 1, backgroundColor: P.soft, paddingHorizontal: sp(3), paddingVertical: sp(2) },
    promoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3) },
    promoApplied: { fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: colors.emerald[700] },
    promoSave: { marginTop: 2, fontSize: 10, lineHeight: 15, fontWeight: '500', color: alpha(colors.emerald[700], 0.8) },
    promoRemove: { fontSize: 10, lineHeight: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.25, color: colors.emerald[700] },
    promoMessage: { fontSize: 10, lineHeight: 15, fontWeight: '500' },
    prefsWrap: { marginTop: sp(2.5) },
    prefsLabel: { fontSize: 10, lineHeight: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: P.secondary },
    prefsRow: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    prefChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: sp(3), paddingVertical: 6 },
    prefChipOn: { borderColor: colors.slate[900], backgroundColor: P.accent },
    prefChipOff: { borderColor: P.border, backgroundColor: P.card },
    prefChipText: { fontSize: 11, lineHeight: 16.5, fontWeight: '600' },
    bookButton: { marginTop: sp(3), width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: sp(4), paddingVertical: sp(3.5) },
    bookButtonOn: { backgroundColor: '#1f1f1f' },
    bookButtonOff: { backgroundColor: P.soft },
    bookText: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
    scheduleNote: { marginTop: sp(2), fontSize: 11, lineHeight: 16.5, fontWeight: '500' },

    // bottom sheets (modals)
    modal: { backgroundColor: P.card, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
    modalBody8: { paddingHorizontal: sp(5), paddingTop: sp(4), paddingBottom: sp(8) },
    modalBody10: { paddingHorizontal: sp(5), paddingTop: sp(4), paddingBottom: sp(10) },
    modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: P.soft, alignSelf: 'center', marginBottom: sp(5) },
    modalKicker: { fontSize: 10, lineHeight: 15, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    modalTitle: { fontSize: 18, lineHeight: 27, fontWeight: '600', color: P.text },
    modalSub: { marginTop: 4, fontSize: 12, lineHeight: 18, fontWeight: '600', color: P.muted },
    previewTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(4) },
    previewName: { fontSize: 20, lineHeight: 30, fontWeight: '700', color: P.text },
    previewImageBox: { width: 64, height: 64, borderRadius: 18, backgroundColor: P.card, alignItems: 'center', justifyContent: 'center' },
    previewImage: { width: 56, height: 48 },
    previewGrid: { marginTop: sp(5), gap: sp(3) },
    previewGridRow: { flexDirection: 'row', gap: sp(3) },
    previewCell: { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: P.border, backgroundColor: P.soft, paddingHorizontal: sp(4), paddingVertical: sp(3) },
    previewLabel: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4, color: P.secondary },
    previewLabelPlain: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4, color: P.secondary },
    previewValue: { marginTop: 4, fontSize: 17, lineHeight: 25.5, fontWeight: '700', color: P.text },
    previewValueSm: { marginTop: 4, fontSize: 14, lineHeight: 21, fontWeight: '700', color: P.text },
    previewStruck: { fontSize: 12, fontWeight: '500', color: P.secondary, textDecorationLine: 'line-through' },
    previewPrefs: { marginTop: sp(2), flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
    previewPref: {
      flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: P.border, backgroundColor: P.card,
      paddingHorizontal: sp(3), paddingVertical: 6,
    },
    previewPrefIcon: { width: 16, height: 16, borderRadius: 4 },
    previewPrefText: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: P.secondary },
    snapshot: { marginTop: sp(4), borderRadius: 20, borderWidth: 1, borderColor: colors.orange[100], backgroundColor: P.soft, paddingHorizontal: sp(4), paddingVertical: sp(4) },
    snapshotText: { marginTop: sp(2), fontSize: 12, lineHeight: 20, fontWeight: '600', color: P.secondary },
    closeButton: { marginTop: sp(5), width: '100%', borderRadius: 18, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, paddingHorizontal: sp(4), paddingVertical: sp(3), alignItems: 'center' },
    closeButtonText: { fontSize: 13, lineHeight: 19.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.82, color: P.secondary },
    bidBox: { marginTop: sp(5), borderRadius: 20, borderWidth: 1, borderColor: colors.orange[100], backgroundColor: P.soft, paddingHorizontal: sp(4), paddingVertical: sp(4) },
    bidHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3) },
    bidHint: { marginTop: 4, fontSize: 13, lineHeight: 19.5, fontWeight: '600', color: P.text },
    bidMax: { marginTop: 4, fontSize: 20, lineHeight: 30, fontWeight: '700', color: P.text },
    slider: { marginTop: sp(4), width: '100%', height: 24 },
    bidBounds: { marginTop: sp(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    bidBoundText: { fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: P.muted },
    bidActions: { marginTop: sp(5), flexDirection: 'row', gap: sp(3) },
    bidCancel: { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, paddingHorizontal: sp(4), paddingVertical: sp(3), alignItems: 'center' },
    bidCancelText: { fontSize: 13, lineHeight: 19.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.82, color: P.secondary },
    bidSend: {
      flex: 1, borderRadius: 18, backgroundColor: '#f8e001', paddingHorizontal: sp(4), paddingVertical: sp(3), alignItems: 'center',
      elevation: 8, shadowColor: '#f8e001', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 12 },
    },
    bidSendText: { fontSize: 13, lineHeight: 19.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.82, color: P.ink },
    couponInputRow: { marginTop: sp(5), flexDirection: 'row', gap: sp(2) },
    couponInput: {
      flex: 1, minWidth: 0, borderRadius: 16, borderWidth: 1, borderColor: P.border, backgroundColor: P.soft, paddingHorizontal: sp(4), paddingVertical: sp(3),
      fontSize: 13, fontWeight: '600', color: P.text,
    },
    inputFocused: { borderColor: P.accent, borderWidth: 2, paddingHorizontal: sp(4) - 1, paddingVertical: sp(3) - 1 },
    applyButton: { borderRadius: 16, backgroundColor: P.card, paddingHorizontal: sp(4), paddingVertical: sp(3), alignItems: 'center', justifyContent: 'center' },
    applyButtonText: { fontSize: 12, lineHeight: 18, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.68, color: P.text },
    couponFeedback: { marginTop: sp(3), fontSize: 11, lineHeight: 16.5, fontWeight: '600' },
    couponList: { marginTop: sp(5), paddingRight: 4 },
    couponLoading: {
      flexDirection: 'row', alignItems: 'center', gap: sp(2), borderRadius: 18, borderWidth: 1, borderColor: P.border, backgroundColor: P.card,
      paddingHorizontal: sp(4), paddingVertical: sp(4),
    },
    couponLoadingText: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: P.secondary },
    couponEmpty: { borderRadius: 18, borderWidth: 1, borderColor: P.border, backgroundColor: P.card, paddingHorizontal: sp(4), paddingVertical: sp(4) },
    promoCard: { borderRadius: 18, borderWidth: 1, backgroundColor: P.soft, paddingHorizontal: sp(4), paddingVertical: sp(4) },
    promoCodeRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
    promoCode: { flexShrink: 1, fontSize: 14, lineHeight: 21, fontWeight: '700', color: P.text },
    promoSummary: { marginTop: 4, fontSize: 11, lineHeight: 16.5, fontWeight: '500', color: P.secondary },
    useButton: { flexShrink: 0, borderRadius: 999, paddingHorizontal: sp(3), paddingVertical: sp(2) },
    useButtonApplied: { backgroundColor: colors.emerald[600] },
    useButtonIdle: { backgroundColor: P.card, borderWidth: 1, borderColor: P.border },
    useButtonText: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4, color: P.text },
    rideForOptions: { marginTop: sp(4), flexDirection: 'row', gap: sp(2) },
    rideForOption: { flex: 1, borderRadius: 14, borderWidth: 1, paddingHorizontal: sp(3), paddingVertical: sp(3), alignItems: 'center' },
    rideForOptionOn: { borderColor: colors.slate[900], backgroundColor: P.accent },
    rideForOptionOff: { borderColor: P.border, backgroundColor: P.card },
    rideForOptionText: { fontSize: 13, lineHeight: 19.5, fontWeight: '600' },
    rideForInputs: { marginTop: sp(3), gap: sp(2) },
    rideForInput: {
      width: '100%', borderRadius: 14, borderWidth: 1, borderColor: P.border, backgroundColor: P.soft, paddingHorizontal: sp(4), paddingVertical: sp(3),
      fontSize: 13, fontWeight: '600', color: P.text,
    },
    rideForNote: { fontSize: 11, lineHeight: 16.5, fontWeight: '500', color: P.muted },
    doneButton: { marginTop: sp(4), width: '100%', borderRadius: 14, backgroundColor: P.accent, paddingHorizontal: sp(4), paddingVertical: sp(3.5), alignItems: 'center' },
    doneButtonText: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: P.ink },
    paymentList: { gap: sp(2.5) },
    paymentOption: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: sp(3.5), padding: sp(4), borderRadius: 18, borderWidth: 2 },
    paymentOptionOn: { borderColor: colors.orange[200], backgroundColor: alpha(colors.orange[50], 0.4) },
    paymentOptionOff: { borderColor: P.border, backgroundColor: P.soft },
    paymentIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    paymentLabel: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: P.text },
    paymentSub: { fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: P.secondary },
    paymentCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: P.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  };
});

export default SelectVehicle;
