import mongoose from 'mongoose';

/**
 * Platform-wide settings owned by the Global admin (Customization Settings). One document, scope "default".
 * Only switches live here — gateway keys and other secrets stay in Backend/.env.
 */
const gatewaySwitchSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
  },
  { _id: false },
);

const platformSettingSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true, unique: true, default: 'default' },
    payment_gateways: {
      razorpay: { type: gatewaySwitchSchema, default: () => ({ enabled: true }) },
      phonepe: { type: gatewaySwitchSchema, default: () => ({ enabled: false }) },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, collection: 'platform_settings', minimize: false },
);

export const PlatformSetting =
  mongoose.models.PlatformSetting || mongoose.model('PlatformSetting', platformSettingSchema);
