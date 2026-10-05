import usePublicCustomization from './usePublicCustomization.js';

/**
 * Whether the customer referral system is switched on (Global admin > Customization Settings > Referral System).
 * One switch for Food and Taxi, so both wallets / profiles / referral pages read it from here.
 */
const selectReferral = (settings) => settings.referral_enabled !== false;

export default function useReferralEnabled() {
  return usePublicCustomization(selectReferral);
}
