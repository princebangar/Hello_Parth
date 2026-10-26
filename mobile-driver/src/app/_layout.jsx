// Root layout: waits for the stored session (localStorage shim) before the first screen, then mounts the
// app-wide parts the web mounted around every screen (theme, toasts, connection notice, maintenance gate, default status
// bar), the native payment sheet (wallet top-up) and the notification tap routing (a ride request opens Taxi Home).
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hydrateStorage } from '@/lib/storage';
import { RouteSync, navigateTo } from '@/lib/router';
import { routeFromNotification } from '@/lib/push';
import { ThemeProvider, driverTheme } from '@/theme';
import { FontScope, Toaster } from '@/native/ui';
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
    hydrateStorage().finally(() => setStorageReady(true));
  }, []);

  // the fonts are embedded in the app (expo-font plugin in app.json), so only the stored session is awaited
  const ready = storageReady;
  const [splashDone, setSplashDone] = useState(false);
  useNotificationRouting(ready);

  // The native splash (header blue, Captain wordmark) hands over to the animated brand splash as soon as that is on screen.
  const splash = splashDone ? null : (
    <AnimatedSplash ready={ready} onShown={() => SplashScreen.hideAsync().catch(() => {})} onDone={() => {
        setSplashDone(true);
        markSplashDone();
      }} />
  );

  return (
    // one root for both states, so the splash (last child) is not remounted when the app becomes ready
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: ready ? driverTheme.bg : SPLASH_BG }}>
      {ready ? (
        <SafeAreaProvider>
          <ThemeProvider>
            <FontScope family="Outfit">
              <RouteSync />
              <StatusBarSync />
              <ConnectionStatus />
              <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}>
                <Stack.Screen name="taxi" />
              </Stack>
              <MaintenanceGate />
              <NavBarScrim />
              <PaymentHost />
              <Toaster />
            </FontScope>
          </ThemeProvider>
        </SafeAreaProvider>
      ) : null}
      {splash}
    </GestureHandlerRootView>
  );
}
