import mongoose from 'mongoose';

// A reservation is either a short-lived payment hold (expiresAt set, no booking yet) or a
// confirmed seat (expiresAt null, booking set). Both block the seat for other users.
const poolingSeatReservationSchema = new mongoose.Schema(
  {
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPoolingRoute',
      required: true,
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPoolingVehicle',
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPoolingBooking',
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      default: null,
    },
    orderId: {
      type: String,
      default: '',
      trim: true,
    },
    pickupStopId: {
      type: String,
      default: '',
      trim: true,
    },
    dropStopId: {
      type: String,
      default: '',
      trim: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    scheduleId: {
      type: String,
      required: true,
      trim: true,
    },
    travelDate: {
      type: String,
      required: true,
      trim: true,
    },
    seatId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

poolingSeatReservationSchema.index(
  { route: 1, vehicle: 1, scheduleId: 1, travelDate: 1, seatId: 1 },
  { unique: true },
);
poolingSeatReservationSchema.index({ orderId: 1 });
poolingSeatReservationSchema.index({ expiresAt: 1 });

export const PoolingSeatReservation =
  mongoose.models.TaxiPoolingSeatReservation ||
  mongoose.model('TaxiPoolingSeatReservation', poolingSeatReservationSchema);
