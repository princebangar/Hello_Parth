// The delivery partner app around every /food/delivery/** screen. Web pieces it replaces:
//   - modules/DeliveryV2/index.jsx: the `.delivery-v2-theme` root (page gradient #f7faff -> #edf2fb, Nunito Sans, light);
//   - DeliveryV2Router.jsx: `authRefreshFailed` (module delivery) and the cross-tab `delivery_accessToken` removal send
//     the rider to /food/delivery/login;
//   - modules/Food/routes.jsx (the parts that run for /food/delivery): push registration on every route change
//     (registerWebPushForCurrentModule), the 2 s safety net (no delivery token outside the auth / legal pages ->
//     login), and a session check with the backend when the app comes back to the front (`focus`);
//   - the protected routes' layout element DeliveryRealtimeShell (socket + order queue + Orders GPS), here running
//     while the rider is signed in (see DeliveryRealtimeShell.jsx);
//   - DeliveryHomeV2 / OrdersV2 as kept-alive bottom-bar screens + one DeliveryBottomNav (see DeliveryTabKeepAlive.jsx).
// Native addition: the notification channels (default + the ringing delivery_orders) exist before the first push.
// (The delivery socket reconnects on return to the front inside useDeliveryNotifications.)
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocationNow, useNavigate } from '@/lib/router';
import { ensureAndroidChannel } from '@/lib/push';
import { deliveryTheme } from '@/theme';
import { FontScope } from '@/native/ui';
import { authAPI } from '@food/api';
import { isModuleAuthenticated } from '@food/utils/auth';
import { initPushNotificationClient, registerWebPushForCurrentModule } from '@food/utils/firebaseMessaging';
import DeliveryRealtimeShell from './components/DeliveryRealtimeShell';
import DeliveryTabKeepAlive from './components/DeliveryTabKeepAlive';
import DeliveryBottomNav from './components/DeliveryBottomNav';
import { resolveDeliveryTab } from './deliveryTabPages';

// modules/Food/routes.jsx safety net: pages that may be open without a delivery session
const isDeliveryAuthPath = (p) =>
  p.includes('/login') || p.includes('/otp') || p.includes('/signup') || p.includes('/auth') || p.includes('/pending-verification');
const isPublicLegalPath = (p) =>
  p.includes('/privacy') || p.includes('/terms') || p.includes('/help-content') || p.includes('/help/content') || p.includes('/help-centre/support');

function useDeliverySignedIn(pathname) {
  const [signedIn, setSignedIn] = useState(() => isModuleAuthenticated('delivery'));
  useEffect(() => {
    setSignedIn(isModuleAuthenticated('delivery'));
  }, [pathname]);
  useEffect(() => {
    const id = setInterval(() => setSignedIn(isModuleAuthenticated('delivery')), 2000);
    return () => clearInterval(id);
  }, []);
  return signedIn;
}

export default function DeliveryApp({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocationNow();
  const signedIn = useDeliverySignedIn(pathname);

  useEffect(() => {
    // the "default" channel (every backend push uses it) must be high importance before the first push arrives
    ensureAndroidChannel().catch(() => {});
  }, []);

  // DeliveryV2Router: a failed token refresh / a removed delivery token -> login
  useEffect(() => {
    const handleAuthFailure = (e) => {
      if (e.detail?.module === 'delivery') {
        navigate('/food/delivery/login', { replace: true });
      }
    };
    const handleStorageChange = (e) => {
      if (e.key === 'delivery_accessToken' && !e.newValue) {
        navigate('/food/delivery/login', { replace: true });
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
      if (p.startsWith('/food/delivery') && !isDeliveryAuthPath(p) && !isPublicLegalPath(p)) {
        if (!localStorage.getItem('delivery_accessToken')) {
          navigate('/food/delivery/login', { replace: true });
        }
      }
    }, 2000);
    const handleFocus = async () => {
      try {
        if (localStorage.getItem('delivery_accessToken')) authAPI.me('delivery').catch(() => {});
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

  const onTabPath = Boolean(resolveDeliveryTab(pathname));

  return (
    <FontScope family="Nunito Sans">
      <View style={styles.root}>
        <LinearGradient colors={[deliveryTheme.pageFrom, deliveryTheme.pageTo]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {signedIn ? <DeliveryRealtimeShell /> : null}
        {children}
        <DeliveryTabKeepAlive signedIn={signedIn} />
        {signedIn && onTabPath ? <DeliveryBottomNav /> : null}
      </View>
    </FontScope>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: deliveryTheme.pageTo },
});
