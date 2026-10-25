// Web: modules/Food/components/user/UserLayout.jsx — the Food user shell around every /food/user screen:
// Food providers (Profile, Cart, Orders, search overlay, location selector), notifications hook, order-type sync,
// first location / zone check (skeleton -> Home or the out-of-zone screen), "Fetching Location..." blocker,
// login-required popup, notification + out-of-zone toasts, the bottom navigation on the exact main tabs, Back to top,
// and the keep-alive main tabs + category browse page.
//
// Native structure: `children` is the Food Stack navigator (the web's <Outlet />). It always stays mounted (so the
// navigation history survives); the main tabs (MainTabKeepAlive) and the category browse page (CategoryBrowseKeepAlive)
// are layers above it that stay mounted once visited and are shown / hidden (display: none) by route — the main tab
// routes themselves are empty placeholder screens, exactly like the web's MainTabRoutePlaceholder. The loading
// skeleton and the out-of-zone screen cover everything while they apply (the web rendered them instead of <main>).
import { useLingeringTrue } from '@/native/ui/useLingeringTrue';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { FreezeLocation, useLocation, useLocationNow, useNavigate } from '@/lib/router';
import { useAnnouncedTab } from '@/lib/tabSwitch';
import { toast } from '@/lib/toast';
import { Text } from '@/native/ui';
import { alpha, colors, useTheme } from '@/theme';
import { BrandToastIcon } from '@/shared/utils/customToasts';
import { ProfileProvider, useProfile } from '@food/context/ProfileContext';
import { CartProvider } from '@food/context/CartContext';
import { OrdersProvider } from '@food/context/OrdersContext';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

import SearchOverlay from './SearchOverlay';
import BottomNavigation from './BottomNavigation';
import BackToTop from './BackToTop';
import { useUserNotifications } from '../../hooks/useUserNotifications';
import { useLocation as useGeoLocation } from '../../hooks/useLocation';
import { useZone } from '../../hooks/useZone';
import { useCartZoneGuard } from '../../hooks/useCartZoneGuard';
import OutOfZoneScreen from './OutOfZoneScreen';
import { useLocationPromptPending } from './LocationPrompt';
import { isModuleAuthenticated } from '../../utils/auth';
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons';
import { markFirstScreenShown } from '@/shared/utils/firstScreen';
import LoginRequiredModal from './LoginRequiredModal';
import MainTabKeepAlive from './MainTabKeepAlive';
import { whenAppSettled } from '@/shared/utils/whenSettled';
import {
  getMainTabFromPath,
  isExactMainTabPath,
  rememberMainTabBeforeProfile,
  shouldPreserveMainTabsUnderPath,
  getCategorySlugFromPath,
  isRestaurantDetailPath,
  rememberCategoryKeepAliveSlug,
  peekCategoryKeepAliveSlug,
  clearCategoryKeepAliveSlug,
} from '@food/utils/mainTabRoutes';
import { registerFoodPageCacheLifecycle } from '@food/utils/foodPageCache';
import CategoryBrowseKeepAlive from './CategoryBrowseKeepAlive';

const debugWarn = (...args) => {};

// Sync orderType with route
function RouteSyncHandler() {
  const location = useLocation();
  const { setOrderType, orderType } = useProfile();

  useEffect(() => {
    // Determine path ignoring /food prefix for uniform handling
    let path = location.pathname;
    if (path.startsWith('/food')) {
      path = path.substring(5) || '/';
    }
    const normalizedPath = path.replace(/\/+$/, '') || '/';

    // Paths that should PRESERVE the current orderType (sub-navigation)
    const preservePaths = [
      '/cart',
      '/user/cart',
      '/restaurants',
      '/user/restaurants',
      '/search',
      '/user/search',
      '/product',
      '/user/product',
      '/user/orders',
      '/orders',
      '/profile',
      '/user/profile',
    ];
    const isPreservePath = preservePaths.some((p) => normalizedPath === p || normalizedPath.startsWith(p + '/'));

    if (isPreservePath) return;

    // Explicit mode switches
    let newMode = null;
    if (normalizedPath === '/takeaway' || normalizedPath.startsWith('/takeaway/') || normalizedPath.startsWith('/user/takeaway')) {
      newMode = 'takeaway';
    } else if (normalizedPath === '/dining' || normalizedPath.startsWith('/dining/') || normalizedPath.startsWith('/user/dining')) {
      newMode = 'dining';
    } else if (normalizedPath === '/' || normalizedPath === '/user' || normalizedPath === '/user/') {
      newMode = 'delivery';
    }

    if (newMode && orderType !== newMode) {
      setOrderType(newMode);
    }
  }, [location.pathname, orderType, setOrderType]);

  return null;
}

// SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: '',
  setSearchValue: () => {
    debugWarn('SearchOverlayProvider not available');
  },
  openSearch: () => {
    debugWarn('SearchOverlayProvider not available');
  },
  closeSearch: () => {},
});

export function useSearchOverlay() {
  return useContext(SearchOverlayContext);
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const openSearch = () => {
    setIsSearchOpen(true);
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchValue('');
  };

  return (
    <SearchOverlayContext.Provider value={{ isSearchOpen, searchValue, setSearchValue, openSearch, closeSearch }}>
      {children}
      {isSearchOpen && <SearchOverlay isOpen={isSearchOpen} onClose={closeSearch} searchValue={searchValue} onSearchChange={setSearchValue} />}
    </SearchOverlayContext.Provider>
  );
}

// LocationSelector context with default value
const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {
    debugWarn('LocationSelectorProvider not available');
  },
  closeLocationSelector: () => {},
});

export function useLocationSelector() {
  const context = useContext(LocationSelectorContext);
  if (!context) {
    throw new Error('useLocationSelector must be used within LocationSelectorProvider');
  }
  return context;
}

function LocationSelectorProvider({ children }) {
  const navigate = useNavigate();

  const openLocationSelector = useCallback(() => {
    // Navigate to the standalone address selector page
    navigate('/food/user/address-selector', { state: { from: getAppRoutePath() } });
  }, [navigate]);

  const closeLocationSelector = useCallback(() => {}, []);

  // Debounced loading state to prevent flickering and ensure smooth navigation transitions
  const [showGlobalLoader, setShowGlobalLoader] = useState(false);

  const value = useMemo(
    () => ({
      isLocationSelectorOpen: false,
      openLocationSelector,
      closeLocationSelector,
      showGlobalLoader,
      setShowGlobalLoader,
    }),
    [openLocationSelector, closeLocationSelector, showGlobalLoader],
  );

  return <LocationSelectorContext.Provider value={value}>{children}</LocationSelectorContext.Provider>;
}

function Spinner() {
  // w-10 h-10 border-[3px] ring (gray-100/30) + spinning #DC2626 ring with a transparent top
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  return (
    <View style={{ width: 40, height: 40 }}>
      <View style={{ position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: alpha(colors.gray[100], 0.3) }} />
      <Animated.View
        style={{
          position: 'absolute',
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 3,
          borderColor: '#DC2626',
          borderTopColor: 'transparent',
          transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }}
      />
    </View>
  );
}

function NotificationToast({ title, message }) {
  return (
    <View style={toastStyles.card}>
      <BrandToastIcon size="md" />
      <View style={{ flex: 1, paddingRight: 4, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.gray[900], lineHeight: 16 }}>
          {title || 'Notification'}
        </Text>
        {message ? (
          <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '500', color: colors.gray[500], marginTop: 2, lineHeight: 16 }}>
            {message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function OutOfZoneToast() {
  return (
    <View style={toastStyles.card}>
      <BrandToastIcon />
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[800], lineHeight: 18 }}>Our services are unavailable here right now.</Text>
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[500], marginTop: 4 }}>Please choose a different location</Text>
      </View>
    </View>
  );
}

