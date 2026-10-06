import { saveDriverFcmToken, getLocalDriverToken } from '../../modules/driver/services/registrationService';
import { userAuthService, getLocalUserToken } from '../../modules/user/services/authService';
import { getAppRoutePath } from '@/shared/utils/nativeShell';

const PENDING_NATIVE_FCM_KEY = 'pendingNativeFcmRegistration';
const LAST_NATIVE_FCM_KEY = 'lastNativeFcmRegistration';
const LAST_NATIVE_FCM_DEBUG_KEY = 'lastNativeFcmDebugState';
const NATIVE_FCM_GLOBAL_KEYS = [
  '__nativeFcmToken',
  '__Appzeto 24NativeFcmToken',
  '__fcmToken',
  'nativeFcmToken',
  'fcmToken',
  '__firebaseToken',
  'firebaseToken',
];
const DRIVER_PORTAL_ROLES = new Set([
  'driver',
  'owner',
  'pooling_driver',
  'bus_driver',
]);

const decodeBase64Url = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padding);
};

const getTokenPayload = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return null;
    }

    const decoded = JSON.parse(atob(decodeBase64Url(payload)));
    if (decoded && typeof decoded.exp === 'number') {
      const isExpired = Date.now() / 1000 >= decoded.exp;
      if (isExpired) {
        return null;
      }
    }
    return decoded;
  } catch {
    return null;
  }
};

const inferRole = (explicitRole) => {
  const normalizedRole = String(explicitRole || '').trim().toLowerCase();

  if (normalizedRole === 'user' || DRIVER_PORTAL_ROLES.has(normalizedRole)) {
    return normalizedRole;
  }

  const pathname = String(getAppRoutePath() || '').toLowerCase();
  if (pathname.includes('/taxi/owner')) {
    return 'owner';
  }
  if (pathname.includes('/taxi/driver')) {
    return 'driver';
  }
  if (pathname.includes('/taxi/user')) {
    return 'user';
  }

  const storedCandidates = [
    sessionStorage.getItem('driverToken'),
    sessionStorage.getItem('token'),
    localStorage.getItem('driverToken'),
    localStorage.getItem('userToken'),
    localStorage.getItem('token'),
  ].filter(Boolean);

  const tokenRole = storedCandidates
    .map((token) => getTokenPayload(token)?.role)
    .find((role) => role === 'user' || DRIVER_PORTAL_ROLES.has(String(role || '').toLowerCase()));

  return String(tokenRole || '').toLowerCase();
};

const getActivePortalRole = () => {
  const pathname = String(getAppRoutePath() || '').toLowerCase();

  if (pathname.includes('/taxi/owner')) {
    return 'owner';
  }
  if (pathname.includes('/taxi/driver') || pathname.includes('/driver')) {
    return 'driver';
  }
  if (pathname.includes('/taxi/user') || pathname.includes('/user')) {
    return 'user';
  }

  return '';
};

const hasRoleSession = (role) => {
  if (DRIVER_PORTAL_ROLES.has(String(role || '').toLowerCase())) {
    return Boolean(getLocalDriverToken());
  }

  if (role === 'user') {
    return Boolean(getLocalUserToken());
  }

  return false;
};

const persistLastRegistration = (payload) => {
  localStorage.setItem(LAST_NATIVE_FCM_KEY, JSON.stringify({
    ...payload,
    updatedAt: new Date().toISOString(),
  }));
};

const savePendingRegistration = (payload) => {
  localStorage.setItem(PENDING_NATIVE_FCM_KEY, JSON.stringify({
    ...payload,
    updatedAt: new Date().toISOString(),
  }));
};

const readPendingRegistration = () => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_NATIVE_FCM_KEY) || 'null');
  } catch {
    return null;
  }
};

const clearPendingRegistration = () => {
  localStorage.removeItem(PENDING_NATIVE_FCM_KEY);
};

const persistDebugState = (payload) => {
  try {
    localStorage.setItem(LAST_NATIVE_FCM_DEBUG_KEY, JSON.stringify({
      ...payload,
      updatedAt: new Date().toISOString(),
    }));
  } catch { }
};

const normalizeBridgePayload = (payload = {}, fallbackPlatform = 'android') => {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    const trimmedPayload = payload.trim();
    if (!trimmedPayload) {
      return null;
    }

    if (trimmedPayload.startsWith('{') || trimmedPayload.startsWith('[')) {
      try {
        return normalizeBridgePayload(JSON.parse(trimmedPayload), fallbackPlatform);
      } catch {
        // Fall through and treat the raw string as the token itself.
      }
    }

    return {
      token: trimmedPayload,
      role: '',
      platform: fallbackPlatform,
    };
  }

  if (typeof payload !== 'object') {
    return null;
  }

  const nestedPayload =
    payload.data && typeof payload.data === 'object'
      ? payload.data
      : payload.detail && typeof payload.detail === 'object'
        ? payload.detail
        : payload;

  const token = String(
    nestedPayload.token ||
    nestedPayload.fcmToken ||
    nestedPayload.fcm_token ||
    nestedPayload.registrationToken ||
    nestedPayload.nativeFcmToken ||
    nestedPayload.deviceToken ||
    nestedPayload.firebaseToken ||
    nestedPayload.fcm ||
    nestedPayload.value ||
    '',
  ).trim();

  if (!token) {
    return null;
  }

  return {
    token,
    role: String(
      nestedPayload.role ||
      nestedPayload.userRole ||
      nestedPayload.accountRole ||
      nestedPayload.portalRole ||
      nestedPayload.accountType ||
      '',
    ).trim(),
    platform: String(
      nestedPayload.platform ||
      nestedPayload.devicePlatform ||
      nestedPayload.sourcePlatform ||
      fallbackPlatform ||
      'android',
    ).trim() || 'android',
  };
};

