import { Ride } from '../../user/models/Ride.js';

// The admin dashboard used to load EVERY ride document into memory and filter/sum them in JavaScript on each
// refresh. This does the same maths inside MongoDB and only returns a handful of grouped rows, so the cost no
// longer grows with the number of rides sent over the wire. The per-ride rules mirror the old JS exactly:
//   event date  : completed -> completedAt||updatedAt||createdAt, cancelled -> updatedAt||createdAt, else createdAt||updatedAt
//   commission  : the stored commissionAmount when present, otherwise fare - driverEarnings (never below 0)
//   driver cut  : the stored driverEarnings when present, otherwise fare - commissionAmount (never below 0)
//   payment     : '' / 'cash' count as cash, 'online' as card
//   "scheduled" : anything that is neither completed nor cancelled

const isMissing = (field) => ({ $eq: [{ $type: field }, 'missing'] });
const toDouble = (field, onNull = 0) => ({ $convert: { input: field, to: 'double', onError: null, onNull } });
const toDoubleOr = (field, fallback) => ({ $ifNull: [{ $convert: { input: field, to: 'double', onError: null, onNull: 0 } }, fallback] });

export const buildPipeline = ({ startOfToday, endOfToday, timezone }) => {
  const statusLower = { $toLower: { $ifNull: [{ $toString: '$status' }, ''] } };
  const paymentLower = { $toLower: { $ifNull: [{ $toString: '$paymentMethod' }, ''] } };

  return [
    {
      $project: {
        cls: {
          $switch: {
            branches: [
              { case: { $eq: [statusLower, 'completed'] }, then: 'completed' },
              { case: { $eq: [statusLower, 'cancelled'] }, then: 'cancelled' },
            ],
            default: 'scheduled',
          },
        },
        eventDate: {
          $switch: {
            branches: [
              { case: { $eq: [statusLower, 'completed'] }, then: { $ifNull: ['$completedAt', { $ifNull: ['$updatedAt', '$createdAt'] }] } },
              { case: { $eq: [statusLower, 'cancelled'] }, then: { $ifNull: ['$updatedAt', '$createdAt'] } },
            ],
            default: { $ifNull: ['$createdAt', '$updatedAt'] },
          },
        },
        fare: toDoubleOr('$fare', 0),
        commissionStored: { $cond: [isMissing('$commissionAmount'), null, toDouble('$commissionAmount')] },
        driverEarningsStored: { $cond: [isMissing('$driverEarnings'), null, toDouble('$driverEarnings')] },
        pay: {
          $switch: {
            branches: [
              { case: { $in: [paymentLower, ['', 'cash']] }, then: 'cash' },
              { case: { $eq: [paymentLower, 'online'] }, then: 'online' },
            ],
            default: 'other',
          },
        },
        hasDriver: { $not: [{ $in: [{ $type: '$driverId' }, ['missing', 'null']] }] },
      },
    },
    {
      $project: {
        cls: 1,
        pay: 1,
        hasDriver: 1,
        fare: 1,
        eventDate: 1,
        commission: {
          $cond: [
            { $ne: ['$commissionStored', null] },
            '$commissionStored',
            { $max: [{ $subtract: ['$fare', { $ifNull: ['$driverEarningsStored', 0] }] }, 0] },
          ],
        },
        driverEarnings: {
          $cond: [
            { $ne: ['$driverEarningsStored', null] },
            '$driverEarningsStored',
            { $max: [{ $subtract: ['$fare', { $ifNull: ['$commissionStored', 0] }] }, 0] },
          ],
        },
      },
    },
    {
      $group: {
        _id: {
          cls: '$cls',
          pay: '$pay',
          hasDriver: '$hasDriver',
          today: {
            $and: [
              { $ne: ['$eventDate', null] },
              { $gte: ['$eventDate', startOfToday] },
              { $lte: ['$eventDate', endOfToday] },
            ],
          },
          month: {
            $cond: [
              { $eq: ['$eventDate', null] },
              null,
              { $dateToString: { format: '%Y-%m', date: '$eventDate', timezone } },
            ],
          },
        },
        count: { $sum: 1 },
        fare: { $sum: '$fare' },
        commission: { $sum: '$commission' },
        driverEarnings: { $sum: '$driverEarnings' },
      },
    },
  ];
};

/**
 * Grouped ride numbers for the dashboard.
 * @returns {{ groups: Array, topDriverTrips: Array<{ id: string, trips: number }> }}
 */
export const loadRideStats = async ({ startOfToday, endOfToday, topDriverCount = 4 }) => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const [groups, topDriverRows] = await Promise.all([
    Ride.aggregate(buildPipeline({ startOfToday, endOfToday, timezone })),
    Ride.aggregate([
      { $match: { driverId: { $exists: true, $ne: null } } },
      { $match: { $expr: { $eq: [{ $toLower: { $ifNull: [{ $toString: '$status' }, ''] } }, 'completed'] } } },
      { $group: { _id: '$driverId', trips: { $sum: 1 } } },
      { $sort: { trips: -1 } },
      { $limit: topDriverCount },
    ]),
  ]);

  return {
    groups: groups.map((row) => ({ ...row._id, count: row.count, fare: row.fare, commission: row.commission, driverEarnings: row.driverEarnings })),
    topDriverTrips: topDriverRows.map((row) => ({ id: String(row._id), trips: row.trips })),
  };
};

// Helpers the dashboard uses to fold the grouped rows back into the numbers it shows.
export const sumGroups = (groups, predicate, field = 'count') =>
  groups.filter(predicate).reduce((total, row) => total + Number(row[field] || 0), 0);
