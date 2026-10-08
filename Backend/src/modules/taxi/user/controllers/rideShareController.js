import crypto from 'crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { Ride } from '../models/Ride.js';

// "Share my ride": the rider gets one secret link per ride. Anyone holding it sees the live trip (no login), only while
// the trip is on and for a few hours after it ended. No phone numbers or payment details are ever part of the answer.
const SHARE_AFTER_END_MS = 3 * 60 * 60 * 1000;

const ACTIVE_STATUSES = ['searching', 'accepted', 'ongoing'];

const toPoint = (location) => {
  const [lng, lat] = Array.isArray(location?.coordinates) ? location.coordinates : [];
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
};

const buildVehicleLabel = (driver = {}) =>
  [driver?.vehicleColor, driver?.vehicleMake, driver?.vehicleModel].map((part) => String(part || '').trim()).filter(Boolean).join(' ');

export const createRideShareLink = async (req, res) => {
  const ride = await Ride.findOne({ _id: req.params.rideId, userId: req.auth.sub }).select('status shareToken');

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  if (!ACTIVE_STATUSES.includes(ride.status)) {
    throw new ApiError(409, 'This trip is over - there is nothing live to share');
  }

  if (!ride.shareToken) {
    ride.shareToken = crypto.randomBytes(12).toString('hex');
    await ride.save();
  }

  res.json({ success: true, data: { token: ride.shareToken } });
};

export const getPublicRideTracking = async (req, res) => {
  const token = String(req.params.token || '').trim();

  if (!/^[a-f0-9]{24}$/.test(token)) {
    throw new ApiError(404, 'This tracking link is not valid');
  }

  const ride = await Ride.findOne({ shareToken: token })
    .select('status liveStatus pickupAddress dropAddress pickupLocation dropLocation lastDriverLocation driverId startedAt completedAt updatedAt serviceType')
    .populate('driverId', 'name vehicleNumber vehicleColor vehicleMake vehicleModel vehicleType rating')
    .lean();

  if (!ride) {
    throw new ApiError(404, 'This tracking link is not valid');
  }

  const ended = ['completed', 'cancelled'].includes(ride.status);
  const endedAt = ride.completedAt || ride.updatedAt;

  if (ended && Date.now() - new Date(endedAt || 0).getTime() > SHARE_AFTER_END_MS) {
    throw new ApiError(410, 'This trip has ended and its tracking link has expired');
  }

  const driver = ride.driverId || null;

  res.json({
    success: true,
    data: {
      status: ride.status,
      liveStatus: ride.liveStatus,
      ended,
      serviceType: ride.serviceType || 'ride',
      pickupAddress: ride.pickupAddress || '',
      dropAddress: ride.dropAddress || '',
      pickup: toPoint(ride.pickupLocation),
      drop: toPoint(ride.dropLocation),
      driverLocation: ended ? null : toPoint(ride.lastDriverLocation),
      driverLocationAt: ride.lastDriverLocation?.updatedAt || null,
      heading: ride.lastDriverLocation?.heading ?? null,
      driver: driver
        ? {
            name: driver.name || 'Driver',
            vehicleNumber: driver.vehicleNumber || '',
            vehicleLabel: buildVehicleLabel(driver),
            vehicleType: driver.vehicleType || '',
            rating: driver.rating ?? null,
          }
        : null,
    },
  });
};