const readQueuedGlobalPayloads = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  return NATIVE_FCM_GLOBAL_KEYS
    .map((key) => normalizeBridgePayload(window[key]))
    .filter(Boolean);
};

const submitFcmToken = async ({ token, role, platform = 'mobile' }) => {
  const inferredRole = inferRole(role);
  const activePortalRole = getActivePortalRole();
  const normalizedRole =
    activePortalRole === 'user'
      ? 'user'
      : activePortalRole === 'owner'
        ? 'owner'
        : activePortalRole === 'driver'
          ? 'driver'
          : inferredRole;
  const normalizedPlatform = String(platform || 'mobile').trim().toLowerCase() || 'mobile';
  const normalizedToken = String(token || '').trim();

  if (!normalizedToken) {
    persistDebugState({ ok: false, reason: 'missing-token', role: normalizedRole, platform: normalizedPlatform });
    return { ok: false, reason: 'missing-token' };
  }

  if (!normalizedRole) {
    savePendingRegistration({ token: normalizedToken, role: '', platform: normalizedPlatform });
    persistDebugState({ ok: false, reason: 'missing-role', role: '', platform: normalizedPlatform });
    return { ok: false, reason: 'missing-role' };
  }

  if (!hasRoleSession(normalizedRole)) {
    savePendingRegistration({ token: normalizedToken, role: normalizedRole, platform: normalizedPlatform });
    persistDebugState({ ok: false, reason: 'missing-auth', role: normalizedRole, platform: normalizedPlatform });
    return { ok: false, reason: 'missing-auth' };
  }

  if (DRIVER_PORTAL_ROLES.has(normalizedRole)) {
    await saveDriverFcmToken(normalizedToken, normalizedPlatform);
  } else {
    await userAuthService.saveFcmToken(normalizedToken, normalizedPlatform);
  }

  clearPendingRegistration();
  persistLastRegistration({
    token: normalizedToken,
    role: normalizedRole,
    platform: normalizedPlatform,
  });
  persistDebugState({ ok: true, reason: 'saved', role: normalizedRole, platform: normalizedPlatform });

  return { ok: true, role: normalizedRole, platform: normalizedPlatform };
};

const flushPendingRegistration = async () => {
  const pending = readPendingRegistration();

  if (!pending?.token) {
    return { ok: false, reason: 'no-pending-token' };
  }

  try {
    return await submitFcmToken(pending);
  } catch (error) {
    console.warn('[native-fcm-bridge] pending registration failed', error?.message || error);
    return { ok: false, reason: 'submit-failed' };
  }
};

// The Food apps ask the Flutter shell for its FCM token; the Taxi apps only waited for the shell to hand it over,
// and the captain app never did - its drivers had no push token, so a ride request reached them only while the app
// was open in front (a background WebView drops its socket). Ask the shell the same way the Food apps do.
const NATIVE_TOKEN_HANDLERS = ['getFcmToken', 'getFCMToken', 'getPushToken', 'getFirebaseToken'];
const NATIVE_PERMISSION_HANDLERS = ['requestNotificationPermission', 'requestPushPermission', 'enableNotifications'];
const NATIVE_TOKEN_REQUEST_GAP_MS = 10 * 60 * 1000;
let lastNativeTokenRequest = { role: '', at: 0 };
let nativeTokenRequestInFlight = null;

const callNativeHandler = async (names, payload) => {
  for (const name of names) {
    try {
      const value = await window.flutter_inappwebview.callHandler(name, payload);
      if (value !== undefined) return value;
    } catch {
      // try the next name
    }
  }
  return undefined;
};

