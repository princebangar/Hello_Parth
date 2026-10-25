import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronRight,
  MapPin,
  ArrowRight,
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { AppImage, Screen, Text } from '@/native/ui';
import { alpha, makeStyles, useTheme } from '@/theme';
import { cleanGroundAddress } from '../../utils/preciseLocation';
import api from '../../../../shared/api/axiosInstance';
import { getSavedLocation, getSavedLocationCoords, saveLocation } from '../../services/locationStore';
import { googleMapsCompat } from '../../../../../../shared/maps/placesCompat';

import trucksImg from '@/assets/images/delivery/trucks.png';
import bikeImg from '@/assets/images/delivery/bike.png';
import moversImg from '@/assets/images/delivery/movers.png';

// The web hands window.google to this logic; natively the same classes come from placesCompat.
const google = googleMapsCompat;

// Taxi/index.css `.user-app-theme` palette (the web remaps slate / white classes to these in both themes).
const userTokens = (dark) => ({
  bg: dark ? '#0a0a0a' : '#F1F4F9',
  card: dark ? '#141414' : '#FFFFFF',
  soft: dark ? '#1c1c1c' : '#E9EDF4',
  text: dark ? '#FFFFFF' : '#0B1220',
  text2: dark ? '#CBD5E1' : '#475569',
  border: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
});
const USER_SHADOW = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const PARCEL_BOOKING_DRAFT_KEY = 'parcelBookingDraft';
const FALLBACK_PICKUP_LABEL = 'Choose your location';
const unwrapResults = (response) => {
  const payload = response?.data?.data || response?.data || response;
  return payload?.results || (Array.isArray(payload) ? payload : []);
};

const toPlainData = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

const getDeliveryPricingScore = (vehicle = {}) => {
  const pricing = vehicle?.delivery_distance_pricing || {};
  const enabled = Boolean(pricing?.enabled);
  const basePrice = Number(pricing?.base_price || 0);
  const distancePrice = Number(pricing?.distance_price || 0);
  const baseDistance = Number(pricing?.base_distance ?? pricing?.free_distance ?? 0);

  return Number(enabled) * 1000 + Number(basePrice > 0) * 100 + Number(distancePrice > 0) * 10 + Number(baseDistance > 0);
};

const getVehicleRecencyScore = (vehicle = {}) => {
  const timestamp = new Date(vehicle?.updatedAt || vehicle?.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const DELIVERY_CATEGORY_OPTIONS = [
  {
    id: 'trucks',
    title: 'Trucks',
    img: trucksImg,
    searchTokens: ['truck', 'lcv', 'hcv', 'mcv', 'loader'],
  },
  {
    id: '2wheeler',
    title: '2 Wheeler',
    img: bikeImg,
    searchTokens: ['bike', 'scooter', 'cycle', '2-wheeler'],
  },
  {
    id: 'auto',
    title: 'Auto',
    img: '/2_AutoRickshaw.png',
    searchTokens: ['auto', 'rickshaw', 'tuk', '3-wheeler', 'three-wheeler'],
  },
  {
    id: 'movers',
    title: 'Packers & Movers',
    img: moversImg,
    searchTokens: ['mover', 'packers'],
  }
];

const WAVE_PATH = 'M0,160L48,176C96,192,192,224,288,224C384,224,480,192,576,165.3C672,139,768,117,864,128C960,139,1056,181,1152,186.7C1248,192,1344,160,1392,144L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z';

// framer-motion initial -> animate (opacity + one transform), with an optional delay
function Appear({ from, delay = 0, style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, damping: 20, stiffness: 180, useNativeDriver: true }).start();
  }, [v, delay]);
  const transform = [];
  if (from.y != null) transform.push({ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from.y, 0] }) });
  if (from.x != null) transform.push({ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [from.x, 0] }) });
  if (from.scale != null) transform.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from.scale, 1] }) });
  return <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform }]}>{children}</Animated.View>;
}

