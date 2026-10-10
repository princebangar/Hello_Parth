import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { cleanGroundAddress } from '../../utils/preciseLocation';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Contact,
  LocateFixed,
  MapPin,
  Mic,
  Navigation,
  PackageCheck,
  Phone,
  Plus,
  Search,
  User,
  X,
} from 'lucide-react';
import { GoogleMap } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../../admin/utils/googleMaps';
import { userAuthService } from '../../services/authService';
import api from '../../../../shared/api/axiosInstance';
import { computeDrivingRoute, sumComputedRouteLegs } from '../../../../shared/utils/googleRoutes';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';
import { clearParcelPickerResult, peekParcelPickerResult } from '../../utils/parcelPickerResult';
import {
  dedupePlaces,
  formatDistance,
  isAreaPlace,
  keepNearbyPredictions,
  loadAreaHints,
  loadPopularPlaces,
  nearbyAutocompleteRequest,
  withAreaHint,
} from '../../utils/nearbyPlaces';
import { loadRoadDistances } from '../../utils/preciseLocation';

const Motion = motion;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const PARCEL_BOOKING_DRAFT_KEY = 'parcelBookingDraft';
const DELIVERY_CATEGORY_SEARCH_TOKENS = {
  trucks: ['truck', 'lcv', 'hcv', 'mcv', 'loader'],
  '2wheeler': ['bike', 'scooter', 'cycle', '2-wheeler'],
  movers: ['mover', 'packers'],
};
// Only a last-resort map viewport when nothing is known yet (centre of India) - never a city.
const DEFAULT_COORDS = { lat: 20.5937, lng: 78.9629 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const unwrapResults = (response) => {
  const payload = response?.data?.data || response?.data || response;
  return payload?.results || payload?.zones || (Array.isArray(payload) ? payload : []);
};

const getZoneServiceLocationId = (zone) =>
  zone?.service_location_id?._id
  || zone?.service_location_id?.id
  || zone?.service_location_id
  || zone?.service_location?._id
  || zone?.service_location?.id
  || zone?.service_location
  || '';

const isZoneActive = (zone) => zone?.active !== false && Number(zone?.status ?? 1) !== 0;

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

const isPointInAnyZone = (point, zonePaths) => {
  if (!zonePaths.length) {
    return true;
  }

  return zonePaths.some((path) => isPointInPolygon(point, path));
};

const readStoredUserInfo = () => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.localStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const readParcelBookingDraft = () => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.sessionStorage.getItem(PARCEL_BOOKING_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
};

const coordPairToLatLng = (coords, fallback = DEFAULT_COORDS) => {
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return fallback;
};

const latLngToCoordPair = (position) => [Number(position.lng), Number(position.lat)];

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (fromCoords, toCoords) => {
  const from = coordPairToLatLng(fromCoords, null);
  const to = coordPairToLatLng(toCoords, null);

  if (!from || !to) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const normalizeDeliveryPricing = (vehicle = {}) => {
  const basePrice = Number(vehicle?.delivery_distance_pricing?.base_price ?? 0);
  const baseDistance = Number(
    vehicle?.delivery_distance_pricing?.base_distance
      ?? vehicle?.delivery_distance_pricing?.free_distance
      ?? 0,
  );
  const distancePrice = Number(vehicle?.delivery_distance_pricing?.distance_price ?? 0);
  const serviceTaxPercentage = Number(vehicle?.service_tax ?? 0);

  return {
    enabled: Boolean(
      vehicle?.delivery_distance_pricing?.enabled ||
      basePrice > 0 ||
      distancePrice > 0
    ),
    basePrice,
    baseDistance,
    distancePrice,
    serviceTaxPercentage,
  };
};

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateVehicleFare = (vehicle, distanceKm) => {
  const pricing = normalizeDeliveryPricing(vehicle);
  if (!pricing.enabled) {
    return null;
  }

  const normalizedDistanceKm = Math.max(Number(distanceKm || 0), 0);
  const extraDistanceKm = Math.max(normalizedDistanceKm - pricing.baseDistance, 0);
  const distanceCharge = extraDistanceKm * pricing.distancePrice;
  const subtotal = pricing.basePrice + distanceCharge;
  const serviceTaxAmount = (subtotal * pricing.serviceTaxPercentage) / 100;
  const total = subtotal + serviceTaxAmount;

  return {
    total: Math.max(0, roundCurrency(total)),
    subtotal: roundCurrency(subtotal),
    basePrice: pricing.basePrice,
    baseDistance: pricing.baseDistance,
    distancePrice: pricing.distancePrice,
    extraDistanceKm: roundCurrency(extraDistanceKm),
    distanceCharge: roundCurrency(distanceCharge),
    serviceTaxPercentage: roundCurrency(pricing.serviceTaxPercentage),
    serviceTaxAmount: roundCurrency(serviceTaxAmount),
  };
};

const formatCoordLabel = (coords) => {
  const position = coordPairToLatLng(coords);
  return `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
};

const formatLatLngLabel = (position) => `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
const getLatLngCacheKey = (position, precision = 5) =>
  `${Number(position?.lat || 0).toFixed(precision)},${Number(position?.lng || 0).toFixed(precision)}`;
const getCoordPairCacheKey = (coords, precision = 5) =>
  Array.isArray(coords) && coords.length >= 2
    ? `${Number(coords[1] || 0).toFixed(precision)},${Number(coords[0] || 0).toFixed(precision)}`
    : '';
const getParcelRouteCacheKey = (pickupCoords, dropCoords) =>
  `${getCoordPairCacheKey(pickupCoords)}|${getCoordPairCacheKey(dropCoords)}`;
const COORDINATE_LABEL_REGEX = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
const isCoordinateLabel = (value = '') => COORDINATE_LABEL_REGEX.test(String(value || '').trim());
const getVehicleId = (vehicle) => String(vehicle?._id || vehicle?.id || '').trim();
const isDeliveryVehicle = (vehicle) => vehicle?.active && ['delivery', 'both'].includes(String(vehicle?.transport_type || '').trim().toLowerCase());
const matchesDeliveryCategory = (vehicle, categoryId) => {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  if (!normalizedCategoryId) return false;

  const configuredCategory = String(vehicle?.delivery_category || '').trim().toLowerCase();
  if (configuredCategory) {
    return configuredCategory === normalizedCategoryId;
  }

  const searchTokens = DELIVERY_CATEGORY_SEARCH_TOKENS[normalizedCategoryId] || [];
  const vehicleName = String(vehicle?.name || '').toLowerCase();
  const iconType = String(vehicle?.icon_types || '').toLowerCase();
  return searchTokens.some((token) => vehicleName.includes(token) || iconType.includes(token));
};

const PhoneInput = ({ label, value, onChange, error, name, onClearError, disabled = false }) => (
  <div className="space-y-2">
    <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</label>
    <div
      className={`flex items-center gap-3 rounded-[18px] border p-4 transition-all ${
        error
          ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20'
          : value && PHONE_REGEX.test(value)
            ? 'border-emerald-100 bg-emerald-50 dark:border-emerald-800/40 dark:bg-slate-900/30'
            : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-slate-900/30'
      }`}
    >
      <Phone
        size={18}
        className={
          error ? 'text-red-500' : value && PHONE_REGEX.test(value) ? 'text-emerald-500' : 'text-slate-400'
        }
      />
      <input
        type="tel"
        maxLength={10}
        disabled={disabled}
        className="flex-1 bg-transparent text-[15px] font-semibold text-slate-900 outline-none placeholder:text-slate-300"
        value={value}
        placeholder="10-digit mobile number"
        onChange={(event) => {
          const nextValue = event.target.value.replace(/\D/g, '');
          onChange(nextValue);
          if (onClearError) onClearError(name, nextValue);
        }}
      />
      {value && PHONE_REGEX.test(value) ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" /> : null}
    </div>
    {error ? (
      <p className="ml-2 flex items-center gap-1 text-[11px] font-black text-red-500">
        <AlertCircle size={11} strokeWidth={3} />
        {error}
      </p>
    ) : null}
  </div>
);

const ContactDetailsSheet = ({
  open,
  onClose,
  onSave,
  senderName,
  setSenderName,
  senderMobile,
  setSenderMobile,
  useSelfForReceiver,
  setUseSelfForReceiver,
  receiverName,
  setReceiverName,
  receiverMobile,
  setReceiverMobile,
  errors,
  clearError,
}) => {
  if (!open) return null;

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm">
        <Motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="absolute inset-x-0 bottom-0 mx-auto max-w-lg overflow-hidden rounded-t-[34px] bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Booking Details</p>
              <h3 className="text-lg font-black tracking-tight text-slate-900">Sender & receiver</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
              <X size={18} />
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-5 py-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <User size={16} />
                </div>
                <p className="text-sm font-black text-slate-900">Sender</p>
              </div>

              <div className="space-y-2">
                <div className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 ${errors.senderName ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-slate-900/30'}`}>
                  <User size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={senderName}
                    placeholder="Sender name"
                    onChange={(event) => {
                      setSenderName(event.target.value);
                      clearError('senderName');
                    }}
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                  />
                </div>
                {errors.senderName ? <p className="text-[11px] font-black text-red-500">{errors.senderName}</p> : null}
              </div>

              <PhoneInput label="Mobile Number" value={senderMobile} onChange={setSenderMobile} error={errors.senderMobile} name="senderMobile" onClearError={clearError} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                  <Contact size={16} />
                </div>
                <p className="text-sm font-black text-slate-900">Receiver</p>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-[24px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-slate-900/10 px-4 py-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 group">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={useSelfForReceiver}
                    onChange={(event) => setUseSelfForReceiver(event.target.checked)}
                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border-2 border-slate-200 dark:border-zinc-700 bg-white dark:bg-slate-900 checked:bg-slate-900 checked:border-slate-900 dark:checked:bg-white dark:checked:border-white transition-all"
                  />
                  <CheckCircle2 size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-black text-slate-900 group-hover:text-slate-950 transition-colors">Same as Sender</p>
                  <p className="text-[11px] font-bold text-slate-400">Use sender's name and mobile for receiver</p>
                </div>
              </label>

              <div className="space-y-2">
                <div className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 ${errors.receiverName ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-slate-900/30'} ${useSelfForReceiver ? 'opacity-70' : ''}`}>
                  <User size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={receiverName}
                    placeholder="Receiver name"
                    disabled={useSelfForReceiver}
                    onChange={(event) => {
                      setReceiverName(event.target.value);
                      clearError('receiverName');
                    }}
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                  />
                </div>
                {errors.receiverName ? <p className="text-[11px] font-black text-red-500">{errors.receiverName}</p> : null}
              </div>

              <PhoneInput label="Mobile Number" value={receiverMobile} onChange={setReceiverMobile} error={errors.receiverMobile} name="receiverMobile" onClearError={clearError} disabled={useSelfForReceiver} />
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-zinc-800 px-5 py-4">
            <button
              type="button"
              onClick={onSave}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-slate-900 text-sm font-black text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
            >
              Save Details
              <ChevronRight size={16} />
            </button>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
};

const SenderReceiverDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const { isLoaded: isGoogleMapsLoaded } = useAppGoogleMapsLoader();
  const storedParcelDraft = useMemo(() => readParcelBookingDraft(), []);
  // The place picker comes back with one history step, so this screen gets its old router state again:
  // the place just picked is handed over separately and wins over that state.
  const pickerResult = useMemo(() => peekParcelPickerResult() || {}, []);
  useEffect(() => { clearParcelPickerResult(); }, []);
  const parcelState = useMemo(
    () => ({ ...storedParcelDraft, ...(location.state || {}), ...pickerResult }),
    [location.state, storedParcelDraft, pickerResult],
  );
  const storedUser = useMemo(() => readStoredUserInfo(), []);
  const [senderName, setSenderName] = useState(() => parcelState.senderName || storedUser?.name || '');
  const [senderMobile, setSenderMobile] = useState(() => parcelState.senderMobile || storedUser?.phone || '');
  const [useSelfForReceiver, setUseSelfForReceiver] = useState(() => {
    const receiverNameSeed = String(parcelState.receiverName || '').trim();
    const receiverMobileSeed = String(parcelState.receiverMobile || '').trim();
    const userNameSeed = String(storedUser?.name || '').trim();
    const userPhoneSeed = String(storedUser?.phone || '').trim();
    return Boolean(
      receiverNameSeed &&
      receiverMobileSeed &&
      receiverNameSeed === userNameSeed &&
      receiverMobileSeed === userPhoneSeed,
    );
  });
  const [receiverName, setReceiverName] = useState(() => parcelState.receiverName || '');
  const [receiverMobile, setReceiverMobile] = useState(() => parcelState.receiverMobile || '');
  const [pickup, setPickup] = useState(() => parcelState.pickup || '');
  const [drop, setDrop] = useState(() => parcelState.drop || '');
  const [pickupCoords, setPickupCoords] = useState(() => parcelState.pickupCoords || null);
  const [dropCoords, setDropCoords] = useState(() => parcelState.dropCoords || null);
  const [activeInput, setActiveInput] = useState(() => {
    const seed = { ...(location.state || {}), ...pickerResult };
    if (seed.activeInput === 'pickup' || seed.editPickup) {
      return 'pickup';
    }
    return 'drop';
  });
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [isLocatingPickup, setIsLocatingPickup] = useState(false);
  const [errors, setErrors] = useState({});
  const [recoveredSelectedVehicles, setRecoveredSelectedVehicles] = useState([]);
  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [, setZones] = useState([]);
  const [zonePaths, setZonePaths] = useState([]);
  const [routeEstimate, setRouteEstimate] = useState({ distanceKm: 0, durationMinutes: 0, source: 'air' });
  const autoPickupRequestedRef = useRef(false);
  const livePickupHydratedRef = useRef(false);
  const dropInputRef = useRef(null);
  const dropGeocodeTimerRef = useRef(null);
  const dropSuggestionTimerRef = useRef(null);
  const dropSuggestionCacheRef = useRef(new Map());
  const autocompleteServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const addressLookupCacheRef = useRef(new Map());
  const placeIdLookupCacheRef = useRef(new Map());
  const routeEstimateCacheRef = useRef(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(PARCEL_BOOKING_DRAFT_KEY, JSON.stringify({
      ...parcelState,
      senderName,
      senderMobile,
      receiverName,
      receiverMobile,
      pickup,
      drop,
      pickupCoords,
      dropCoords,
    }));
  }, [drop, dropCoords, parcelState, pickup, pickupCoords, receiverMobile, receiverName, senderMobile, senderName]);

  useEffect(() => {
    let active = true;

    const loadZoneData = async () => {
      try {
        const zonesResponse = await api.get('/users/zones');
        if (!active) {
          return;
        }

        const allZones = unwrapResults(zonesResponse).filter(isZoneActive);
        const allPaths = allZones.map(normalizeZonePath).filter((path) => path.length >= 3);

        setZones(allZones);
        setZonePaths(allPaths);
      } catch {
        if (active) {
          setZones([]);
          setZonePaths([]);
        }
      }
    };

    loadZoneData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (dropInputRef.current) {
      dropInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateSenderDetails = async () => {
      try {
        const response = await userAuthService.getCurrentUser();
        const user = response?.data?.user || response?.data?.data || {};

        if (!active || (!user?.name && !user?.phone)) return;

        const nextName = user.name || '';
        const nextPhone = user.phone || '';

        if (nextName || nextPhone) {
          window.localStorage.setItem('userInfo', JSON.stringify({ ...storedUser, ...user }));
        }

        setSenderName((current) => (!String(current || '').trim() || String(current || '').trim() === String(storedUser?.name || '').trim() ? nextName || current : current));
        setSenderMobile((current) => (!String(current || '').trim() || String(current || '').trim() === String(storedUser?.phone || '').trim() ? nextPhone || current : current));
      } catch {
        // ignore and keep fallback info
      }
    };

    hydrateSenderDetails();

    return () => {
      active = false;
    };
  }, [storedUser]);

  useEffect(() => {
    const selectedVehicleIds = Array.isArray(parcelState.selectedVehicleIds)
      ? parcelState.selectedVehicleIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const selectedVehicleId = String(parcelState.selectedVehicleId || '').trim();
    const selectedIdSet = new Set([...selectedVehicleIds, selectedVehicleId].filter(Boolean));
    const deliveryCategory = String(parcelState.deliveryCategory || parcelState.category || '').trim().toLowerCase();

    if (!selectedIdSet.size && !deliveryCategory) {
      setRecoveredSelectedVehicles([]);
      return undefined;
    }

    let active = true;

    const recoverSelectedVehicles = async () => {
      try {
        const response = await api.get('/users/vehicle-types');
        const items = response?.data?.results || response?.results || response?.data?.data?.results || [];
        const deliveryVehicles = Array.isArray(items) ? items.filter(isDeliveryVehicle) : [];

        let matchedVehicles = deliveryVehicles.filter((vehicle) => selectedIdSet.has(getVehicleId(vehicle)));
        if (matchedVehicles.length === 0 && deliveryCategory) {
          matchedVehicles = deliveryVehicles.filter((vehicle) => matchesDeliveryCategory(vehicle, deliveryCategory));
        }

        if (!active) return;
        setRecoveredSelectedVehicles(matchedVehicles);
      } catch {
        if (!active) return;
        setRecoveredSelectedVehicles([]);
      }
    };

    recoverSelectedVehicles();

    return () => {
      active = false;
    };
  }, [parcelState.category, parcelState.deliveryCategory, parcelState.selectedVehicle, parcelState.selectedVehicleId, parcelState.selectedVehicleIds, parcelState.selectedVehicles]);

  const query = useMemo(() => (activeInput === 'pickup' ? pickup : drop), [activeInput, drop, pickup]);

  // Popular places around the pickup, nearest first - looked up live, never a fixed city list.
  const [popularNearby, setPopularNearby] = useState([]);
  const popularOriginLng = Array.isArray(pickupCoords) ? pickupCoords[0] : null;
  const popularOriginLat = Array.isArray(pickupCoords) ? pickupCoords[1] : null;
  useEffect(() => {
    if (!isGoogleMapsLoaded || !window.google?.maps?.places?.PlacesService
      || !Number.isFinite(Number(popularOriginLat)) || !Number.isFinite(Number(popularOriginLng))) {
      return undefined;
    }
    let cancelled = false;
    const placesService = new window.google.maps.places.PlacesService(document.createElement('div'));
    loadPopularPlaces(window.google, placesService, [Number(popularOriginLng), Number(popularOriginLat)]).then((places) => {
      if (!cancelled) setPopularNearby(places);
    });
    return () => {
      cancelled = true;
    };
  }, [isGoogleMapsLoaded, popularOriginLat, popularOriginLng]);

  // Landmark for area results ("Vijay Nagar" -> near Bhawarkua Square), so two areas with one name can be told apart.
  const [areaHints, setAreaHints] = useState({});
  useEffect(() => {
    if (!isGoogleMapsLoaded || !window.google?.maps) return undefined;
    const wanted = googleSuggestions.filter((item) => item.placeId && isAreaPlace(item.types) && areaHints[item.placeId] === undefined);
    if (wanted.length === 0) return undefined;
    let cancelled = false;
    loadAreaHints(window.google, wanted).then((found) => {
      if (cancelled) return;
      setAreaHints((prev) => {
        const next = { ...prev };
        wanted.forEach((item) => { next[item.placeId] = found[item.placeId] || ''; });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleSuggestions, isGoogleMapsLoaded]);

  // The distance on a row is the road distance from the pickup (what Google Maps shows, same as the ride screen), not
  // the straight line. null = Google has no road route / the service is off: the straight-line figure is shown then.
  const [roadMeters, setRoadMeters] = useState({});
  const roadKey = (item) => String(item?.placeId || (Array.isArray(item?.coords) ? item.coords.join(',') : item?.title || ''));
  useEffect(() => { setRoadMeters({}); }, [popularOriginLat, popularOriginLng]);
  useEffect(() => {
    if (!isGoogleMapsLoaded || !window.google?.maps
      || !Number.isFinite(Number(popularOriginLat)) || !Number.isFinite(Number(popularOriginLng))) {
      return undefined;
    }
    const wanted = [...googleSuggestions, ...popularNearby]
      .filter((item) => (item.placeId || Array.isArray(item.coords)) && roadMeters[roadKey(item)] === undefined)
      .slice(0, 10);
    if (wanted.length === 0) return undefined;
    let cancelled = false;
    loadRoadDistances(window.google, [Number(popularOriginLng), Number(popularOriginLat)], wanted).then((meters) => {
      if (cancelled) return;
      setRoadMeters((prev) => {
        const next = { ...prev };
        wanted.forEach((item, index) => {
          next[roadKey(item)] = meters && Number.isFinite(meters[index]) ? meters[index] : null;
        });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleSuggestions, popularNearby, isGoogleMapsLoaded, popularOriginLat, popularOriginLng]);
  const distanceTextFor = (item) => {
    const meters = roadMeters[roadKey(item)];
    if (Number.isFinite(meters)) return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
    return meters === null ? item.distanceLabel || '' : '';
  };
  const selectedAreaHint = (suggestion) => (suggestion?.placeId && isAreaPlace(suggestion.types) ? areaHints[suggestion.placeId] || '' : '');

  const selectedVehicles = useMemo(() => {
    if (Array.isArray(recoveredSelectedVehicles) && recoveredSelectedVehicles.length) {
      return recoveredSelectedVehicles;
    }
    return [];
  }, [recoveredSelectedVehicles]);
  const primarySelectedVehicle = useMemo(() => {
    return selectedVehicles[0] || null;
  }, [selectedVehicles]);
  const estimatedDistanceKm = useMemo(
    () => calculateDistanceKm(pickupCoords, dropCoords),
    [dropCoords, pickupCoords],
  );
  const effectiveDistanceKm = Number(routeEstimate?.distanceKm || 0) > 0
    ? Number(routeEstimate.distanceKm)
    : estimatedDistanceKm;

  useEffect(() => {
    let active = true;
    const routeCacheKey = getParcelRouteCacheKey(pickupCoords, dropCoords);

    if (!Array.isArray(pickupCoords) || pickupCoords.length !== 2 || !Array.isArray(dropCoords) || dropCoords.length !== 2) {
      setRouteEstimate({ distanceKm: 0, durationMinutes: 0, source: 'air' });
      return undefined;
    }

    if (!isGoogleMapsLoaded || !window.google?.maps?.importLibrary) {
      setRouteEstimate({ distanceKm: estimatedDistanceKm, durationMinutes: 0, source: 'air' });
      return undefined;
    }

    const cachedRouteEstimate = routeEstimateCacheRef.current.get(routeCacheKey);
    if (cachedRouteEstimate) {
      setRouteEstimate(cachedRouteEstimate);
      return undefined;
    }

    void (async () => {
      const result = await computeDrivingRoute({
        origin: coordPairToLatLng(pickupCoords),
        destination: coordPairToLatLng(dropCoords),
      });

      if (!active) {
        return;
      }

      if (result.status !== 'OK' || !result.legs.length) {
        const fallbackEstimate = { distanceKm: estimatedDistanceKm, durationMinutes: 0, source: 'air' };
        routeEstimateCacheRef.current.set(routeCacheKey, fallbackEstimate);
        setRouteEstimate(fallbackEstimate);
        return;
      }

      const totals = sumComputedRouteLegs(result.legs);
      const nextRouteEstimate = {
        distanceKm: roundCurrency(totals.distanceMeters / 1000),
        durationMinutes: Math.max(0, Math.ceil(totals.durationSeconds / 60)),
        source: 'road',
      };
      routeEstimateCacheRef.current.set(routeCacheKey, nextRouteEstimate);
      setRouteEstimate(nextRouteEstimate);
    })();

    return () => {
      active = false;
    };
  }, [dropCoords, estimatedDistanceKm, isGoogleMapsLoaded, pickupCoords]);

  const estimatedFare = useMemo(() => {
    if (!drop.trim()) {
      return null;
    }

    const primaryFare = calculateVehicleFare(primarySelectedVehicle, effectiveDistanceKm);
    if (!Number.isFinite(primaryFare?.total)) {
      return null;
    }

    return {
      min: primaryFare.total,
      max: primaryFare.total,
      approx: Math.round(primaryFare.total),
      dynamic: true,
      minBaseDistance: Number(primaryFare.baseDistance || 0),
      maxBaseDistance: Number(primaryFare.baseDistance || 0),
      subtotal: Number(primaryFare.subtotal || 0),
      serviceTaxPercentage: Number(primaryFare.serviceTaxPercentage || 0),
      serviceTaxAmount: Number(primaryFare.serviceTaxAmount || 0),
    };
  }, [drop, effectiveDistanceKm, primarySelectedVehicle]);

  const validate = () => {
    const nextErrors = {};
    if (!senderName.trim()) nextErrors.senderName = 'Sender name is required';
    if (!PHONE_REGEX.test(senderMobile)) nextErrors.senderMobile = 'Enter a valid 10-digit number';
    if (!receiverName.trim()) nextErrors.receiverName = 'Receiver name is required';
    if (!PHONE_REGEX.test(receiverMobile)) nextErrors.receiverMobile = 'Enter a valid 10-digit number';
    if (!pickup.trim()) nextErrors.pickup = 'Pickup location is required';
    if (!drop.trim()) nextErrors.drop = 'Drop location is required';
    setErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      nextErrors,
    };
  };

  const clearError = (key) => {
    if (!errors[key]) return;
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const syncReceiverWithSelf = () => {
    const nextName = String(storedUser?.name || senderName || '').trim();
    const nextPhone = String(storedUser?.phone || senderMobile || '').trim();

    setReceiverName(nextName);
    setReceiverMobile(nextPhone);
    setErrors((prev) => ({
      ...prev,
      receiverName: '',
      receiverMobile: nextPhone && !PHONE_REGEX.test(nextPhone) ? 'Enter a valid 10-digit number' : '',
    }));
  };

  useEffect(() => {
    if (!useSelfForReceiver) return;
    const timer = setTimeout(() => {
      const nextName = String(storedUser?.name || senderName || '').trim();
      const nextPhone = String(storedUser?.phone || senderMobile || '').trim();

      setReceiverName(nextName);
      setReceiverMobile(nextPhone);
      setErrors((prev) => ({
        ...prev,
        receiverName: '',
        receiverMobile: nextPhone && !PHONE_REGEX.test(nextPhone) ? 'Enter a valid 10-digit number' : '',
      }));
    }, 0);

    return () => clearTimeout(timer);
  }, [senderMobile, senderName, storedUser, useSelfForReceiver]);

  const validatePhoneField = (key, value) => {
    const trimmedValue = String(value || '').trim();

    setErrors((prev) => {
      const nextError = trimmedValue && !PHONE_REGEX.test(trimmedValue) ? 'Enter a valid 10-digit number' : '';
      if (prev[key] === nextError) return prev;
      return { ...prev, [key]: nextError };
    });
  };

  const clearPhoneError = (key, value) => {
    validatePhoneField(key, value);
  };

  const openSharedLocationPicker = (targetInput) => {
    navigate(`${routePrefix}/ride/select-location`, {
      state: {
        ...parcelState,
        flow: 'parcel',
        returnTo: `${routePrefix}/parcel/details`,
        openMapPicker: true,
        activeInput: targetInput,
        editPickup: targetInput === 'pickup',
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        senderName,
        senderMobile,
        receiverName,
        receiverMobile,
      },
    });
  };

  const resolveAddressFromCoords = useEffectEvent((position) =>
    new Promise((resolve) => {
      const cacheKey = getLatLngCacheKey(position);
      const cachedAddress = addressLookupCacheRef.current.get(cacheKey);
      if (cachedAddress) {
        resolve(cachedAddress);
        return;
      }

      if (!isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(formatLatLngLabel(position));
        return;
      }
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results?.[0]?.formatted_address) {
          addressLookupCacheRef.current.set(cacheKey, cleanGroundAddress(results[0].formatted_address));
          resolve(cleanGroundAddress(results[0].formatted_address));
          return;
        }
        resolve(formatLatLngLabel(position));
      });
    }));

  const resolveCoordsFromAddress = useEffectEvent((address) =>
    new Promise((resolve) => {
      const trimmedAddress = String(address || '').trim();
      const cacheKey = trimmedAddress.toLowerCase();
      const cachedCoords = addressLookupCacheRef.current.get(cacheKey);
      if (cachedCoords) {
        resolve(cachedCoords);
        return;
      }

      if (!trimmedAddress || !isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      const addressQuery = /indore/i.test(trimmedAddress) ? trimmedAddress : `${trimmedAddress}, Indore`;

      geocoder.geocode({ address: addressQuery }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        const resolvedCoords = latLngToCoordPair({ lat: locationPoint.lat(), lng: locationPoint.lng() });
        addressLookupCacheRef.current.set(cacheKey, resolvedCoords);
        resolve(resolvedCoords);
      });
    }));

  const resolveCoordsFromPlaceId = useEffectEvent((placeId) =>
    new Promise((resolve) => {
      const trimmedPlaceId = String(placeId || '').trim();
      const cachedCoords = placeIdLookupCacheRef.current.get(trimmedPlaceId);
      if (cachedCoords) {
        resolve(cachedCoords);
        return;
      }

      if (!trimmedPlaceId || !isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: trimmedPlaceId }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        const resolvedCoords = latLngToCoordPair({ lat: locationPoint.lat(), lng: locationPoint.lng() });
        placeIdLookupCacheRef.current.set(trimmedPlaceId, resolvedCoords);
        resolve(resolvedCoords);
      });
    }));

  const requestCurrentPickupLocation = useEffectEvent(() => {
    if (!navigator.geolocation) {
      setErrors((prev) => ({ ...prev, pickup: 'Current location is not available' }));
      return;
    }

    setIsLocatingPickup(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        const coords = latLngToCoordPair(next);
        const address = await resolveAddressFromCoords(next);
        setPickupCoords(coords);
        setPickup(address || formatLatLngLabel(next));
        clearError('pickup');
        setIsLocatingPickup(false);
      },
      () => {
        setIsLocatingPickup(false);
        setErrors((prev) => ({ ...prev, pickup: 'Location permission denied' }));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });

  useEffect(() => {
    if (autoPickupRequestedRef.current || livePickupHydratedRef.current) return;
    autoPickupRequestedRef.current = true;
    livePickupHydratedRef.current = true;
    const timer = setTimeout(() => {
      requestCurrentPickupLocation();
    }, 0);

    return () => clearTimeout(timer);
  }, [requestCurrentPickupLocation]);

  useEffect(() => {
    if (!pickupCoords || !pickup || !isCoordinateLabel(pickup) || !isGoogleMapsLoaded) {
      return;
    }

    let active = true;

    resolveAddressFromCoords(coordPairToLatLng(pickupCoords)).then((resolvedAddress) => {
      if (!active || !resolvedAddress || isCoordinateLabel(resolvedAddress)) {
        return;
      }

      setPickup((current) => (isCoordinateLabel(current) ? resolvedAddress : current));
    });

    return () => {
      active = false;
    };
  }, [isGoogleMapsLoaded, pickup, pickupCoords]);

  useEffect(() => {
    const trimmedQuery = String(query || '').trim();

    clearTimeout(dropGeocodeTimerRef.current);
    clearTimeout(dropSuggestionTimerRef.current);

    if (!trimmedQuery) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    if (!isGoogleMapsLoaded || isCoordinateLabel(trimmedQuery)) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    if (trimmedQuery.length < 3 || !window.google?.maps?.places?.AutocompleteService) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    const cacheKey = `${trimmedQuery.toLowerCase()}|${activeInput}|${Array.isArray(pickupCoords) ? pickupCoords.join(',') : ''}`;
    const cachedSuggestions = dropSuggestionCacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setGoogleSuggestions(cachedSuggestions);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    let active = true;
    dropSuggestionTimerRef.current = setTimeout(() => {
      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
      if (!autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }

      setIsFetchingSuggestions(true);
      const request = {
        input: trimmedQuery,
        componentRestrictions: { country: 'in' },
        types: ['geocode'],
        sessionToken: autocompleteSessionTokenRef.current || undefined,
      };

      // City parcels stay in the pickup's neighbourhood; outstation parcels may go anywhere.
      const isOutstationParcel = Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation');
      if (!isOutstationParcel && Array.isArray(pickupCoords)) {
        Object.assign(request, nearbyAutocompleteRequest(window.google, coordPairToLatLng(pickupCoords, null)));
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (!active) {
          return;
        }

        const normalizedSuggestions =
          status === 'OK'
            ? dedupePlaces(keepNearbyPredictions(predictions).map((prediction) => ({
                id: prediction.place_id || prediction.description,
                label: prediction.structured_formatting?.main_text || prediction.description,
                title: prediction.structured_formatting?.main_text || prediction.description,
                address: prediction.description || '',
                secondaryText: prediction.structured_formatting?.secondary_text || '',
                description: prediction.description || '',
                placeId: prediction.place_id || '',
                types: prediction.types || [],
                distanceLabel: Number.isFinite(prediction.distance_meters) ? formatDistance(prediction.distance_meters / 1000) : '',
                source: 'google',
              }))).slice(0, 5)
            : [];

        dropSuggestionCacheRef.current.set(cacheKey, normalizedSuggestions);
        setGoogleSuggestions(normalizedSuggestions);
        setIsFetchingSuggestions(false);
      });
    }, 350);

    return () => {
      active = false;
      clearTimeout(dropGeocodeTimerRef.current);
      clearTimeout(dropSuggestionTimerRef.current);
    };
  }, [query, isGoogleMapsLoaded, pickupCoords, activeInput]);

  const applySuggestion = async (type, suggestion) => {
    const baseValue = typeof suggestion === 'string' ? suggestion : suggestion?.title || suggestion?.label || suggestion?.description || '';
    // "Vijay Nagar" at Bhawarkua is saved as "Vijay Nagar, near Bhawarkua Square", never as the bare ambiguous name.
    const value = withAreaHint(baseValue, selectedAreaHint(suggestion));

    if (type === 'pickup') {
      setPickup(value);
      if (Array.isArray(suggestion?.coords) && suggestion.coords.length === 2) {
        setPickupCoords(suggestion.coords);
      } else if (suggestion?.placeId) {
        const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId);
        setPickupCoords(resolvedCoords);
      }
      clearError('pickup');
      setActiveInput('drop');
      return;
    }

    setDrop(value);
    if (Array.isArray(suggestion?.coords) && suggestion.coords.length === 2) {
      setDropCoords(suggestion.coords);
    } else if (suggestion?.placeId) {
      const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId);
      setDropCoords(resolvedCoords);
      if (autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }
    }
    setGoogleSuggestions([]);
    clearError('drop');
  };

  const handleProceed = async ({ fromContactSheet = false } = {}) => {
    const { isValid, nextErrors } = validate();

    if (!isValid) {
      if (nextErrors.senderName || nextErrors.senderMobile || nextErrors.receiverName || nextErrors.receiverMobile) {
        setIsContactSheetOpen(true);
        return;
      }

      if (fromContactSheet) {
        setIsContactSheetOpen(false);
      }
      return;
    }

    let resolvedPickupCoords = pickupCoords;
    let resolvedDropCoords = dropCoords;

    if (!resolvedPickupCoords && pickup.trim()) {
      resolvedPickupCoords = await resolveCoordsFromAddress(pickup);
      if (resolvedPickupCoords) {
        setPickupCoords(resolvedPickupCoords);
      }
    }

    if (!resolvedDropCoords && drop.trim()) {
      resolvedDropCoords = await resolveCoordsFromAddress(drop);
      if (resolvedDropCoords) {
        setDropCoords(resolvedDropCoords);
      }
    }

    if (!resolvedPickupCoords || !resolvedDropCoords) {
      setErrors((prev) => ({
        ...prev,
        ...(!resolvedPickupCoords ? { pickup: 'Could not find this pickup on the map. Pick it from the suggestions.' } : {}),
        ...(!resolvedDropCoords ? { drop: 'Could not find this drop on the map. Pick it from the suggestions.' } : {}),
      }));
      setIsContactSheetOpen(false);
      return;
    }

    setIsContactSheetOpen(false);
    navigate(`${routePrefix}/parcel/searching`, {
      state: {
        ...parcelState,
        pickup,
        drop,
        pickupCoords: resolvedPickupCoords,
        dropCoords: resolvedDropCoords,
        senderName,
        senderMobile,
        receiverName,
        receiverMobile,
        paymentMethod: 'Cash',
        fare: estimatedFare?.approx ?? estimatedFare?.min ?? null,
        estimatedFare,
        // Same distance the fare above was priced on (road route when available), so every screen shows one km.
        estimatedDistanceKm: effectiveDistanceKm,
        deliveryScope: parcelState.deliveryScope || 'city',
        isOutstation: Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation'),
        parcel: {
          category: parcelState.parcelType || 'Parcel',
          weight: parcelState.weight || 'Under 5kg',
          description: parcelState.description || '',
          deliveryCategory: parcelState.deliveryCategory || parcelState.parcel?.deliveryCategory || '',
          goodsTypeFor: parcelState.goodsTypeFor || parcelState.parcel?.goodsTypeFor || '',
          deliveryScope: parcelState.deliveryScope || 'city',
          isOutstation: Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation'),
          senderName,
          senderMobile,
          receiverName,
          receiverMobile,
        },
        isParcel: true,
        searchNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
  };

  return (
    <div className="relative mx-auto flex min-h-screen max-w-lg flex-col overflow-x-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f7f9fc_100%)] font-sans">
      <ContactDetailsSheet
        open={isContactSheetOpen}
        onClose={() => setIsContactSheetOpen(false)}
        onSave={() => handleProceed({ fromContactSheet: true })}
        senderName={senderName}
        setSenderName={setSenderName}
        senderMobile={senderMobile}
        setSenderMobile={setSenderMobile}
        useSelfForReceiver={useSelfForReceiver}
        setUseSelfForReceiver={(checked) => {
          setUseSelfForReceiver(checked);
          if (!checked) {
            return;
          }
          syncReceiverWithSelf();
        }}
        receiverName={receiverName}
        setReceiverName={(value) => {
          if (useSelfForReceiver) {
            setUseSelfForReceiver(false);
          }
          setReceiverName(value);
        }}
        receiverMobile={receiverMobile}
        setReceiverMobile={(value) => {
          if (useSelfForReceiver) {
            setUseSelfForReceiver(false);
          }
          setReceiverMobile(value);
        }}
        errors={errors}
        clearError={(key, value) => {
          if (key === 'senderMobile' || key === 'receiverMobile') {
            clearPhoneError(key, value);
            return;
          }
          clearError(key);
        }}
      />

      {/* Background visual blobs for rich depth */}
      <div className="absolute -top-20 right-[-40px] h-48 w-48 rounded-full bg-blue-100/60 blur-3xl pointer-events-none" />
      <div className="absolute top-64 left-[-60px] h-56 w-56 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />
      <div className="absolute bottom-32 right-[-40px] h-48 w-48 rounded-full bg-indigo-100/50 blur-3xl pointer-events-none" />

      <header className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-5 py-4 border-b border-slate-100/80 dark:border-zinc-800/80 flex items-center gap-3">
        <button 
          onClick={() => navigate(-1)} 
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-800 dark:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm active:scale-95 transition-all"
        >
          <ArrowLeft size={20} className="text-slate-900 dark:text-white" strokeWidth={2.5} />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-zinc-100">Parcel Delivery</p>
          <h1 className="mt-0.5 text-[18px] font-bold text-slate-900 dark:text-white tracking-tight leading-none truncate">Details & Address</h1>
        </div>
      </header>

      <main className="flex-1 px-4 pt-2 pb-28 z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[32px] bg-white dark:bg-[#111827] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-zinc-800 relative"
        >
          <div className="space-y-3">
            {/* Pickup Row */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="w-5 h-5 rounded-full border-2 border-emerald-700 bg-white/70 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                </div>
              </div>
              <div
                className={`flex-1 flex bg-transparent border rounded-2xl px-4 py-2.5 transition-all cursor-pointer items-center ${
                  activeInput === 'pickup' ? 'border-slate-900 ring-2 ring-slate-950/10 dark:border-white dark:ring-white/10 text-slate-800 dark:text-white' : 'border-slate-100 dark:border-zinc-800/60 hover:bg-slate-100/50 dark:hover:bg-zinc-800/50'
                } ${errors.pickup ? 'border-red-400' : ''}`}
                onClick={() => setActiveInput('pickup')}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Pick Up From</p>
                  <input
                    type="text"
                    value={pickup}
                    onChange={(e) => {
                      setPickup(e.target.value);
                      clearError('pickup');
                    }}
                    onFocus={() => setActiveInput('pickup')}
                    placeholder="Search pickup location..."
                    className="w-full bg-transparent border-none text-[14px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none placeholder:text-slate-450 mt-0.5"
                  />
                </div>
                {pickup.length > 0 && activeInput === 'pickup' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickup('');
                    }} 
                    className="ml-2 shrink-0"
                  >
                    <X size={16} className="text-slate-300 hover:text-slate-600 transition-colors" />
                  </button>
                )}
              </div>
            </div>

            {/* Dotted connector */}
            <div className="ml-[9px] h-2 w-[1.5px] border-l-[1.5px] border-dotted border-slate-300/70 dark:border-zinc-800/60" />

            {/* Drop Row */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="w-5 h-5 rounded-full border-2 border-orange-600 bg-white/70 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
                </div>
              </div>
              <div
                className={`flex-1 flex bg-transparent border rounded-2xl px-4 py-2.5 transition-all cursor-pointer items-center ${
                  activeInput === 'drop' ? 'border-slate-900 ring-2 ring-slate-950/10 dark:border-white dark:ring-white/10 text-slate-800 dark:text-white' : 'border-slate-100 dark:border-zinc-800/60 hover:bg-slate-100/50 dark:hover:bg-zinc-800/50'
                } ${errors.drop ? 'border-red-400' : ''}`}
                onClick={() => setActiveInput('drop')}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Deliver To</p>
                  <input
                    ref={dropInputRef}
                    type="text"
                    value={drop}
                    autoFocus={activeInput === 'drop'}
                    onFocus={() => setActiveInput('drop')}
                    onChange={(e) => {
                      setDrop(e.target.value);
                      clearError('drop');
                    }}
                    placeholder="Search drop location..."
                    className="w-full bg-transparent border-none text-[14px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none placeholder:text-slate-450 mt-0.5"
                  />
                </div>
                {drop.length > 0 && activeInput === 'drop' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrop('');
                    }} 
                    className="ml-2 shrink-0"
                  >
                    <X size={16} className="text-slate-300 hover:text-slate-600 transition-colors" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Pills */}
        <div className="relative z-10 flex gap-3 my-5">
          <button
            onClick={() => openSharedLocationPicker(activeInput)}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-100 rounded-2xl py-3.5 shadow-sm hover:shadow-md hover:border-slate-200 active:scale-95 transition-all text-[13px] font-bold text-slate-800 group"
          >
            <MapPin size={16} className="text-slate-900 dark:text-white group-hover:scale-110 transition-transform" strokeWidth={2.5} />
            <span>Pin on map</span>
          </button>
          
          <button
            onClick={() => setIsContactSheetOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-100 rounded-2xl py-3.5 shadow-sm hover:shadow-md hover:border-slate-200 active:scale-95 transition-all text-[13px] font-bold text-slate-800 group"
          >
            <User size={16} className="text-slate-900 dark:text-white group-hover:scale-110 transition-transform" strokeWidth={2.5} />
            <span>Contact Details</span>
          </button>
        </div>

        {/* Contact details badge */}
        {(senderName || receiverName) && (
          <div className="mx-1 mb-5 bg-gradient-to-r from-slate-50/70 to-slate-100/30 rounded-2xl p-4 border-l-4 border-l-slate-900 border border-slate-100 flex items-center justify-between gap-3 text-[12px] shadow-sm">
            <div className="flex-1 min-w-0 space-y-1.5">
              {senderName && (
                <div className="flex items-center gap-2 text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Sender:</span>
                  <span className="truncate font-semibold text-slate-700">{senderName} ({senderMobile})</span>
                </div>
              )}
              {receiverName && (
                <div className="flex items-center gap-2 text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Receiver:</span>
                  <span className="truncate font-semibold text-slate-700">{receiverName} ({receiverMobile})</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsContactSheetOpen(true)}
              className="text-[11px] font-black text-slate-900 dark:text-white hover:text-slate-800 bg-white dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-zinc-700 shadow-sm uppercase tracking-wider shrink-0 transition-colors"
            >
              Edit
            </button>
          </div>
        )}

        <div className="mt-5 space-y-5 px-2">
          <h2 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
            {query.trim().length > 0 ? 'Search Results' : 'Suggestions'}
          </h2>

          {googleSuggestions.length > 0 ? (
            <div className="space-y-2">
              {googleSuggestions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => applySuggestion(activeInput, item)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left shadow-sm hover:border-slate-300 transition-colors"
                >
                  <div className="mt-0.5 w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                    <Navigation size={14} className="text-slate-900 dark:text-white fill-slate-900/10" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black text-slate-800">{item.label}</p>
                    {item.secondaryText || item.distanceLabel ? (
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                        {distanceTextFor(item) ? `${distanceTextFor(item)} • ` : ''}
                        {selectedAreaHint(item) ? `Near ${selectedAreaHint(item)} • ` : ''}
                        {item.secondaryText}
                      </p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {!query.trim().length && popularNearby.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Popular near you</p>
              {popularNearby.map((item) => (
                <button
                  key={item.placeId || item.title}
                  onClick={() => applySuggestion(activeInput, item)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left shadow-sm hover:border-slate-300 transition-colors"
                >
                  <div className="mt-0.5 w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                    <MapPin size={14} className="text-emerald-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black text-slate-800">{item.title}</p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                      {distanceTextFor(item) ? `${distanceTextFor(item)} • ` : ''}{item.address}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {Boolean(query) && isFetchingSuggestions ? (
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 shadow-sm animate-pulse">
              Finding suggestions...
            </div>
          ) : null}
        </div>

        <motion.section 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.12 }} 
          className={`mt-8 rounded-[30px] p-6 shadow-xl relative overflow-hidden border transition-colors ${
            isDark 
              ? 'bg-gradient-to-br from-slate-900 to-slate-950 text-white border-slate-800' 
              : 'bg-gradient-to-r from-amber-100 via-yellow-100 to-yellow-50 text-slate-900 border-yellow-200/60 shadow-md'
          }`}
        >
          <div className={`absolute right-[-20px] top-[-20px] w-36 h-36 rounded-full blur-2xl pointer-events-none ${isDark ? 'bg-indigo-500/10' : 'bg-yellow-400/20'}`} />
          <div className={`absolute left-[-20px] bottom-[-20px] w-36 h-36 rounded-full blur-2xl pointer-events-none ${isDark ? 'bg-emerald-500/5' : 'bg-emerald-400/10'}`} />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Approx. Delivery Fare</p>
              <p className={`mt-1 text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {estimatedFare ? `Rs ${estimatedFare.approx ?? estimatedFare.min}` : '--'}
              </p>
              <p className={`mt-1 text-[11px] font-bold ${isDark ? 'text-slate-450' : 'text-slate-600'}`}>
                {estimatedFare
                  ? `Based on ${routeEstimate.source === 'road' ? 'road' : 'approx'} travel of ${effectiveDistanceKm.toFixed(1)} km`
                  : 'Enter drop location to view live fare'}
              </p>
              {estimatedFare ? (
                <>
                  <p className={`mt-1 text-[10px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    Base fare covers {estimatedFare.minBaseDistance === estimatedFare.maxBaseDistance
                      ? `${estimatedFare.maxBaseDistance.toFixed(1)} km`
                      : `${estimatedFare.minBaseDistance.toFixed(1)}-${estimatedFare.maxBaseDistance.toFixed(1)} km`}
                    {' '}before extra charges.
                  </p>
                  <p className={`mt-1 text-[10px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    Subtotal Rs {Number(estimatedFare.subtotal || 0).toFixed(2)} + service tax {Number(estimatedFare.serviceTaxPercentage || 0).toFixed(2)}% (Rs {Number(estimatedFare.serviceTaxAmount || 0).toFixed(2)})
                  </p>
                </>
              ) : null}
            </div>
             <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shrink-0 ${isDark ? 'bg-white/10 border border-white/10' : 'bg-white shadow-sm border border-slate-200/60'}`}>
               <PackageCheck size={28} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />
             </div>
          </div>
        </motion.section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 p-6">
        <div className="mx-auto max-w-lg relative">
          <div className="absolute inset-x-0 bottom-0 -mb-6 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleProceed}
            className="relative flex h-16 w-full items-center justify-center gap-3 rounded-[24px] bg-slate-900 text-[15px] font-black text-white shadow-[0_20px_40px_rgba(15,23,42,0.2)] group overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-slate-800 to-slate-950 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10">
               {drop ? 'Confirm Receiver Details' : 'Select Drop Location'}
            </span>
            <ChevronRight size={20} className="relative z-10 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default SenderReceiverDetails;
