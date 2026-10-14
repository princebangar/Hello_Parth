import mongoose from 'mongoose';

/**
 * Home banners of the user apps that are managed from the Global admin (User Management > Home Banners).
 * One document for the whole platform. The Food fest banner is kept where Food already reads it
 * (food_landing_settings, the document without a zone); only the Taxi banner lives here.
 */
const homeBannerSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, index: true },
    // Image shown on the Taxi user home, under the app bar. Empty = a plain colour is shown instead.
    taxiImageUrl: { type: String, default: '' },
  },
  { collection: 'global_home_banners', timestamps: true },
);

export const GlobalHomeBanner = mongoose.model('GlobalHomeBanner', homeBannerSchema);