const requestTokenFromNativeShell = async ({ force = false } = {}) => {
  if (typeof window === 'undefined' || typeof window.flutter_inappwebview?.callHandler !== 'function') return null;

  const role = getActivePortalRole() || inferRole('');
  if (!role || !hasRoleSession(role)) return null;
  if (!force && lastNativeTokenRequest.role === role && Date.now() - lastNativeTokenRequest.at < NATIVE_TOKEN_REQUEST_GAP_MS) return null;
  if (nativeTokenRequestInFlight) return nativeTokenRequestInFlight;

  lastNativeTokenRequest = { role, at: Date.now() };
  const module = role === 'user' ? 'user' : 'driver';
  nativeTokenRequestInFlight = (async () => {
    await callNativeHandler(NATIVE_PERMISSION_HANDLERS, { module });
    // the shell's bridge is often not ready on the first call
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const payload = normalizeBridgePayload(await callNativeHandler(NATIVE_TOKEN_HANDLERS, { module }), 'mobile');
      if (payload?.token && payload.token.length >= 20) {
        return submitFcmToken({ token: payload.token, role, platform: 'mobile' });
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    persistDebugState({ ok: false, reason: 'native-shell-gave-no-token', role, platform: 'mobile' });
    return null;
  })()
    .catch((error) => {
      persistDebugState({ ok: false, reason: error?.message || 'native-token-request-failed', role, platform: 'mobile' });
      return null;
    })
    .finally(() => {
      nativeTokenRequestInFlight = null;
    });

  return nativeTokenRequestInFlight;
};

export const installNativeFcmBridge = () => {
  const processQueuedCalls = async (queuedCalls = []) => {
    for (const queuedCall of queuedCalls) {
      const normalizedCall = normalizeBridgePayload(queuedCall);
      if (!normalizedCall) {
        continue;
      }

      try {
        await submitFcmToken(normalizedCall);
      } catch (error) {
        savePendingRegistration({
          token: normalizedCall.token,
          role: inferRole(normalizedCall.role),
          platform: normalizedCall.platform || 'android',
        });
      }
    }
  };

  const drainQueuedCalls = async () => {
    const queuedCalls = Array.isArray(window.__pendingNativeFcmCalls)
      ? [...window.__pendingNativeFcmCalls]
      : [];

    window.__pendingNativeFcmCalls = [];

    await processQueuedCalls(queuedCalls);

    const globalPayloads = readQueuedGlobalPayloads();
    await processQueuedCalls(globalPayloads);
  };

  const queueNativePayload = (payload) => {
    const normalizedPayload = normalizeBridgePayload(payload);
    if (!normalizedPayload) {
      persistDebugState({ ok: false, reason: 'invalid-native-payload' });
      return null;
    }

    window.__pendingNativeFcmCalls = Array.isArray(window.__pendingNativeFcmCalls)
      ? window.__pendingNativeFcmCalls
      : [];

    window.__pendingNativeFcmCalls.push(normalizedPayload);
    return normalizedPayload;
  };

  const handleNativeFcmToken = async (tokenOrPayload, role, platform = 'android') => {
    const normalizedPayload = normalizeBridgePayload(
      typeof tokenOrPayload === 'object' && tokenOrPayload !== null
        ? tokenOrPayload
        : { token: tokenOrPayload, role, platform },
      platform || 'android',
    );

    if (!normalizedPayload) {
      persistDebugState({ ok: false, reason: 'invalid-native-payload' });
      return { ok: false, reason: 'invalid-native-payload' };
    }

    try {
      const result = await submitFcmToken(normalizedPayload);
      console.info('[native-fcm-bridge] token registration result', result);
      return result;
    } catch (error) {
      console.error('[native-fcm-bridge] token registration error', error);
      savePendingRegistration({
        token: normalizedPayload.token,
        role: inferRole(normalizedPayload.role),
        platform: normalizedPayload.platform || 'android',
      });
      persistDebugState({
        ok: false,
        reason: error?.message || 'unknown-error',
        role: inferRole(normalizedPayload.role),
        platform: String(normalizedPayload.platform || 'android').trim().toLowerCase() || 'android',
      });
      return { ok: false, reason: error?.message || 'unknown-error' };
    }
  };

  window.__saveNativeFcmToken = handleNativeFcmToken;
  window.__setNativeFcmToken = handleNativeFcmToken;
  window.setNativeFcmToken = handleNativeFcmToken;
  window.onNativeFcmToken = handleNativeFcmToken;
  window.onFcmTokenReceived = handleNativeFcmToken;
  window.saveFcmToken = handleNativeFcmToken;
  window.setFcmToken = handleNativeFcmToken;

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

  const retryPending = () => {
    flushPendingRegistration().catch(() => { });
  };

  const handleMessageEvent = (event) => {
    try {
      const rawData = event?.data;
      const normalizedPayload = normalizeBridgePayload(rawData);

      if (!normalizedPayload) {
        return;
      }

      if (queueNativePayload(normalizedPayload)) {
        retryPending();
      }
    } catch { }
  };

  window.addEventListener('focus', retryPending);
  window.addEventListener('pageshow', retryPending);
  window.addEventListener('app:auth-ready', retryPending);
  // just logged in: ask the shell for the token right away
  window.addEventListener('app:auth-ready', () => { requestTokenFromNativeShell({ force: true }).catch(() => { }); });
  window.addEventListener('message', handleMessageEvent);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      retryPending();
      requestTokenFromNativeShell().catch(() => { });
    }
  });

  drainQueuedCalls().catch(() => { });
  window.setTimeout(() => { requestTokenFromNativeShell().catch(() => { }); }, 1200);
  window.setTimeout(retryPending, 1500);
  window.setInterval(retryPending, 15000);
};
