import mongoose from 'mongoose';

const adminThirdPartySettingSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      required: true,
      unique: true,
      default: 'default',
    },
    recharge_api: { type: mongoose.Schema.Types.Mixed, default: {} },
    notification_channels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

export const AdminThirdPartySetting =
  mongoose.models.TaxiAdminThirdPartySetting || mongoose.model('TaxiAdminThirdPartySetting', adminThirdPartySettingSchema);
