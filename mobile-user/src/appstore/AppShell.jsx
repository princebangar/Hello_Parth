// App-wide watchers that wrap every screen - the web mounted these in app/App.jsx and app/routes.jsx (AppRoutes):
// theme / session sync, maintenance gate, connection status, the Taxi <-> Food switch overlay, the location prompt,
// the logout cover, and the route effects of AppRoutes (active module, login return-to, last-route memory, old links).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Path } from 'react-native-svg';
import { useLocation, navigateTo } from '@/lib/router';
import { Text } from '@/native/ui';
import { alpha, shadow, useTheme } from '@/theme';
import { AppProviders } from './providers';
import ThemeSync from './ThemeSync';
import StatusBarSync from './StatusBarSync';
import ConnectionStatus from './ConnectionStatus';
import MaintenanceGate from './MaintenanceGate';
import UserSessionSync from './UserSessionSync';
import VerticalSwitchOverlay from '@/shared/components/VerticalSwitchOverlay';
import LocationPrompt from '@/modules/Food/components/user/LocationPrompt';
import { Spin } from '@/shared/components/Loader';
import {
  NATIVE_LAST_ROUTE_KEY,
  rememberLoginReturnTo,
  syncActiveModule,
  isConsumerLoggedIn,
  prefetchFoodUser,
  prefetchTaxiUser,
  prefetchFoodAdmin,
  prefetchTaxiAdmin,
} from '@/shared/utils/activeModule.js';
import { whenAppSettled } from '@/shared/utils/whenSettled.js';
import { clearUserLocalData } from '@/shared/utils/userLocalData.js';
import { syncSharedLocationStoresOnBoot } from '@/shared/utils/sharedUserLocation';
import { installDefaultLocationMode } from '@/shared/utils/defaultLocationMode';
import { installNativeApiErrorBridge } from '@/shared/utils/apiError';
import { markNativeSessionRunning } from '@/shared/utils/nativeShell';
import { subscribeLogoutCover, LOGOUT_COVER_FADE_MS } from '@/shared/utils/logoutTransition';

// Default Location Mode: answers customer GPS requests with Indore while the Global admin switch is ON.
installDefaultLocationMode();
installNativeApiErrorBridge();
// web index.jsx: the app session is running (sessionStorage is empty again after the app is closed)
markNativeSessionRunning();

// Do NOT persist transient ride-flow routes that rely on route state: reopened there, the state is lost.
const TRANSIENT_ROUTE_SEGMENTS = [
  '/ride/select-vehicle',
  '/ride/select-location',
  '/ride/searching',
  '/ride/tracking',
  '/ride/complete',
  '/ride/chat',
  '/parcel/searching',
  '/parcel/tracking',
  '/parcel/details',
  '/parcel/contacts',
  '/intercity/details',
  '/intercity/confirm',
];

// Old addresses (shared links, notifications) -> where the web's <Routes> sent them.
const OLD_POLICY_LINKS = {
  '/food/user/profile/terms': '/user/terms',
  '/food/user/profile/privacy': '/user/privacy',
  '/food/user/profile/support-info': '/user/support',
};
const USER_POLICY_ROUTES = new Set(['/user/terms', '/user/privacy', '/user/support']);
const FOOD_PREFIXES = /^\/(user|restaurant|delivery|usermain|profile|orders)(\/|$)/;

function legacyRedirect(pathname, search) {
  const path = String(pathname || '');
  if (OLD_POLICY_LINKS[path]) return OLD_POLICY_LINKS[path];
  if (/^\/cart(\/|$)/.test(path)) return '/food/user/cart';
  if (FOOD_PREFIXES.test(path) && !USER_POLICY_ROUTES.has(path.replace(/\/+$/, ''))) return `/food${path}${search || ''}`;
  return null;
}

