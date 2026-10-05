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
    // Customer referral programme (Food + Taxi wallets). On unless the Global admin switches it off.
    referral: {
      enabled: { type: Boolean, default: true },
    },
    // App-wide switches (Food + Taxi). Maintenance / default location have no schema default on purpose: until the
    // Global admin saves them once, appSwitches.service falls back to the value Food admin used to hold.
    app: {
      maintenance_mode_enabled: { type: Boolean },
      default_location_enabled: { type: Boolean },
    },
    // Customer payment methods for every customer app. Off here beats any per-app (Food) switch.
    user_payments: {
      cod_enabled: { type: Boolean, default: true },
      wallet_enabled: { type: Boolean, default: true },
      online_enabled: { type: Boolean, default: true },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, collection: 'platform_settings', minimize: false },
);

export const PlatformSetting =
  mongoose.models.PlatformSetting || mongoose.model('PlatformSetting', platformSettingSchema);
