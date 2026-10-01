import { Ride } from '../../user/models/Ride.js';
import { Driver } from '../../driver/models/Driver.js';
import { User } from '../../user/models/User.js';

// Cancellation analytics used to load every cancelled ride (with its rider and driver populated) and loop over
// them in JavaScript. The counting now happens inside MongoDB; only the grouped numbers, the top reasons, the 5
// worst drivers and the latest 50 flagged rides come back. Per-ride rules are unchanged:
//   reason     : trimmed cancellation.reason, or "Not specified"
//   stage      : cancellation.stage, else "accepted" when the ride had a driver, otherwise "searching"
//   revenue lost: fare of cancelled rides that had a (still existing) driver
//   fees       : cancellation_charge where is_fee_applied
//   top drivers: cancellations by the driver themselves (cancelled_by === 'driver')
// Deliberate differences: flagged rides are the NEWEST 50 (was the first 50 found, i.e. the oldest) and the
// reasons list is capped at the 50 most common ones.

const REASON_LIMIT = 50;
const FLAGGED_LIMIT = 50;
const TOP_DRIVER_LIMIT = 5;

const toDouble = (input) => ({ $convert: { input, to: 'double', onError: 0, onNull: 0 } });
const lowerString = (input) => ({ $toLower: { $ifNull: [{ $toString: { $ifNull: [input, ''] } }, ''] } });

export const buildCancellationStatsStages = ({ existingDriverIds }) => [
  { $match: { status: 'cancelled' } },
  {
    $project: {
      driverId: 1,
      userId: 1,
      fare: toDouble('$fare'),
      cancelledBy: lowerString('$cancellation.cancelled_by'),
      reason: {
        $let: {
          vars: { trimmed: { $trim: { input: { $toString: { $ifNull: ['$cancellation.reason', ''] } } } } },
          in: { $cond: [{ $eq: ['$$trimmed', ''] }, 'Not specified', '$$trimmed'] },
        },
      },
      stageRaw: lowerString('$cancellation.stage'),
      hasDriver: { $in: ['$driverId', existingDriverIds] },
      fee: { $cond: [{ $eq: ['$cancellation.is_fee_applied', true] }, toDouble('$cancellation.cancellation_charge'), 0] },
      flagged: { $eq: ['$cancellation.flaggedForAdminReview', true] },
      flagReason: '$cancellation.flagReason',
      comment: '$cancellation.comment',
      cancelledAt: '$cancellation.cancelled_at',
    },
  },
  {
    $addFields: {
      stage: {
        $cond: [{ $ne: ['$stageRaw', ''] }, '$stageRaw', { $cond: ['$hasDriver', 'accepted', 'searching'] }],
      },
    },
  },
  {
    $facet: {
      totals: [
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            customer: { $sum: { $cond: [{ $eq: ['$cancelledBy', 'user'] }, 1, 0] } },
            driver: { $sum: { $cond: [{ $eq: ['$cancelledBy', 'driver'] }, 1, 0] } },
            revenueLost: { $sum: { $cond: ['$hasDriver', '$fare', 0] } },
            fees: { $sum: '$fee' },
          },
        },
      ],
      reasons: [
        { $group: { _id: '$reason', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: REASON_LIMIT },
      ],
      stages: [{ $group: { _id: '$stage', count: { $sum: 1 } } }],
      drivers: [
        { $match: { cancelledBy: 'driver', hasDriver: true } },
        { $group: { _id: '$driverId', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: TOP_DRIVER_LIMIT },
      ],
      flagged: [
        { $match: { flagged: true } },
        { $sort: { cancelledAt: -1, _id: -1 } },
        { $limit: FLAGGED_LIMIT },
        { $project: { reason: 1, flagReason: 1, comment: 1, cancelledAt: 1, userId: 1, driverId: 1 } },
      ],
    },
  },
];

export const loadCancellationStats = async () => {
  // A driver document can be gone while rides still point at it; those rides count as "no driver" (as they
  // did when the driver was populated). Resolve the (small) set of drivers once instead of per ride.
  const referencedDriverIds = await Ride.distinct('driverId', { status: 'cancelled', driverId: { $ne: null } });
  const drivers = referencedDriverIds.length
    ? await Driver.find({ _id: { $in: referencedDriverIds } }).select('name phone').lean()
    : [];
  const driverById = new Map(drivers.map((doc) => [String(doc._id), doc]));

  const [facets] = await Ride.aggregate(
    buildCancellationStatsStages({ existingDriverIds: drivers.map((doc) => doc._id) }),
  );

  const flaggedUserIds = [...new Set((facets?.flagged || []).map((row) => String(row.userId || '')).filter(Boolean))];
  const users = flaggedUserIds.length
    ? await User.find({ _id: { $in: flaggedUserIds } }).select('name phone').lean()
    : [];
  const userById = new Map(users.map((doc) => [String(doc._id), doc]));

  return { facets: facets || {}, driverById, userById };
};
