// The restaurant partner app around every /food/restaurant/** screen. Web pieces it replaces:
//   - RestaurantRouter.jsx: the `.restaurant-theme` root (text #1f1f24), StorePanelWording (here the shared Text reads
//     native/ui/storeWording.js), `authRefreshFailed` (module restaurant) and the removed `restaurant_accessToken`
//     -> "Session Expired" toast + /food/restaurant/login;
//   - modules/Food/routes.jsx (the parts that run for /food/restaurant): push registration on every route change
//     (registerWebPushForCurrentModule), the 2 s safety net (no restaurant token outside the auth / onboarding /
//     pending / legal pages -> login), a session check with the backend when the app comes back to the front
//     (`focus`), and RestaurantGlobalNotificationListener (RestaurantRealtimeShell);
//   - OrdersMain / Inventory / Feedback / ExploreMore as kept-alive bottom-bar screens + one BottomNavOrders
//     (RestaurantTabKeepAlive).
// Native addition: the notification channels (default + the ringing restaurant_orders) exist before the first push.
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocationNow, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { ensureAndroidChannel } from '@/lib/push';
import { restaurantTheme } from '@/theme';
import { authAPI } from '@food/api';
import { isModuleAuthenticated } from '@food/utils/auth';
import { initPushNotificationClient, registerWebPushForCurrentModule } from '@food/utils/firebaseMessaging';
import RestaurantRealtimeShell from './RestaurantRealtimeShell';
import RestaurantTabKeepAlive from './RestaurantTabKeepAlive';
import BottomNavOrders from './BottomNavOrders';
import { resolveRestaurantLayer, restaurantPanelAllowed } from './restaurantTabPages';

// modules/Food/routes.jsx safety net: pages that may be open without a restaurant session
const isRestaurantAuthLike = (p) =>
  p.includes('/login') ||
  p.includes('/otp') ||
  p.includes('/signup') ||
  p.includes('/auth') ||
  p.includes('/forgot-password') ||
  p.includes('/onboarding') ||
  p.includes('/pending-verification');
const isPublicLegalPath = (p) =>
  p.includes('/privacy') || p.includes('/terms') || p.includes('/help-content') || p.includes('/help/content') || p.includes('/help-centre/support');

function useRestaurantSession(pathname) {
  const read = () => {
    const signedIn = isModuleAuthenticated('restaurant');
    return { signedIn, allowed: signedIn && restaurantPanelAllowed() };
  };
  const [session, setSession] = useState(read);
  useEffect(() => {
    const update = () =>
      setSession((prev) => {
        const next = read();
        return prev.signedIn === next.signedIn && prev.allowed === next.allowed ? prev : next;
      });
    update();
    const id = setInterval(update, 2000);
    window.addEventListener('restaurantAuthChanged', update);
    return () => {
      clearInterval(id);
      window.removeEventListener('restaurantAuthChanged', update);
    };
  }, [pathname]);
  return session;
}

export default function RestaurantApp({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocationNow();
  const { signedIn, allowed } = useRestaurantSession(pathname);

  useEffect(() => {
    // the "default" channel and the ringing "restaurant_orders" channel must exist before the first push arrives
    ensureAndroidChannel().catch(() => {});
  }, []);

  // RestaurantRouter: a failed token refresh / a removed restaurant token -> login
  useEffect(() => {
    const handleAuthFailure = (e) => {
      if (e.detail?.module === 'restaurant') {
        toast.error('Session Expired', { description: 'Please log in again.' });
        navigate('/food/restaurant/login', { replace: true });
      }
    };
    const handleStorageChange = (e) => {
      if (e.key === 'restaurant_accessToken' && !e.newValue) {
        toast.error('Session Expired', { description: 'Please log in again.' });
        navigate('/food/restaurant/login', { replace: true });
      }
    };
    window.addEventListener('authRefreshFailed', handleAuthFailure);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('authRefreshFailed', handleAuthFailure);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [navigate]);

  // modules/Food/routes.jsx: safety net every 2 s + session check when the app is back in front
  useEffect(() => {
    const safetyInterval = setInterval(() => {
      const p = pathname;
      if (p.startsWith('/food/restaurant') && !isRestaurantAuthLike(p) && !isPublicLegalPath(p)) {
        if (!localStorage.getItem('restaurant_accessToken')) {
          navigate('/food/restaurant/login', { replace: true });
        }
      }
    }, 2000);
    const handleFocus = async () => {
      try {
        if (localStorage.getItem('restaurant_accessToken')) authAPI.me('restaurant').catch(() => {});
      } catch {
        // authAPI handles a 401 itself
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(safetyInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [pathname, navigate]);

  // modules/Food/routes.jsx: push registration for the module of the current route
  useEffect(() => {
    initPushNotificationClient();
    registerWebPushForCurrentModule(pathname);
  }, [pathname]);

  const onTabPath = Boolean(resolveRestaurantLayer(pathname));

  return (
    <View style={styles.root}>
      {signedIn ? <RestaurantRealtimeShell /> : null}
      {children}
      <RestaurantTabKeepAlive allowed={allowed} />
      {allowed && onTabPath ? <BottomNavOrders /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: restaurantTheme.surface },
});
