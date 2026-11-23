// Web: DeliveryRealtimeShell.jsx — keeps the delivery socket + order queue (useDeliveryNotifications) and the Orders
// GPS sync (useRiderLocationSync) alive across Feed / Orders / Pocket, and hands the notifications API to the screens
// through a context.
// Native: the web shell was the layout element of the protected routes and wrapped them (<Outlet />). Here the Stack is
// rendered by the delivery layout and must not be remounted, so the shell is a sibling mounted while the rider is
// signed in; it publishes the hook's value in a tiny store that useDeliveryNotificationsContext() reads. The value is
// set during the shell's render, which comes before the Stack in the tree, so a screen rendered in the same pass
// already sees it. Native addition: the background "You are online" location service (lib/riderLocation) runs while
// the rider is online.
import { useEffect, useSyncExternalStore } from 'react';
import { useDeliveryNotifications } from '@food/hooks/useDeliveryNotifications';
import { useRiderLocationSync } from '@/modules/DeliveryV2/hooks/useRiderLocationSync';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { hasLocationPermission, startOnlineLocationUpdates, stopOnlineLocationUpdates } from '@/lib/riderLocation';
import { deliveryAPI } from '@food/api';
import { toast } from '@/lib/toast';

let current = null;
let last = null; // a kept-alive screen re-rendering in the commit that signs out still gets the last value
const listeners = new Set();
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSnapshot = () => current;

export function useDeliveryNotificationsContext() {
  const ctx = useSyncExternalStore(subscribe, getSnapshot) || last;
  if (!ctx) {
    throw new Error('useDeliveryNotificationsContext must be used within DeliveryRealtimeShell');
  }
  return ctx;
}

function useOnlineLocationService() {
  const isOnline = useDeliveryStore((state) => state.isOnline);
  useEffect(() => {
    if (!isOnline) {
      stopOnlineLocationUpdates();
      return;
    }
    const goOffline = () => {
      if (!useDeliveryStore.getState().isOnline) return;
      useDeliveryStore.getState().setOnline(false);
      deliveryAPI.updateOnlineStatus(false).catch(() => {});
    };
    let cancelled = false;
    (async () => {
      // Online from the last session, but location is not allowed (any more): back to Offline straight away, without
      // asking. Asking here put the location screen up while orders kept coming (the server still had the rider
      // Online), and the order popup covered it. Going Online again with the toggle asks properly.
      if (!(await hasLocationPermission())) {
        if (cancelled) return;
        goOffline();
        toast.error('You are Offline', {
          id: 'online-location-permission',
          description: 'Location permission is needed to stay Online. Go Online again to allow it.',
          duration: 5000,
        });
        return;
      }
      const started = await startOnlineLocationUpdates();
      if (cancelled || started || (await hasLocationPermission())) return;
      goOffline();
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline]);
  // signing out unmounts the shell: the service stops with it
  useEffect(() => () => {
    stopOnlineLocationUpdates();
  }, []);
}

/**
 * Keeps delivery socket + order queue alive across Feed / Orders / Pocket routes.
 */
export default function DeliveryRealtimeShell() {
  const notifications = useDeliveryNotifications();
  useRiderLocationSync();
  useOnlineLocationService();

  current = notifications;
  last = notifications;
  useEffect(() => {
    listeners.forEach((fn) => fn());
  }, [notifications]);
  useEffect(() => () => {
    current = null;
    listeners.forEach((fn) => fn());
  }, []);

  return null;
}
