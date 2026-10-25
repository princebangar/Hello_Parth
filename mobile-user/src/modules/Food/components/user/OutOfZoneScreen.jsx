// Web: modules/Food/components/user/OutOfZoneScreen.jsx — full-screen "We'll be there soon" screen shown when the
// delivery location is outside every zone. Same props (location, handleLocationClick, service, isGuest), texts,
// image, header (location picker, wallet when signed in, avatar -> profile / guest login popup).
import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, MapPin, Wallet } from 'lucide-react-native';
import { Link, useLocation, useNavigate } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { alpha } from '@/theme';
import { useProfile } from '@food/context/ProfileContext';
import { isModuleAuthenticated } from '../../utils/auth';

import outOfZoneBg from '@food/assets/Outofzone_bg.jpg';

// Same avatar as the home header (shared/components/SuperAppHomeHeader.jsx): the user's photo, else the default one.
const DEFAULT_AVATAR = require('../../../../assets/public/images/profile_avatar.webp');

const shadowText = (radius = 3) => ({ textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: radius });

// service="taxi" reuses this screen on the Taxi home: same look, Taxi profile/wallet links, Taxi login state.
const OutOfZoneScreen = ({ location, handleLocationClick, service = 'food', isGuest: isGuestProp }) => {
  const { userProfile } = useProfile();
  const BRAND_NAME = 'Hello Parth';
  const insets = useSafeAreaInsets();
  const { height: vh } = useWindowDimensions();

  const routerLocation = useLocation();
  const navigate = useNavigate();
  const isGuest = typeof isGuestProp === 'boolean' ? isGuestProp : !isModuleAuthenticated('user');
  const base = service === 'taxi' ? '/taxi/user' : '/food/user';
  const [avatarBroken, setAvatarBroken] = React.useState(false);
  const profileImage = isGuest ? '' : userProfile?.profileImage || '';

  // Guests have no profile or wallet: the avatar opens the same login popup as the rest of the guest app.
  const handleProfileClick = () => {
    if (isGuest) {
      window.dispatchEvent(new CustomEvent('show-login-required', { detail: { intent: 'general' } }));
      return;
    }
    navigate(`${base}/profile`, { state: { from: routerLocation.pathname } });
  };

  const areaTitle = (() => {
    const area = location?.area || location?.subLocality || location?.mainTitle || location?.neighborhood;
    if (area && !/^-?\d+(\.\d+)?$/.test(String(area).trim())) return area;
    return location?.city || 'Select Location';
  })();

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {/* Full Screen Background Image with scale to prevent subpixel edge lines */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]}>
        <AppImage src={outOfZoneBg} contentFit="cover" style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.02 }] }]} />
      </View>

      {/* Navbar Overlay */}
      <View style={[styles.navbar, { paddingTop: 24 + insets.top }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Pressable onPress={handleLocationClick} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%' }}>
              {({ pressed }) => (
                <>
                  <View style={[{ padding: 6, borderRadius: 9999, flexShrink: 0 }, pressed && { transform: [{ scale: 0.95 }] }]}>
                    <MapPin size={20} color="#ffffff" />
                  </View>
                  <View style={{ flexDirection: 'column', minWidth: 0, flexShrink: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text numberOfLines={1} style={[{ fontSize: 17, fontWeight: '900', color: '#ffffff', flexShrink: 1 }, shadowText(4)]}>
                        {areaTitle}
                      </Text>
                      <ChevronDown size={14} color={alpha('#ffffff', 0.9)} />
                    </View>
                    <Text numberOfLines={1} style={[{ fontSize: 12, lineHeight: 15, fontWeight: '700', color: alpha('#ffffff', 0.9) }, shadowText(2)]}>
                      {location?.city || 'Pinpoint location'}
                    </Text>
                  </View>
                </>
              )}
            </Pressable>
          </View>

          {/* Right: Wallet (signed-in only) and Profile */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {!isGuest && (
              <Link
                to={`${base}/wallet`}
                state={{ from: routerLocation.pathname }}
                accessibilityLabel="Wallet"
                style={({ pressed }) => [styles.iconBtn, pressed && { transform: [{ scale: 0.9 }] }]}
              >
                <Wallet size={22} color="#ffffff" />
              </Link>
            )}

            <Pressable
              onPress={handleProfileClick}
              accessibilityLabel={isGuest ? 'Login' : 'Profile'}
              style={({ pressed }) => [styles.avatar, pressed && { transform: [{ scale: 0.9 }] }]}
            >
              <AppImage
                src={!avatarBroken && profileImage ? profileImage : DEFAULT_AVATAR}
                contentFit="cover"
                style={{ width: '100%', height: '100%' }}
                onError={() => setAvatarBroken(true)}
              />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Text Context - centred on 48vh */}
      <View pointerEvents="none" style={[styles.textBlock, { top: 0, height: vh * 0.96 }]}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.heading, shadowText(4)]}>{"We'll be there soon –\nhang tight!"}</Text>
          <Text style={[styles.sub, shadowText(2)]}>{"Looks like our services aren't available\nat your location yet."}</Text>
        </View>
      </View>

      {/* Brand Logo - Faded watermark style */}
      <View pointerEvents="none" style={[styles.brand, { top: vh * 0.71 }]}>
        <Text style={styles.brandText}>{BRAND_NAME}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, flexDirection: 'column', backgroundColor: '#2a1c3d', overflow: 'hidden', zIndex: 40, elevation: 40 },
  navbar: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 16, paddingHorizontal: 16, zIndex: 50, backgroundColor: 'transparent' },
  iconBtn: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9999 },
  avatar: {
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: '#FFF5E6',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 25 },
  },
  textBlock: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, zIndex: 10 },
  heading: { fontSize: 28, lineHeight: 33.6, fontWeight: '700', color: '#ffffff', marginBottom: 16, letterSpacing: -0.7, textAlign: 'center' },
  sub: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: alpha('#ffffff', 0.9), maxWidth: 320, textAlign: 'center' },
  brand: { position: 'absolute', left: 0, width: '100%', paddingLeft: 32, zIndex: 10 },
  brandText: { fontSize: 34, lineHeight: 34, fontWeight: '900', color: alpha('#ffffff', 0.3), fontStyle: 'italic', letterSpacing: -1.5 },
});

export default OutOfZoneScreen;
