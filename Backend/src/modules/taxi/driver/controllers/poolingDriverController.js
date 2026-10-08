import { ApiError } from '../../../../utils/ApiError.js';
import { PoolingVehicle } from '../../admin/models/PoolingVehicle.js';
import { PoolingRoute } from '../../admin/models/PoolingRoute.js';
import { PoolingBooking } from '../../admin/models/PoolingBooking.js';

// The pooling "driver" account is its vehicle (token sub = pooling vehicle id). Online = this car is open for new seat
// bookings (users only see online cars); the app shares the live position while online.

const requirePoolingDriver = (req) => {
  if (String(req.auth?.role || '').toLowerCase() !== 'pooling_driver') {
    throw new ApiError(403, 'Pooling driver access is required');
  }
  return req.auth.sub;
};

const toPoint = (value) => {
  const raw = Array.isArray(value) ? value : value?.coordinates;
  const [lng, lat] = Array.isArray(raw) ? raw : [value?.lng, value?.lat];
  return Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))
    ? { type: 'Point', coordinates: [Number(lng), Number(lat)] }
    : null;
};

const serializeOnlineState = (vehicle) => ({
  isOnline: vehicle?.isOnline === true,
  onlineAt: vehicle?.onlineAt || null,
  location: vehicle?.lastLocation?.coordinates?.length === 2
    ? { lng: vehicle.lastLocation.coordinates[0], lat: vehicle.lastLocation.coordinates[1], updatedAt: vehicle.lastLocation.updatedAt || null }
    : null,
});

export const setPoolingDriverOnline = async (req, res) => {
  const vehicleId = requirePoolingDriver(req);
  const wantsOnline = req.body?.online === true;
  const point = toPoint(req.body?.location || req.body?.coordinates);

  const vehicle = await PoolingVehicle.findById(vehicleId);
  if (!vehicle) {
    throw new ApiError(404, 'Pooling driver not found');
  }

  if (wantsOnline && (vehicle.approve === false || String(vehicle.status || '') !== 'active')) {
    throw new ApiError(403, 'Your vehicle is not approved yet');
  }

  vehicle.isOnline = wantsOnline;
  vehicle.onlineAt = wantsOnline ? new Date() : null;
  if (point) {
    vehicle.lastLocation = { ...point, updatedAt: new Date() };
  }
  await vehicle.save();

  res.json({ success: true, data: serializeOnlineState(vehicle) });
};

export const updatePoolingDriverLocation = async (req, res) => {
  const vehicleId = requirePoolingDriver(req);
  const point = toPoint(req.body?.location || req.body?.coordinates);
  if (!point) {
    throw new ApiError(400, 'location is required');
  }

  const heading = Number(req.body?.heading);
  await PoolingVehicle.updateOne(
    { _id: vehicleId },
    { $set: { lastLocation: { ...point, heading: Number.isFinite(heading) ? heading : null, updatedAt: new Date() } } },
  );

  res.json({ success: true });
};

