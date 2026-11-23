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
import { Alert, Linking, Platform } from 'react-native';
import { hydrateStorage } from './storage';
import { requestLocationDisclosure } from './locationDisclosure';

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
 * Run before going Online: shows the location explanation and Android's prompt when needed.
 * Resolves 'granted', 'declined' ("Not now" on the explanation or "Don't allow" on Android's prompt) or
 * 'blocked' (Android no longer shows its prompt: the permission can only be given in the app settings).
 */
export async function ensureOnlineLocationPermission() {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.granted) {
      await askBackgroundOnce();
      return 'granted';
    }
    if (!fg.canAskAgain) return 'blocked';
    if (!(await requestLocationDisclosure())) return 'declined';
    const asked = await Location.requestForegroundPermissionsAsync();
    if (asked.granted) {
      await askBackgroundOnce();
      return 'granted';
    }
    return asked.canAskAgain ? 'declined' : 'blocked';
  } catch {
    return 'declined';
  }
}

// "Allow all the time" is asked only once per install, right after "While using the app" in the same Online tap. The
// location service works without it too (foreground service), so a "no" is not asked again.
const BG_ASKED_KEY = 'location_background_asked_v1';
async function askBackgroundOnce() {
  try {
    if (localStorage.getItem(BG_ASKED_KEY) === '1') return;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.granted || !bg.canAskAgain) return;
    localStorage.setItem(BG_ASKED_KEY, '1');
    await Location.requestBackgroundPermissionsAsync();
  } catch {
    // older Android / refused: the foreground service still runs
  }
}

/** Whether the app may read the location now (no prompt). */
export async function hasLocationPermission() {
  try {
    return (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Starts the background location service (asks for location permission first; "Allow all the time" is asked for too,
 * but the service also works with "While using the app" because it runs as a foreground service).
 * Returns false when location permission was refused.
 */
export async function startOnlineLocationUpdates() {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    let granted = fg.granted;
    // Play prominent disclosure: the driver sees why location (also in the background) is needed before Android asks
    if (!granted && fg.canAskAgain && (await requestLocationDisclosure())) {
      granted = (await Location.requestForegroundPermissionsAsync()).granted;
    }
    if (!granted) return false;
    // "Allow all the time" is asked once from the Online toggle (ensureOnlineLocationPermission), not here: this also
    // runs on every app start while Online, and asking here brought the prompt back again and again
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
      'In Battery settings choose "All apps", open Hello Parth Captain and select "Don\'t optimise", so your location and ride requests keep coming while the phone is locked.\n\nOn Xiaomi / Redmi / POCO phones set Battery saver to "No restrictions" and turn on Autostart in the app settings.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => localStorage.setItem(BATTERY_ASKED_KEY, String(Date.now())) },
        { text: 'App settings', onPress: () => Linking.openSettings().catch(() => {}) },
        {
          // the system's battery optimisation list: needs no REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission (Play restricts it)
          text: 'Battery settings',
          onPress: () =>
            IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS).catch(() =>
              Linking.openSettings().catch(() => {}),
            ),
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
