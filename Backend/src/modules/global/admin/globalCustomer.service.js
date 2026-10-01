import mongoose from 'mongoose';
import { FoodRefreshToken } from '../../../core/refreshTokens/refreshToken.model.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';
import { Ride } from '../../taxi/user/models/Ride.js';
import { User as Customer } from '../../taxi/user/models/User.js';

/**
 * One customer across both apps. Food and Taxi keep their customers in the same `users` collection, so a
 * customer is listed once, with the activity they have in each app next to it. Blocking flips both flags
 * (`isActive` is read by Food, `active` by Taxi) so the block applies everywhere. The Taxi user model is used
 * because it declares both flags (the Food one only knows `isActive`, so a write of `active` would be dropped).
 */
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const notDeleted = { deletedAt: null };
const activeOnly = { isActive: { $ne: false }, active: { $ne: false } };
const blockedOnly = { $or: [{ isActive: false }, { active: false }] };
const USER_FIELDS = 'name phone email profileImage isActive active isVerified createdAt';

const assertObjectId = (id) => {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ValidationError('Invalid customer id');
  }
};

const isBlocked = (user = {}) => user.isActive === false || user.active === false;

const serializeCustomer = (user = {}, foodStats = {}, taxiStats = {}) => ({
  id: String(user._id),
  name: user.name || '',
  phone: user.phone || '',
  email: user.email || '',
  profileImage: user.profileImage || '',
  isBlocked: isBlocked(user),
  isVerified: user.isVerified === true,
  joinedAt: user.createdAt || null,
  food: { orders: foodStats.count || 0, lastOrderAt: foodStats.lastAt || null },
  taxi: { rides: taxiStats.count || 0, lastRideAt: taxiStats.lastAt || null },
});

const groupByUser = (Model, ids) =>
  Model.aggregate([
    { $match: { userId: { $in: ids } } },
    { $group: { _id: '$userId', count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } },
  ]);

const toStatsMap = (rows = []) => new Map(rows.map((row) => [String(row._id), row]));

export async function listCustomers(query = {}) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;
  const status = String(query.status || 'all').toLowerCase();
  const term = String(query.search || '').trim().slice(0, 80);

  // Same rule as Food admin > Customers: a number that stopped at OTP (no name
  // yet) is not a customer.
  const signedUp = { name: { $regex: '\\S', $nin: ['null', 'Null', 'NULL'] } };
  const filter = { ...notDeleted, ...signedUp };
  const and = [];

  if (status === 'active') and.push(activeOnly);
  if (status === 'blocked') and.push(blockedOnly);

  if (term) {
    const regex = new RegExp(escapeRegex(term), 'i');
    and.push({ $or: [{ name: regex }, { email: regex }, { phone: regex }] });
  }

  if (and.length > 0) filter.$and = and;

  const [users, total, totalAll, totalBlocked] = await Promise.all([
    Customer.find(filter).select(USER_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Customer.countDocuments(filter),
    Customer.countDocuments({ ...notDeleted, ...signedUp }),
    Customer.countDocuments({ ...notDeleted, ...signedUp, ...blockedOnly }),
  ]);

  const ids = users.map((user) => user._id);
  const [foodRows, taxiRows] = ids.length
    ? await Promise.all([groupByUser(FoodOrder, ids), groupByUser(Ride, ids)])
    : [[], []];
  const foodMap = toStatsMap(foodRows);
  const taxiMap = toStatsMap(taxiRows);

  return {
    customers: users.map((user) => serializeCustomer(user, foodMap.get(String(user._id)), taxiMap.get(String(user._id)))),
    summary: { total: totalAll, blocked: totalBlocked, active: Math.max(totalAll - totalBlocked, 0) },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getCustomerById(id) {
  assertObjectId(id);
  const user = await Customer.findOne({ _id: id, ...notDeleted }).select(USER_FIELDS).lean();
  if (!user) return null;

  const userId = user._id;
  const [foodRows, taxiRows, recentOrders, recentRides] = await Promise.all([
    groupByUser(FoodOrder, [userId]),
    groupByUser(Ride, [userId]),
    FoodOrder.find({ userId }).select('orderId orderStatus pricing.total createdAt').sort({ createdAt: -1 }).limit(5).lean(),
    Ride.find({ userId }).select('serviceType status fare createdAt').sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  return {
    ...serializeCustomer(user, toStatsMap(foodRows).get(String(userId)), toStatsMap(taxiRows).get(String(userId))),
    recentOrders: recentOrders.map((order) => ({
      id: String(order._id),
      orderId: order.orderId || '',
      status: order.orderStatus || '',
      total: order.pricing?.total ?? null,
      createdAt: order.createdAt,
    })),
    recentRides: recentRides.map((ride) => ({
      id: String(ride._id),
      serviceType: ride.serviceType || '',
      status: ride.status || '',
      fare: ride.fare ?? null,
      createdAt: ride.createdAt,
    })),
  };
}

export async function setCustomerStatus(id, isActive) {
  assertObjectId(id);
  const active = isActive !== false;
  const user = await Customer.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { isActive: active, active } },
    { returnDocument: 'after' },
  )
    .select(USER_FIELDS)
    .lean();
  if (!user) return null;

  if (!active) {
    // Drop Food refresh tokens so an open app session is signed out at its next refresh.
    await FoodRefreshToken.deleteMany({ userId: user._id });
  }

  return serializeCustomer(user);
}
