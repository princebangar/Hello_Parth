// Web: modules/Food/routes.jsx — the Food app root (everything under /food). In the app the routes themselves are
// Expo Router files (src/app/food/**); this component keeps what the web root did around them:
//   AuthInitializer, PushSoundEnableButton, FCM token registration (init + per route + after login, now the native
//   token from @/lib/push via firebaseMessaging.js), the auth-failure -> login redirect, the restaurant / delivery
//   token watchers and the focus session check.
// Not carried over: the restaurant / delivery / admin routers and the restaurant new-order listener (partner panels
// are not part of the user app), and ScrollToTop (every native screen starts at its top; kept-alive tabs keep theirs).
import React, { useEffect } from 'react';
import { useLocation, useNavigate } from '@/lib/router';
import AuthInitializer from '@food/components/AuthInitializer';
import PushSoundEnableButton from '@food/components/PushSoundEnableButton';
import { initPushNotificationClient, registerWebPushForCurrentModule } from '@food/utils/firebaseMessaging';
import { authAPI } from '@food/api';
import { isExactMainTabPath } from '@food/utils/mainTabRoutes';

export default function App({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const lastFcmPathRef = React.useRef('');

  useEffect(() => {
    initPushNotificationClient();

    const pathname = location.pathname;
    const isUserMainTabSwitch = isExactMainTabPath(pathname) && isExactMainTabPath(lastFcmPathRef.current) && pathname !== lastFcmPathRef.current;

    lastFcmPathRef.current = pathname;

    if (isUserMainTabSwitch) return;

    registerWebPushForCurrentModule(pathname);
  }, [location.pathname]);

  // Ensure FCM token is saved once after login (not on every tab switch)
  useEffect(() => {
    const onLoginSuccess = () => {
      registerWebPushForCurrentModule('/food/user');
    };
    window.addEventListener('userLoginSuccess', onLoginSuccess);
    return () => window.removeEventListener('userLoginSuccess', onLoginSuccess);
  }, []);

  // Global Auth Failure Listener
  useEffect(() => {
    const handleAuthFailure = (event) => {
      const module = event.detail?.module || 'user';

      const loginPaths = {
        admin: '/food/admin/login',
        restaurant: '/food/restaurant/login',
        delivery: '/food/delivery/login',
        user: '/login',
      };

      // Only redirect if the current screen is actually on the module that failed
      if (location.pathname.startsWith(`/food/${module}`)) {
        const targetPath = loginPaths[module] || '/login';
        navigate(targetPath, { replace: true, state: { from: location.pathname } });
      }
    };

    const handleStorageChange = (e) => {
      // Instant logout when a partner token disappears
      if ((e.key === 'restaurant_accessToken' || e.key === 'delivery_accessToken') && !e.newValue) {
        const module = e.key === 'restaurant_accessToken' ? 'restaurant' : 'delivery';
        const loginPaths = {
          restaurant: '/food/restaurant/login',
          delivery: '/food/delivery/login',
        };
        if (location.pathname.startsWith(`/food/${module}`)) {
          navigate(loginPaths[module], { replace: true });
        }
      }
    };

    window.addEventListener('authRefreshFailed', handleAuthFailure);
    window.addEventListener('storage', handleStorageChange);

    // Safety Net: check local storage every 2 seconds if the active partner token gets deleted
    const safetyInterval = setInterval(() => {
      const p = location.pathname;
      const isRestaurantAuth =
        p.includes('/login') ||
        p.includes('/otp') ||
        p.includes('/signup') ||
        p.includes('/auth') ||
        p.includes('/forgot-password') ||
        p.includes('/onboarding') ||
        p.includes('/pending-verification');
      const isDeliveryAuth = p.includes('/login') || p.includes('/otp') || p.includes('/signup') || p.includes('/auth') || p.includes('/pending-verification');
      const isPublicLegalPage =
        p.includes('/privacy') || p.includes('/terms') || p.includes('/help-content') || p.includes('/help/content') || p.includes('/help-centre/support');

      if (p.startsWith('/food/restaurant') && !isRestaurantAuth && !isPublicLegalPage) {
        if (!localStorage.getItem('restaurant_accessToken')) {
          navigate('/food/restaurant/login', { replace: true });
        }
      }
      if (p.startsWith('/food/delivery') && !isDeliveryAuth && !isPublicLegalPage) {
        if (!localStorage.getItem('delivery_accessToken')) {
          navigate('/food/delivery/login', { replace: true });
        }
      }
    }, 2000);

    // Verify session when the app comes back to the foreground (web: window focus)
    const handleFocus = async () => {
      try {
        const hasRestaurantToken = !!localStorage.getItem('restaurant_accessToken');
        const hasDeliveryToken = !!localStorage.getItem('delivery_accessToken');
        if (hasRestaurantToken || hasDeliveryToken) {
          if (hasRestaurantToken) authAPI.me('restaurant').catch(() => {});
          if (hasDeliveryToken) authAPI.me('delivery').catch(() => {});
        }
      } catch (error) {
        // Silently catch - if it fails authAPI will handle the 401
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('authRefreshFailed', handleAuthFailure);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(safetyInterval);
    };
  }, [navigate, location.pathname]);

  return (
    <AuthInitializer>
      <>
        <PushSoundEnableButton />
        {children}
      </>
    </AuthInitializer>
  );
}
