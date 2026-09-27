import { Driver } from '../models/Driver.js';

// A driver whose app stops sending location (crash, killed app, no network) would otherwise stay
// "online" forever and keep receiving dispatches nobody answers.
const STALE_DRIVER_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;

let sweepTimer = null;

export const markStaleDriversOffline = async () => {
  const result = await Driver.updateMany(
    {
      isOnline: true,
      isOnRide: false,
      'routeBooking.enabled': { $ne: true },
      updatedAt: { $lt: new Date(Date.now() - STALE_DRIVER_MS) },
    },
    { $set: { isOnline: false, socketId: null } },
  );

  return result.modifiedCount || 0;
};

export const startDriverPresenceSweep = () => {
  if (sweepTimer) {
    return;
  }

  const run = () => {
    markStaleDriversOffline().catch((error) => {
      console.error('Stale driver sweep failed', error);
    });
  };

  run();
  sweepTimer = setInterval(run, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
};
