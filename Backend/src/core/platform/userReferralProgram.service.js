import { AdminBusinessSetting } from '../../modules/taxi/admin/models/AdminBusinessSetting.js';

/**
 * The customer referral reward the Global admin sets (Global > Referral Management > User Referral Settings).
 * It is one program for the whole platform, so a friend who signs up through the common login (/login?ref=CODE, the
 * link the Taxi and Food apps share) must be paid by THIS setting. Until it is set (switched off or amount 0) the older
 * Food referral settings stay in charge.
 *
 *  - instant_referrer / instant_referrer_new: paid when the friend signs up (new user gets it too for *_new)
 *  - conditional_referrer / conditional_referrer_new: only marks who invited the friend; the Taxi ride-completion
 *    code pays after the friend finished the set number of rides
 */
export const getGlobalUserReferralProgram = async () => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }).select('referral.user').lean();
  const user = setting?.referral?.user || {};
  const amount = Math.max(0, Number(user.amount || 0) || 0);
  const type = String(user.type || 'instant_referrer').trim().toLowerCase();

  return {
    usable: Boolean(user.enabled) && amount > 0,
    amount,
    type,
    rideCount: Math.max(0, Number(user.ride_count || 0) || 0),
    isInstant: type === 'instant_referrer' || type === 'instant_referrer_new',
    paysNewUser: type === 'instant_referrer_new',
  };
};
