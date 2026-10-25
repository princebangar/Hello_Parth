// Web: the Flutter shell handed its FCM token to the page (window.__saveNativeFcmToken ...) or the page asked for it
// (callHandler('getFcmToken')), and the page saved it with POST /users/fcm-token { token, platform: 'mobile' }.
// In the app the token comes from @/lib/push (expo-notifications / FCM). Same rules as the web: the token is saved only
// while a user session exists; otherwise it is kept as "pending" and sent once the user signs in (app:auth-ready),
// on app focus / visibility, and every 15 s. The user app has no driver/owner portal, so only the user call remains.
import { getNativeFcmToken, onFcmTokenChange } from '@/lib/push';
import { userAuthService, getLocalUserToken } from '../../modules/user/services/authService';

const PENDING_NATIVE_FCM_KEY = 'pendingNativeFcmRegistration';
const LAST_NATIVE_FCM_KEY = 'lastNativeFcmRegistration';
const LAST_NATIVE_FCM_DEBUG_KEY = 'lastNativeFcmDebugState';
// The backend keeps app tokens (fcmTokenMobile) for platform "mobile" — what the web sent from the shell.
const APP_PUSH_PLATFORM = 'mobile';
const NATIVE_TOKEN_REQUEST_GAP_MS = 10 * 60 * 1000;

let installed = false;
let lastNativeTokenRequestAt = 0;
let nativeTokenRequestInFlight = null;

const persistLastRegistration = (payload) => {
  localStorage.setItem(LAST_NATIVE_FCM_KEY, JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }));
};

const savePendingRegistration = (payload) => {
  localStorage.setItem(PENDING_NATIVE_FCM_KEY, JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }));
};

const readPendingRegistration = () => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_NATIVE_FCM_KEY) || 'null');
  } catch {
    return null;
  }
};

const readLastRegistration = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_NATIVE_FCM_KEY) || 'null');
  } catch {
    return null;
  }
};

const clearPendingRegistration = () => {
  localStorage.removeItem(PENDING_NATIVE_FCM_KEY);
};

const persistDebugState = (payload) => {
  try {
    localStorage.setItem(LAST_NATIVE_FCM_DEBUG_KEY, JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }));
  } catch {}
};

const submitFcmToken = async ({ token, platform = APP_PUSH_PLATFORM }) => {
  const normalizedPlatform = String(platform || APP_PUSH_PLATFORM).trim().toLowerCase() || APP_PUSH_PLATFORM;
  const normalizedToken = String(token || '').trim();
  const role = 'user';

  if (!normalizedToken) {
    persistDebugState({ ok: false, reason: 'missing-token', role, platform: normalizedPlatform });
    return { ok: false, reason: 'missing-token' };
  }

  if (!getLocalUserToken()) {
    savePendingRegistration({ token: normalizedToken, role, platform: normalizedPlatform });
    persistDebugState({ ok: false, reason: 'missing-auth', role, platform: normalizedPlatform });
    return { ok: false, reason: 'missing-auth' };
  }

  await userAuthService.saveFcmToken(normalizedToken, normalizedPlatform);

  clearPendingRegistration();
  persistLastRegistration({ token: normalizedToken, role, platform: normalizedPlatform });
  persistDebugState({ ok: true, reason: 'saved', role, platform: normalizedPlatform });
  return { ok: true, role, platform: normalizedPlatform };
};

const flushPendingRegistration = async () => {
  const pending = readPendingRegistration();
  if (!pending?.token) return { ok: false, reason: 'no-pending-token' };
  try {
    return await submitFcmToken(pending);
  } catch (error) {
    console.warn('[native-fcm-bridge] pending registration failed', error?.message || error);
    return { ok: false, reason: 'submit-failed' };
  }
};

/** Asks the device for its FCM token (permission prompt on Android 13+) and saves it for the signed-in user. */
const requestTokenFromDevice = async ({ force = false } = {}) => {
  if (!getLocalUserToken()) return null;
  if (!force && Date.now() - lastNativeTokenRequestAt < NATIVE_TOKEN_REQUEST_GAP_MS) return null;
  if (nativeTokenRequestInFlight) return nativeTokenRequestInFlight;

  lastNativeTokenRequestAt = Date.now();
  nativeTokenRequestInFlight = (async () => {
    const token = await getNativeFcmToken();
    if (token && token.length >= 20) {
      const last = readLastRegistration();
      // already saved for this session: nothing to send (the web re-sent on every request; the result is the same)
      if (!force && last?.token === token) return { ok: true, reason: 'unchanged' };
      return submitFcmToken({ token, platform: APP_PUSH_PLATFORM });
    }
    persistDebugState({ ok: false, reason: 'native-shell-gave-no-token', role: 'user', platform: APP_PUSH_PLATFORM });
    return null;
  })()
    .catch((error) => {
      persistDebugState({ ok: false, reason: error?.message || 'native-token-request-failed', role: 'user', platform: APP_PUSH_PLATFORM });
      return null;
    })
    .finally(() => {
      nativeTokenRequestInFlight = null;
    });

  return nativeTokenRequestInFlight;
};

export const installNativeFcmBridge = () => {
  if (installed) return;
  installed = true;

  const retryPending = () => {
    flushPendingRegistration().catch(() => {});
  };

  window.__flushNativeFcmToken = async () => {
    const result = await flushPendingRegistration();
    console.info('[native-fcm-bridge] flush result', result);
    return result;
  };

  window.__getNativeFcmDebugState = () => {
    try {
      return JSON.parse(localStorage.getItem(LAST_NATIVE_FCM_DEBUG_KEY) || 'null');
    } catch {
      return null;
    }
  };

  // FCM rotated the token: save the new one (or keep it pending until sign-in).
  onFcmTokenChange((token) => {
    submitFcmToken({ token, platform: APP_PUSH_PLATFORM }).catch(() => {
      savePendingRegistration({ token, role: 'user', platform: APP_PUSH_PLATFORM });
    });
  });

  window.addEventListener('focus', retryPending);
  window.addEventListener('pageshow', retryPending);
  window.addEventListener('app:auth-ready', retryPending);
  // just logged in: ask for the token right away
  window.addEventListener('app:auth-ready', () => {
    requestTokenFromDevice({ force: true }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      retryPending();
      requestTokenFromDevice().catch(() => {});
    }
  });

  setTimeout(() => {
    requestTokenFromDevice().catch(() => {});
  }, 1200);
  setTimeout(retryPending, 1500);
  setInterval(retryPending, 15000);
};
