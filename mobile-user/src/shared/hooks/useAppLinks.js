import usePublicCustomization from './usePublicCustomization.js';

/**
 * Where a shared referral should send people: the installable app (Play Store / App Store / smart link), set in
 * Backend/.env (APP_LINK_USER, APP_LINK_CAPTAIN) and served with the public customization settings.
 * Empty strings until the real links are set - the share message then carries the website link instead.
 */
const selectAppLinks = (settings) => ({
  user: String(settings?.app_links?.user || '').trim(),
  captain: String(settings?.app_links?.captain || '').trim(),
});

export default function useAppLinks() {
  return usePublicCustomization(selectAppLinks);
}
