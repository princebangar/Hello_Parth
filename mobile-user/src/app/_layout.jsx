// Root layout: waits for the fonts and the stored session (localStorage shim) before the first screen, then mounts the
// same providers the web's app/providers.jsx had (Redux store, theme, toasts) plus the native payment sheet.
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { Provider as ReduxProvider } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { hydrateStorage } from '@/lib/storage';
import { RouteSync, navigateTo } from '@/lib/router';
import { routeFromNotification } from '@/lib/push';
import { fontAssets } from '@/theme/fonts';
import { ThemeProvider, brand } from '@/theme';
import { FontScope, Toaster } from '@/native/ui';
import { PaymentHost } from '@/native/PaymentHost';
import { AnimatedSplash } from '@/native/AnimatedSplash';
import { NavBarScrim } from '@/native/NavBarScrim';
import { store } from '@/appstore/store';
import AppShell from '@/appstore/AppShell';

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
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    hydrateStorage().finally(() => setStorageReady(true));
  }, []);

  const ready = (fontsLoaded || Boolean(fontError)) && storageReady;
  const [splashDone, setSplashDone] = useState(false);
  useNotificationRouting(ready);

  // The native splash (plain Taxi navy) hands over to the animated brand splash as soon as that is on screen.
  const splash = splashDone ? null : (
    <AnimatedSplash ready={ready} onShown={() => SplashScreen.hideAsync().catch(() => {})} onDone={() => setSplashDone(true)} />
  );

  return (
    // one root for both states, so the splash (last child) is not remounted when the app becomes ready
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: ready ? brand.bootBg : '#0B172A' }}>
      {ready ? (
      <SafeAreaProvider>
        <ReduxProvider store={store}>
          <ThemeProvider>
            <FontScope family="Poppins">
              <RouteSync />
              <AppShell>
                <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}>
                  {/* Taxi + Food: one screen holding both as tabs (app/(main)/_layout.jsx) */}
                  <Stack.Screen name="(main)" />
                </Stack>
              </AppShell>
              <NavBarScrim />
              <PaymentHost />
              <Toaster />
            </FontScope>
          </ThemeProvider>
        </ReduxProvider>
      </SafeAreaProvider>
      ) : null}
      {splash}
    </GestureHandlerRootView>
  );
}
