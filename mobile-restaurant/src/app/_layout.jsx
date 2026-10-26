// Root layout: waits for the stored session (localStorage shim) before the first screen, then mounts the
// app-wide parts the web mounted around every screen (theme, toasts, connection notice, maintenance gate, default status
// bar), the native payment sheet (Razorpay) and the notification tap routing (a new order opens the Orders screen).
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hydrateStorage } from '@/lib/storage';
import { RouteSync, navigateTo } from '@/lib/router';
import { routeFromNotification } from '@/lib/push';
import { ThemeProvider, restaurantTheme } from '@/theme';
import { FontScope, StoreWordingProvider, Toaster } from '@/native/ui';
import { PaymentHost } from '@/native/PaymentHost';
import { AnimatedSplash, SPLASH_BG } from '@/native/AnimatedSplash';
import { markSplashDone } from '@/native/splashState';
import { NavBarScrim } from '@/native/NavBarScrim';
import StatusBarSync from '@/appstore/StatusBarSync';
import ConnectionStatus from '@/appstore/ConnectionStatus';
import MaintenanceGate from '@/appstore/MaintenanceGate';

SplashScreen.preventAutoHideAsync().catch(() => {});

function useNotificationRouting(ready) {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!ready || !last) return;
    const route = routeFromNotification(last.notification);
    if (route) navigateTo(route);
  }, [ready, last]);
}

export default function RootLayout() {
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    hydrateStorage()
      .catch(() => {})
      .finally(() => setStorageReady(true));
  }, []);

  // the fonts are embedded in the app (expo-font plugin in app.json), so only the stored session is awaited
  const ready = storageReady;
  const [splashDone, setSplashDone] = useState(false);
  useNotificationRouting(ready);

  // The native splash (header crimson, Restaurant Partner wordmark) hands over to the animated brand splash as soon as that is on screen.
  const splash = splashDone ? null : (
    <AnimatedSplash ready={ready} onShown={() => SplashScreen.hideAsync().catch(() => {})} onDone={() => {
        setSplashDone(true);
        markSplashDone();
      }} />
  );

  return (
    // one root for both states, so the splash (last child) is not remounted when the app becomes ready
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: ready ? restaurantTheme.surface : SPLASH_BG }}>
      {ready ? (
        <SafeAreaProvider>
          <ThemeProvider>
            {/* web: global.css body font Poppins (the restaurant pages set Outfit / Poppins where they want it) */}
            <StoreWordingProvider>
            <FontScope family="Poppins">
              <RouteSync />
              <StatusBarSync />
              <ConnectionStatus />
              <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}>
              </Stack>
              <MaintenanceGate />
              <NavBarScrim />
              <PaymentHost />
              <Toaster />
            </FontScope>
            </StoreWordingProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      ) : null}
      {splash}
    </GestureHandlerRootView>
  );
}
