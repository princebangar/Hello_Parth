import { Ride } from '../user/models/Ride.js';
import { RIDE_STATUS } from '../constants/index.js';
import { settleCompletedRideWallet } from '../driver/services/walletService.js';
import { emitToDriver } from './dispatchService.js';

// Online rides paid through the driver's Razorpay QR / payment link are confirmed by asking Razorpay. The driver app does
// that only while the payment screen is open, so a rider who pays after the trip was closed is picked up here: the
// collection is refreshed and, once paid, the driver's earning is settled (settleCompletedRideWallet credits at most once).
const SWEEP_EVERY_MS = 2 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

let sweepTimer = null;

export const settleRideIfCollectionPaid = async (ride) => {
  const { refreshDriverPaymentCollection } = await import('../driver/controllers/driverController.js');
  const collection = await refreshDriverPaymentCollection(ride);
  if (!collection?.paid) {
    return null;
  }

  const settlement = await settleCompletedRideWallet({ rideId: ride._id });
  if (settlement?.transaction && ride.driverId) {
    emitToDriver(ride.driverId, 'driver:wallet:updated', {
      wallet: settlement.wallet,
      transaction: settlement.transaction,
      notification: {
        id: `ride-qr-earning-${ride._id}`,
        title: 'Ride earning credited',
        body: `Rs ${Number(settlement.transaction.amount || 0).toFixed(2)} added - the rider paid your QR.`,
        sentAt: new Date().toISOString(),
      },
    });
  }
  return settlement;
};

export const settlePaidQrRides = async () => {
  const rides = await Ride.find({
    status: RIDE_STATUS.COMPLETED,
    paymentMethod: 'online',
    walletSettledAt: null,
    'driverPaymentCollection.provider': 'razorpay',
    'driverPaymentCollection.providerId': { $nin: ['', null] },
    completedAt: { $gte: new Date(Date.now() - LOOKBACK_MS) },
  }).limit(50);

  for (const ride of rides) {
    try {
      await settleRideIfCollectionPaid(ride);
    } catch (error) {
      console.error('QR payment sweep failed for ride', String(ride._id), error?.message || error);
    }
  }
};

export const startRidePaymentSweep = () => {
  if (sweepTimer) {
    return;
  }
  sweepTimer = setInterval(() => {
    settlePaidQrRides().catch((error) => console.error('QR payment sweep failed', error));
  }, SWEEP_EVERY_MS);
  sweepTimer.unref?.();
};
