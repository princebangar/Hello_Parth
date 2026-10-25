// Web: modules/Food/components/user/Footer.jsx — the site footer is "hidden md:block": it never shows at phone
// width. Same component and effects (business-settings logo load + 'businessSettingsUpdated' listener, which the
// web runs even while hidden), nothing drawn.
import { useEffect, useState } from 'react';
import { getCachedSettings, loadBusinessSettings } from '@food/utils/businessSettings';
import { useCompanyName } from '@food/hooks/useCompanyName';
import { DEFAULT_BRAND_LOGO } from '@/shared/constants/brandLogo';

export default function Footer() {
  useCompanyName();
  const [, setLogoUrl] = useState(DEFAULT_BRAND_LOGO);

  // Load business settings logo
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const cached = getCachedSettings();
        if (cached?.logo?.url) {
          setLogoUrl(cached.logo.url);
        } else {
          const settings = await loadBusinessSettings();
          if (settings?.logo?.url) setLogoUrl(settings.logo.url);
        }
      } catch (error) {
        // Silently fail, use default logo
      }
    };
    loadLogo();

    const handleSettingsUpdate = () => {
      const cached = getCachedSettings();
      if (cached?.logo?.url) setLogoUrl(cached.logo.url);
    };
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
  }, []);

  return null;
}
