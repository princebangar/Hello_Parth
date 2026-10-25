// Web: modules/Taxi/modules/user/pages/Home.jsx — the Taxi customer home (mobile layout): app bar (SuperAppHomeHeader),
// home banner, "Where do you want to go?", recent places, active-ride strip, Everything In Minutes, Explore, promo
// carousel, Go Places, scheduled-ride tracker and the All Services dialog. The desktop (lg) layout is not built.
// Active ride: GET /rides/active/me (15 s while a ride is active, 60/120/180 s backoff while idle, again on focus).
// Native: recent-place road distances use the Routes API (@/lib/google computeRoute) instead of the map's JS SDK.
import { useBottomNavSpace } from '@/native/ui/useBottomNavSpace';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Clock, Heart, Search, ShieldCheck, User, X } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Dialog, StatusBarSpacer, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { computeRoute } from '@/lib/google';
import SuperAppHomeHeader from '@/shared/components/SuperAppHomeHeader';
import { getVerticalTheme } from '@/shared/constants/superAppVerticalTheme';
import ServiceGrid from '../components/ServiceGrid';
import ServiceArt, { ServiceArtBox } from '../components/ServiceArt';
import useTaxiNotificationUnread from '../utils/useTaxiNotificationUnread';
import LocationDetector from '../components/LocationDetector';
import TaxiHomeBanner from '../components/TaxiHomeBanner';

import taxiFallback from '../../../assets/user-app/taxi.png';
import bikeFallback from '../../../assets/user-app/bike.png';
import parcelFallback from '../../../assets/user-app/parcel.png';
import busFallback from '../../../assets/user-app/bus.png';
import yellowTaxiImg from '../../../assets/user-app/yellow-taxi.jpg';
import seamlessHighwayBg from '@/assets/seamless_highway_bg.png';
import airplaneIcon from '../../../assets/3d images/AutoCab/airoplan.png';
import railwayIcon from '../../../assets/3d images/AutoCab/one way.png';
import busStationIcon from '../../../assets/3d images/AutoCab/bus.png';
import api from '../../../shared/api/axiosInstance';
import { useSettings, normalizeAssetUrl } from '../../../shared/context/SettingsContext';
import { useUserTheme, useUserPalette, USER_SHADOW } from '../../../shared/context/UserThemeContext';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';
import { getLocalUserToken, clearLocalUserSession } from '../services/authService';
import { getSavedLocation } from '../services/locationStore';
import { hasPersistentMap } from '../utils/persistentMap';
import useTaxiZoneGate from '../utils/useTaxiZoneGate';
import { showHelloParthBrandedToast } from '@/shared/utils/customToasts';
import { getFoodStyleLocationParts } from '@/shared/utils/sharedUserLocation';
import { cleanRecentPlace } from '../utils/preciseLocation';
import { distanceBetweenKm } from '../utils/nearbyPlaces';
import OutOfZoneScreen from '@food/components/user/OutOfZoneScreen';
import {
  CURRENT_RIDE_UPDATED_EVENT,
  getCurrentRide,
  getCurrentRideSignature,
  isActiveCurrentRide,
  saveCurrentRide,
  clearCurrentRide,
} from '../services/currentRideService';

const RECENT_MAX_DISTANCE_KM = 50;
const ACTIVE_RIDE_SYNC_INTERVAL_MS = 15000;
const IDLE_RIDE_SYNC_INTERVALS_MS = [60000, 120000, 180000];
const DEFERRED_SECTION_DELAY_MS = 250;
const FORCED_SYNC_COOLDOWN_MS = 10000;
const TAXI_BANNER_KNOWN_KEY = 'helloparth:taxi-home-banner-known';
const TAXI_BAR_COLOR = getVerticalTheme('taxi').theme;

const getDynamicImageSrc = (item = {}, fallbackImage) => {
  const rawImage = item.uploadedImage || item.imageUrl || item.image || item.bannerImage || item.thumbnail || item.url || item.icon || null;

  if (!rawImage) {
    return fallbackImage;
  }

  let imageUrl = rawImage;
  if (!rawImage.startsWith('http') && !rawImage.startsWith('data:')) {
    const origin = BACKEND_ORIGIN.replace('/api/v1', '');
    const cleanPath = rawImage.startsWith('/') ? rawImage : `/${rawImage}`;
    imageUrl = `${origin}${cleanPath}`;
  }

  if (item.updatedAt) {
    const separator = imageUrl.includes('?') ? '&' : '?';
    imageUrl = `${imageUrl}${separator}v=${item.updatedAt}`;
  }

  return imageUrl;
};

/** <img> that falls back to `fallbackImage` when the uploaded one fails. */
const SafeImage = ({ item, fallbackImage, style, contentFit = 'contain' }) => {
  const resolved = getDynamicImageSrc(item, fallbackImage);
  return <AppImage src={resolved} fallback={fallbackImage} accessibilityLabel={item?.title || ''} contentFit={contentFit} style={style} />;
};

const getCurrentRideIcon = (ride) => {
  const customIcon = String(ride?.vehicleIconUrl || ride?.vehicle?.vehicleIconUrl || ride?.vehicle?.icon || ride?.driver?.vehicleIconUrl || '').trim();

  if (customIcon && !customIcon.includes('localhost') && !customIcon.startsWith('/')) {
    return customIcon;
  }

  const serviceType = String(ride?.serviceType || ride?.type || '').toLowerCase();
  const iconType = String(ride?.vehicleIconType || ride?.driver?.vehicleIconType || ride?.driver?.vehicleType || '').toLowerCase();

  if (serviceType === 'parcel' || serviceType === 'delivery') {
    return parcelFallback;
  }
  if (iconType.includes('bike')) {
    return bikeFallback;
  }
  if (iconType.includes('auto')) {
    return taxiFallback;
  }
  if (serviceType === 'bus') {
    return busFallback;
  }
  return taxiFallback;
};

