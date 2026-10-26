// Web: the part of modules/Taxi/TaxiApp.jsx that wraps the driver / owner portal (/taxi/driver/*, /taxi/owner/*):
//   - SettingsProvider (admin settings: bus service on/off, wallet rules ...);
//   - push registration (installNativeFcmBridge — here the driver's POST /drivers/fcm-token);
//   - MainLayout's partner root: "driver-app-root light", bg #F8F9FA (.driver-theme), Outfit (index.css), light only;
//   - the top-level Suspense fallback (AppRouteFallback).
// The customer screens, admin panel and their watchers are not part of the Captain app.
// Native additions: the socket reconnects as soon as the app comes back to the front (a background phone may have
// dropped it), and the web's `focus` / `visibilitychange` events come from AppState (lib/webCompat).
import React, { Suspense, useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { FontScope } from '@/native/ui';
import { driverTheme } from '@/theme';
import { socketService } from './shared/api/socket';
import { installHistoryStateGuard } from './shared/api/historyStateGuard';
import { SettingsProvider } from './shared/context/SettingsContext';
import { installNativeFcmBridge } from './shared/push/nativeFcmBridge';
import { ensureAndroidChannel } from '@/lib/push';
import { getLocalDriverToken } from './modules/driver/services/registrationService';
import AppRouteFallback from '@/shared/components/AppRouteFallback';

installHistoryStateGuard();

function useSocketResume() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !getLocalDriverToken()) return;
      const socket = socketService.socket;
      if (socket && !socket.connected) socket.connect();
    });
    return () => sub.remove();
  }, []);
}

export default function DriverApp({ children }) {
  useEffect(() => {
    // the high-importance "default" channel must exist before the first push arrives with the app in the background
    // (the backend sends every push on channel "default"); otherwise Android files it under "Miscellaneous"
    ensureAndroidChannel().catch(() => {});
    installNativeFcmBridge();
  }, []);
  useSocketResume();

  return (
    <SettingsProvider>
      <FontScope family="Outfit">
        <View style={styles.root}>
          <Suspense fallback={<AppRouteFallback />}>{children}</Suspense>
        </View>
      </FontScope>
    </SettingsProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: driverTheme.bg },
});
