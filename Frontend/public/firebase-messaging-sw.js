/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

const sanitize = (value) => String(value || "").trim().replace(/^['"]|['"]$/g, "");
const PUSH_DEBUG_PREFIX = "[push-sw]";
const pushDebugLog = () => { };
const getNotificationKey = (payload) =>
  payload?.data?.notificationId ||
  payload?.data?.messageId ||
  payload?.messageId ||
  [
    payload?.notification?.title || payload?.data?.title || "",
    payload?.notification?.body || payload?.data?.body || "",
    payload?.data?.orderId || "",
    payload?.data?.targetUrl || payload?.data?.link || "",
  ].join("::");

async function notifyOpenClients(payload) {
  pushDebugLog(PUSH_DEBUG_PREFIX, "Broadcasting push to open clients", { payload });
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  windowClients.forEach((client) => {
    client.postMessage({
      type: "push-notification-received",
      payload,
    });
  });
}

function getTargetPathFromPayload(payload = {}) {
  const rawTarget =
    payload?.data?.targetUrl ||
    payload?.data?.link ||
    payload?.data?.click_action ||
    payload?.fcmOptions?.link ||
    "/";

  try {
    const url = new URL(rawTarget, self.location.origin);
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

async function hasVisibleClientForTarget(payload = {}) {
  const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const targetPath = getTargetPathFromPayload(payload);
  const targetRoot = `/${String(targetPath).split("/").filter(Boolean)[0] || ""}`;
  const visibleClient = windowClients.find((client) => {
    const isVisible = client.visibilityState === "visible" || client.focused;
    if (!isVisible) return false;
    try {
      const clientUrl = new URL(client.url);
      if (targetRoot === "/" || !targetRoot) {
        return true;
      }
      return clientUrl.pathname.startsWith(targetRoot);
    } catch {
      return false;
    }
  });
  pushDebugLog(PUSH_DEBUG_PREFIX, "Visible client check", {
    count: windowClients.length,
    targetPath,
    targetRoot,
    hasVisibleClient: Boolean(visibleClient),
    clients: windowClients.map((client) => ({
      url: client.url,
      visibilityState: client.visibilityState,
      focused: client.focused,
    })),
  });
  return Boolean(visibleClient);
}

// The page registers this worker as /firebase-messaging-sw.js?apiKey=...&projectId=... (see
// src/shared/utils/firebaseServiceWorkerUrl.js), so the config is available the moment the worker starts - also
// when a push wakes it with no page open - and there is nothing to download.
function readFirebaseWebConfigFromUrl() {
  try {
    const query = new URL(self.location.href).searchParams;
    const config = {
      apiKey: sanitize(query.get("apiKey")),
      authDomain: sanitize(query.get("authDomain")),
      projectId: sanitize(query.get("projectId")),
      appId: sanitize(query.get("appId")),
      messagingSenderId: sanitize(query.get("messagingSenderId")),
      storageBucket: sanitize(query.get("storageBucket")),
      measurementId: sanitize(query.get("measurementId")),
    };
    if (config.apiKey && config.projectId && config.appId && config.messagingSenderId) {
      return config;
    }
  } catch {
    // fall through to the backend lookup
  }
  return null;
}

async function loadFirebaseWebConfig() {
  const fromUrl = readFirebaseWebConfigFromUrl();
  if (fromUrl) return fromUrl;

  // Older registrations without a config in the URL: ask the backend (the only real endpoint).
  const candidates = ["/api/v1/food/public/env"];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const json = await response.json();
      const data = (json && json.data) || {};
      const config = {
        apiKey: sanitize(data.VITE_FIREBASE_API_KEY || data.FIREBASE_API_KEY),
        authDomain: sanitize(data.VITE_FIREBASE_AUTH_DOMAIN || data.FIREBASE_AUTH_DOMAIN),
        projectId: sanitize(data.VITE_FIREBASE_PROJECT_ID || data.FIREBASE_PROJECT_ID),
        appId: sanitize(data.VITE_FIREBASE_APP_ID || data.FIREBASE_APP_ID),
        messagingSenderId: sanitize(data.VITE_FIREBASE_MESSAGING_SENDER_ID || data.FIREBASE_MESSAGING_SENDER_ID),
        storageBucket: sanitize(data.VITE_FIREBASE_STORAGE_BUCKET || data.FIREBASE_STORAGE_BUCKET),
        measurementId: sanitize(data.VITE_FIREBASE_MEASUREMENT_ID || data.FIREBASE_MEASUREMENT_ID),
      };

      if (config.apiKey && config.projectId && config.appId && config.messagingSenderId) {
        pushDebugLog(PUSH_DEBUG_PREFIX, "Loaded Firebase web config");
        return config;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

(async () => {
  const config = await loadFirebaseWebConfig();
  if (!config || !config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) {
    return;
  }

  firebase.initializeApp(config);
  pushDebugLog(PUSH_DEBUG_PREFIX, "Firebase messaging service worker initialized");
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(async (payload) => {
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received Firebase background message", { payload });

    const visibleClient = await hasVisibleClientForTarget(payload);

    // Taxi pushes carry a `notification` block, which the Firebase SDK already shows on its own; showing it
    // again here gave riders/drivers every Taxi push twice. Food pushes keep the existing behaviour.
    const isTaxiPush =
      payload?.data?.module === "taxi" || getTargetPathFromPayload(payload).startsWith("/taxi");
    const sdkAlreadyShowsIt = isTaxiPush && Boolean(payload?.notification?.title || payload?.notification?.body);

    if (!visibleClient && !sdkAlreadyShowsIt) {
      const title = payload?.notification?.title || payload?.data?.title || "New Notification";
      const body = payload?.notification?.body || payload?.data?.body || "";
      const image =
        payload?.notification?.image ||
        payload?.data?.image ||
        payload?.data?.imageUrl ||
        undefined;
      const notificationKey = getNotificationKey(payload);

      pushDebugLog(PUSH_DEBUG_PREFIX, "Showing service worker notification", {
        title,
        body,
        image,
        notificationKey,
      });

      self.registration.showNotification(title, {
        body,
        icon: "/hello-parth-icon.png",
        image,
        tag: notificationKey,
        renotify: false,
        silent: false,
        requireInteraction: false,
        vibrate: [200, 100, 200, 100, 300],
        data: payload?.data || {},
      });
    }

    // Always notify clients regardless of visibility
    await notifyOpenClients(payload);
  });
})();

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    pushDebugLog(PUSH_DEBUG_PREFIX, "Received raw push event", { payload });
    // No client relay here. onBackgroundMessage handles delivery, and relaying in both
    // places can produce duplicate notifications in web clients.
    event.waitUntil(Promise.resolve());
  } catch {
    // Ignore malformed payloads.
  }
});

self.addEventListener("notificationclick", (event) => {
  pushDebugLog(PUSH_DEBUG_PREFIX, "Notification click received", {
    data: event?.notification?.data || {},
  });
  event.notification.close();
  const notificationData = event?.notification?.data || {};
  // click_action is often a non-URL marker (FLUTTER_NOTIFICATION_CLICK); it must not beat targetUrl.
  const rawLink =
    notificationData.link ||
    notificationData.targetUrl ||
    (String(notificationData.click_action || "").startsWith("/") ? notificationData.click_action : "") ||
    "/";
  const targetUrl = String(rawLink || "/").startsWith("/") ? String(rawLink || "/") : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const client = windowClients.find((c) => c.url.includes(self.location.origin));
      if (client) {
        client.focus();
        return client.navigate(targetUrl);
      }
      return clients.openWindow(targetUrl);
    }),
  );
});

