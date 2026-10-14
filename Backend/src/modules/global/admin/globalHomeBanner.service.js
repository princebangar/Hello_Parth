import { GlobalHomeBanner } from './models/homeBanner.model.js';
import { getLandingSettings, updateLandingSettingsDetailed } from '../../food/landing/services/landingSettings.service.js';
import { deleteStoredAsset } from '../../../services/storage.service.js';
import { invalidateCachedValue } from '../../../utils/cache.js';
import { ValidationError } from '../../../core/auth/errors.js';

// The Taxi app reads its start-up settings (including this banner) from one cached public answer.
const TAXI_BOOTSTRAP_CACHE_KEY = 'cache:public:app_bootstrap';
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const cleanUrl = (value) => {
  const url = String(value ?? '').trim();
  if (url.length > 1000) throw new ValidationError('Image URL is too long');
  return url;
};

const cleanColor = (value) => {
  const color = String(value ?? '').trim();
  if (color && !HEX_COLOR.test(color)) throw new ValidationError('Top colour must be a hex colour like #D91F3A');
  return color;
};

/** The Taxi home banner image ('' when none): what the Taxi user app receives with its start-up settings. */
export const getTaxiHomeBannerUrl = async () => {
  const doc = await GlobalHomeBanner.findOne({ key: 'default' }).select('taxiImageUrl').lean();
  return String(doc?.taxiImageUrl || '').trim();
};

export const getHomeBanners = async () => {
  const [food, taxiImageUrl] = await Promise.all([getLandingSettings(null), getTaxiHomeBannerUrl()]);
  return {
    food: {
      imageUrl: String(food?.festBannerImageUrl || ''),
      topColor: String(food?.festBannerTopColor || ''),
    },
    taxi: { imageUrl: taxiImageUrl },
  };
};

export const updateFoodHomeBanner = async ({ imageUrl, topColor } = {}) => {
  const festBannerImageUrl = cleanUrl(imageUrl);
  // Without an image there is nothing a top colour could belong to.
  const festBannerTopColor = festBannerImageUrl ? cleanColor(topColor) : '';
  // Only these two fields are written; the old image file is removed when it was replaced or cleared.
  const { removedAsset } = await updateLandingSettingsDetailed({ festBannerImageUrl, festBannerTopColor }, null);
  return { ...(await getHomeBanners()), fileDeleted: removedAsset ? removedAsset.deleted : null };
};

export const updateTaxiHomeBanner = async ({ imageUrl } = {}) => {
  const taxiImageUrl = cleanUrl(imageUrl);
  const previous = await GlobalHomeBanner.findOneAndUpdate(
    { key: 'default' },
    { $set: { taxiImageUrl } },
    { upsert: true, new: false, setDefaultsOnInsert: true },
  ).lean();

  const previousUrl = String(previous?.taxiImageUrl || '').trim();
  let fileDeleted = null; // null = there was no old file to remove
  if (previousUrl && previousUrl !== taxiImageUrl) {
    fileDeleted = await deleteStoredAsset(previousUrl);
  }
  await invalidateCachedValue(TAXI_BOOTSTRAP_CACHE_KEY);
  return { ...(await getHomeBanners()), fileDeleted };
};
