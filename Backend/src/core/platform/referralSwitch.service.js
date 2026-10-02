import { PlatformSetting } from './platformSetting.model.js';

/**
 * Global admin > Customization Settings > Referral System.
 * One switch for the customer referral programme in both Food and Taxi: off means no referral entry in the
 * wallets / profile, codes are ignored at sign-up and no reward is credited. Driver / rider referral is a
 * separate programme and is not affected.
 *
 * Read on every sign-up and every completed ride, so the answer is kept in memory for a few seconds.
 */
const CACHE_TTL_MS = 5000;

let cachedEnabled = true;
let cachedAt = 0;
let inflight = null;

export const isReferralEnabled = async () => {
  if (Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedEnabled;
  }
  if (inflight) {
    return inflight;
  }

  inflight = PlatformSetting.findOne({ scope: 'default' })
    .select('referral')
    .lean()
    .then((doc) => {
      cachedEnabled = doc?.referral?.enabled !== false;
      cachedAt = Date.now();
      return cachedEnabled;
    })
    .catch(() => cachedEnabled) // keep the last known answer if the lookup fails
    .finally(() => {
      inflight = null;
    });

  return inflight;
};

export const setReferralEnabled = async (enabled, updatedBy = null) => {
  await PlatformSetting.updateOne(
    { scope: 'default' },
    { $set: { 'referral.enabled': enabled === true, updatedBy } },
    { upsert: true },
  );
  cachedEnabled = enabled === true;
  cachedAt = Date.now();
  return cachedEnabled;
};
