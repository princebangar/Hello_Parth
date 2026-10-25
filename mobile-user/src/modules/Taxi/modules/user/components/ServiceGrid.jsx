// Web: modules/Taxi/modules/user/components/ServiceGrid.jsx — "Everything In Minutes" tiles (admin tiles from
// userHomeSettings.everything, art from the active service modules: GET /users/app-modules via userService).
// The modules list is cached (page cache + localStorage taxi_service_modules_v1, stale-while-revalidate).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LayoutGrid } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { useSettings, normalizeAssetUrl } from '../../../shared/context/SettingsContext';
import { useUserPalette } from '../../../shared/context/UserThemeContext';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';
import { getPageCache, setPageCache, registerPageCacheLifecycle } from '@/shared/utils/pageCache';
import { userService } from '../services/userService';
import ServiceArt, { ServiceArtBox } from './ServiceArt';

import taxiFallback from '../../../assets/user-app/taxi.png';
import bikeFallback from '../../../assets/user-app/bike.png';
import deliveryFallback from '../../../assets/user-app/delivery.png';
import parcelFallback from '../../../assets/user-app/parcel.png';
import truckFallback from '../../../assets/user-app/truck.png';
import busFallback from '../../../assets/user-app/bus.png';
import fallbackCar from '../../../assets/user-app/fallback-car.png';

registerPageCacheLifecycle();

const SERVICE_MODULES_CACHE_KEY = 'taxi_home_service_modules';
// The last list is also kept in localStorage: it is shown at once and the request that follows replaces it.
const SERVICE_MODULES_PERSIST_KEY = 'taxi_service_modules_v1';

const readPersistedModules = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SERVICE_MODULES_PERSIST_KEY) || 'null');
    return Array.isArray(parsed?.list) && parsed.list.length > 0 ? parsed.list : null;
  } catch {
    return null;
  }
};

const persistModules = (list) => {
  try {
    if (Array.isArray(list) && list.length > 0) {
      localStorage.setItem(SERVICE_MODULES_PERSIST_KEY, JSON.stringify({ at: Date.now(), list }));
    }
  } catch {
    // storage full / blocked - the session cache still works
  }
};

const readModuleList = (response) => response?.data?.data?.results || response?.data?.results || response?.data || [];

/** Downloads the service tiles ahead of time (login screen) so Taxi's first screen has them. Needs no login. */
export const prefetchServiceModules = async () => {
  if (getPageCache(SERVICE_MODULES_CACHE_KEY) || readPersistedModules()) return;
  try {
    // Warm-up read made from the OTHER app (Food): runs behind that screen's own requests.
    const response = await userService.getAppModules({ limit: 100 }, { background: true });
    const list = readModuleList(response);
    if (Array.isArray(list) && list.length > 0) {
      setPageCache(SERVICE_MODULES_CACHE_KEY, list);
      persistModules(list);
    }
  } catch {
    // purely an optimisation
  }
};