const ParcelType = () => {
  const t = useTheme();
  const theme = t.dark ? 'dark' : 'light';
  const u = userTokens(t.dark);
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const location = useLocation();
  const routeState = location.state || {};
  const savedLocation = getSavedLocation();
  const savedPickupLabel = String(savedLocation?.address || '').trim();
  const savedPickupCoords = getSavedLocationCoords();
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickupAddress, setPickupAddress] = useState(() => routeState.pickup || savedPickupLabel || FALLBACK_PICKUP_LABEL);
  const [pickupCoords, setPickupCoords] = useState(() => routeState.pickupCoords || savedPickupCoords || null);
  const geolocationRequestedRef = useRef(false);
  const navigate = useNavigate();
  // No script to load natively: the Geocoder is always available.
  const isGoogleMapsLoaded = true;

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        setLoading(true);
        const response = await api.get('/users/vehicle-types');
        const items = unwrapResults(response);
        setVehicleTypes(items.filter(v => v.active && (v.transport_type === 'delivery' || v.transport_type === 'both')));
      } catch (err) {
        console.error('Failed to load vehicles:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, []);

  useEffect(() => {
    try {
      const draft = JSON.parse(window.sessionStorage.getItem(PARCEL_BOOKING_DRAFT_KEY) || '{}');

      if (!routeState.pickup && !savedPickupLabel && draft?.pickup) {
        setPickupAddress(String(draft.pickup || '').trim() || FALLBACK_PICKUP_LABEL);
      }

      if (!routeState.pickupCoords && !savedPickupCoords && Array.isArray(draft?.pickupCoords) && draft.pickupCoords.length === 2) {
        setPickupCoords(draft.pickupCoords);
      }
    } catch {
      // ignore invalid draft state
    }
  }, [routeState.pickup, routeState.pickupCoords, savedPickupCoords, savedPickupLabel]);

  useEffect(() => {
    if (geolocationRequestedRef.current || !navigator.geolocation) {
      return;
    }

    geolocationRequestedRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoords = [position.coords.longitude, position.coords.latitude];
        setPickupCoords(nextCoords);
        saveLocation({
          lon: position.coords.longitude,
          lat: position.coords.latitude,
          updatedAt: Date.now(),
        });
      },
      () => {
        // keep saved or route-based location when geolocation fails
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    if (!isGoogleMapsLoaded || !google?.maps?.Geocoder || !Array.isArray(pickupCoords) || pickupCoords.length !== 2) {
      return;
    }

    let active = true;
    const geocoder = new google.maps.Geocoder();
    const [lng, lat] = pickupCoords;

    geocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, (results, status) => {
      if (!active) {
        return;
      }

      const nextAddress = status === 'OK' && results?.[0]?.formatted_address
        ? cleanGroundAddress(results[0].formatted_address)
        : '';

      if (!nextAddress) {
        return;
      }

      setPickupAddress(nextAddress);
      saveLocation({
        address: nextAddress,
        lon: Number(lng),
        lat: Number(lat),
        updatedAt: Date.now(),
      });
    });

    return () => {
      active = false;
    };
  }, [isGoogleMapsLoaded, pickupCoords]);

  const handleCategorySelect = (category) => {
    if (loading) {
      toast('Vehicle options are still loading. Try again in a sec.', {
        duration: 2200,
      });
      return;
    }

    const filteredVehicles = vehicleTypes.filter((vehicle) => {
      const configuredCategory = String(vehicle.delivery_category || '').trim().toLowerCase();
      if (configuredCategory) {
        return configuredCategory === category.id;
      }

      const name = String(vehicle.name || '').toLowerCase();
      const iconType = String(vehicle.icon_types || '').toLowerCase();
      return category.searchTokens.some((token) => name.includes(token) || iconType.includes(token));
    });
    const prioritizedVehicles = [...filteredVehicles].sort((left, right) => {
      const pricingDelta = getDeliveryPricingScore(right) - getDeliveryPricingScore(left);
      if (pricingDelta !== 0) {
        return pricingDelta;
      }

      const recencyDelta = getVehicleRecencyScore(right) - getVehicleRecencyScore(left);
      if (recencyDelta !== 0) {
        return recencyDelta;
      }

      return String(left?.name || '').localeCompare(String(right?.name || ''));
    });

    const selectedVehicle = prioritizedVehicles[0] || vehicleTypes[0];
    const selectedVehicles = (prioritizedVehicles.length ? prioritizedVehicles : selectedVehicle ? [selectedVehicle] : [])
      .map((vehicle) => toPlainData(vehicle))
      .filter(Boolean);
    const plainSelectedVehicle = toPlainData(selectedVehicle);
    const selectedVehicleIds = prioritizedVehicles.length
      ? prioritizedVehicles.map((vehicle) => vehicle?._id || vehicle?.id).filter(Boolean)
      : [plainSelectedVehicle?._id || plainSelectedVehicle?.id].filter(Boolean);

    const nextState = {
      parcelType: 'General Parcel',
      selectedVehicle: plainSelectedVehicle,
      selectedVehicles,
      selectedVehicleId: plainSelectedVehicle?._id || plainSelectedVehicle?.id,
      selectedVehicleIds,
      category: category.id,
      deliveryCategory: category.id,
      pickup: pickupAddress,
      pickupCoords,
    };

    window.sessionStorage.setItem(PARCEL_BOOKING_DRAFT_KEY, JSON.stringify(nextState));

    navigate('/taxi/user/parcel/details', {
      state: nextState,
    });
  };

  return (
    <Screen edges={['bottom']} bg={u.bg}>
      <ScrollView style={{ flex: 1, backgroundColor: u.bg }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Premium Header with Wave Background */}
        <View style={[s.header, { paddingTop: 40 + insets.top, backgroundColor: theme === 'dark' ? '#090D16' : '#F1F5F9' }]}>
          {/* Subtle Wave SVG */}
          <View pointerEvents="none" style={s.wave}>
            <Svg viewBox="0 0 1440 320" width="100%" height="100%">
              <Path fill={theme === 'dark' ? '#05070D' : '#ffffff'} fillOpacity={1} d={WAVE_PATH} />
            </Svg>
          </View>

          <View style={{ zIndex: 10, gap: 16 }}>
            {/* Pickup Selector */}
            <Appear from={{ y: -10 }}>
              <Pressable
                onPress={() => navigate('/taxi/user/parcel/details', { state: { editPickup: true, pickup: pickupAddress, pickupCoords } })}
                style={[s.pickupCard, theme === 'dark' ? s.pickupCardDark : s.pickupCardLight]}
              >
                <View style={[s.pickupIcon, { backgroundColor: theme === 'dark' ? alpha('#10b981', 0.1) : u.soft }]}>
                  <MapPin size={20} color="#10b981" fill={alpha('#10b981', 0.2)} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.pickupLabel}>PICK UP FROM</Text>
                  <Text numberOfLines={1} style={[s.pickupAddress, { color: theme === 'dark' ? '#e2e8f0' : u.text }]}>{pickupAddress}</Text>
                </View>
                <ChevronRight size={18} color={u.text2} />
              </Pressable>
            </Appear>
          </View>
        </View>

        {/* Main Content Area */}
        <View style={s.main}>
          {/* Category Grid */}
          <View style={s.grid}>
            {DELIVERY_CATEGORY_OPTIONS.map((cat, idx) => (
              <Appear key={cat.id} from={{ scale: 0.9 }} delay={idx * 100} style={s.gridCell}>
                <Pressable
                  onPress={() => handleCategorySelect(cat)}
                  style={({ pressed }) => [
                    s.categoryCard,
                    theme === 'dark' ? s.categoryCardDark : s.categoryCardLight,
                    pressed && { transform: [{ scale: 0.95 }] },
                  ]}
                >
                  <View style={s.categoryImageWrap}>
                    <AppImage src={cat.img} style={s.categoryImage} contentFit="contain" />
                  </View>
                  <Text style={s.categoryTitle}>{cat.title}</Text>
                </Pressable>
              </Appear>
            ))}
          </View>

          {/* Promo Banner: Explore Porter Rewards */}
          <Appear from={{ x: -20 }} delay={400}>
            <Pressable onPress={() => navigate('/taxi/user/referral')}>
              <LinearGradient
                colors={['#fef3c7', '#fef9c3', '#fefce8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.promo}
              >
                <View style={s.promoRow}>
                  <View style={s.promoLeft}>
                    <LinearGradient colors={['#fde047', '#ca8a04']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.coin}>
                      <View style={s.coinInner}>
                        <Text style={s.coinText}>₹</Text>
                      </View>
                    </LinearGradient>
                    <View>
                      <Text style={s.promoTitle}>Explore Rewards</Text>
                      <Text style={s.promoSub}>Earn 2 coins for every 100 spent</Text>
                    </View>
                  </View>
                  <View style={s.promoArrow}>
                    <ArrowRight size={18} strokeWidth={3} color="#0f172a" />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          </Appear>

          {/* Footer Illustration */}
          <View style={s.footer}>
            <Appear from={{ y: 20 }} style={s.illustration}>
              {/* Simulated Road */}
              <View style={[s.road, { backgroundColor: theme === 'dark' ? 'rgba(39,39,42,0.5)' : 'rgba(226,232,240,0.5)' }]} />
              <AppImage src={trucksImg} style={[StyleSheet.absoluteFill, { opacity: 0.2 }]} contentFit="contain" />
              <View style={s.illustrationPin}>
                <MapPin size={24} color={alpha('#3b82f6', 0.4)} />
              </View>
            </Appear>
          </View>
        </View>
      </ScrollView>

      {/* Floating Back Button */}
      <Pressable
        onPress={() => navigate(-1)}
        style={({ pressed }) => [
          s.backButton,
          { top: 8 + insets.top },
          theme === 'dark' ? s.backButtonDark : s.backButtonLight,
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        <ArrowLeft size={16} color={u.text} />
      </Pressable>
    </Screen>
  );
};

const useStyles = makeStyles((t) => {
  const u = userTokens(t.dark);
  return {
    header: { position: 'relative', paddingBottom: 80, paddingHorizontal: 24, overflow: 'hidden' },
    wave: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 64, opacity: 0.2 },
    pickupCard: { borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, ...USER_SHADOW },
    pickupCardDark: { backgroundColor: '#111827', borderColor: 'rgba(39,39,42,0.85)' },
    pickupCardLight: { backgroundColor: u.card, borderColor: 'rgba(255,255,255,0.5)' },
    pickupIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    pickupLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, color: u.text2 },
    pickupAddress: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    main: { flex: 1, paddingHorizontal: 20, marginTop: -40, zIndex: 20, paddingBottom: 40 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 32 },
    gridCell: { width: '48.4%' },
    categoryCard: { borderRadius: 24, padding: 16, alignItems: 'center', gap: 16, borderWidth: 1, aspectRatio: 0.85, ...USER_SHADOW },
    categoryCardDark: { backgroundColor: '#111827', borderColor: 'rgba(39,39,42,0.8)' },
    categoryCardLight: { backgroundColor: u.card, borderColor: 'rgba(241,245,249,0.5)' },
    categoryImageWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
    categoryImage: { width: '100%', height: 110 },
    categoryTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700', textAlign: 'center', color: u.text },
    promo: { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(254,240,138,0.6)', padding: 20, marginBottom: 32, overflow: 'hidden', ...USER_SHADOW },
    promoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    promoLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 },
    coin: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.2)' },
    coinInner: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
    coinText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: '#ffffff' },
    // text-dark-force / text-dark-force-muted (index.css): dark text on the yellow card in both themes
    promoTitle: { fontSize: 17, lineHeight: 20, fontWeight: '700', letterSpacing: -0.4, color: '#0f172a' },
    promoSub: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600', color: '#475569' },
    promoArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15,23,42,0.1)', alignItems: 'center', justifyContent: 'center' },
    footer: { marginTop: 16, alignItems: 'center' },
    illustration: { width: '100%', maxWidth: 320, aspectRatio: 16 / 9 },
    road: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 16, borderRadius: 9999 },
    illustrationPin: { position: 'absolute', top: '50%', left: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: alpha('#3b82f6', 0.1), alignItems: 'center', justifyContent: 'center' },
    backButton: { position: 'absolute', left: 16, zIndex: 50, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    backButtonDark: { backgroundColor: u.card, borderColor: u.border, elevation: 4, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    backButtonLight: { backgroundColor: u.card, borderColor: 'rgba(226,232,240,0.8)', ...USER_SHADOW },
  };
});

export default ParcelType;
