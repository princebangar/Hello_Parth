// Native only: the driver's location while online, also with the app in the background or the screen off.
// On the web, Taxi Home sent `socket.emit('locationUpdate', { coordinates: [lng, lat] })` every 10 s while online (and
// only while the page was open: a background WebView stopped). Here an Android foreground service ("You are online"
// notification, expo-location + expo-task-manager) delivers a location every ~10 s and the task sends the same socket
// event. Taxi Home starts it when the driver goes online and stops it when they go offline; signing out stops it too.
// Imported once from index.js, so the task is defined before Android can start it (also after the app was closed).
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { Alert, Linking, Platform } from 'react-native';
import { hydrateStorage } from './storage';

export const DRIVER_LOCATION_TASK = 'helloparth-driver-online-location';

const SEND_GAP_MS = 10000; // web: ONLINE location interval
let lastSentAt = 0;

const readDriverToken = () => {
  try {
    return localStorage.getItem('driverToken') || localStorage.getItem('token') || '';
  } catch {
    return '';
  }
};

TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const latest = data.locations[data.locations.length - 1];
  const { latitude, longitude } = latest?.coords || {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const coordinates = [longitude, latitude];

  try {
    // after Android restarted the service the JS storage may not be loaded yet
    await hydrateStorage();
  } catch {
    // storage unavailable: nothing to send with
  }
  if (!readDriverToken()) {
    stopOnlineLocationUpdates();
    return;
  }

  try {
    // same place Taxi Home keeps the last position (persistStoredDriverInfo), so the next screen starts from it
    const raw = localStorage.getItem('driverInfo');
    const info = raw ? JSON.parse(raw) : {};
    localStorage.setItem('driverInfo', JSON.stringify({ ...info, location: { ...(info.location || {}), coordinates }, coordinates }));
  } catch {
    // ignore
  }

  const now = Date.now();
  if (now - lastSentAt < SEND_GAP_MS - 1000) return;
  lastSentAt = now;
  try {
    // required here (not at the top) so this file has no import cycle with the API layer
    const { socketService } = require('@/modules/Taxi/shared/api/socket');
    const socket = socketService.connect({ role: 'driver' });
    if (socket) socketService.emit('locationUpdate', { coordinates });
  } catch {
    // socket not ready: the next update tries again
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
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false)) return true;
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: SEND_GAP_MS,
      distanceInterval: 0,
      deferredUpdatesInterval: SEND_GAP_MS,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'You are online',
        notificationBody: 'Hello Parth Captain is sharing your location to get ride requests.',
        notificationColor: '#2563EB',
        killServiceOnDestroy: false,
      },
    });
    askToRunInBackground();
    return true;
  } catch (e) {
    console.warn('[driver-location] start failed', e?.message || e);
    return false;
  }
}

// With battery optimization on, Android (MIUI even more) throttles the location service once the screen is off. Going
// online asks once per app start (and at most once a day after "Not now") to let the app run in the background.
const BATTERY_ASKED_KEY = 'captain_battery_prompt_at';
let batteryAskedThisRun = false;

async function askToRunInBackground() {
  if (Platform.OS !== 'android' || batteryAskedThisRun) return;
  batteryAskedThisRun = true;
  try {
    if (!(await Battery.isBatteryOptimizationEnabledAsync())) return;
    const last = Number(localStorage.getItem(BATTERY_ASKED_KEY) || 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;
    Alert.alert(
      'Keep getting rides with the screen off',
      'Allow Hello Parth Captain to run in the background so your location and ride requests keep coming while the phone is locked.\n\nOn Xiaomi / Redmi / POCO phones also set Battery saver to "No restrictions" and turn on Autostart in the app settings.',
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
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch {
    // not running
  }
}