const getDynamicImageSrc = (item = {}, fallbackImage) => {
  const rawImage = item.uploadedImage || item.imageUrl || item.image || item.thumbnail || item.icon || null;

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

const getFallbackIcon = (module = {}) => {
  const name = String(module?.name || '').toLowerCase();
  const serviceType = String(module?.service_type || '').toLowerCase();
  const transportType = String(module?.transport_type || '').toLowerCase();

  if (serviceType === 'bus' || name.includes('bus')) {
    return busFallback;
  }
  if (name.includes('bike')) {
    return bikeFallback;
  }
  if (transportType === 'delivery' || serviceType === 'delivery' || name.includes('delivery')) {
    return deliveryFallback;
  }
  if (name.includes('parcel')) {
    return parcelFallback;
  }
  if (name.includes('truck')) {
    return truckFallback;
  }
  if (name.includes('taxi') || name.includes('cab') || name.includes('ride') || name.includes('normal')) {
    return taxiFallback;
  }
  return fallbackCar;
};

const normalizeModuleText = (value = '') => String(value || '').trim().toLowerCase();

// Pooling is switched off for riders until the new pooling flow is built.
const isPoolingModule = (module = {}) => {
  const name = normalizeModuleText(module?.name);
  const serviceType = normalizeModuleText(module?.service_type);
  return serviceType === 'pooling' || name.includes('pooling');
};

const isDeliveryModule = (module = {}) => {
  const name = normalizeModuleText(module?.name);
  const serviceType = normalizeModuleText(module?.service_type);
  const transportType = normalizeModuleText(module?.transport_type);

  return transportType === 'delivery' || serviceType === 'delivery' || name.includes('delivery') || name.includes('delhivery');
};

const isNormalRideModule = (module = {}) => {
  const name = normalizeModuleText(module?.name);
  const serviceType = normalizeModuleText(module?.service_type);
  const transportType = normalizeModuleText(module?.transport_type);

  if (isDeliveryModule(module)) {
    return false;
  }

  if (['outstation', 'bus', 'pooling'].includes(serviceType)) {
    return false;
  }

  return (
    ['normal', 'taxi', 'ride', 'ride_hailing', 'ride-hailing'].includes(serviceType) ||
    ['taxi', 'both'].includes(transportType) ||
    name.includes('taxi') ||
    name.includes('cab') ||
    name.includes('ride') ||
    name.includes('normal')
  );
};

const getPinnedModuleOrder = (module = {}) => {
  if (isNormalRideModule(module)) return 1;
  if (isDeliveryModule(module)) return 2;
  return null;
};

const fallbackForLabel = (label) => {
  const cleanLabel = String(label || '').toLowerCase();
  if (cleanLabel.includes('bus')) return busFallback;
  if (cleanLabel.includes('bike')) return bikeFallback;
  if (cleanLabel.includes('parcel') || cleanLabel.includes('delivery')) return parcelFallback;
  if (cleanLabel.includes('ride') || cleanLabel.includes('cab') || cleanLabel.includes('taxi')) return taxiFallback;
  return fallbackCar;
};

/** The legacy big service card (exported by the web; Home imports it). */
export const ServiceCard = React.memo(({ icon, label, description, path, loading, isDark, onClick }) => {
  const navigate = useNavigate();
  const p = useUserPalette();
  const [imgSrc, setImgSrc] = useState(icon);

  useEffect(() => {
    setImgSrc(icon);
  }, [icon]);

  if (loading) {
    return (
      <View
        style={[
          styles.legacyCard,
          { borderColor: isDark ? alpha(colors.zinc[800], 0.85) : p.border, backgroundColor: isDark ? alpha(colors.zinc[900], 0.6) : p.cardSoft },
        ]}
      />
    );
  }

  const getDynamicSubtitle = () => {
    if (description && description.trim() !== '') {
      return description;
    }
    const cleanLabel = String(label || '').toLowerCase();
    if (cleanLabel.includes('ride') || cleanLabel.includes('cab') || cleanLabel.includes('taxi')) {
      return 'Everyday rides';
    }
    if (cleanLabel.includes('bike')) {
      return 'Beat the traffic';
    }
    if (cleanLabel.includes('parcel') || cleanLabel.includes('delivery') || cleanLabel.includes('courier')) {
      return 'Send anything';
    }
    if (cleanLabel.includes('bus')) {
      return 'Intercity travel';
    }
    return 'Everything in minutes';
  };

  const handleCardClick = () => {
    const cleanLabel = String(label || '').toLowerCase();
    let vehicleType = '';
    if (cleanLabel.includes('bike') || cleanLabel.includes('moto')) vehicleType = 'bike';
    else if (cleanLabel.includes('auto')) vehicleType = 'auto';
    else if (cleanLabel.includes('cab') || cleanLabel.includes('taxi') || cleanLabel.includes('car') || cleanLabel === 'book now' || cleanLabel === 'ride') vehicleType = 'cab';
    else if (cleanLabel.includes('parcel') || cleanLabel.includes('delivery')) vehicleType = 'parcel';

    if (vehicleType) {
      localStorage.setItem('selectedVehicleType', vehicleType);
    } else {
      localStorage.removeItem('selectedVehicleType');
    }

    if (onClick) {
      onClick();
    } else if (path) {
      navigate(path);
    }
  };

  return (
    <Pressable onPress={handleCardClick} style={({ pressed }) => [pressed && { transform: [{ scale: 0.97 }] }]}>
      <LinearGradient
        colors={isDark ? [colors.zinc[900], alpha(colors.zinc[950], 0.9)] : [p.cardBg, p.cardSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.legacyCard, styles.legacyCardInner, { borderColor: isDark ? colors.zinc[800] : p.border }]}
      >
        <View style={styles.legacyText}>
          <Text numberOfLines={1} style={[styles.legacySubtitle, { color: isDark ? p.textSecondary : p.textMuted }]}>
            {getDynamicSubtitle()}
          </Text>
          <Text numberOfLines={2} style={[styles.legacyLabel, { color: p.textPrimary }]}>
            {label}
          </Text>
        </View>
        <View style={styles.legacyArt}>
          <AppImage src={imgSrc} accessibilityLabel={label} contentFit="contain" style={styles.fill} onError={() => setImgSrc(fallbackForLabel(label))} />
        </View>
      </LinearGradient>
    </Pressable>
  );
});

/** `.everything-card` of index.css: art top-left, subtitle + title under it. */
const ServiceCardStretched = React.memo(({ subtitle, title, icon, path, onPress, item }) => {
  const navigate = useNavigate();
  const p = useUserPalette();

  const handleCardClick = () => {
    const cleanTitle = String(title || '').toLowerCase();
    let vehicleType = '';
    if (cleanTitle.includes('bike') || cleanTitle.includes('moto')) vehicleType = 'bike';
    else if (cleanTitle.includes('auto')) vehicleType = 'auto';
    else if (cleanTitle.includes('cab') || cleanTitle.includes('taxi') || cleanTitle.includes('car') || cleanTitle === 'book now' || cleanTitle === 'ride') vehicleType = 'cab';
    else if (cleanTitle.includes('parcel') || cleanTitle.includes('delivery')) vehicleType = 'parcel';

    if (vehicleType) {
      localStorage.setItem('selectedVehicleType', vehicleType);
    } else {
      localStorage.removeItem('selectedVehicleType');
    }

    if (onPress) {
      onPress();
    } else if (path) {
      navigate(path);
    }
  };

  const isAllServices = String(title || '').toLowerCase().includes('all services');
  // The admin's tile image wins, then the module's own icon; with neither, ServiceArt draws a glyph.
  const artSrc = getDynamicImageSrc(item || {}, icon || '');
  const showSubtitle = subtitle && String(subtitle).toLowerCase() !== String(title || '').toLowerCase();

  return (
    <Pressable
      onPress={handleCardClick}
      style={({ pressed }) => [
        styles.everythingCard,
        { backgroundColor: p.cardBg, borderColor: p.border },
        p.cardShadow,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <ServiceArtBox style={styles.everythingArt}>
        {isAllServices ? <LayoutGrid size={26} strokeWidth={2} color={p.serviceArtFg} /> : <ServiceArt src={artSrc} label={title} hint={title} imgPadding={4} />}
      </ServiceArtBox>
      <View style={styles.everythingContent}>
        {showSubtitle ? (
          <Text numberOfLines={1} style={[styles.everythingSubtitle, { color: p.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={[styles.everythingTitle, { color: p.textPrimary }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
});

/** framer-motion itemVariants: fade + rise 10px with a spring, staggered 50 ms. */
const StaggerItem = ({ index, children, style }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.spring(v, { toValue: 1, stiffness: 280, damping: 24, mass: 1, delay: index * 50, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [v, index]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
};

/** grid grid-cols-2 gap-3 */
const TwoColumnGrid = ({ children }) => {
  const items = React.Children.toArray(children);
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          <View style={styles.cell}>{row[0]}</View>
          <View style={styles.cell}>{row[1] || null}</View>
        </View>
      ))}
    </View>
  );
};

const defaultSettings = {
  everything: [
    { id: '1', title: 'Parcel', subtitle: 'Send anything', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Bike Taxi', subtitle: 'Beat the traffic', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Car Taxi', subtitle: 'Everyday rides', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'All Services', subtitle: 'All Services', image: '', route: '', order: 4, status: 'active' },
  ],
};

const ServiceGrid = ({ showAllModal: parentShowAllModal, setShowAllModal: parentSetShowAllModal, isAllServicesOpen, setIsAllServicesOpen, onLoadServices }) => {
  const navigate = useNavigate();
  const p = useUserPalette();
  const { settings } = useSettings();
  const [cachedModules] = useState(() => getPageCache(SERVICE_MODULES_CACHE_KEY) || readPersistedModules());
  const [modules, setModules] = useState(cachedModules || []);
  const [loading, setLoading] = useState(!cachedModules);
  const [localShowAllModal, localSetShowAllModal] = useState(false);

  const showAllModal = isAllServicesOpen !== undefined ? isAllServicesOpen : parentShowAllModal !== undefined ? parentShowAllModal : localShowAllModal;
  void showAllModal;

  const setShowAllModal =
    setIsAllServicesOpen !== undefined ? setIsAllServicesOpen : parentSetShowAllModal !== undefined ? parentSetShowAllModal : localSetShowAllModal;

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
    return null;
  });

  useEffect(() => {
    if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
      setUiSettings((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(settings.userHomeSettings)) {
          return prev;
        }
        return settings.userHomeSettings;
      });
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
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [settings?.userHomeSettings]);

  useEffect(() => {
    const handleOpenModal = () => {
      setShowAllModal(true);
    };
    window.addEventListener('helloparth:open-all-services-modal', handleOpenModal);
    return () => window.removeEventListener('helloparth:open-all-services-modal', handleOpenModal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tell the Taxi tab switch (its skeleton) that the tiles are on screen.
  useEffect(() => {
    if (loading) return undefined;
    const timer = setTimeout(() => window.dispatchEvent(new Event('helloparth:taxi-home-ready')), 250);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    let isMounted = true;
    const fetchModules = async () => {
      // Cached list is already showing (if any) — no loading state for a silent background refresh.
      if (!cachedModules) setLoading(true);
      try {
        const response = await userService.getAppModules({ limit: 100 });
        const list = readModuleList(response);
        setPageCache(SERVICE_MODULES_CACHE_KEY, list);
        persistModules(list);
        if (isMounted) {
          setModules(list);
        }
      } catch (error) {
        console.error('[ServiceGrid] Failed to fetch modules dynamically:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchModules();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPath = (module) => {
    const serviceType = String(module?.service_type || '').trim().toLowerCase();
    const transportType = String(module?.transport_type || '').trim().toLowerCase();
    const moduleName = String(module?.name || '').trim().toLowerCase();

    if (transportType === 'delivery') return '/taxi/user/parcel/type';
    if (serviceType === 'outstation') return '/taxi/user/intercity';

    if (serviceType === 'bus' || transportType === 'bus' || moduleName.includes('bus')) {
      return '/taxi/user/bus';
    }

    return '/taxi/user/ride/select-location';
  };

  const isParcelModule = (module = {}) => {
    const name = String(module?.name || '').toLowerCase();
    const serviceType = String(module?.service_type || '').toLowerCase();
    const transportType = String(module?.transport_type || '').toLowerCase();
    return name.includes('parcel') || name.includes('courier') || transportType === 'delivery' || serviceType === 'delivery';
  };

  const isBikeModule = (module = {}) => {
    const name = String(module?.name || '').toLowerCase();
    const serviceType = String(module?.service_type || '').toLowerCase();
    const transportType = String(module?.transport_type || '').toLowerCase();
    return name.includes('bike') || name.includes('moto') || serviceType === 'bike' || transportType === 'bike';
  };

  const isRideModule = (module = {}) => {
    const name = String(module?.name || '').toLowerCase();
    const serviceType = String(module?.service_type || '').toLowerCase();
    const transportType = String(module?.transport_type || '').toLowerCase();
    return (
      !isParcelModule(module) &&
      !isBikeModule(module) &&
      (name.includes('ride') || name.includes('cab') || name.includes('taxi') || serviceType === 'normal' || transportType === 'taxi')
    );
  };

  const activeModules = React.useMemo(() => {
    return (modules || []).filter(
      (m) => (m.active === 1 || m.active === true || String(m.active) === '1' || String(m.active) === 'true') && !isPoolingModule(m),
    );
  }, [modules]);

  const parcelModule = activeModules.find(isParcelModule);
  const bikeModule = activeModules.find(isBikeModule);
  const rideModule = activeModules.find(isRideModule);

  const sortedModules = React.useMemo(() => {
    return activeModules.slice().sort((a, b) => {
      const pinnedA = getPinnedModuleOrder(a);
      const pinnedB = getPinnedModuleOrder(b);

      if (pinnedA !== null || pinnedB !== null) {
        if (pinnedA === null) return 1;
        if (pinnedB === null) return -1;
        if (pinnedA !== pinnedB) return pinnedA - pinnedB;
      }

      const orderA = Number(a?.order_by);
      const orderB = Number(b?.order_by);
      const hasOrderA = Number.isFinite(orderA);
      const hasOrderB = Number.isFinite(orderB);

      if (hasOrderA && hasOrderB && orderA !== orderB) {
        return orderA - orderB;
      }

      if (hasOrderA !== hasOrderB) {
        return hasOrderA ? -1 : 1;
      }

      return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
    });
  }, [activeModules]);

  const services = React.useMemo(() => {
    return sortedModules.map((m) => {
      const apiIcon = normalizeAssetUrl(m.mobile_menu_icon || m.uploadedImage || m.imageUrl || m.image);
      const serviceTypeDisplay = String(m.service_type || '').toUpperCase();
      const transportTypeDisplay = String(m.transport_type || '').toUpperCase();
      const typeLabel =
        serviceTypeDisplay && transportTypeDisplay ? `${serviceTypeDisplay} • ${transportTypeDisplay}` : serviceTypeDisplay || transportTypeDisplay || 'SERVICE';

      return {
        icon: apiIcon && apiIcon.trim() !== '' ? apiIcon : getFallbackIcon(m),
        hasImage: !!(apiIcon && apiIcon.trim() !== ''),
        label: m.name,
        description: typeLabel,
        path: getPath(m),
        rawModule: m,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedModules]);

  useEffect(() => {
    if (onLoadServices) {
      onLoadServices(services);
    }
  }, [services, onLoadServices]);

  const activeItems = (uiSettings?.everything || defaultSettings.everything)
    .filter((item) => item.status === 'active' || item.status === true)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  return (
    <View style={styles.fullWidth}>
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={[styles.sectionTitle, { color: p.textPrimary }]}>Everything In Minutes</Text>
        </View>

        {loading ? (
          <TwoColumnGrid>
            {[...Array(4)].map((_, i) => (
              <View key={i} style={[styles.skeletonCard, { backgroundColor: p.cardSoft }]} />
            ))}
          </TwoColumnGrid>
        ) : (
          <TwoColumnGrid>
            {activeItems.map((item, idx) => {
              const title = String(item.title || '').toLowerCase();
              const isAllServices = title.includes('all services');
              const isParcel = title.includes('parcel');
              const isBike = title.includes('bike');
              const isBook = /book|ride|car|cab|taxi/.test(title);

              const moduleIcon = (module) => normalizeAssetUrl(module?.mobile_menu_icon);
              const fallbackIcon = isParcel ? moduleIcon(parcelModule) : isBike ? moduleIcon(bikeModule) : isBook ? moduleIcon(rideModule) : '';

              const clickHandler = () => {
                const clickRoute = item.actionRoute || item.route;
                if (clickRoute === 'ALL_SERVICES_MODAL' || isAllServices) {
                  setShowAllModal(true);
                } else if (clickRoute) {
                  // Hand the tile's vehicle category to Select Vehicle through the route itself (Home does the same).
                  const tileCategory = /bike|moto/.test(title) ? 'bike' : /auto/.test(title) ? 'auto' : /cab|taxi|car/.test(title) ? 'cab' : '';
                  if (tileCategory && clickRoute.includes('/ride/select-location')) {
                    navigate(`${clickRoute}?vehicleType=${tileCategory}`, { state: { selectedCategory: tileCategory } });
                  } else {
                    navigate(clickRoute);
                  }
                } else {
                  const fallbackRoute = isParcel ? '/taxi/user/parcel/type' : '/taxi/user/ride/select-location';
                  if (fallbackRoute.includes('/ride/select-location')) {
                    const category = isBike ? 'bike' : 'car';
                    navigate(fallbackRoute, { state: { selectedCategory: category, flow: 'ride', activeInput: 'drop' } });
                  } else {
                    navigate(fallbackRoute);
                  }
                }
              };

              return (
                <StaggerItem key={item.id || idx} index={idx}>
                  <ServiceCardStretched title={item.title} subtitle={item.subtitle} icon={fallbackIcon} onPress={clickHandler} item={item} />
                </StaggerItem>
              );
            })}
          </TwoColumnGrid>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  fullWidth: { width: '100%' },
  section: { paddingVertical: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 17, lineHeight: 21, fontWeight: '700', letterSpacing: -0.17 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, minWidth: 0 },
  skeletonCard: { height: 114, borderRadius: 20 },
  everythingCard: {
    width: '100%',
    height: 114,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  everythingArt: { width: 40, height: 40, borderRadius: 12, flexShrink: 0 },
  everythingContent: { minWidth: 0, maxWidth: '100%', alignItems: 'center', gap: 3 },
  everythingSubtitle: { fontSize: 11.5, lineHeight: 14, fontWeight: '500', textAlign: 'center' },
  everythingTitle: { fontSize: 15, lineHeight: 18, fontWeight: '700', letterSpacing: -0.15, textAlign: 'center' },
  legacyCard: { width: '100%', height: 106, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  legacyCardInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  legacyText: { maxWidth: '58%', paddingRight: 4, justifyContent: 'center' },
  legacySubtitle: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.25 },
  legacyLabel: { marginTop: 4, fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.4, textTransform: 'uppercase' },
  legacyArt: { height: 64, width: 64, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
});

export default ServiceGrid;
