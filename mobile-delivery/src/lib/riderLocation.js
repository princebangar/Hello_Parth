// Native only: the rider's location while online, also with the app in the background or the screen off.
// On the web the Feed (DeliveryHomeV2) watched GPS while online and sent `deliveryAPI.updateLocation(...)` every 7 s or
// 25 m (plus the socket `update-location` + Firebase tracking for the order being carried), with a 15 s heartbeat; all of
// it stopped as soon as the page was in the background. Here an Android foreground service ("You are online"
// notification, expo-location + expo-task-manager) delivers a location every ~7 s. While the app is on screen the
// screens keep doing exactly what the web did; while it is in the background the task does the same sends:
//   - a handler registered by the Feed (setRiderBackgroundHandler) when the JS app is alive — it sends like the
//     web's watchPosition branch (HTTP + socket + Firebase for the active order);
//   - otherwise (app process restarted by Android) the HTTP update only.
// DeliveryRealtimeShell starts it when the rider is online and stops it when they go offline or sign out.
// Imported once from index.js, so the task is defined before Android can start it (also after the app was closed).
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { hydrateStorage } from './storage';

export const RIDER_LOCATION_TASK = 'helloparth-delivery-online-location';

const SEND_GAP_MS = 7000; // web: DeliveryHomeV2 sends at least every 7 s while online
let lastSentAt = 0;
let backgroundHandler = null;

const readDeliveryToken = () => {
  try {
    return localStorage.getItem('delivery_accessToken') || '';
  } catch {
    return '';
  }
};

/** The Feed registers what to do with a background location (same sends as its watchPosition). Returns an unregister. */
export function setRiderBackgroundHandler(fn) {
  backgroundHandler = fn;
  return () => {
    if (backgroundHandler === fn) backgroundHandler = null;
  };
}

TaskManager.defineTask(RIDER_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const latest = data.locations[data.locations.length - 1];
  const coords = latest?.coords || {};
  const { latitude, longitude } = coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  try {
    // after Android restarted the service the JS storage may not be loaded yet
    await hydrateStorage();
  } catch {
    // storage unavailable: nothing to send with
  }
  if (!readDeliveryToken()) {
    stopOnlineLocationUpdates();
    return;
  }

  // on screen the Feed's own GPS watch + heartbeat send (web behaviour); the service only covers the background
  if (AppState.currentState === 'active' && backgroundHandler) return;

  const now = Date.now();
  if (now - lastSentAt < SEND_GAP_MS - 1000) return;
  lastSentAt = now;

  if (backgroundHandler) {
    try {
      backgroundHandler(latest);
      return;
    } catch {
      // fall through to the plain update
    }
  }
  try {
    // required here (not at the top) so this file has no import cycle with the API layer
    const { deliveryAPI } = require('@/services/api');
    await deliveryAPI.updateLocation(latitude, longitude, true, {
      heading: coords.heading || 0,
      speed: coords.speed || 0,
      accuracy: coords.accuracy,
    });
  } catch {
    // offline / token refresh failed: the next update tries again
  }
});

/**
 * Starts the background location service (asks for location permission first; "Allow all the time" is asked for too,
 * but the service also works with "While using the app" because it runs as a foreground service).
 * Returns false when location permission was refused.
 */
export async function startOnlineLocationUpdates() {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    let granted = fg.granted;
    if (!granted && fg.canAskAgain) granted = (await Location.requestForegroundPermissionsAsync()).granted;
    if (!granted) return false;
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      if (!bg.granted && bg.canAskAgain) await Location.requestBackgroundPermissionsAsync();
    } catch {
      // older Android / refused: the foreground service still runs
    }
    if (await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK).catch(() => false)) return true;
    await Location.startLocationUpdatesAsync(RIDER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: SEND_GAP_MS,
      distanceInterval: 0,
      deferredUpdatesInterval: SEND_GAP_MS,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'You are online',
        notificationBody: 'Hello Parth Delivery Partner is sharing your location to get orders.',
        notificationColor: '#15498B',
        killServiceOnDestroy: false,
      },
    });
    askToRunInBackground();
    return true;
  } catch (e) {
    console.warn('[rider-location] start failed', e?.message || e);
    return false;
  }
}

// With battery optimization on, Android (MIUI even more) throttles the location service once the screen is off. Going
// online asks once per app start (and at most once a day after "Not now") to let the app run in the background.
const BATTERY_ASKED_KEY = 'delivery_battery_prompt_at';
let batteryAskedThisRun = false;

async function askToRunInBackground() {
  if (Platform.OS !== 'android' || batteryAskedThisRun) return;
  batteryAskedThisRun = true;
  try {
    if (!(await Battery.isBatteryOptimizationEnabledAsync())) return;
    const last = Number(localStorage.getItem(BATTERY_ASKED_KEY) || 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    Alert.alert(
      'Keep getting orders with the screen off',
      'Allow Hello Parth Delivery Partner to run in the background so your location and new orders keep coming while the phone is locked.\n\nOn Xiaomi / Redmi / POCO phones also set Battery saver to "No restrictions" and turn on Autostart in the app settings.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => localStorage.setItem(BATTERY_ASKED_KEY, String(Date.now())) },
        { text: 'App settings', onPress: () => Linking.openSettings().catch(() => {}) },
        {
          text: 'Allow',
          onPress: () =>
            IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
              data: `package:${Application.applicationId}`,
            }).catch(() => Linking.openSettings().catch(() => {})),
        },
      ],
    );
  } catch {
    // no battery API on this device: nothing to ask
  }
}

export async function stopOnlineLocationUpdates() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(RIDER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(RIDER_LOCATION_TASK);
    }
  } catch {
    // not running
  }
}