const istDateString = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const getPoolingDriverDashboard = async (req, res) => {
  const vehicleId = requirePoolingDriver(req);
  const vehicle = await PoolingVehicle.findById(vehicleId).lean();
  if (!vehicle) {
    throw new ApiError(404, 'Pooling driver not found');
  }

  const today = istDateString();
  const [routes, bookings] = await Promise.all([
    PoolingRoute.find({ assignedVehicleTypeIds: vehicleId, status: 'active', active: { $ne: false } })
      .select('routeName originLabel destinationLabel schedules farePerSeat')
      .lean(),
    PoolingBooking.find({
      vehicle: vehicleId,
      bookingStatus: { $ne: 'cancelled' },
      travelDate: { $gte: new Date(`${today}T00:00:00.000Z`) },
    })
      .populate('user', 'name phone')
      .populate('route', 'routeName originLabel destinationLabel schedules')
      .sort({ travelDate: 1, createdAt: 1 })
      .limit(200)
      .lean(),
  ]);

  // one row per departure (route + schedule + date) with who is coming
  const departures = new Map();
  for (const booking of bookings) {
    const schedule = (booking.route?.schedules || []).find((item) => String(item?.id || '') === String(booking.scheduleId || ''));
    const date = new Date(booking.travelDate).toISOString().slice(0, 10);
    const key = `${booking.route?._id}:${booking.scheduleId}:${date}`;
    const row = departures.get(key) || {
      date,
      isToday: date === today,
      routeName: booking.route?.routeName || `${booking.route?.originLabel || ''} to ${booking.route?.destinationLabel || ''}`,
      origin: booking.route?.originLabel || '',
      destination: booking.route?.destinationLabel || '',
      departureTime: schedule?.departureTime || '',
      seatsBooked: 0,
      bookings: [],
    };
    row.seatsBooked += Number(booking.seatsBooked || 0);
    row.bookings.push({
      bookingId: booking.bookingId || '',
      passenger: booking.user?.name || 'Passenger',
      phone: booking.user?.phone || '',
      seats: Number(booking.seatsBooked || 0),
      pickup: booking.pickupLabel || '',
      drop: booking.dropLabel || '',
    });
    departures.set(key, row);
  }

  res.json({
    success: true,
    data: {
      ...serializeOnlineState(vehicle),
      vehicle: {
        name: vehicle.name || '',
        number: vehicle.vehicleNumber || '',
        capacity: vehicle.capacity || 0,
      },
      routes: routes.map((route) => ({
        id: String(route._id),
        routeName: route.routeName || '',
        origin: route.originLabel || '',
        destination: route.destinationLabel || '',
        schedules: (route.schedules || [])
          .filter((item) => String(item?.status || 'active') === 'active')
          .map((item) => ({ id: String(item.id || ''), departureTime: item.departureTime || '', arrivalTime: item.arrivalTime || '', activeDays: item.activeDays || [] })),
      })),
      departures: [...departures.values()].sort((a, b) => (a.date + a.departureTime).localeCompare(b.date + b.departureTime)),
      todaySeats: [...departures.values()].filter((row) => row.isToday).reduce((sum, row) => sum + row.seatsBooked, 0),
      upcomingBookings: bookings.length,
    },
  });
};

// Every active admin route with "does this car run it". A self-registered car is on no route until its driver (or the
// admin) puts it on one - that is why an approved, online car never showed up for riders.
export const getPoolingDriverRoutes = async (req, res) => {
  const vehicleId = requirePoolingDriver(req);
  const routes = await PoolingRoute.find({ status: 'active', active: { $ne: false } })
    .select('routeName originLabel destinationLabel schedules assignedVehicleTypeIds')
    .sort({ routeName: 1 })
    .lean();

  res.json({
    success: true,
    data: routes.map((route) => ({
      id: String(route._id),
      routeName: route.routeName || '',
      origin: route.originLabel || '',
      destination: route.destinationLabel || '',
      assigned: (route.assignedVehicleTypeIds || []).some((id) => String(id) === String(vehicleId)),
      schedules: (route.schedules || [])
        .filter((item) => String(item?.status || 'active') === 'active')
        .map((item) => ({ id: String(item.id || ''), departureTime: item.departureTime || '', arrivalTime: item.arrivalTime || '', label: item.label || '' })),
    })),
  });
};

export const setPoolingDriverRoute = async (req, res) => {
  const vehicleId = requirePoolingDriver(req);
  const vehicle = await PoolingVehicle.findById(vehicleId).select('approve status').lean();
  if (!vehicle || vehicle.approve === false || String(vehicle.status || '') !== 'active') {
    throw new ApiError(403, 'Your vehicle is not approved yet');
  }

  const assigned = req.body?.assigned === true;
  const route = await PoolingRoute.findOneAndUpdate(
    { _id: req.params.routeId, status: 'active', active: { $ne: false } },
    assigned ? { $addToSet: { assignedVehicleTypeIds: vehicleId } } : { $pull: { assignedVehicleTypeIds: vehicleId } },
    { new: true },
  ).select('_id');

  if (!route) {
    throw new ApiError(404, 'Route not found');
  }

  res.json({ success: true, data: { id: String(route._id), assigned } });
};
