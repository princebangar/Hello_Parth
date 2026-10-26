import usePublicCustomization from './usePublicCustomization.js';

/**
 * Whether Food "My Store" (brand stores) is switched on (Global admin > Customization Settings > My Store).
 * Off hides the whole feature: the Explore More icon, the My Store page and the Restaurant Partner | My Store
 * choice on the restaurant login. Until the first answer arrives nothing is hidden (a failed request must never
 * take a feature away); the last answer is cached, so the right state shows on the first paint.
 */
const selectMyStore = (settings) => settings.my_store_enabled !== false;

export default function useMyStoreEnabled() {
  return usePublicCustomization(selectMyStore);
}
