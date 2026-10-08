import mongoose from 'mongoose';

const poolingVehicleSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Owner',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleModel: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    driverName: {
      type: String,
      trim: true,
      default: '',
    },
    driverPhone: {
      type: String,
      trim: true,
      default: '',
    },
    approve: {
      type: Boolean,
      default: true,
    },
    color: {
      type: String,
      trim: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    adminCommissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    ownerCommissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    serviceTaxPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    vehicleType: {
      type: String,
      enum: ['bike', 'sedan', 'hatchback', 'suv', 'van', 'luxury'],
      default: 'sedan',
    },
    blueprint: {
      type: Object, // JSON layout of seats
      default: {},
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'maintenance'],
      default: 'active',
    },
    poolingEnabled: {
      type: Boolean,
      default: true,
    },
    // Driver app switch: an online car is open for new seat bookings. Cars made in the admin / owner panels have no
    // value (undefined) and stay bookable as before; a self-registered pooling driver starts offline.
    isOnline: {
      type: Boolean,
      default: undefined,
    },
    onlineAt: {
      type: Date,
      default: null,
    },
    lastLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
      heading: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },
    // push tokens of the pooling driver app (saved by the shared "save FCM token" call)
    fcmTokenWeb: { type: String, default: '' },
    fcmTokenMobile: { type: String, default: '' },
  },
  { timestamps: true },
);

poolingVehicleSchema.index({ status: 1 });
poolingVehicleSchema.index({ driverPhone: 1 });
poolingVehicleSchema.index({ approve: 1, status: 1 });

export const PoolingVehicle =
  mongoose.models.TaxiPoolingVehicle ||
  mongoose.model('TaxiPoolingVehicle', poolingVehicleSchema);
