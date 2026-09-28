import mongoose from 'mongoose';

/**
 * "Other Service" cards shown on the public landing page (outside Food and Taxi) — an external link the
 * platform wants to point visitors to (a partner site, a sister product, etc). Fully admin-managed from
 * Global → Landing Page.
 */
const otherServiceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    collection: 'landing_other_services',
    timestamps: true,
  },
);

otherServiceSchema.index({ isActive: 1, sortOrder: 1 });

export const OtherService =
  mongoose.models.LandingOtherService || mongoose.model('LandingOtherService', otherServiceSchema);
