// Native push (FCM via google-services.json), replacing the Flutter wrapper's token bridge.
// getNativeFcmToken() asks for notification permission (Android 13+) once and returns the device FCM token, which the
// screens send to the same backend endpoints the web used (e.g. POST /users/fcm-token { token, platform: 'android' }).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

let tokenPromise = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifications',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function requestPushPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** The device's FCM token, or null (emulator without Play services, permission denied, no network). */
export function getNativeFcmToken({ askPermission = true } = {}) {
  if (!tokenPromise) {
    tokenPromise = (async () => {
      if (!Device.isDevice && Platform.OS !== 'android') return null;
      await ensureAndroidChannel();
      const granted = askPermission ? await requestPushPermission() : (await Notifications.getPermissionsAsync()).granted;
      if (!granted) return null;
      const res = await Notifications.getDevicePushTokenAsync();
      const token = typeof res?.data === 'string' ? res.data : null;
      if (token) globalThis.__nativeFcmToken = token;
      return token;
    })().catch(() => null);
    tokenPromise.then((t) => {
      if (!t) tokenPromise = null; // allow a retry later
    });
  }
  return tokenPromise;
}

// the backend stores app (FCM) tokens under platform "mobile" (web tokens under "web")
export const PUSH_PLATFORM = 'mobile';

/** Calls `fn(token)` whenever FCM rotates the token. */
export function onFcmTokenChange(fn) {
  const sub = Notifications.addPushTokenListener((t) => {
    if (typeof t?.data === 'string') {
      globalThis.__nativeFcmToken = t.data;
      fn(t.data);
    }
  });
  return () => sub.remove();
}

/** Path inside the app a notification points at (data.link / url / route / path), if any. */
export function routeFromNotification(notification) {
  const data = notification?.request?.content?.data || {};
  const raw = data.link || data.url || data.route || data.path || data.click_action || '';
  const value = String(raw || '');
  if (value.startsWith('/')) return value;
  const m = /^https?:\/\/(?:www\.)?helloparth\.in(\/[^#]*)/i.exec(value);
  return m ? m[1] : null;
}
