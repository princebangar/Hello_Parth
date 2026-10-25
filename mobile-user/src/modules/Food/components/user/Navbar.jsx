// Web: modules/Food/components/user/Navbar.jsx — older Food header (location, logo, points, cart, profile menu).
// Same logic, texts and links (the web's userPoints value is the web's own constant).
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { MapPin, ShoppingCart, Trophy } from 'lucide-react-native';
import { Link, useNavigate, useLocation as useRouterLocation } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors, shadow } from '@/theme';
import { Button } from '@food/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@food/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@food/components/ui/dropdown-menu';
import { tokensFor } from '@food/components/ui/tokens';
import { useLocation } from '@food/hooks/useLocation';
import { useCart } from '@food/context/CartContext';
import { useLocationSelector } from './UserLayout';
import { useProfile } from '@food/context/ProfileContext';
import { getCachedSettings, loadBusinessSettings } from '@food/utils/businessSettings';
import { isModuleAuthenticated } from '@food/utils/auth';
import { DEFAULT_BRAND_LOGO } from '@/shared/constants/brandLogo';

const DEFAULT_AVATAR = require('../../../../assets/public/images/profile_avatar.webp');
const debugError = (...args) => {};

export default function Navbar() {
  const routerLocation = useRouterLocation();
  const navigate = useNavigate();
  const { location, loading } = useLocation();
  const { userProfile } = useProfile();
  const { getCartCount } = useCart();
  const { openLocationSelector } = useLocationSelector();
  const cartCount = getCartCount();
  const [logoUrl, setLogoUrl] = useState(null);
  const [companyName, setCompanyName] = useState(null);
  const [logoBroken, setLogoBroken] = useState(false);
  const k = tokensFor({ dark: false });

  // Load business settings logo
  useEffect(() => {
    const loadLogo = async () => {
      try {
        const cached = getCachedSettings();
        if (cached) {
          if (cached.logo?.url) setLogoUrl(cached.logo.url);
          if (cached.companyName) setCompanyName(cached.companyName);
        } else {
          const settings = await loadBusinessSettings();
          if (settings) {
            if (settings.logo?.url) setLogoUrl(settings.logo.url);
            if (settings.companyName) setCompanyName(settings.companyName);
          }
        }
      } catch (error) {
        debugError('Error loading logo:', error);
      }
    };
    loadLogo();

    const handleSettingsUpdate = () => {
      const cached = getCachedSettings();
      if (cached) {
        if (cached.logo?.url) setLogoUrl(cached.logo.url);
        if (cached.companyName) setCompanyName(cached.companyName);
      }
    };
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
  }, []);

  const handleLocationClick = () => {
    openLocationSelector();
  };

  // The web's points value (not wired to an API there either)
  const userPoints = 99;

  const badge = (value) => (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.nav}>
      <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#ffffff', 0.7) }]} />
      <View style={{ width: '100%', paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', height: 56, alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {/* Location Section */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Button variant="ghost" onPress={handleLocationClick} disabled={loading}>
              {loading ? (
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.black }}>Loading...</Text>
              ) : (
                <View style={{ flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color={colors.black} />
                    <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: k.foreground }}>
                      {location?.area || location?.subLocality || location?.city || 'Select Location'}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 14, color: k.mutedForeground, paddingTop: 2 }}>
                    {[location?.state, location?.pincode].filter(Boolean).join(', ') || location?.city || 'Location'}
                  </Text>
                </View>
              )}
            </Button>
          </View>

          {/* Company Logo or Name */}
          <Link to="/food/user" style={{ alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {logoUrl ? (
              logoBroken ? null : <AppImage src={logoUrl} contentFit="contain" style={{ height: 32, width: 32 }} onError={() => setLogoBroken(true)} />
            ) : companyName ? (
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{companyName}</Text>
            ) : (
              <AppImage src={DEFAULT_BRAND_LOGO} contentFit="contain" style={{ height: 32, width: 32 }} />
            )}
          </Link>

          {/* Right Side Actions - Points, Cart, Profile */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Button variant="ghost" size="icon" style={{ position: 'relative', height: 40, width: 40 }} accessibilityLabel={`${userPoints} Points`}>
              <Trophy size={20} color={k.primary} />
              {badge(userPoints > 999 ? '999+' : userPoints)}
            </Button>

            <Link to="/food/cart" state={{ from: routerLocation.pathname }}>
              <View style={{ position: 'relative', height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                <ShoppingCart size={20} color={colors.gray[700]} />
                {cartCount > 0 && badge(cartCount > 99 ? '99+' : cartCount)}
              </View>
            </Link>

            {/* Guests: the avatar opens the login popup instead of the menu (web: preventDefault on the trigger) */}
            <DropdownMenu>
              {isModuleAuthenticated('user') ? (
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" style={{ borderRadius: 9999, height: 44, width: 44 }}>
                    <Avatar style={{ height: 40, width: 40 }}>
                      <AvatarImage src={userProfile?.profileImage || DEFAULT_AVATAR} />
                      <AvatarFallback style={{ backgroundColor: k.primary }}>
                        <AppImage src={DEFAULT_AVATAR} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  style={{ borderRadius: 9999, height: 44, width: 44 }}
                  onPress={() => window.dispatchEvent(new CustomEvent('show-login-required'))}
                >
                  <Avatar style={{ height: 40, width: 40 }}>
                    <AvatarImage src={userProfile?.profileImage || DEFAULT_AVATAR} />
                    <AvatarFallback style={{ backgroundColor: k.primary }}>
                      <AppImage src={DEFAULT_AVATAR} contentFit="cover" style={{ width: '100%', height: '100%' }} />
                    </AvatarFallback>
                  </Avatar>
                </Button>
              )}
              <DropdownMenuContent align="end" style={{ width: 192 }}>
                <DropdownMenuItem onSelect={() => navigate('/food/user/cart', { state: { from: routerLocation.pathname } })}>YOUR CART</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/food/user/profile', { state: { from: routerLocation.pathname } })}>Profile</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/food/user/orders')}>My Orders</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/food/user/offers')}>Offers</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/food/user/help')}>Help</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/login')}>Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { zIndex: 50, width: '100%', borderBottomWidth: 1, borderBottomColor: colors.gray[100], overflow: 'hidden', ...shadow.sm },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    height: 16,
    minWidth: 16,
    borderRadius: 9999,
    backgroundColor: '#c99500',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  badgeText: { color: '#ffffff', fontSize: 10, lineHeight: 12, fontWeight: '700' },
});
