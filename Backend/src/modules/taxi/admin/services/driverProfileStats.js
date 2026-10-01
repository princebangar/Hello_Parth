import { Ride } from '../../user/models/Ride.js';
import { WalletTransaction } from '../../driver/models/WalletTransaction.js';

// The driver profile used to load EVERY ride and EVERY wallet transaction of the driver into memory just to
// add numbers up. These do the same additions inside MongoDB and return one small row each. The per-ride rules
// are the old JavaScript rules, unchanged:
//   completed / cancelled / ongoing : by lower-cased status (anything else is "ongoing")
//   driver earnings : stored driverEarnings, else fare - commissionAmount (never below 0)
//   admin commission: stored commissionAmount, else fare - driverEarnings (never below 0)
//   cash / card     : paymentMethod === 'cash' / 'online' (exact match, no default)
//   "today"         : createdAt >= start of today; for the earnings / cancelled-today figures the date is
//                     completedAt || createdAt

const toDouble = (input) => ({ $convert: { input, to: 'double', onError: 0, onNull: 0 } });
const isMissingOrNull = (field) => ({ $in: [{ $type: field }, ['missing', 'null']] });
const statusLower = { $toLower: { $ifNull: [{ $toString: '$status' }, ''] } };

export const buildDriverRideStatsStages = ({ startOfDay }) => [
  {
    $project: {
      cls: {
        $switch: {
          branches: [
            { case: { $eq: [statusLower, 'completed'] }, then: 'completed' },
            { case: { $eq: [statusLower, 'cancelled'] }, then: 'cancelled' },
          ],
          default: 'ongoing',
        },
      },
      fare: toDouble('$fare'),
      createdToday: { $gte: ['$createdAt', startOfDay] },
      eventToday: { $gte: [{ $ifNull: ['$completedAt', '$createdAt'] }, startOfDay] },
      paymentMethod: '$paymentMethod',
      commissionStored: { $cond: [isMissingOrNull('$commissionAmount'), null, toDouble('$commissionAmount')] },
      driverEarningsStored: { $cond: [isMissingOrNull('$driverEarnings'), null, toDouble('$driverEarnings')] },
    },
  },
  {
    $project: {
      cls: 1,
      fare: 1,
      createdToday: 1,
      eventToday: 1,
      paymentMethod: 1,
      driverShare: {
        $cond: [
          { $ne: ['$driverEarningsStored', null] },
          '$driverEarningsStored',
          { $max: [{ $subtract: ['$fare', { $ifNull: ['$commissionStored', 0] }] }, 0] },
        ],
      },
      adminShare: {
        $cond: [
          { $ne: ['$commissionStored', null] },
          '$commissionStored',
          { $max: [{ $subtract: ['$fare', { $ifNull: ['$driverEarningsStored', 0] }] }, 0] },
        ],
      },
    },
  },
  {
    $group: {
      _id: null,
      total: { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ['$cls', 'completed'] }, 1, 0] } },
      cancelled: { $sum: { $cond: [{ $eq: ['$cls', 'cancelled'] }, 1, 0] } },
      ongoing: { $sum: { $cond: [{ $eq: ['$cls', 'ongoing'] }, 1, 0] } },
      todayTotal: { $sum: { $cond: ['$createdToday', 1, 0] } },
      todayCancelled: { $sum: { $cond: [{ $and: [{ $eq: ['$cls', 'cancelled'] }, '$eventToday'] }, 1, 0] } },
      totalEarnings: { $sum: { $cond: [{ $eq: ['$cls', 'completed'] }, '$fare', 0] } },
      todayEarnings: { $sum: { $cond: [{ $and: [{ $eq: ['$cls', 'completed'] }, '$eventToday'] }, '$fare', 0] } },
      driverEarnings: { $sum: { $cond: [{ $eq: ['$cls', 'completed'] }, '$driverShare', 0] } },
      adminCommission: { $sum: { $cond: [{ $eq: ['$cls', 'completed'] }, '$adminShare', 0] } },
      byCash: { $sum: { $cond: [{ $and: [{ $eq: ['$cls', 'completed'] }, { $eq: ['$paymentMethod', 'cash'] }] }, '$fare', 0] } },
      byCard: { $sum: { $cond: [{ $and: [{ $eq: ['$cls', 'completed'] }, { $eq: ['$paymentMethod', 'online'] }] }, '$fare', 0] } },
    },
  },
];

export const buildWalletStatsStages = () => [
  {
    $group: {
      _id: null,
      count: { $sum: 1 },
      spend: { $sum: { $cond: [{ $lt: [toDouble('$amount'), 0] }, { $abs: toDouble('$amount') }, 0] } },
      credit: { $sum: { $cond: [{ $gt: [toDouble('$amount'), 0] }, toDouble('$amount'), 0] } },
    },
  },
];

const RIDE_ZERO = {
  total: 0, completed: 0, cancelled: 0, ongoing: 0, todayTotal: 0, todayCancelled: 0,
  totalEarnings: 0, todayEarnings: 0, driverEarnings: 0, adminCommission: 0, byCash: 0, byCard: 0,
};
const WALLET_ZERO = { count: 0, spend: 0, credit: 0 };

/** Ride + wallet figures for one driver. `driverId` must be an ObjectId (aggregate() does not cast). */
export const loadDriverProfileStats = async (driverId, startOfDay) => {
  const [rideRows, walletRows] = await Promise.all([
    Ride.aggregate([{ $match: { driverId } }, ...buildDriverRideStatsStages({ startOfDay })]),
    WalletTransaction.aggregate([{ $match: { driverId } }, ...buildWalletStatsStages()]),
  ]);

  return {
    rides: { ...RIDE_ZERO, ...(rideRows[0] || {}) },
    wallet: { ...WALLET_ZERO, ...(walletRows[0] || {}) },
  };
};

/** Newest ride that recorded a driver position (used only when the driver has no live location of their own). */
export const findLastRideLocation = (driverId) =>
  Ride.findOne({ driverId, 'lastDriverLocation.coordinates': { $type: 'array' } })
    .sort({ createdAt: -1 })
    .select('lastDriverLocation.coordinates')
    .lean();
