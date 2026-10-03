import { Driver } from '../models/Driver.js';
import { mergeOnlineSessionIntoTracking } from './driverTodaySummaryService.js';

// A driver whose app stops sending location (crash, killed app, no network) would otherwise stay
// "online" forever and keep receiving dispatches nobody answers.
const STALE_DRIVER_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 2 * 60 * 1000;

let sweepTimer = null;

export const markStaleDriversOffline = async () => {
  const staleDrivers = await Driver.find({
    isOnline: true,
    isOnRide: false,
    updatedAt: { $lt: new Date(Date.now() - STALE_DRIVER_MS) },
  })
    .select('_id updatedAt incentiveTracking')
    .lean();

  if (staleDrivers.length === 0) {
    return 0;
  }

  // Close the online session at the driver's last sign of life, so the time they were gone is not counted
  // as active time (Today's summary / incentives).
  const operations = staleDrivers.map((driver) => {
    const tracking = mergeOnlineSessionIntoTracking(
      driver.incentiveTracking || {},
      driver.incentiveTracking?.currentOnlineStartedAt,
      driver.updatedAt || new Date(),
    );
    return {
      updateOne: {
        filter: { _id: driver._id, isOnline: true },
        update: {
          $set: {
            isOnline: false,
            socketId: null,
            'incentiveTracking.dailyActivity': tracking.dailyActivity || [],
            'incentiveTracking.currentOnlineStartedAt': null,
          },
        },
      },
    };
  });

  const result = await Driver.bulkWrite(operations, { ordered: false });
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
