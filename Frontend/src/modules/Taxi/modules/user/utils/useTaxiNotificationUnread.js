import { useCallback, useEffect, useState } from 'react';
import { userAuthService } from '../services/authService';
import { USER_NOTIFICATIONS_UPDATED_EVENT, getRealtimeNotifications } from './realtimeNotificationStore';

// "Unread" = Taxi notifications (admin broadcasts from the server + ride / support ones kept on the
// device) newer than the last time the user opened the Taxi notifications page. Food's notifications
// are a separate list and never counted here.
const SEEN_KEY = 'taxi:user:notifications-last-seen';
const SEEN_EVENT = 'taxi:user-notifications-seen';

const readSeenAt = () => {
  try {
    const stored = Number(window.localStorage.getItem(SEEN_KEY));
    if (Number.isFinite(stored) && stored > 0) return stored;
    // First run on this device: older broadcasts are history, not "new".
    const now = Date.now();
    window.localStorage.setItem(SEEN_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
};

export const markTaxiNotificationsSeen = () => {
  try {
    window.localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // storage blocked — the badge just won't persist
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
};

const toTime = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
};

export default function useTaxiNotificationUnread({ enabled = true, pollMs = 60000 } = {}) {
  const [serverTimes, setServerTimes] = useState([]);
  const [localTimes, setLocalTimes] = useState(() => getRealtimeNotifications().map((item) => toTime(item.sentAt)));
  const [seenAt, setSeenAt] = useState(readSeenAt);

  const fetchServer = useCallback(async () => {
    try {
      const response = await userAuthService.getNotifications();
      const results = response?.data?.results || [];
      setServerTimes(results.map((item) => toTime(item.sentAt)));
    } catch {
      // not signed in / offline — keep the last known list
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    fetchServer();
    const timer = window.setInterval(fetchServer, pollMs);
    const onFocus = () => fetchServer();
    // A push that arrives while the app is open: refresh straight away instead of waiting for the poll.
    const onWorkerMessage = (event) => {
      if (event?.data?.type === 'push-notification-received') fetchServer();
    };
    const onLocalUpdate = () => setLocalTimes(getRealtimeNotifications().map((item) => toTime(item.sentAt)));
    const onSeen = () => setSeenAt(readSeenAt());

    window.addEventListener('focus', onFocus);
    window.addEventListener(USER_NOTIFICATIONS_UPDATED_EVENT, onLocalUpdate);
    window.addEventListener(SEEN_EVENT, onSeen);
    navigator.serviceWorker?.addEventListener?.('message', onWorkerMessage);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(USER_NOTIFICATIONS_UPDATED_EVENT, onLocalUpdate);
      window.removeEventListener(SEEN_EVENT, onSeen);
      navigator.serviceWorker?.removeEventListener?.('message', onWorkerMessage);
    };
  }, [enabled, pollMs, fetchServer]);

  return [...serverTimes, ...localTimes].filter((time) => time > seenAt).length;
}