function UserLayoutContent({ children }) {
  const t = useTheme();
  const location = useLocationNow(); // same render as the navigation (tab layer vs. page)
  const { location: activeLocation, loading: isGeoLoading } = useGeoLocation();
  const { loading: isProfileLoading } = useProfile();
  const { isOutOfService, loading: isZoneLoading, zoneStatus, zoneId, error: zoneError } = useZone(activeLocation);
  const isLocationPending = useLocationPromptPending();
  useCartZoneGuard(zoneId, zoneStatus);
  const hasValidCoordinates = activeLocation && Number.isFinite(activeLocation.latitude) && Number.isFinite(activeLocation.longitude);
  const isOutOfZone = isOutOfService && hasValidCoordinates;
  const { openLocationSelector } = useLocationSelector();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalIntent, setLoginModalIntent] = useState('general');

  useEffect(() => {
    const handleShowLoginModal = (event) => {
      const intent = event?.detail?.intent === 'taxi' ? 'taxi' : 'general';
      setLoginModalIntent(intent);
      setIsLoginModalOpen(true);
    };
    window.addEventListener('show-login-required', handleShowLoginModal);
    return () => {
      window.removeEventListener('show-login-required', handleShowLoginModal);
    };
  }, []);

  useEffect(() => {
    const handleNotificationToast = (e) => {
      const { title, message } = e.detail || {};
      toast.custom(() => <NotificationToast title={title} message={message} />, {
        id: 'user-notif-toast',
        duration: 6000,
        position: 'top-center',
      });
    };
    window.addEventListener('show-user-notification-toast', handleNotificationToast);
    return () => window.removeEventListener('show-user-notification-toast', handleNotificationToast);
  }, []);

  // Save order status notifications to localStorage so bell badge updates everywhere
  useEffect(() => {
    const handleOrderNotif = (e) => {
      const { orderId, status, title, message } = e.detail || {};
      const statusLower = String(status || '').toLowerCase();
      // Only save to bell inbox for delivered or cancelled orders
      if (statusLower !== 'delivered' && !statusLower.includes('cancel')) return;
      const isDelivered = statusLower === 'delivered';
      const newNotif = {
        id: `order-${orderId}-${status}-${Date.now()}`,
        type: isDelivered ? 'order' : 'alert',
        title: title || (isDelivered ? `Order #${orderId} Delivered!` : `Order #${orderId} ${status}`),
        message: message || (isDelivered ? 'Your order has been delivered. Enjoy!' : `Your order status is now ${statusLower.replace(/_/g, ' ')}`),
        time: 'Just now',
        timestamp: Date.now(),
        read: false,
        icon: isDelivered ? 'CheckCircle2' : 'AlertCircle',
        iconColor: isDelivered ? 'text-green-600' : 'text-red-600',
      };
      try {
        const existing = JSON.parse(localStorage.getItem('food_user_notifications') || '[]');
        const list = Array.isArray(existing) ? existing : [];
        // Drop legacy demo seeds (#12345 / Special Offer) if still present
        const cleaned = list.filter((item) => {
          const id = String(item?.id || '');
          const itemTitle = String(item?.title || '');
          const itemMessage = String(item?.message || '');
          if (id === '1' || id === '2') return false;
          if (itemTitle === 'Order Confirmed' && itemMessage.includes('#12345')) return false;
          if (itemTitle === 'Special Offer' && itemMessage.includes('50% off')) return false;
          return true;
        });
        // Dedupe same order+status within a short window
        const dedupeKey = `order-${orderId}-${status}`;
        const already = cleaned.some(
          (n) => String(n.id || '').startsWith(dedupeKey) || (String(n.title || '') === String(newNotif.title) && Date.now() - Number(n.timestamp || 0) < 15_000),
        );
        if (already) return;
        const updated = [newNotif, ...cleaned].slice(0, 100);
        localStorage.setItem('food_user_notifications', JSON.stringify(updated));
        const unreadCount = updated.filter((n) => !n.read).length;
        window.dispatchEvent(new CustomEvent('notificationsUpdated', { detail: { count: unreadCount } }));
      } catch {}
    };
    window.addEventListener('orderStatusNotification', handleOrderNotif);
    return () => window.removeEventListener('orderStatusNotification', handleOrderNotif);
  }, []);

  const path = location.pathname.startsWith('/food') ? location.pathname.substring(5) || '/' : location.pathname;
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;

  const isMainPage =
    normalizedPath === '/' ||
    normalizedPath === '' ||
    normalizedPath === '/user' ||
    normalizedPath === '/dining' ||
    normalizedPath === '/user/dining' ||
    normalizedPath === '/takeaway' ||
    normalizedPath === '/user/takeaway' ||
    normalizedPath === '/under-250' ||
    normalizedPath === '/user/under-250';

  // Determine if this is a policy or auth page immediately
  const isAuthPage = normalizedPath.includes('auth/');
  const isPolicyPage = normalizedPath.includes('terms') || normalizedPath.includes('privacy') || normalizedPath.includes('support');

  const isZoneGatedPath =
    !isAuthPage &&
    !isPolicyPage &&
    !normalizedPath.includes('profile') &&
    !normalizedPath.includes('wallet') &&
    !normalizedPath.includes('help') &&
    !normalizedPath.includes('address') &&
    !normalizedPath.includes('orders');
  const shouldBlockOutOfZone = hasValidCoordinates && isZoneGatedPath;

  // The zone for this location is not known yet: stay on the loading skeleton, then show Home or the out-of-zone
  // screen once - never Home first and the out-of-zone screen a moment later. A failed zone check falls through to Home.
  const isZonePending =
    isZoneGatedPath &&
    !location.pathname.includes('/search') &&
    (hasValidCoordinates ? zoneStatus === 'loading' && !zoneError : isLocationPending || isGeoLoading);

  const { showGlobalLoader, setShowGlobalLoader } = useLocationSelector();

  // Safety: never leave a full-screen blocker that eats every tap until app kill
  useEffect(() => {
    if (!showGlobalLoader) return undefined;
    const timer = window.setTimeout(() => {
      setShowGlobalLoader(false);
      sessionStorage.removeItem('manual_location_update');
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [showGlobalLoader, setShowGlobalLoader]);

  // isInitialChecking: only block render if we have ZERO cached location AND zone data.
  // On a start with cached data -> render immediately, fetch in background.
  const [isInitialChecking, setIsInitialChecking] = useState(() => {
    const isAuthenticated = isModuleAuthenticated('user');
    if (!isAuthenticated || isAuthPage || isPolicyPage) return false;
    const hasCachedLocation = !!localStorage.getItem('userLocation');
    const hasCachedZone = !!localStorage.getItem('userZoneId');
    return !(hasCachedLocation && hasCachedZone);
  });

  useEffect(() => {
    // Skip location/zone check for auth, policy, support pages, or if not logged in
    const isAuthenticated = isModuleAuthenticated('user');
    if (isAuthPage || isPolicyPage || !isAuthenticated) {
      setShowGlobalLoader(false);
      setIsInitialChecking(false);
      return undefined;
    }

    if (isZoneLoading || isGeoLoading || isProfileLoading) {
      // ONLY show global overlay for truly manual location updates (user explicitly changed location)
      const isManualUpdate = sessionStorage.getItem('manual_location_update') === 'true';
      if (isManualUpdate) {
        setShowGlobalLoader(true);
      }
      return undefined;
    }
    const timer = setTimeout(() => {
      setShowGlobalLoader(false);
      setIsInitialChecking(false); // First load completed
      sessionStorage.removeItem('manual_location_update'); // Clear manual flag
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isZoneLoading, isGeoLoading, isProfileLoading, isAuthPage, isPolicyPage, activeLocation?.latitude, activeLocation?.longitude, zoneStatus]);

  // (The web cleared scroll / manual-location flags on a browser reload; the app has no page reload.)

  useEffect(() => {
    registerFoodPageCacheLifecycle();
  }, []);

  // the bottom bar announces a tap before navigating: show that tab at once
  const routeMainTab = getMainTabFromPath(location.pathname);
  const pathMainTab = useAnnouncedTab('food', routeMainTab);
  // A page opening on top of a tab: keep the tab painted until that page has rendered (no half-built frame between).
  const mainTabsPainted = useLingeringTrue(Boolean(pathMainTab));
  const lastMainTabRef = useRef(pathMainTab || 'delivery');
  const [mainTabsMounted, setMainTabsMounted] = useState(() => !!pathMainTab);

  useEffect(() => {
    if (pathMainTab) {
      lastMainTabRef.current = pathMainTab;
      setMainTabsMounted(true);
    }
  }, [pathMainTab]);

  useEffect(() => {
    if (pathMainTab && pathMainTab !== 'profile') {
      rememberMainTabBeforeProfile(pathMainTab);
    }
  }, [pathMainTab]);

  // My Store opened directly (deep link / notification): Home was never built, so Back had to build it from scratch.
  // Build Home underneath once the page has settled; Back is then instant.
  useEffect(() => {
    if (mainTabsMounted || !/\/my-store\/?$/.test(location.pathname)) return undefined;
    return whenAppSettled(() => setMainTabsMounted(true), { delay: 1200 });
  }, [location.pathname, mainTabsMounted]);

  // Keep home/tabs alive under restaurant/category so back is instant (no remount/refetch).
  const preserveMainTabs = !pathMainTab && mainTabsMounted && shouldPreserveMainTabsUnderPath(location.pathname);
  const keepAliveTab = pathMainTab || (preserveMainTabs ? lastMainTabRef.current : null);

  const categorySlug = getCategorySlugFromPath(location.pathname);
  const isRestaurantPath = isRestaurantDetailPath(location.pathname);
  const lastCategorySlugRef = useRef(categorySlug || peekCategoryKeepAliveSlug() || null);
  const [categoryBrowseMounted, setCategoryBrowseMounted] = useState(() => !!(categorySlug || peekCategoryKeepAliveSlug()));

  if (categorySlug) {
    lastCategorySlugRef.current = categorySlug;
    rememberCategoryKeepAliveSlug(categorySlug);
  }

  useEffect(() => {
    if (categorySlug) {
      setCategoryBrowseMounted(true);
      rememberCategoryKeepAliveSlug(categorySlug);
      return;
    }
    // Keep category page mounted under restaurant OR home tabs — instant reopen.
    // Only tear down when leaving both (e.g. search / other non-tab routes).
    if (!isRestaurantPath && !pathMainTab) {
      setCategoryBrowseMounted(false);
      lastCategorySlugRef.current = null;
      clearCategoryKeepAliveSlug();
    }
  }, [categorySlug, isRestaurantPath, pathMainTab]);

  const preservedCategorySlug = categorySlug || lastCategorySlugRef.current || peekCategoryKeepAliveSlug();
  const showCategoryBrowse = !!categorySlug || (categoryBrowseMounted && !!preservedCategorySlug && (isRestaurantPath || !!pathMainTab));
  const categoryBrowseVisible = !!categorySlug;

  // Exact main tabs only (includes /home + /user/home). Do not broaden beyond mainTabRoutes.
  const showBottomNav = !isInitialChecking && isExactMainTabPath(location.pathname);

  // "Toast already shown for this out-of-zone stay".
  const lastOutOfZoneRef = useRef(false);

  // Out of Zone Branded Toast Trigger
  useEffect(() => {
    if (isOutOfZone && !lastOutOfZoneRef.current && !showGlobalLoader && isMainPage) {
      const timer = setTimeout(() => {
        lastOutOfZoneRef.current = true;
        toast.custom(() => <OutOfZoneToast />, { duration: 4000, position: 'top-center', id: 'out-of-zone-toast' });
      }, 300);
      // Marked as shown inside the timer: if this effect re-runs within the 300ms the timer is cleared.
      return () => clearTimeout(timer);
    }
    if (!isOutOfZone) {
      lastOutOfZoneRef.current = false;
    }
    return undefined;
  }, [isOutOfZone, showGlobalLoader, isMainPage]);

  const showSkeleton = (isInitialChecking && !location.pathname.includes('/search')) || isZonePending;
  const showOutOfZone = !showSkeleton && zoneStatus === 'OUT_OF_SERVICE' && shouldBlockOutOfZone;
  const pageBg = t.dark ? '#0a0a0a' : '#f5f5f5';

  return (
    <>
      <RouteSyncHandler />

      <View style={styles.main}>
        {/* The Food stack (web: <Outlet />) — always mounted; covered by the layers below while they apply */}
        <View style={styles.fill}>{children}</View>

        {keepAliveTab ? (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: pageBg }, !mainTabsPainted && styles.transparent]}
            pointerEvents={pathMainTab ? 'auto' : 'none'}
            accessibilityElementsHidden={!pathMainTab}
            importantForAccessibility={pathMainTab ? 'auto' : 'no-hide-descendants'}          >
            {/* while a page opens on top, the tab stays exactly as it was drawn (it used to react to the new URL and
                strip its header / list for a moment) */}
            <FreezeLocation frozen={!pathMainTab}>
              <MainTabKeepAlive
                activeTab={keepAliveTab}
                holdTab={routeMainTab || (preserveMainTabs ? lastMainTabRef.current : null)}
                isVisible={mainTabsPainted}
              />
            </FreezeLocation>
          </View>
        ) : null}

        {showCategoryBrowse ? (
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: pageBg }, !categoryBrowseVisible && styles.hidden]}
            pointerEvents={categoryBrowseVisible ? 'auto' : 'none'}
          >
            <CategoryBrowseKeepAlive categorySlug={preservedCategorySlug} isVisible={categoryBrowseVisible} />
          </View>
        ) : null}

        {showSkeleton ? (
          <View style={[StyleSheet.absoluteFill, styles.cover]}>
            <AppShellSkeleton />
          </View>
        ) : showOutOfZone ? (
          <View style={[StyleSheet.absoluteFill, styles.cover]}>
            <OutOfZoneScreen location={activeLocation} handleLocationClick={openLocationSelector} />
          </View>
        ) : null}
      </View>

      {(normalizedPath === '/' || normalizedPath === '' || normalizedPath === '/user') && !isOutOfZone && <BackToTop />}
      {showBottomNav && !isOutOfZone && <BottomNavigation />}

      {/* Location Fetching Loader - Only shown on main pages after login */}
      {showGlobalLoader && !isInitialChecking && !location.pathname.includes('/search') && (
        <View style={[StyleSheet.absoluteFill, styles.loader]}>
          <BlurView intensity={8} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#ffffff', 0.6) }]} />
          <Spinner />
          <Text style={styles.loaderText}>Fetching Location...</Text>
        </View>
      )}

      {/* Central Login Required Modal */}
      <LoginRequiredModal
        isOpen={isLoginModalOpen}
        intent={loginModalIntent}
        onClose={() => {
          setIsLoginModalOpen(false);
          setLoginModalIntent('general');
        }}
      />
    </>
  );
}

export default function UserLayout({ children }) {
  const t = useTheme();
  useUserNotifications();
  // a real Food screen is on screen from here on (see shared/utils/firstScreen.js)
  useEffect(() => {
    markFirstScreenShown();
  }, []);

  return (
    <View style={[styles.fill, { backgroundColor: t.dark ? '#0a0a0a' : '#f5f5f5' }]}>
      <ProfileProvider>
        <CartProvider>
          <OrdersProvider>
            <SearchOverlayProvider>
              <LocationSelectorProvider>
                <UserLayoutContent>{children}</UserLayoutContent>
              </LocationSelectorProvider>
            </SearchOverlayProvider>
          </OrdersProvider>
        </CartProvider>
      </ProfileProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  main: { flex: 1, flexDirection: 'column' },
  hidden: { display: 'none' },
  // the main-tab layer under a page keeps its native views (display: none rebuilt them all on Back)
  transparent: { opacity: 0 },
  cover: { zIndex: 40, elevation: 40 },
  loader: { zIndex: 1000, elevation: 1000, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 16, fontSize: 13, fontWeight: '700', color: colors.gray[800], letterSpacing: -0.3 },
});

const toastStyles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.gray[50],
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});
