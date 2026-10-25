// Web: modules/Taxi/TaxiApp.jsx — the Taxi app shell. The web's <Routes> table became Expo Router files under
// src/app/taxi/** (same URLs, see TAXI_USER_ROUTES below); what stays here is everything the web mounted around them
// for the customer screens:
//   - SettingsProvider + UserThemeProvider, the Outfit font scope (index.css: Outfit on every Taxi screen) and the
//     MainLayout background (--user-bg; index.html .tp #f1f4f9 light / #0a0a0a dark);
//   - push registration (installNativeFcmBridge / installBrowserFcmRegistration);
//   - UserAccountInvalidationListener (user socket: account deleted, admin support chat, ride status notices,
//     app:auth-stale) and UserUpcomingRideReminderBootstrap (bus + scheduled ride reminders);
//   - AppAutoUpdater (renders nothing in the app), Suspense fallback (AppRouteFallback);
//   - userRoute(): the web's <UserProtectedRoute> for the route files.
// Driver / owner / bus-driver / admin routes are not part of the user app. The web's ScrollToTop is not needed: every
// pushed screen starts at its top, and the kept-alive tabs keep their own scroll.
import { PaintProbe } from '@/native/ui/screenPaint';
import React, { Suspense, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { FontScope } from '@/native/ui';
import { Navigate, useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import api from './shared/api/axiosInstance';
import { socketService } from './shared/api/socket';
import { installHistoryStateGuard } from './shared/api/historyStateGuard';
import { SettingsProvider, useSettings } from './shared/context/SettingsContext';
import { UserThemeProvider, useUserPalette } from './shared/context/UserThemeContext';
import AppAutoUpdater from './modules/shared/components/AppAutoUpdater';
import { addRealtimeNotification } from './modules/user/utils/realtimeNotificationStore';
import { clearLocalUserSessionData } from '@/shared/utils/userSession.js';
import { syncThemeForPath } from '@/shared/utils/theme.js';
import { getLocalUserToken } from './modules/user/services/authService';
import { clearCurrentRide } from './modules/user/services/currentRideService';
import userBusService from './modules/user/services/busService';
import { syncUpcomingRideReminders } from './modules/user/utils/upcomingRideReminderService';
import { installBrowserFcmRegistration } from './shared/push/browserFcmRegistration';
import { installNativeFcmBridge } from './shared/push/nativeFcmBridge';
import AppRouteFallback from '@/shared/components/AppRouteFallback';

installHistoryStateGuard();

/** The web's customer routes (relative to /taxi). guard: 'public' | 'user'. Each has a file in src/app/taxi. */
export const TAXI_USER_ROUTES = [
  { path: '', guard: 'public', note: 'redirect to /' },
  { path: 'about|contact|faq|services|blog|links', guard: 'public', note: 'redirect to /' },
  { path: 'track/:token', guard: 'public' },
  { path: 'terms|terms-and-conditions|privacy|privacy-policy|refund|cancellation', guard: 'public' },
  { path: 'user/terms|user/privacy|user/refund', guard: 'public' },
  { path: 'user', guard: 'user', mainTab: true },
  { path: 'user/activity|user/bus|user/support|user/profile', guard: 'user', mainTab: true },
  { path: '(user/)ride/*, (user/)parcel/*, (user/)intercity/*, (user/)cab, (user/)bus/*, (user/)profile/*, ...', guard: 'user' },
];

const clearUserSession = () => {
  clearCurrentRide();
  socketService.disconnect();
  syncThemeForPath('/login');
  clearLocalUserSessionData();
};

/**
 * <UserProtectedRoute>: guests cannot browse Taxi — send to the shared login with the taxi return intent.
 * Route files: export default userRoute(Page).
 */
export function UserProtectedRoute({ children }) {
  const location = useLocation();

  if (!getLocalUserToken()) {
    const from = location.pathname.startsWith('/taxi/') ? location.pathname : '/taxi/user';
    return <Navigate to="/login" state={{ from }} replace />;
  }

  return children;
}

export function userRoute(Page) {
  function TaxiUserRoute(props) {
    return (
      <UserProtectedRoute>
        <Suspense fallback={<AppRouteFallback />}>
          <Page {...props} />
          <PaintProbe />
        </Suspense>
      </UserProtectedRoute>
    );
  }
  TaxiUserRoute.displayName = `TaxiUserRoute(${Page.displayName || Page.name || 'Page'})`;
  return TaxiUserRoute;
}

export function publicRoute(Page) {
  function TaxiPublicRoute(props) {
    return (
      <Suspense fallback={<AppRouteFallback />}>
        <Page {...props} />
        <PaintProbe />
      </Suspense>
    );
  }
  TaxiPublicRoute.displayName = `TaxiPublicRoute(${Page.displayName || Page.name || 'Page'})`;
  return TaxiPublicRoute;
}

/** Main bottom-bar tabs are drawn by UserMainTabKeepAlive in the Taxi layout: the route only matches (and guards). */
export const UserMainTabRoute = userRoute(() => null);

const UserAccountInvalidationListener = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const isUserRoute =
    !location.pathname.startsWith('/admin') &&
    !location.pathname.startsWith('/user-import') &&
    !location.pathname.startsWith('/driver-import') &&
    !location.pathname.startsWith('/owner') &&
    !location.pathname.startsWith('/taxi/driver');

  // Runs when the rider enters / leaves the user area, not on every screen change: the web re-ran it per path, which
  // dropped and re-opened the socket on each tap (a reconnect every second while moving through the app).
  useEffect(() => {
    if (!isUserRoute) {
      return undefined;
    }

    const handleLogout = () => {
      clearUserSession();
      socketService.disconnect();
      navigate('/login', { replace: true, state: { from: pathRef.current } });
    };

    const handleAdminChatMessage = (payload = {}) => {
      const senderRole = String(payload.senderRole || payload.sender?.role || '').toLowerCase();
      const receiverRole = String(payload.receiverRole || payload.receiver?.role || '').toLowerCase();
      const messageBody = String(payload.message || payload.body || '').trim();

      if (senderRole !== 'admin' || !messageBody) {
        return;
      }

      if (receiverRole && receiverRole !== 'user') {
        return;
      }

      const notificationWasAdded = addRealtimeNotification({
        id: `support-chat:${payload.id || payload._id || `${Date.now()}-${messageBody}`}`,
        title: 'Support message',
        body: messageBody,
        sentAt: payload.createdAt || new Date().toISOString(),
        type: 'support',
        source: 'support-chat',
      });

      if (!notificationWasAdded) {
        return;
      }

      toast(messageBody, { duration: 4500 });
    };

    // Ride progress goes into the same Taxi notification list the header bell opens. The id is ride + status, so a
    // repeated socket event never creates a duplicate row.
    const RIDE_NOTICES = {
      accepted: ['Driver accepted your ride', 'Your driver is on the way to the pickup point.'],
      arriving: ['Driver is arriving', 'Your driver is almost at the pickup point.'],
      arrived: ['Driver has arrived', 'Your driver is waiting at the pickup point.'],
      started: ['Ride started', 'Your trip is in progress.'],
      ongoing: ['Ride started', 'Your trip is in progress.'],
      completed: ['Ride completed', 'You have reached your destination. Thanks for riding with us.'],
      cancelled: ['Ride cancelled', 'Your ride was cancelled.'],
    };

    const handleRideStatus = (payload = {}) => {
      const rideId = String(payload.rideId || payload.id || payload._id || '').trim();
      const status = String(payload.liveStatus || payload.status || '').trim().toLowerCase();
      const notice = RIDE_NOTICES[status];
      if (!rideId || !notice) {
        return;
      }

      addRealtimeNotification({
        id: `ride:${rideId}:${status}`,
        title: notice[0],
        body: notice[1],
        sentAt: new Date().toISOString(),
        type: 'ride',
        source: 'ride-status',
      });
    };

    const handleRideAccepted = (payload = {}) => handleRideStatus({ ...payload, status: 'accepted', liveStatus: 'accepted' });
    const handleRideCancelled = (payload = {}) => handleRideStatus({ ...payload, status: 'cancelled', liveStatus: 'cancelled' });

    const socket = socketService.connect({ role: 'user' });
    if (!socket) {
      return undefined;
    }

    socketService.on('account:deleted', handleLogout);
    socketService.on('chat:message', handleAdminChatMessage);
    socketService.on('ride:status:updated', handleRideStatus);
    socketService.on('rideAccepted', handleRideAccepted);
    socketService.on('rideCancelled', handleRideCancelled);

    const handleAuthStale = (event) => {
      const staleToken = event.detail?.token || '';
      const currentUserToken = localStorage.getItem('userToken') || localStorage.getItem('user_accessToken') || localStorage.getItem('token') || '';

      if (event.detail?.role === 'user' && (!staleToken || staleToken === currentUserToken)) {
        handleLogout();
        return;
      }

      // (web: an admin session going stale opened /admin/login — the admin panel is not part of the user app)
      if (event.detail?.role === 'admin') {
        socketService.disconnect();
      }
    };

    window.addEventListener('app:auth-stale', handleAuthStale);

    return () => {
      socketService.off('account:deleted', handleLogout);
      socketService.off('chat:message', handleAdminChatMessage);
      socketService.off('ride:status:updated', handleRideStatus);
      socketService.off('rideAccepted', handleRideAccepted);
      socketService.off('rideCancelled', handleRideCancelled);
      window.removeEventListener('app:auth-stale', handleAuthStale);
      socketService.disconnect();
    };
  }, [isUserRoute, navigate]);

  return null;
};

const getResponsePayload = (response) => response?.data?.data || response?.data || response || {};

// Reminder sync = 2 reads (bus, scheduled rides). Background work: it starts a few seconds after the screen is up, does
// not repeat on every in-app navigation, and focus / visible events only refresh it when the last sync is old.
const REMINDER_FIRST_SYNC_DELAY_MS = 4000;
const REMINDER_MIN_GAP_MS = 2 * 60 * 1000;
let lastReminderSyncAt = 0;

const UserUpcomingRideReminderBootstrap = () => {
  const location = useLocation();
  const { settings, loading: settingsLoading } = useSettings();
  const busEnabled = String(settings?.transportRide?.enable_bus_service || '0') === '1';
  const isUserRoute =
    location.pathname.startsWith('/taxi/user') || location.pathname === '/user' || location.pathname.startsWith('/ride') || location.pathname.startsWith('/bus');

  useEffect(() => {
    if (!isUserRoute || !getLocalUserToken() || settingsLoading) {
      return undefined;
    }

    let cancelled = false;

    const syncReminders = async () => {
      lastReminderSyncAt = Date.now();
      try {
        const [busResult, scheduledRideResult] = await Promise.all([
          busEnabled
            ? userBusService.getMyBookings({ page: 1, limit: 20, tripState: 'upcoming' }).catch(() => ({ data: { results: [] } }))
            : Promise.resolve({ data: { results: [] } }),
          api
            .get('/rides', {
              params: {
                page: 1,
                limit: 20,
                category: 'scheduled',
              },
            })
            .catch(() => ({ data: { results: [] } })),
        ]);

        if (cancelled) {
          return;
        }

        const busPayload = getResponsePayload(busResult);
        const scheduledRidePayload = getResponsePayload(scheduledRideResult);

        syncUpcomingRideReminders({
          busBookings: Array.isArray(busPayload?.results) ? busPayload.results : [],
          scheduledRides: Array.isArray(scheduledRidePayload?.results) ? scheduledRidePayload.results : [],
        });
      } catch {
        // Reminder sync is non-blocking.
      }
    };

    const syncIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastReminderSyncAt < REMINDER_MIN_GAP_MS) return;
      syncReminders();
    };

    // First sync waits until the screen is up (and is skipped when a recent one already ran, e.g. Food <-> Taxi).
    const firstSyncTimer = setTimeout(syncIfStale, REMINDER_FIRST_SYNC_DELAY_MS);
    const intervalId = setInterval(syncIfStale, 10 * 60 * 1000);
    window.addEventListener('focus', syncIfStale);
    document.addEventListener('visibilitychange', syncIfStale);

    return () => {
      cancelled = true;
      clearTimeout(firstSyncTimer);
      clearInterval(intervalId);
      window.removeEventListener('focus', syncIfStale);
      document.removeEventListener('visibilitychange', syncIfStale);
    };
  }, [isUserRoute, settingsLoading, busEnabled]);

  return null;
};

/** MainLayout for the customer screens: the `user-app-theme` root (Outfit, --user-bg background). */
const MainLayout = ({ children }) => {
  const p = useUserPalette();
  return <View style={[styles.root, { backgroundColor: p.bg }]}>{children}</View>;
};

function TaxiApp({ children }) {
  useEffect(() => {
    installNativeFcmBridge();
    installBrowserFcmRegistration();
  }, []);

  return (
    <SettingsProvider>
      <UserThemeProvider>
        <FontScope family="Outfit">
          <AppAutoUpdater />
          <UserAccountInvalidationListener />
          <UserUpcomingRideReminderBootstrap />
          <MainLayout>
            <Suspense fallback={<AppRouteFallback />}>{children}</Suspense>
          </MainLayout>
        </FontScope>
      </UserThemeProvider>
    </SettingsProvider>
  );
}

/** The Taxi customer screens people open first: the app bundle already holds them (web: chunk preload). */
export const preloadTaxiUserPages = () => Promise.resolve();

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default TaxiApp;