const defaultSettings = {
  homeSections: {
    enableEverything: true,
    enableExplore: true,
    enablePromo: true,
    enableGoPlaces: true,
  },
  everything: [
    { id: '1', title: 'Parcel', subtitle: 'Send anything', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Bike Taxi', subtitle: 'Beat the traffic', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Car Taxi', subtitle: 'Everyday rides', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'All Services', subtitle: 'All Services', image: '', route: '', order: 4, status: 'active' },
  ],
  explore: [
    { id: '1', title: 'Parcel on Bike', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Auto', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Cab Economy', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'Bike', image: '', route: '/taxi/user/ride/select-location', order: 4, status: 'active' },
  ],
  promos: [
    {
      id: '1',
      title: 'Experience A New Standard With Hello Parth',
      subtitle: 'A premier private hire service where luxury and reliability converge.',
      image: '',
      route: '/taxi/user/ride/select-location',
      order: 1,
      status: 'active',
    },
    {
      id: '2',
      title: 'Need to Send Packages? Try Parcel!',
      subtitle: 'Fast and secure delivery across your city at affordable prices.',
      image: '',
      route: '/taxi/user/parcel/type',
      order: 2,
      status: 'active',
    },
  ],
  goPlaces: [
    { id: '1', title: 'Hassle-Free City Rides', image: '', route: '/taxi/user/ride/select-location', order: 1, status: 'active' },
    { id: '2', title: 'Quick Rides to Railway Station', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Ride to Bus Terminal', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
  ],
};

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Scheduled time pending';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Scheduled time pending';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScheduledCountdownLabel = (value, now = Date.now()) => {
  const parsed = value ? new Date(value) : null;
  const time = parsed?.getTime?.() || NaN;

  if (!Number.isFinite(time)) {
    return '';
  }

  const diffMs = time - now;
  if (diffMs <= 0) {
    return 'Pickup window is opening now';
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `Starts in ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `Starts in ${hours}h ${minutes}m`;
  }

  return `Starts in ${minutes}m`;
};

/** motion initial={{ opacity: 0 }} animate={{ opacity: 1 }} (0.2 s, easeOut) */
const FadeIn = ({ children, style }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
};

/** animate-pulse block */
const PulseBlock = ({ style }) => {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[style, { opacity: v }]} />;
};

/** animate-ping dot */
const PingDot = ({ size = 8 }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: size,
            backgroundColor: colors.emerald[400],
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
          },
        ]}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: colors.emerald[500] }} />
    </View>
  );
};

/** whileTap={{ scale }} */
const TapScale = ({ scale = 0.97, style, children, ...rest }) => (
  <Pressable {...rest} style={({ pressed }) => [typeof style === 'function' ? style({ pressed }) : style, pressed && { transform: [{ scale }] }]}>
    {children}
  </Pressable>
);

const RecentLocationsList = ({ routePrefix }) => {
  const navigate = useNavigate();
  const { theme } = useUserTheme();
  const p = useUserPalette();
  const isDark = theme === 'dark';

  const [recentLocations, setRecentLocations] = useState(() => {
    try {
      const saved = window.localStorage.getItem('helloparth:recentLocations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    // A new user has no recent places yet — never show made-up ones.
    return [];
  });

  const getSavedLocationCoords = () => {
    const saved = getSavedLocation();
    if (Number.isFinite(saved?.lat) && Number.isFinite(saved?.lon)) {
      return [saved.lon, saved.lat];
    }
    return null;
  };

  useEffect(() => {
    const handleRefresh = () => {
      try {
        const saved = window.localStorage.getItem('helloparth:recentLocations');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRecentLocations(parsed);
          }
        }
      } catch (e) {}
    };
    window.addEventListener('storage', handleRefresh);
    window.addEventListener('helloparth:recent-locations-updated', handleRefresh);
    return () => {
      window.removeEventListener('storage', handleRefresh);
      window.removeEventListener('helloparth:recent-locations-updated', handleRefresh);
    };
  }, []);

  // Distances are the road distance from the current location (what Google Maps shows), not the straight line.
  const [recentRoadMeters, setRecentRoadMeters] = useState({});
  const recentOriginKey = (getSavedLocationCoords() || []).join(',');
  // Only places near the person's current location are suggested here.
  const nearbyRecents = useMemo(() => {
    const origin = getSavedLocationCoords();
    if (!origin) return recentLocations.map(cleanRecentPlace);
    return recentLocations
      .filter((item) => {
        if (!item.lat || !item.lon) return false;
        const km = distanceBetweenKm(origin, [Number(item.lon), Number(item.lat)]);
        return Number.isFinite(km) && km <= RECENT_MAX_DISTANCE_KM;
      })
      .map(cleanRecentPlace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentLocations, recentOriginKey]);

  useEffect(() => {
    const origin = getSavedLocationCoords();
    const items = nearbyRecents.slice(0, 3).filter((item) => item.lat && item.lon);
    if (!origin || items.length === 0) return undefined;
    let cancelled = false;
    Promise.all(
      items.map((item) =>
        computeRoute({ lat: origin[1], lng: origin[0] }, { lat: Number(item.lat), lng: Number(item.lon) })
          .then((route) => (Number.isFinite(route?.distanceMeters) && route.distanceMeters > 0 ? route.distanceMeters : null))
          .catch(() => null),
      ),
    ).then((meters) => {
      if (cancelled) return;
      const next = {};
      items.forEach((item, index) => {
        if (Number.isFinite(meters[index])) next[`${item.lat},${item.lon}`] = meters[index];
      });
      setRecentRoadMeters(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyRecents, recentOriginKey]);

  const recentList = useMemo(() => {
    return nearbyRecents
      .map((item) => {
        const meters = recentRoadMeters[`${item.lat},${item.lon}`];
        const distanceLabel = Number.isFinite(meters)
          ? meters < 1000
            ? `${Math.max(10, Math.round(meters / 10) * 10)} m`
            : `${(meters / 1000).toFixed(1)} km`
          : '';
        return {
          ...item,
          distance: distanceLabel || 'Recent',
        };
      })
      .slice(0, 3);
  }, [nearbyRecents, recentRoadMeters]);

  return (
    <View style={styles.recentList}>
      {recentList.map((item, index) => (
        <View key={index} style={{ width: '100%' }}>
          <View style={styles.recentRow}>
            <Pressable
              onPress={() =>
                navigate(`${routePrefix}/ride/select-location`, {
                  state: {
                    drop: item.address,
                    dropCoords: item.lat && item.lon ? [item.lon, item.lat] : null,
                    activeInput: 'drop',
                  },
                })
              }
              style={styles.recentMain}
            >
              {/* bg-slate-900 / bg-slate-100 + border-slate-800 / border-slate-200 + text-slate-400 / -500 (index.css remaps) */}
              <View style={[styles.recentIcon, { backgroundColor: isDark ? p.cardBg : p.cardSoft, borderColor: p.border }]}>
                <Clock size={16} color={isDark ? p.textSecondary : p.textMuted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.recentName, { color: isDark ? p.textPrimary : '#0B1220' }]}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={[styles.recentAddress, { color: isDark ? p.textSecondary : '#64748B' }]}>
                  {item.distance && `${item.distance} • `}
                  {item.address}
                </Text>
              </View>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                const updated = recentLocations.map((loc) => {
                  if (loc.address === item.address) {
                    return { ...loc, favourite: !loc.favourite };
                  }
                  return loc;
                });
                setRecentLocations(updated);
                localStorage.setItem('helloparth:recentLocations', JSON.stringify(updated));
              }}
              style={styles.heartBtn}
            >
              <Heart size={16} color={item.favourite ? colors.rose[500] : p.textSecondary} fill={item.favourite ? colors.rose[500] : 'none'} />
            </Pressable>
          </View>
          {index < recentList.length - 1 && (
            <View style={[styles.dashed, { borderColor: isDark ? alpha(colors.slate[800], 0.8) : alpha(colors.slate[200], 0.8) }]} />
          )}
        </View>
      ))}
    </View>
  );
};

/** The promo carousel (index.css .promo-carousel / .promo-track / .promo-slide / .promo-dots). */
const PromoCarousel = ({ promoBanners, currentPromoIndex, setCurrentPromoIndex, isHoveringPromo, setIsHoveringPromo, onOpen }) => {
  const p = useUserPalette();
  const [width, setWidth] = useState(0);
  const translate = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const fallbackImages = [yellowTaxiImg, seamlessHighwayBg];

  useEffect(() => {
    Animated.timing(translate, { toValue: -currentPromoIndex * width, duration: 450, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
  }, [currentPromoIndex, width, translate]);

  useEffect(() => {
    progress.setValue(0);
    if (isHoveringPromo) return undefined;
    const anim = Animated.timing(progress, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [currentPromoIndex, isHoveringPromo, progress]);

  const handleTouchStart = (e) => {
    touchStartX.current = e.nativeEvent.pageX;
    touchEndX.current = e.nativeEvent.pageX;
    setIsHoveringPromo(true);
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.nativeEvent.pageX;
  };

  const handleTouchEnd = () => {
    setIsHoveringPromo(false);
    const diffX = touchStartX.current - touchEndX.current;
    if (Math.abs(diffX) > 50) {
      if (diffX > 0) {
        setCurrentPromoIndex((prev) => (prev + 1) % promoBanners.length);
      } else {
        setCurrentPromoIndex((prev) => (prev - 1 + promoBanners.length) % promoBanners.length);
      }
    }
  };

  return (
    <View style={styles.promoOuter} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={() => setIsHoveringPromo(false)}>
      <View style={[styles.promoCarousel, { borderColor: p.border }, p.cardShadow]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Animated.View style={[styles.promoTrack, { width: width * Math.max(1, promoBanners.length), transform: [{ translateX: translate }] }]}>
          {promoBanners.map((item, idx) => {
            const fallback = fallbackImages[idx % fallbackImages.length];
            const resolvedImgSrc = getDynamicImageSrc(item, fallback);
            const words = item.title ? item.title.split(' ') : [];
            return (
              <Pressable key={item.id || item._id || idx} style={[styles.promoSlide, { width }]} onPress={() => onOpen(item)}>
                <AppImage src={resolvedImgSrc} fallback={fallback} accessibilityLabel={item.title || 'Promo'} contentFit="cover" style={styles.promoImage} />
                <LinearGradient
                  colors={[colors.slate[950], alpha(colors.slate[950], 0.8), 'transparent']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
                />
                <View style={styles.promoTextBox}>
                  <View style={{ maxWidth: '80%', gap: 6 }}>
                    <Text style={styles.promoTitle}>
                      <Text style={[styles.promoTitle, { color: '#FFC400' }]}>{words[0] || ''}</Text> {words.slice(1).join(' ')}
                    </Text>
                    {item.subtitle ? (
                      <Text numberOfLines={2} style={styles.promoSubtitle}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Autoplay Linear Progress Bar */}
        {promoBanners.length > 1 && (
          <View style={styles.progressTrack} pointerEvents="none">
            <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
        )}

        {/* Page Indicators */}
        {promoBanners.length > 1 && (
          <View style={styles.promoDots}>
            {promoBanners.map((_, idx) => (
              <Pressable key={idx} hitSlop={6} onPress={() => setCurrentPromoIndex(idx)} style={[styles.promoDot, idx === currentPromoIndex && styles.promoDotActive]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const AllServicesBottomSheet = ({ open, services, onClose, onServiceClick }) => {
  const p = useUserPalette();
  const { height } = useWindowDimensions();

  return (
    <Dialog open={open} onClose={onClose} backdropOpacity={0.55} style={styles.allServicesShell}>
      <View style={[styles.allServicesSheet, { backgroundColor: p.cardBg, maxHeight: height * 0.8 }]}>
        {/* Header */}
        <View style={[styles.allServicesHeader, { borderBottomColor: p.border }]}>
          <Text style={[styles.allServicesTitle, { color: p.textPrimary }]}>All Services</Text>
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.closeBtn, { backgroundColor: p.cardSoft }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <X size={16} strokeWidth={2.5} color={p.textSecondary} />
          </Pressable>
        </View>

        {/* Services grid — 4 across */}
        <ScrollView style={{ marginTop: 20 }} showsVerticalScrollIndicator={false}>
          <View style={styles.servicesGrid}>
            {services.map((service, index) => {
              const { icon, label, hasImage } = service;
              return (
                <View key={index} style={styles.serviceCell}>
                  <TapScale scale={0.95} onPress={() => onServiceClick(service)} style={styles.serviceBtn}>
                    <ServiceArtBox style={styles.serviceArt64}>
                      <ServiceArt src={hasImage ? icon : ''} label={label} hint={label} size={28} imgPadding={8} />
                    </ServiceArtBox>
                    <Text style={[styles.serviceLabel, { color: p.textPrimary }]}>{label}</Text>
                  </TapScale>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Dialog>
  );
};

const Home = () => {
  const bottomNavSpace = useBottomNavSpace();
  const unreadNotifications = useTaxiNotificationUnread();
  const outOfZone = useTaxiZoneGate();
  useEffect(() => {
    if (!outOfZone) return undefined;
    const timer = setTimeout(() => {
      showHelloParthBrandedToast({
        id: 'out-of-zone-toast',
        title: 'Our services are unavailable here right now.',
        message: 'Please choose a different location',
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [outOfZone]);
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const { settings, loading: settingsBootLoading, settingsFresh, refreshSettings } = useSettings();
  // A pull to refresh puts the sections back on their skeletons until the settings answer arrives.
  const settingsLoading = settingsBootLoading || refreshing;
  const taxiBannerUrl = normalizeAssetUrl(settings?.homeBanner?.taxiImageUrl);
  // The server has not answered yet and the saved copy has no image: keep the area plain colour instead of flashing the
  // default design and then swapping it — but only when it is not known yet whether a banner is uploaded at all. Once
  // the server has said "no uploaded banner" (remembered below), the default banner shows at once on the next start
  // instead of a plain block until the settings refresh arrives.
  const knownNoUploadedBanner = (() => {
    try {
      return localStorage.getItem(TAXI_BANNER_KNOWN_KEY) === 'none';
    } catch {
      return false;
    }
  })();
  const taxiBannerPending = !settingsFresh && !taxiBannerUrl && !knownNoUploadedBanner;
  useEffect(() => {
    if (!settingsFresh) return;
    try {
      localStorage.setItem(TAXI_BANNER_KNOWN_KEY, taxiBannerUrl ? 'uploaded' : 'none');
    } catch {
      // only a start-up nicety
    }
  }, [settingsFresh, taxiBannerUrl]);
  const { theme } = useUserTheme();
  const p = useUserPalette();
  const isDark = theme === 'dark';
  const scrollRef = useRef(null);
  const [uiSettings, setUiSettings] = useState(() => {
    try {
      if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
        return settings.userHomeSettings;
      }
      const saved = window.localStorage.getItem('helloparth:admin:user-app-settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return defaultSettings;
  });

  useEffect(() => {
    if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
      setUiSettings((prev) => (JSON.stringify(prev) === JSON.stringify(settings.userHomeSettings) ? prev : settings.userHomeSettings));
    }
  }, [settings?.userHomeSettings]);

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = window.localStorage.getItem('helloparth:admin:user-app-settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setUiSettings((prev) => (JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed));
        } else if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
          setUiSettings((prev) => (JSON.stringify(prev) === JSON.stringify(settings.userHomeSettings) ? prev : settings.userHomeSettings));
        } else {
          setUiSettings((prev) => (prev === defaultSettings ? prev : defaultSettings));
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [settings?.userHomeSettings]);

  const [isAllServicesOpen, setIsAllServicesOpen] = useState(false);
  const [activeServices, setActiveServices] = useState([]);
  const [currentRide, setCurrentRide] = useState(() => {
    const ride = getCurrentRide();
    return isActiveCurrentRide(ride) ? ride : null;
  });
  const [clockNow, setClockNow] = useState(() => Date.now());
  // The GPS / address lookup (LocationDetector) starts a beat after the first paint on a cold start.
  const [showDeferredSections, setShowDeferredSections] = useState(() => hasPersistentMap() || Boolean(getSavedLocation()?.address));
  const [currentPromoIndex, setCurrentPromoIndex] = useState(0);
  const [isHoveringPromo, setIsHoveringPromo] = useState(false);
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const currentRideRef = useRef(currentRide);
  const syncCurrentRideRef = useRef(null);
  const [serviceGridKey, setServiceGridKey] = useState(0);
  const lastSyncAtRef = useRef(0);
  const consecutiveIdleMissesRef = useRef(0);
  const lastRideSignatureRef = useRef(getCurrentRideSignature(currentRide));

  const persistCurrentRide = (ride) => {
    const normalizedRide = isActiveCurrentRide(ride) ? ride : null;
    const nextSignature = getCurrentRideSignature(normalizedRide);

    if (lastRideSignatureRef.current === nextSignature) {
      return;
    }

    lastRideSignatureRef.current = nextSignature;
    setCurrentRide(normalizedRide);

    if (normalizedRide) {
      saveCurrentRide(normalizedRide);
    } else {
      clearCurrentRide();
    }
  };

  useEffect(() => {
    currentRideRef.current = currentRide;
    lastRideSignatureRef.current = getCurrentRideSignature(currentRide);
  }, [currentRide]);

  const rawBanners = uiSettings?.promos || defaultSettings.promos;
  const promoBanners = useMemo(() => {
    if (!Array.isArray(rawBanners)) return [];
    return rawBanners.filter((b) => {
      const imageSrc = b.uploadedImage || b.imageUrl || b.image || b.bannerImage || b.thumbnail || b.url;
      return b.status !== false && b.status !== 'inactive' && imageSrc;
    });
  }, [rawBanners]);

  useEffect(() => {
    setCurrentPromoIndex(0);
  }, [promoBanners.length]);

  useEffect(() => {
    if (!promoBanners || promoBanners.length <= 1) return undefined;
    if (isHoveringPromo) return undefined;

    const interval = setInterval(() => {
      setCurrentPromoIndex((prev) => (prev + 1) % promoBanners.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [promoBanners.length, isHoveringPromo]);

  // A vehicle on the default banner starts a booking for that vehicle type (same as its tile in the grid).
  const handleHeroPick = (category) => {
    try {
      localStorage.setItem('selectedVehicleType', category);
    } catch {
      /* ignore */
    }
    navigate(`${routePrefix}/ride/select-location?vehicleType=${category}`, {
      state: { selectedCategory: category, flow: 'ride', activeInput: 'drop' },
    });
  };

  const handleServiceClick = (service) => {
    // Scroll to top immediately upon clicking a service
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });

    // Helper to map fallback routes to registered routes defensively
    const cleanRoute = (route) => {
      if (!route) return '/taxi/user/ride/select-location';
      if (route === '/delivery') return '/taxi/user/parcel/type';
      if (route === '/bus') return '/taxi/user/bus';
      if (route === '/truck') return '/taxi/user/ride/select-location';
      return route;
    };

    const targetRoute = service.actionRoute || service.route;

    if (targetRoute === 'ALL_SERVICES_MODAL') {
      setIsAllServicesOpen(true);
      return;
    }

    if (targetRoute && targetRoute.trim() !== '') {
      setIsAllServicesOpen(false);

      let vehicleType = '';
      const tName = String(service.name || service.label || service.title || '').toLowerCase();
      if (tName.includes('bike') || tName.includes('moto')) vehicleType = 'bike';
      else if (tName.includes('auto')) vehicleType = 'auto';
      else if (tName.includes('cab') || tName.includes('taxi') || tName.includes('car') || tName === 'book now' || tName === 'ride') vehicleType = 'cab';
      else if (tName.includes('parcel') || tName.includes('delivery')) vehicleType = 'parcel';

      if (vehicleType && vehicleType !== 'parcel') {
        localStorage.setItem('selectedVehicleType', vehicleType);
        navigate(`/taxi/user/ride/select-location?vehicleType=${vehicleType}`, { state: { selectedCategory: vehicleType } });
      } else {
        localStorage.removeItem('selectedVehicleType');
        navigate(cleanRoute(targetRoute), { state: { selectedCategory: vehicleType } });
      }
      return;
    }

    const name = String(service.name || service.label || service.title || '').toLowerCase();
    const serviceType = String(service.service_type || service.serviceType || service.moduleService || '').toLowerCase();
    const transportType = String(service.transport_type || service.transportType || '').toLowerCase();

    // Close any open bottom sheet/modal
    setIsAllServicesOpen(false);

    const definedPath = service.path;
    if (definedPath && definedPath.trim() !== '') {
      let vehicleType = '';
      if (name.includes('bike') || name.includes('moto')) vehicleType = 'bike';
      else if (name.includes('auto')) vehicleType = 'auto';
      else if (name.includes('cab') || name.includes('taxi') || name.includes('car') || name === 'book now' || name === 'ride') vehicleType = 'cab';
      else if (name.includes('parcel') || name.includes('delivery')) vehicleType = 'parcel';

      if (vehicleType && vehicleType !== 'parcel') {
        localStorage.setItem('selectedVehicleType', vehicleType);
        navigate(`/taxi/user/ride/select-location?vehicleType=${vehicleType}`, { state: { selectedCategory: vehicleType } });
      } else {
        localStorage.removeItem('selectedVehicleType');
        navigate(cleanRoute(definedPath), { state: { selectedCategory: vehicleType } });
      }
      return;
    }

    if (name.includes('parcel') || name.includes('delivery') || name.includes('courier') || serviceType.includes('delivery') || serviceType.includes('parcel')) {
      navigate('/taxi/user/parcel/type');
      return;
    }

    if (name.includes('bus') || transportType.includes('bus') || serviceType.includes('bus')) {
      navigate('/taxi/user/bus');
      return;
    }

    // Pooling is switched off until the new pooling flow is built.
    if (name.includes('pooling') || serviceType.includes('pooling')) {
      return;
    }

    if (name.includes('outstation') || name.includes('intercity') || serviceType.includes('intercity')) {
      navigate('/taxi/user/intercity');
      return;
    }

    if (name.includes('truck')) {
      navigate('/taxi/user/ride/select-location');
      return;
    }

    let selectedCategory = '';
    if (name.includes('bike') || name.includes('moto')) selectedCategory = 'bike';
    else if (name.includes('auto')) selectedCategory = 'auto';
    else if (name.includes('cab') || name.includes('taxi') || name.includes('car')) selectedCategory = 'cab';

    // Default ride / taxi / cab / bike flow
    navigate('/taxi/user/ride/select-location', { state: { selectedCategory } });
  };

  useEffect(() => {
    const token = getLocalUserToken();
    if (!token) {
      clearLocalUserSession();
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const shouldTickClock = Number.isFinite(currentRide?.scheduledAt ? new Date(currentRide.scheduledAt).getTime() : NaN);

  useEffect(() => {
    if (!shouldTickClock) {
      return undefined;
    }

    const timer = setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [shouldTickClock]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        setShowDeferredSections(true);
      }
    }, DEFERRED_SECTION_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const refreshCurrentRide = () => {
      const ride = getCurrentRide();
      const nextRide = isActiveCurrentRide(ride) ? ride : null;
      lastRideSignatureRef.current = getCurrentRideSignature(nextRide);
      setCurrentRide(nextRide);
    };

    refreshCurrentRide();
    window.addEventListener('storage', refreshCurrentRide);
    window.addEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);

    let cancelled = false;
    let syncTimer = null;
    let syncInFlight = false;

    const scheduleNextSync = () => {
      if (cancelled) {
        return;
      }

      const nextInterval = currentRideRef.current
        ? ACTIVE_RIDE_SYNC_INTERVAL_MS
        : IDLE_RIDE_SYNC_INTERVALS_MS[Math.min(consecutiveIdleMissesRef.current, IDLE_RIDE_SYNC_INTERVALS_MS.length - 1)];
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncCurrentRide();
      }, nextInterval);
    };

    const syncCurrentRide = async (reason = 'timer') => {
      if (cancelled || syncInFlight || document.visibilityState === 'hidden') {
        scheduleNextSync();
        return;
      }

      // `mount` is exempt from the cooldown.
      if (reason === 'focus' && Date.now() - lastSyncAtRef.current < FORCED_SYNC_COOLDOWN_MS) {
        return;
      }

      syncInFlight = true;
      lastSyncAtRef.current = Date.now();
      try {
        const token = getLocalUserToken();
        if (!token) {
          persistCurrentRide(null);
          currentRideRef.current = null;
          consecutiveIdleMissesRef.current = 0;
          return;
        }

        let rideData = null;

        try {
          rideData = unwrapApiPayload(await api.get('/rides/active/me'));
        } catch (error) {
          const status = Number(error?.response?.status || 0);
          if (status !== 404) {
            throw error;
          }
        }

        if (rideData?._id || rideData?.rideId) {
          const normalizedRide = {
            rideId: rideData._id || rideData.rideId,
            pickup: rideData.pickupAddress || rideData.pickup,
            drop: rideData.dropAddress || rideData.drop,
            pickupCoords: rideData.pickupLocation?.coordinates || rideData.pickupCoords || null,
            dropCoords: rideData.dropLocation?.coordinates || rideData.dropCoords || null,
            fare: rideData.fare,
            baseFare: rideData.baseFare || rideData.fare || 0,
            status: rideData.status,
            liveStatus: rideData.liveStatus,
            serviceType: rideData.serviceType,
            scheduledAt: rideData.scheduledAt || null,
            acceptedAt: rideData.acceptedAt || null,
            arrivedAt: rideData.arrivedAt || null,
            estimatedDistanceMeters: rideData.estimatedDistanceMeters || 0,
            estimatedDurationMinutes: rideData.estimatedDurationMinutes || 0,
            paymentMethod: rideData.paymentMethod || 'Cash',
            pricingSnapshot: rideData.pricingSnapshot || null,
            otp: rideData.otp || '',
            driver: rideData.driverId || rideData.driver,
            vehicleIconUrl: rideData.vehicleIconUrl,
            vehicleIconType: rideData.vehicleIconType,
          };
          if (isActiveCurrentRide(normalizedRide)) {
            if (cancelled) return;
            consecutiveIdleMissesRef.current = 0;
            persistCurrentRide(normalizedRide);
            currentRideRef.current = normalizedRide;
            return;
          }
        }

        if (cancelled) return;
        consecutiveIdleMissesRef.current = Math.min(consecutiveIdleMissesRef.current + 1, IDLE_RIDE_SYNC_INTERVALS_MS.length - 1);
        persistCurrentRide(null);
        currentRideRef.current = null;
      } catch {
        // network error: try again on the next tick
      } finally {
        syncInFlight = false;
        scheduleNextSync();
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState !== 'hidden') {
        syncCurrentRide('focus');
      }
    };

    syncCurrentRideRef.current = syncCurrentRide;
    syncCurrentRide('mount');
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      cancelled = true;
      syncCurrentRideRef.current = null;
      if (syncTimer) {
        clearTimeout(syncTimer);
      }
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
      window.removeEventListener('storage', refreshCurrentRide);
      window.removeEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull to refresh: the home sections go back to their skeletons while settings, services and the active ride reload.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setServiceGridKey((k) => k + 1);
    try {
      await Promise.all([refreshSettings(), syncCurrentRideRef.current?.('refresh')]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshSettings]);

  const driverName = currentRide?.driver?.name || 'Captain';
  const serviceType = String(currentRide?.serviceType || currentRide?.type || 'ride').toLowerCase();
  const vehicleLabel = currentRide?.driver?.vehicle || currentRide?.driver?.vehicleType || (serviceType === 'parcel' ? 'Parcel' : 'Taxi');
  const currentRideIcon = getCurrentRideIcon(currentRide);
  const trackingPath = serviceType === 'parcel' ? `${routePrefix}/parcel/tracking` : `${routePrefix}/ride/tracking`;
  const rideStage = String(currentRide?.liveStatus || currentRide?.status || 'accepted').toLowerCase();
  const hasAssignedDriver = Boolean(currentRide?.driver?._id || currentRide?.driver?.id || currentRide?.driver?.name);
  const scheduledTimestamp = currentRide?.scheduledAt ? new Date(currentRide.scheduledAt).getTime() : NaN;
  const isScheduledRide = Number.isFinite(scheduledTimestamp);
  const isScheduledUpcoming = isScheduledRide && scheduledTimestamp > clockNow;
  const isScheduledAcceptedRide =
    ['ride', 'intercity'].includes(serviceType) && isScheduledUpcoming && hasAssignedDriver && ['accepted', 'arriving'].includes(rideStage);
  const scheduledDateLabel = formatScheduledDateTime(currentRide?.scheduledAt);
  const scheduledCountdown = getScheduledCountdownLabel(currentRide?.scheduledAt, clockNow);

  const renderExploreSection = () => {
    if (settingsLoading) {
      return (
        <View style={{ paddingTop: 8 }}>
          <PulseBlock style={[styles.skelTitle, { backgroundColor: p.cardSoft }]} />
          <View style={styles.hRowSkeleton}>
            {[...Array(4)].map((_, i) => (
              <PulseBlock key={i} style={[styles.skelExplore, { backgroundColor: p.cardSoft }]} />
            ))}
          </View>
        </View>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enableExplore === false) {
      return null;
    }

    const cards = uiSettings?.explore || defaultSettings.explore;
    const activeCards = cards.filter((c) => c.status === 'active' || c.status === true).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    return (
      <View style={{ paddingTop: 4 }}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: p.textPrimary }]}>Explore</Text>
          <Pressable onPress={() => setIsAllServicesOpen(true)} hitSlop={8} style={styles.viewAllBtn}>
            <Text style={[styles.viewAllText, { color: p.textSecondary }]}>View all</Text>
            <ChevronRight size={14} strokeWidth={2.5} color={p.textSecondary} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.hScroll, { flexGrow: 0 }]} contentContainerStyle={styles.hRow}>
          {activeCards.map((card, idx) => (
            <TapScale
              key={card.id || idx}
              scale={0.96}
              onPress={() => handleServiceClick(card)}
              style={[styles.exploreCard, { backgroundColor: p.cardBg, borderColor: p.border }, p.cardShadow]}
            >
              <ServiceArtBox style={styles.exploreArt}>
                <ServiceArt src={getDynamicImageSrc(card, '')} label={card.title} hint={card.title} size={24} imgPadding={6} />
              </ServiceArtBox>
              <Text numberOfLines={2} style={[styles.exploreLabel, { color: p.textPrimary }]}>
                {card.title}
              </Text>
            </TapScale>
          ))}
        </ScrollView>
      </View>
    );
  };

  const openPromo = (item) => {
    if (item.route) {
      const targetRoute = item.route;
      if (targetRoute.includes('/ride/select-location')) {
        navigate(targetRoute, { state: { activeInput: 'drop', flow: 'ride' } });
      } else {
        navigate(targetRoute);
      }
    } else {
      navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } });
    }
  };

  const renderPromoBanner = () => {
    if (settingsLoading) {
      return (
        <View style={{ paddingTop: 8 }}>
          <PulseBlock style={[styles.skelPromo, { backgroundColor: p.cardSoft }]} />
        </View>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enablePromo === false) {
      return null;
    }
    if (!promoBanners || promoBanners.length === 0) return null;

    return (
      <PromoCarousel
        promoBanners={promoBanners}
        currentPromoIndex={currentPromoIndex}
        setCurrentPromoIndex={setCurrentPromoIndex}
        isHoveringPromo={isHoveringPromo}
        setIsHoveringPromo={setIsHoveringPromo}
        onOpen={openPromo}
      />
    );
  };

  const renderGoPlacesSection = () => {
    if (settingsLoading) {
      return (
        <View style={{ paddingTop: 8, gap: 8 }}>
          <PulseBlock style={[styles.skelTitleWide, { backgroundColor: p.cardSoft }]} />
          <PulseBlock style={[styles.skelSub, { backgroundColor: p.cardSoft }]} />
          <View style={[styles.hRowSkeleton, { gap: 14 }]}>
            {[...Array(3)].map((_, i) => (
              <PulseBlock key={i} style={[styles.skelGoPlace, { backgroundColor: p.cardSoft }]} />
            ))}
          </View>
        </View>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enableGoPlaces === false) {
      return null;
    }

    const cards = uiSettings?.goPlaces || defaultSettings.goPlaces;
    const activeCards = cards.filter((c) => c.status === 'active' || c.status === true).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    const getGoPlacesIcon = (title) => {
      const cleanTitle = String(title || '').toLowerCase();
      if (cleanTitle.includes('airport') || cleanTitle.includes('flight')) return airplaneIcon;
      if (cleanTitle.includes('railway') || cleanTitle.includes('station') || cleanTitle.includes('train')) return railwayIcon;
      if (cleanTitle.includes('bus') || cleanTitle.includes('terminal')) return busStationIcon;
      return railwayIcon;
    };

    return (
      <View style={{ paddingTop: 4 }}>
        <View style={{ marginBottom: 12 }}>
          <Text style={[styles.sectionTitle, { color: p.textPrimary }]}>Go Places with Hello Parth</Text>
          <Text style={[styles.sectionSub, { color: p.textMuted }]}>Fast bookings to key transit hubs</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.hScroll, { flexGrow: 0 }]} contentContainerStyle={styles.hRow}>
          {activeCards.map((card, idx) => (
            <TapScale
              key={card.id || idx}
              onPress={() => {
                if (card.route) {
                  navigate(card.route);
                } else {
                  navigate(`${routePrefix}/ride/select-location`);
                }
              }}
              style={[styles.goCard, { backgroundColor: p.cardBg, borderColor: p.border }, p.cardShadow]}
            >
              <ServiceArtBox style={styles.goArt}>
                <SafeImage item={card} fallbackImage={getGoPlacesIcon(card.title)} style={styles.fill} />
              </ServiceArtBox>
              <View style={styles.goBody}>
                <Text numberOfLines={2} style={[styles.goTitle, { color: p.textPrimary }]}>
                  {card.title}
                </Text>
                <View style={styles.bookNowRow}>
                  <Text style={[styles.bookNow, { color: p.textSecondary }]}>Book now</Text>
                  <ChevronRight size={13} strokeWidth={2.5} color={p.textSecondary} />
                </View>
              </View>
            </TapScale>
          ))}
        </ScrollView>
      </View>
    );
  };

  const exploreSection = renderExploreSection();
  const promoBanner = renderPromoBanner();
  const goPlacesSection = renderGoPlacesSection();

  if (outOfZone) {
    const saved = getSavedLocation();
    return (
      <OutOfZoneScreen
        service="taxi"
        isGuest={!getLocalUserToken()}
        location={{ area: saved?.area || getFoodStyleLocationParts({ address: saved?.address }).title, city: saved?.address }}
        handleLocationClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'pickup', flow: 'ride', fromOutOfZone: true } })}
      />
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: p.bg }]}>
      {/* No map on this screen any more, but the rider's current location is still found here. */}
      {showDeferredSections && <LocationDetector />}

      <ScrollView
        ref={scrollRef}
        style={styles.page}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[TAXI_BAR_COLOR]} progressViewOffset={insets.top + 8} />
        }
      >
        {/* Solid top app bar — location + Food/Taxi switcher. */}
        <View style={styles.appbar}>
          <StatusBarSpacer color={TAXI_BAR_COLOR} />
          <SuperAppHomeHeader activeVertical="taxi" notificationCount={unreadNotifications} />
        </View>

        {/* Banner (image from Global admin, else the default Safe Rides design) */}
        <View style={[styles.bannerWrap, USER_SHADOW]}>
          <TaxiHomeBanner imageUrl={taxiBannerUrl} pending={taxiBannerPending} onPick={handleHeroPick} style={styles.banner} />
        </View>

        {/* Content Sheet — flows directly after the banner */}
        <View style={[styles.homeSheet, { backgroundColor: p.bg, paddingBottom: bottomNavSpace + 8 }]}>
          {/* Search Bar */}
          <FadeIn>
            <TapScale
              scale={0.99}
              onPress={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } })}
              style={[styles.searchBtn, { backgroundColor: p.cardBg, borderColor: p.border }, p.cardShadow]}
            >
              <View style={[styles.searchIcon, { backgroundColor: p.accent }]}>
                <Search size={16} strokeWidth={2.6} color={p.accentInk} />
              </View>
              <Text numberOfLines={1} style={[styles.searchText, { color: p.textPrimary }]}>
                Where do you want to go?
              </Text>
            </TapScale>
          </FadeIn>

          {/* Recent Locations List */}
          <FadeIn>
            <RecentLocationsList routePrefix={routePrefix} />
          </FadeIn>

          {/* Compact Active Ride/Booking Banner */}
          {currentRide && String(currentRide?.status || '').toLowerCase() !== 'end_requested' && (
            <FadeIn style={{ paddingTop: 4 }}>
              <TapScale
                scale={0.99}
                onPress={() => navigate(trackingPath, { state: currentRide })}
                style={[
                  styles.activeRide,
                  isDark
                    ? { backgroundColor: '#111827', borderColor: p.border }
                    : { backgroundColor: alpha(colors.emerald[50], 0.4), borderColor: alpha(colors.emerald[100], 0.6) },
                  USER_SHADOW,
                ]}
              >
                <View style={styles.activeRideLeft}>
                  <PingDot />
                  <Text numberOfLines={1} style={[styles.activeRideText, { color: p.textPrimary }]}>
                    You have an active ride
                  </Text>
                </View>
                <View style={styles.viewDetails}>
                  <Text style={[styles.viewDetailsText, { color: isDark ? colors.emerald[400] : colors.emerald[600] }]}>View details</Text>
                  <ChevronRight size={14} color={isDark ? colors.emerald[400] : colors.emerald[600]} style={{ marginTop: 2 }} />
                </View>
              </TapScale>
            </FadeIn>
          )}

          {/* Everything In Minutes Grid */}
          {(!uiSettings?.homeSections || uiSettings.homeSections.enableEverything !== false) && (
            <FadeIn>
              <ServiceGrid key={serviceGridKey} isAllServicesOpen={isAllServicesOpen} setIsAllServicesOpen={setIsAllServicesOpen} onLoadServices={setActiveServices} />
            </FadeIn>
          )}

          {exploreSection && <FadeIn>{exploreSection}</FadeIn>}

          {promoBanner && <FadeIn>{promoBanner}</FadeIn>}

          {goPlacesSection && <FadeIn>{goPlacesSection}</FadeIn>}

          {/* Active Scheduled Ride Tracker (index.css: the black <button> becomes the yellow accent button; its inner
              slate cards / texts take the theme's card and text colours) */}
          {isScheduledAcceptedRide && (
            <View style={{ paddingTop: 8 }}>
              <TapScale
                scale={0.99}
                onPress={() => navigate(trackingPath, { state: currentRide })}
                style={[styles.scheduled, { backgroundColor: p.accent, borderColor: p.border }, USER_SHADOW]}
              >
                <View style={styles.rowBetween}>
                  <View style={[styles.confirmedPill, { backgroundColor: alpha(colors.yellow[400], 0.1) }]}>
                    <ShieldCheck size={11} strokeWidth={3} color={p.accent} />
                    <Text style={[styles.tinyCaps, { color: p.accent, letterSpacing: 1.3 }]}>Confirmed</Text>
                  </View>
                  <View style={styles.liveRow}>
                    <PulseBlock style={[styles.liveDot, { backgroundColor: p.accent }]} />
                    <Text style={[styles.tinyCaps, { color: p.accent, letterSpacing: 1.5 }]}>Live Status</Text>
                  </View>
                </View>

                <View style={[styles.rowBetween, { marginTop: 16, alignItems: 'flex-end' }]}>
                  <View>
                    <Text style={[styles.countdown, { color: p.textPrimary }]}>{scheduledCountdown}</Text>
                    <Text style={[styles.scheduledDate, { color: p.textSecondary }]}>{scheduledDateLabel}</Text>
                  </View>
                  <View style={{ marginBottom: 4 }}>
                    <View style={[styles.rideIconBox, { backgroundColor: p.cardBg, borderColor: p.border }]}>
                      <AppImage src={currentRideIcon} contentFit="contain" style={{ height: 32, width: 32 }} />
                    </View>
                  </View>
                </View>

                <View style={[styles.driverRow, { backgroundColor: p.cardSoft, borderColor: p.border }]}>
                  <View style={styles.driverLeft}>
                    <View style={[styles.driverAvatar, { backgroundColor: p.cardBg, borderColor: p.border }]}>
                      <User size={16} color={p.accent} />
                    </View>
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <Text style={[styles.metaCaps, { color: p.textMuted }]}>Driver & Vehicle</Text>
                      <Text numberOfLines={1} style={[styles.metaValue, { color: '#0b1220' }]}>
                        {driverName} • {vehicleLabel}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.metaCaps, { color: p.textMuted }]}>Fare</Text>
                    <Text style={[styles.metaValue, { color: '#0b1220' }]}>₹{Number(currentRide?.fare || 0).toFixed(0)}</Text>
                  </View>
                </View>
              </TapScale>
            </View>
          )}
        </View>
      </ScrollView>

      <AllServicesBottomSheet
        open={isAllServicesOpen}
        services={activeServices}
        onClose={() => setIsAllServicesOpen(false)}
        onServiceClick={handleServiceClick}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  page: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  appbar: { position: 'relative', zIndex: 40, backgroundColor: TAXI_BAR_COLOR },
  bannerWrap: { marginTop: -1, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, backgroundColor: TAXI_BAR_COLOR },
  banner: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  homeSheet: { zIndex: 5, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 124, gap: 12 },
  searchBtn: { flexDirection: 'row', width: '100%', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, overflow: 'hidden' },
  searchIcon: { height: 32, width: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  searchText: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '500' },
  recentList: { marginTop: 8, gap: 4 },
  recentRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12 },
  recentMain: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 },
  recentIcon: { height: 36, width: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1 },
  recentName: { fontSize: 14, lineHeight: 17, fontWeight: '600' },
  recentAddress: { marginTop: 4, fontSize: 11, fontWeight: '500' },
  heartBtn: { paddingHorizontal: 4, flexShrink: 0 },
  dashed: { borderBottomWidth: 1, borderStyle: 'dashed', marginHorizontal: 8 },
  activeRide: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
  activeRideLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 },
  activeRideText: { fontSize: 13, lineHeight: 15, fontWeight: '600' },
  viewDetails: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  viewDetailsText: { fontSize: 12, lineHeight: 14, fontWeight: '700' },
  sectionHeaderRow: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.17 },
  sectionSub: { marginTop: 4, fontSize: 12, fontWeight: '500' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 13, fontWeight: '600' },
  hScroll: { marginHorizontal: -4 },
  hRow: { gap: 12, paddingBottom: 12, paddingHorizontal: 4 },
  hRowSkeleton: { flexDirection: 'row', gap: 12, paddingBottom: 12, overflow: 'hidden' },
  exploreCard: { width: 88, borderRadius: 18, borderWidth: 1, alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 10 },
  exploreArt: { height: 48, width: 48, borderRadius: 14 },
  exploreLabel: { fontSize: 12, lineHeight: 15, fontWeight: '600', textAlign: 'center' },
  skelTitle: { height: 16, width: 80, borderRadius: 6, marginBottom: 12 },
  skelTitleWide: { height: 16, width: 128, borderRadius: 6 },
  skelSub: { height: 12, width: 160, borderRadius: 6, marginBottom: 12 },
  skelExplore: { width: 86, height: 96, borderRadius: 20 },
  skelGoPlace: { width: 156, height: 162, borderRadius: 24 },
  skelPromo: { height: 140, width: '100%', borderRadius: 26 },
  promoOuter: { paddingTop: 8, width: '100%', overflow: 'hidden' },
  promoCarousel: { width: '100%', overflow: 'hidden', borderRadius: 22, backgroundColor: '#0B1220', borderWidth: 1 },
  promoTrack: { flexDirection: 'row' },
  promoSlide: { position: 'relative' },
  promoImage: { width: '100%', height: 150, borderRadius: 22 },
  promoTextBox: { ...StyleSheet.absoluteFill, zIndex: 20, flexDirection: 'row', alignItems: 'center', padding: 24 },
  promoTitle: { fontSize: 18, lineHeight: 22, fontWeight: '600', letterSpacing: -0.45, color: colors.slate[50] },
  promoSubtitle: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: alpha(colors.slate[200], 0.9) },
  progressTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: alpha('#ffffff', 0.1), zIndex: 30, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFC400' },
  promoDots: { position: 'absolute', right: 14, bottom: 10, flexDirection: 'row', gap: 6, zIndex: 5 },
  promoDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.45)' },
  promoDotActive: { width: 18, backgroundColor: '#FFC400' },
  goCard: { width: 156, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  goArt: { height: 84, width: '100%', padding: 12 },
  goBody: { padding: 12, flex: 1, justifyContent: 'space-between', gap: 8 },
  goTitle: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  bookNowRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bookNow: { fontSize: 12, lineHeight: 12, fontWeight: '600' },
  scheduled: { width: '100%', overflow: 'hidden', borderRadius: 28, borderWidth: 1, padding: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confirmedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  tinyCaps: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { height: 6, width: 6, borderRadius: 3 },
  countdown: { fontSize: 24, lineHeight: 24, fontWeight: '700', letterSpacing: -0.6 },
  scheduledDate: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  rideIconBox: { height: 48, width: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  driverRow: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 10, borderWidth: 1 },
  driverLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 },
  driverAvatar: { height: 32, width: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  metaCaps: { fontSize: 10.5, lineHeight: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.5 },
  metaValue: { marginTop: 2, fontSize: 12.5, fontWeight: '600' },
  allServicesShell: { backgroundColor: 'transparent', maxWidth: 400, overflow: 'visible' },
  allServicesSheet: {
    width: '100%',
    borderRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 22,
    elevation: 16,
    shadowColor: '#080c14',
    shadowOpacity: 0.4,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 20 },
  },
  allServicesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1 },
  allServicesTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', letterSpacing: -0.45 },
  closeBtn: { height: 32, width: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 20 },
  serviceCell: { width: '25%', alignItems: 'center', paddingHorizontal: 4 },
  serviceBtn: { alignItems: 'center' },
  serviceArt64: { height: 64, width: 64, borderRadius: 18 },
  serviceLabel: { marginTop: 8, maxWidth: 78, textAlign: 'center', fontSize: 12, lineHeight: 15, fontWeight: '600' },
});

export default Home;