function useAppRouteEffects() {
  const location = useLocation();
  const pathname = location.pathname;
  const search = location.search;

  useEffect(() => {
    syncActiveModule(pathname);
    rememberLoginReturnTo(pathname);
  }, [pathname]);

  // Old links (RedirectToFood / the policy aliases / /cart) go where the web router sent them.
  useEffect(() => {
    const to = legacyRedirect(pathname, search);
    if (to) navigateTo(to, { replace: true });
  }, [pathname, search]);

  // Taxi lives under /taxi/* only — never embed it on /food/user (one-off deep link /food/user?vertical=taxi).
  useEffect(() => {
    const vertical = new URLSearchParams(search).get('vertical');
    if (pathname.replace(/\/$/, '') === '/food/user' && vertical === 'taxi') {
      navigateTo('/taxi/user', { replace: true });
    }
  }, [pathname, search]);

  // The login screen is open and nobody is signed in: whatever a watcher wrote after the logout (the last address ...)
  // must not be left for the next person.
  useEffect(() => {
    if (/^\/login(\/|$)/.test(pathname) && !isConsumerLoggedIn()) clearUserLocalData({ session: false });
  }, [pathname]);

  // Warm the sibling module once the open screen has settled, so Food <-> Taxi switches stay smooth.
  useEffect(() => {
    const path = pathname || '';
    const warm = () => {
      if (path.startsWith('/food/user') || path === '/food' || path.startsWith('/food/user/')) {
        prefetchTaxiUser();
      } else if (path.startsWith('/taxi/user')) {
        prefetchFoodUser();
      } else if (path.startsWith('/admin')) {
        prefetchTaxiAdmin();
      } else if (path.startsWith('/taxi/admin')) {
        prefetchFoodAdmin();
      }
    };
    return whenAppSettled(warm);
  }, [pathname]);

  // Last-route memory for the next cold start (same rules as the web).
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;

    const route = `${pathname || ''}${search || ''}`;
    const isTransient = TRANSIENT_ROUTE_SEGMENTS.some((seg) => route.includes(seg));
    if (isTransient) {
      // Still remember the module so a cold start opens Taxi/Food home correctly.
      if (route.includes('/ride/select-location') || route.includes('/ride/select-vehicle')) {
        // A restart in the middle of booking resumes at the place picker, not at home.
        localStorage.setItem(NATIVE_LAST_ROUTE_KEY, '/taxi/user/ride/select-location');
      } else if (route.includes('/taxi/')) {
        localStorage.setItem(NATIVE_LAST_ROUTE_KEY, '/taxi/user');
      } else if (route.includes('/food/user')) {
        localStorage.setItem(NATIVE_LAST_ROUTE_KEY, '/food/user');
      }
      return;
    }

    if (route.startsWith('/taxi/') || route.startsWith('/food/') || route.startsWith('/admin')) {
      localStorage.setItem(NATIVE_LAST_ROUTE_KEY, route);
    }
  }, [pathname, search]);
}

/** The dim "Logging out..." cover (shared/utils/logoutTransition.js) - same look as the log-out popup. */
function LogoutTransitionCover() {
  const t = useTheme();
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeLogoutCover(setShown), []);

  useEffect(() => {
    if (shown) {
      setMounted(true);
      opacity.setValue(1);
      return undefined;
    }
    const anim = Animated.timing(opacity, { toValue: 0, duration: LOGOUT_COVER_FADE_MS, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => anim.stop();
  }, [shown, opacity]);

  if (!mounted) return null;
  const ink = t.dark ? '#ffffff' : '#111827';
  return (
    <Animated.View
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      style={[StyleSheet.absoluteFill, styles.cover, { opacity }]}
    >
      <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
      <View
        style={[
          styles.coverCard,
          {
            backgroundColor: t.dark ? 'rgba(26,26,26,0.94)' : 'rgba(255,255,255,0.94)',
            borderColor: t.dark ? alpha('#ffffff', 0.1) : alpha('#ffffff', 0.2),
          },
        ]}
      >
        <Spin duration={800} style={{ marginBottom: 12, alignSelf: 'center' }}>
          <Svg width={36} height={36} viewBox="0 0 50 50">
            <Circle cx={25} cy={25} r={20} fill="none" stroke={ink} strokeOpacity={0.15} strokeWidth={5} />
            <Path d="M25 5 a20 20 0 0 1 20 20" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" />
          </Svg>
        </Spin>
        <Text style={{ fontSize: 16, fontWeight: '700', color: ink, textAlign: 'center' }}>Logging out...</Text>
      </View>
    </Animated.View>
  );
}

function AppWatchers() {
  // usePathname so the watchers re-run on every route change, like the web's useLocation()
  usePathname();
  useAppRouteEffects();

  useEffect(() => {
    syncSharedLocationStoresOnBoot();
  }, []);

  return (
    <>
      <ThemeSync />
      <StatusBarSync />
      <ConnectionStatus />
      <UserSessionSync />
    </>
  );
}

export default function AppShell({ children }) {
  return (
    <AppProviders>
      <View style={styles.fill}>
        <AppWatchers />
        {children}
        <VerticalSwitchOverlay />
        <LocationPrompt />
        <LogoutTransitionCover />
        <MaintenanceGate />
      </View>
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { zIndex: 100000, elevation: 60, alignItems: 'center', justifyContent: 'center', padding: 16 },
  coverCard: {
    width: '100%',
    maxWidth: 384,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow['2xl'],
  },
});
