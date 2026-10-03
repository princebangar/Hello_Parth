import { Ride } from '../user/models/Ride.js';
import { RIDE_STATUS } from '../constants/index.js';
import { sendPushNotificationToEntities } from './pushNotificationService.js';

// Push to the driver once, about 15 minutes before a scheduled ride they already accepted starts
// (bidding / outstation scheduled rides are accepted ahead of time; normal ones are dispatched at the scheduled time).
const REMINDER_BEFORE_MS = 15 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 1000;

let sweepTimer = null;

const formatIndiaTime = (value) =>
  new Date(value).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });

export const sendDueScheduledRideReminders = async () => {
  const now = Date.now();
  const rides = await Ride.find({
    scheduledAt: { $gt: new Date(now), $lte: new Date(now + REMINDER_BEFORE_MS) },
    driverId: { $ne: null },
    status: RIDE_STATUS.ACCEPTED,
    driverReminderSentAt: null,
  })
    .select('_id driverId scheduledAt pickupAddress')
    .limit(200)
    .lean();

  for (const ride of rides) {
    // Claim the reminder first so a second server (or a slow sweep) never sends it twice.
    const claimed = await Ride.updateOne(
      { _id: ride._id, driverReminderSentAt: null },
      { $set: { driverReminderSentAt: new Date() } },
    );
    if (!claimed.modifiedCount) continue;

    const pickup = String(ride.pickupAddress || '').trim();
    sendPushNotificationToEntities({
      driverIds: [String(ride.driverId)],
      title: 'Scheduled ride in 15 minutes',
      body: `Pickup at ${formatIndiaTime(ride.scheduledAt)}${pickup ? ` - ${pickup}` : ''}`.slice(0, 180),
      data: {
        type: 'scheduled_ride_reminder',
        rideId: String(ride._id),
        targetUrl: '/taxi/driver/home',
      },
    }).catch(() => {});
  }
};

export const startScheduledRideReminderSweep = () => {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sendDueScheduledRideReminders().catch(() => {});
  }, SWEEP_EVERY_MS);
  sweepTimer.unref?.();
};
