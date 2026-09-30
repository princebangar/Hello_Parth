import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { PoolingRoute } from '../../admin/models/PoolingRoute.js';
import { PoolingVehicle } from '../../admin/models/PoolingVehicle.js';
import { PoolingBooking } from '../../admin/models/PoolingBooking.js';
import { PoolingSeatReservation } from '../../admin/models/PoolingSeatReservation.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });
const created = (res, data, message) => res.status(201).json({ success: true, data, message });

const toCleanString = (value) => String(value || '').trim();

const normalizeTravelDate = (value) => {
  const rawValue = toCleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const parsed = new Date(rawValue);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  throw new ApiError(400, 'travelDate must be in YYYY-MM-DD format');
};

const getCurrentUserId = (req) => String(req.auth?.sub || req.user?._id || '').trim();

const resolveRazorpayCredentials = async (options) => {
  return resolveConfiguredGatewayCredentials('razor_pay', options);
};

const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.description || payload?.error?.message || 'Razorpay request failed');
  }

  return payload;
};

const createPoolingBookingCode = () =>
  `POOL${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const resolvePickupStop = (route, pickupStopId) => {
  const pickupPoints = Array.isArray(route?.pickupPoints) ? route.pickupPoints : [];
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  return (
    pickupPoints.find((item) => String(item?.id || '') === String(pickupStopId || '')) ||
    stops.find((item) => String(item?.id || '') === String(pickupStopId || '')) ||
    pickupPoints[0] ||
    stops[0] ||
    null
  );
};

const resolveDropStop = (route, dropStopId) => {
  const dropPoints = Array.isArray(route?.dropPoints) ? route.dropPoints : [];
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  return (
    dropPoints.find((item) => String(item?.id || '') === String(dropStopId || '')) ||
    stops.find((item) => String(item?.id || '') === String(dropStopId || '')) ||
    dropPoints[0] ||
    stops[stops.length - 1] ||
    null
  );
};

const getVehicleSeatIds = (vehicle = {}) => {
  const layout = Array.isArray(vehicle?.blueprint?.layout) ? vehicle.blueprint.layout : [];
  return layout
    .filter((item) => item?.type === 'seat')
    .map((item) => `${item.r}-${item.c}`);
};

const getBookedSeatIds = async ({ routeId, vehicleId, scheduleId, travelDate }) => {
  const reservations = await PoolingSeatReservation.find({
    route: routeId,
    vehicle: vehicleId,
    scheduleId,
    travelDate,
  })
    .select('seatId')
    .lean();

  return reservations.map((item) => String(item?.seatId || '')).filter(Boolean);
};

const computePoolingFareBreakdown = ({ route = {}, vehicle = {}, seatCount = 0 }) => {
  const safeSeatCount = Math.max(0, Number(seatCount || 0));
  const farePerSeat = Math.max(0, Number(route?.farePerSeat || 0));
  const baseFare = Math.round(farePerSeat * safeSeatCount * 100) / 100;
  const serviceTaxPercentage = Math.max(0, Math.min(100, Number(vehicle?.serviceTaxPercentage || 0)));
  const driverCommissionPercentage = Math.max(0, Math.min(100, Number(
    vehicle?.driverCommissionPercentage ?? vehicle?.adminCommissionPercentage ?? 0,
  )));
  const ownerCommissionPercentage = Math.max(0, Math.min(100, Number(vehicle?.ownerCommissionPercentage || 0)));
  const serviceTaxAmount = Math.round((baseFare * serviceTaxPercentage) * 100) / 100 / 100;
  const driverCommissionAmount = Math.round(((baseFare * driverCommissionPercentage) / 100) * 100) / 100;
  const ownerCommissionAmount = Math.round(((baseFare * ownerCommissionPercentage) / 100) * 100) / 100;
  const totalFare = Math.round((baseFare + serviceTaxAmount) * 100) / 100;

  return {
    farePerSeat,
    baseFare,
    serviceTaxPercentage,
    serviceTaxAmount,
    driverCommissionPercentage,
    driverCommissionAmount,
    ownerCommissionPercentage,
    ownerCommissionAmount,
    totalFare,
  };
};

const withPrimaryVehicleDriver = (route) => {
  const routeObject = typeof route?.toObject === 'function' ? route.toObject() : route;
  const primaryVehicle = Array.isArray(routeObject?.assignedVehicleTypeIds)
    ? routeObject.assignedVehicleTypeIds[0]
    : null;

  return {
    ...routeObject,
    driverName: routeObject?.driverName || primaryVehicle?.driverName || '',
    driverPhone: routeObject?.driverPhone || primaryVehicle?.driverPhone || '',
  };
};

const serializePoolingBooking = (booking) => {
  const route = booking?.route || booking?.routeId || {};
  const vehicle = booking?.vehicle || booking?.vehicleId || {};
  const user = booking?.user || booking?.userId || {};

  return {
    _id: booking?._id,
    bookingId: booking?.bookingId || '',
    user: user?._id ? user : undefined,
    route: route?._id ? route : undefined,
    vehicle: vehicle?._id ? vehicle : undefined,
    scheduleId: booking?.scheduleId || '',
    pickupStopId: booking?.pickupStopId || '',
    dropStopId: booking?.dropStopId || '',
    pickupLabel: booking?.pickupLabel || '',
    dropLabel: booking?.dropLabel || '',
    seatsBooked: Number(booking?.seatsBooked || 0),
    selectedSeats: Array.isArray(booking?.selectedSeats) ? booking.selectedSeats : [],
    fare: Number(booking?.fare || 0),
    baseFare: Number(booking?.baseFare || 0),
    serviceTaxPercentage: Number(booking?.serviceTaxPercentage || 0),
    serviceTaxAmount: Number(booking?.serviceTaxAmount || 0),
    driverCommissionPercentage: Number(booking?.driverCommissionPercentage || 0),
    driverCommissionAmount: Number(booking?.driverCommissionAmount || 0),
    ownerCommissionPercentage: Number(booking?.ownerCommissionPercentage || 0),
    ownerCommissionAmount: Number(booking?.ownerCommissionAmount || 0),
    currency: booking?.currency || 'INR',
    paymentStatus: booking?.paymentStatus || 'pending',
    bookingStatus: booking?.bookingStatus || 'confirmed',
    travelDate: booking?.travelDate || '',
    createdAt: booking?.createdAt || null,
    updatedAt: booking?.updatedAt || null,
    payment: booking?.payment || {},
  };
};

const HOLD_MINUTES = 10;
const CANCEL_CUTOFF_HOURS = 6;
const IST_OFFSET = '+05:30';

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanupExpiredSeatHolds = async () => {
  await PoolingSeatReservation.deleteMany({ expiresAt: { $ne: null, $lte: new Date() } });
};

const parseDepartureAt = (travelDate, departureTime) => {
  const match = toCleanString(departureTime).match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = (match[3] || '').toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  const departureAt = new Date(`${travelDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00${IST_OFFSET}`);
  return Number.isNaN(departureAt.getTime()) ? null : departureAt;
};

const assertScheduleIsBookable = ({ route, schedule, travelDate }) => {
  const todayInIndia = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (travelDate < todayInIndia) {
    throw new ApiError(400, 'Travel date cannot be in the past');
  }

  const activeDays = (Array.isArray(schedule?.activeDays) ? schedule.activeDays : [])
    .map((day) => toCleanString(day).slice(0, 3).toLowerCase())
    .filter(Boolean);
  if (activeDays.length > 0) {
    const weekday = new Date(`${travelDate}T12:00:00${IST_OFFSET}`)
      .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' })
      .toLowerCase();
    if (!activeDays.includes(weekday)) {
      throw new ApiError(400, 'This departure does not run on the selected date');
    }
  }

  const departureAt = parseDepartureAt(travelDate, schedule?.departureTime);
  if (departureAt) {
    const bookingClosesAt = departureAt.getTime() - Math.max(0, Number(route?.boardingBufferMinutes || 0)) * 60 * 1000;
    if (Date.now() >= bookingClosesAt) {
      throw new ApiError(400, 'Booking for this departure is closed');
    }
  }
};

const refundRazorpayPayment = async ({ paymentId, amountRupees, reason }) => {
  try {
    const { keyId, keySecret } = await resolveRazorpayCredentials();
    const refund = await razorpayRequest({
      method: 'POST',
      path: `/payments/${paymentId}/refund`,
      body: { amount: Math.round(Number(amountRupees || 0) * 100), speed: 'normal', notes: { reason: reason || 'pooling refund' } },
      keyId,
      keySecret,
    });
    return { status: 'processed', refundId: refund?.id || '', error: '' };
  } catch (error) {
    console.error('Pooling refund failed', paymentId, error?.message);
    return { status: 'pending_manual', refundId: '', error: String(error?.message || 'Refund failed') };
  }
};

const fetchRazorpayOrderAmountRupees = async (orderId) => {
  try {
    const { keyId, keySecret } = await resolveRazorpayCredentials();
    const order = await razorpayRequest({ method: 'GET', path: `/orders/${orderId}`, keyId, keySecret });
    return Number(order?.amount_paid || order?.amount || 0) / 100;
  } catch {
    return 0;
  }
};

const loadBookingContext = async ({ routeId, vehicleId, scheduleId, travelDate, pickupStopId, dropStopId }) => {
  const [route, vehicle] = await Promise.all([
    PoolingRoute.findById(routeId).lean(),
    PoolingVehicle.findById(vehicleId).lean(),
  ]);

  if (!route || String(route.status || '') !== 'active' || route.active === false) {
    throw new ApiError(404, 'Pooling route not found');
  }

  if (!vehicle || String(vehicle.status || '') !== 'active') {
    throw new ApiError(404, 'Pooling vehicle not found');
  }

  const allowedVehicleIds = (Array.isArray(route.assignedVehicleTypeIds) ? route.assignedVehicleTypeIds : []).map((item) => String(item));
  if (allowedVehicleIds.length > 0 && !allowedVehicleIds.includes(String(vehicleId))) {
    throw new ApiError(400, 'Selected vehicle is not assigned to this route');
  }

  const schedule = (Array.isArray(route.schedules) ? route.schedules : []).find(
    (item) => String(item?.id || '') === scheduleId && String(item?.status || 'active') === 'active',
  );
  if (!schedule) {
    throw new ApiError(404, 'Selected route schedule is not available');
  }

  assertScheduleIsBookable({ route, schedule, travelDate });

  const pickupStop = resolvePickupStop(route, pickupStopId);
  const dropStop = resolveDropStop(route, dropStopId);
  if (!pickupStop || !dropStop) {
    throw new ApiError(400, 'Pickup and drop points are required for pooling booking');
  }

  return { route, vehicle, schedule, pickupStop, dropStop };
};

const populateBooking = (query) =>
  query
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber driverName driverPhone');

export const searchPoolingRoutes = asyncHandler(async (req, res) => {
  const from = toCleanString(req.query?.from);
  const to = toCleanString(req.query?.to);

  const filter = { status: 'active', active: { $ne: false } };
  const conditions = [];
  if (from) conditions.push({ originLabel: { $regex: escapeRegex(from), $options: 'i' } });
  if (to) conditions.push({ destinationLabel: { $regex: escapeRegex(to), $options: 'i' } });
  if (conditions.length > 0) filter.$and = conditions;

  const routes = await PoolingRoute.find(filter).populate('assignedVehicleTypeIds');

  return ok(res, routes.map(withPrimaryVehicleDriver), 'Routes fetched successfully');
});

export const getPoolingRouteDetails = asyncHandler(async (req, res) => {
  const route = await PoolingRoute.findById(req.params.id).populate('assignedVehicleTypeIds');

  if (!route) {
    throw new ApiError(404, 'Route not found');
  }

  const travelDate = toCleanString(req.query?.travelDate || req.query?.date);
  let seatAvailability = {};

  if (travelDate) {
    const normalizedTravelDate = normalizeTravelDate(travelDate);
    const vehicleIds = (Array.isArray(route.assignedVehicleTypeIds) ? route.assignedVehicleTypeIds : [])
      .map((item) => String(item?._id || item))
      .filter(Boolean);
    const scheduleIds = (Array.isArray(route.schedules) ? route.schedules : [])
      .filter((item) => String(item?.status || 'active') === 'active')
      .map((item) => String(item?.id || ''))
      .filter(Boolean);

    if (vehicleIds.length > 0 && scheduleIds.length > 0) {
      const reservations = await PoolingSeatReservation.find({
        route: route._id,
        vehicle: { $in: vehicleIds },
        scheduleId: { $in: scheduleIds },
        travelDate: normalizedTravelDate,
      })
        .select('vehicle scheduleId seatId')
        .lean();

      seatAvailability = reservations.reduce((accumulator, item) => {
        const key = `${String(item.vehicle)}:${String(item.scheduleId || '')}`;
        accumulator[key] = accumulator[key] || [];
        accumulator[key].push(String(item.seatId || ''));
        return accumulator;
      }, {});
    }
  }

  return ok(
    res,
    {
      ...route.toObject(),
      seatAvailability,
    },
    'Route details fetched successfully',
  );
});

export const createPoolingBookingOrder = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const routeId = toCleanString(req.body?.routeId);
  const vehicleId = toCleanString(req.body?.vehicleId);
  const scheduleId = toCleanString(req.body?.scheduleId);
  const travelDate = normalizeTravelDate(req.body?.travelDate || req.body?.date);
  const selectedSeats = Array.isArray(req.body?.selectedSeats)
    ? [...new Set(req.body.selectedSeats.map((item) => toCleanString(item)).filter(Boolean))]
    : [];
  const pickupStopId = toCleanString(req.body?.pickupStopId);
  const dropStopId = toCleanString(req.body?.dropStopId);

  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }

  if (!routeId || !vehicleId || !scheduleId || selectedSeats.length === 0) {
    throw new ApiError(400, 'routeId, vehicleId, scheduleId and selectedSeats are required');
  }

  await cleanupExpiredSeatHolds();

  const { route, vehicle, pickupStop, dropStop } = await loadBookingContext({
    routeId,
    vehicleId,
    scheduleId,
    travelDate,
    pickupStopId,
    dropStopId,
  });

  const fareBreakdown = computePoolingFareBreakdown({ route, vehicle, seatCount: selectedSeats.length });
  if (!Number.isFinite(fareBreakdown.totalFare) || fareBreakdown.totalFare <= 0) {
    throw new ApiError(400, 'Pooling fare is not configured');
  }

  const vehicleSeatIds = new Set(getVehicleSeatIds(vehicle));
  const invalidSeatId = selectedSeats.find((seatId) => !vehicleSeatIds.has(seatId));
  if (invalidSeatId) {
    throw new ApiError(400, `Seat ${invalidSeatId} is not available in this vehicle`);
  }

  // Release this user's own unpaid holds so retrying after a failed payment is not blocked.
  await PoolingSeatReservation.deleteMany({ user: userId, booking: null, expiresAt: { $ne: null } });

  const alreadyBookedSeatIds = await getBookedSeatIds({ routeId, vehicleId, scheduleId, travelDate });
  const conflictingSeatId = selectedSeats.find((seatId) => alreadyBookedSeatIds.includes(seatId));
  if (conflictingSeatId) {
    throw new ApiError(409, `Seat ${conflictingSeatId} was already booked by another user`);
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials({ forNewPayment: true });
  const compactUserId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(fareBreakdown.totalFare * 100),
      currency: 'INR',
      receipt: `upool_${compactUserId}_${Date.now().toString(36)}`,
      notes: {
        userId,
        routeId,
        vehicleId,
        scheduleId,
        travelDate,
        seats: selectedSeats.join(','),
      },
    },
    keyId,
    keySecret,
  });

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
  try {
    await PoolingSeatReservation.insertMany(
      selectedSeats.map((seatId) => ({
        route: routeId,
        vehicle: vehicleId,
        user: userId,
        orderId: order.id,
        pickupStopId: String(pickupStop.id || pickupStopId),
        dropStopId: String(dropStop.id || dropStopId),
        scheduleId,
        travelDate,
        seatId,
        expiresAt,
      })),
      { ordered: true },
    );
  } catch (error) {
    await PoolingSeatReservation.deleteMany({ orderId: order.id });
    if (error?.code === 11000) {
      throw new ApiError(409, 'One or more selected seats were just booked by another user');
    }
    throw error;
  }

  return created(
    res,
    {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      travelDate,
      expiresAt,
      fare: fareBreakdown.totalFare,
      baseFare: fareBreakdown.baseFare,
      serviceTaxPercentage: fareBreakdown.serviceTaxPercentage,
      serviceTaxAmount: fareBreakdown.serviceTaxAmount,
      driverCommissionPercentage: fareBreakdown.driverCommissionPercentage,
      driverCommissionAmount: fareBreakdown.driverCommissionAmount,
      ownerCommissionPercentage: fareBreakdown.ownerCommissionPercentage,
      ownerCommissionAmount: fareBreakdown.ownerCommissionAmount,
    },
    'Pooling payment order created successfully',
  );
});

export const verifyPoolingBookingPayment = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const orderId = toCleanString(req.body?.razorpay_order_id);
  const paymentId = toCleanString(req.body?.razorpay_payment_id);
  const signature = toCleanString(req.body?.razorpay_signature);

  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  const { keySecret } = await resolveRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const existingBooking = await populateBooking(
    PoolingBooking.findOne({ user: userId, 'payment.orderId': orderId }),
  );

  if (existingBooking) {
    return ok(res, serializePoolingBooking(existingBooking), 'Pooling booking already confirmed');
  }

  const failWithRefund = async (message) => {
    await PoolingSeatReservation.deleteMany({ orderId, user: userId, booking: null });
    const refund = await refundRazorpayPayment({
      paymentId,
      amountRupees: await fetchRazorpayOrderAmountRupees(orderId),
      reason: message,
    });
    throw new ApiError(
      409,
      `${message}. ${refund.status === 'processed' ? 'Your payment is being refunded.' : 'Our team will refund your payment shortly.'}`,
    );
  };

  // Seats, fare and stops come from the hold created with the order, never from the request body,
  // so the amount paid always matches what is being booked.
  const holds = await PoolingSeatReservation.find({ orderId, user: userId, booking: null });
  if (holds.length === 0) {
    return failWithRefund('Seat hold expired before payment completed');
  }

  const [first] = holds;
  const routeId = String(first.route);
  const vehicleId = String(first.vehicle);
  const { scheduleId, travelDate } = first;
  const selectedSeats = holds.map((hold) => hold.seatId);

  let context;
  try {
    context = await loadBookingContext({
      routeId,
      vehicleId,
      scheduleId,
      travelDate,
      pickupStopId: first.pickupStopId,
      dropStopId: first.dropStopId,
    });
  } catch (error) {
    return failWithRefund(error?.message || 'This departure is no longer available');
  }

  const { route, vehicle, pickupStop, dropStop } = context;
  const fareBreakdown = computePoolingFareBreakdown({ route, vehicle, seatCount: selectedSeats.length });

  const booking = await PoolingBooking.create({
    bookingId: createPoolingBookingCode(),
    user: userId,
    route: routeId,
    vehicle: vehicleId,
    scheduleId,
    pickupStopId: String(pickupStop.id || first.pickupStopId),
    dropStopId: String(dropStop.id || first.dropStopId),
    seatsBooked: selectedSeats.length,
    selectedSeats,
    fare: fareBreakdown.totalFare,
    baseFare: fareBreakdown.baseFare,
    serviceTaxPercentage: fareBreakdown.serviceTaxPercentage,
    serviceTaxAmount: fareBreakdown.serviceTaxAmount,
    driverCommissionPercentage: fareBreakdown.driverCommissionPercentage,
    driverCommissionAmount: fareBreakdown.driverCommissionAmount,
    ownerCommissionPercentage: fareBreakdown.ownerCommissionPercentage,
    ownerCommissionAmount: fareBreakdown.ownerCommissionAmount,
    currency: 'INR',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    travelDate: new Date(`${travelDate}T00:00:00.000Z`),
    pickupLabel: pickupStop.name || pickupStop.address || route.originLabel || '',
    dropLabel: dropStop.name || dropStop.address || route.destinationLabel || '',
    payment: {
      provider: 'razorpay',
      orderId,
      paymentId,
      signature,
      status: 'paid',
      paidAt: new Date(),
    },
  });

  await PoolingSeatReservation.updateMany(
    { orderId, user: userId, booking: null },
    { $set: { booking: booking._id, expiresAt: null } },
  );

  const hydratedBooking = await populateBooking(PoolingBooking.findById(booking._id));

  return created(res, serializePoolingBooking(hydratedBooking), 'Pooling booking confirmed successfully');
});

export const cancelMyPoolingBooking = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const bookingRef = toCleanString(req.params?.id);

  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }

  const booking = await PoolingBooking.findOne({
    user: userId,
    $or: [{ bookingId: bookingRef }, ...(mongoose.Types.ObjectId.isValid(bookingRef) ? [{ _id: bookingRef }] : [])],
  });

  if (!booking) {
    throw new ApiError(404, 'Pooling booking not found');
  }

  if (booking.bookingStatus !== 'confirmed') {
    throw new ApiError(409, 'This booking cannot be cancelled');
  }

  const route = await PoolingRoute.findById(booking.route).lean();
  const schedule = (route?.schedules || []).find((item) => String(item?.id || '') === String(booking.scheduleId));
  const travelDate = new Date(booking.travelDate).toISOString().slice(0, 10);
  const departureAt = parseDepartureAt(travelDate, schedule?.departureTime);
  const cutoffMs = CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;

  if (departureAt && departureAt.getTime() - Date.now() < cutoffMs) {
    throw new ApiError(400, `Bookings can only be cancelled at least ${CANCEL_CUTOFF_HOURS} hours before departure`);
  }

  if (!departureAt && travelDate < new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) {
    throw new ApiError(400, 'Past bookings cannot be cancelled');
  }

  const refund = booking.paymentStatus === 'paid' && booking.payment?.paymentId
    ? await refundRazorpayPayment({ paymentId: booking.payment.paymentId, amountRupees: booking.fare, reason: 'user cancelled pooling booking' })
    : { status: 'not_applicable', refundId: '', error: '' };

  booking.bookingStatus = 'cancelled';
  if (refund.status === 'processed') {
    booking.paymentStatus = 'refunded';
  }
  booking.set('payment.refund', { ...refund, amount: booking.fare, at: new Date() });
  await booking.save();
  await PoolingSeatReservation.deleteMany({ booking: booking._id });

  const hydratedBooking = await populateBooking(PoolingBooking.findById(booking._id));
  return ok(
    res,
    serializePoolingBooking(hydratedBooking),
    refund.status === 'processed'
      ? 'Booking cancelled and refund initiated'
      : 'Booking cancelled. Your refund will be processed by our team shortly',
  );
});

export const createPoolingBooking = asyncHandler(async (_req, _res) => {
  throw new ApiError(405, 'Direct pooling booking is disabled. Please complete online payment first.');
});

export const getMyPoolingBookings = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }

  const bookings = await PoolingBooking.find({ user: userId })
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber driverName driverPhone')
    .sort({ createdAt: -1 });

  return ok(res, bookings.map(serializePoolingBooking), 'My bookings fetched successfully');
});
