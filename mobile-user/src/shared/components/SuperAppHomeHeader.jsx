import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Animated, Pressable, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { MapPin, ChevronDown, Bell, Wallet } from 'lucide-react-native';
import { useSwitcherPill, slideSwitcherPills } from '@/shared/utils/useSwitcherIndex.js';
import { SWITCH_VERTICAL_EVENT, hasVisitedVertical } from '@/shared/components/VerticalSwitchOverlay';
import { useNavigate, useLocation } from '@/lib/router';
import { AppImage, Text } from '@/native/ui';
import { getVerticalTheme } from '@/shared/constants/superAppVerticalTheme';
import { syncThemeForPath } from '@/shared/utils/theme.js';
import {
  ensureFoodGuestSession,
  prefetchFoodUser,
  prefetchTaxiUser,
  prefetchSiblingUserVertical,
} from '@/shared/utils/activeModule.js';
import { isUnifiedAuthenticated } from '@/shared/utils/moduleAuth.js';
import { prefetchWallet } from '@/shared/utils/walletPrefetch.js';
import { whenAppSettled } from '@/shared/utils/whenSettled.js';
import { preloadTaxiTab } from '@/modules/Taxi/modules/user/components/tabPages';
import { readSharedFoodLocation, getFoodStyleLocationParts, getHeaderLocationLines, FOOD_LOCATION_UPDATED_EVENT, TAXI_LOCATION_UPDATED_EVENT, TAXI_LOCATION_STORAGE_KEY } from '@/shared/utils/sharedUserLocation';

function readHelloParthLocation() {
  if (typeof window === 'undefined') return null;
  const food = readSharedFoodLocation();
  if (food) {
    const parts = getFoodStyleLocationParts(food);
    return {
      ...food,
      formattedAddress: food.formattedAddress || food.address || parts.title,
      area: parts.title,
      city: food.city || '',
      state: parts.state || food.state || '',
      pincode: parts.pincode,
      zipCode: parts.pincode,
      address: food.address || food.formattedAddress || parts.title,
    };
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem(TAXI_LOCATION_STORAGE_KEY) || '{}');
    const address = String(saved?.address || saved?.area || '').trim();
    if (!address) return null;
    const chunks = address.split(',').map((p) => p.trim()).filter(Boolean);
    return {
      formattedAddress: address,
      area: saved.area || chunks[0] || address,
      city: chunks.length > 2 ? chunks[chunks.length - 2] : chunks[1] || '',
      state: chunks.length > 1 ? chunks[chunks.length - 1] : '',
      address,
    };
  } catch {
    return null;
  }
}

// Always in colour, selected or not (the outline version vanished on the dark Taxi header).
function BurgerIcon({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path d="M12 30C12 18 20 12 32 12C44 12 52 18 52 30H12Z" fill="#F4A261" stroke="#2D1B00" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 32C10 32 14 36 21 36C28 36 30 32 35 32C40 32 43 36 48 36C53 36 54 32 54 32" fill="#2A9D8F" stroke="#2D1B00" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 36L14 40L50 40L54 36" fill="#E9C46A" stroke="#2D1B00" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={14} y={40} width={36} height={6} rx={3} fill="#8B5E3C" stroke="#2D1B00" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 46C16 52 22 54 32 54C42 54 48 52 48 46H16Z" fill="#F4A261" stroke="#2D1B00" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Always in colour, selected or not (same as the burger).
function TaxiIcon({ size = 32 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x={22} y={10} width={20} height={7} rx={2} fill="#1E293B" stroke="#0F172A" strokeWidth={2} />
      <Rect x={26} y={11.5} width={12} height={4} rx={1} fill="#FDE68A" />
      <Path d="M14 24H50L46 17H18L14 24Z" fill="#FFC400" stroke="#0F172A" strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M12 24H52C54.2 24 56 25.8 56 28V38C56 40.2 54.2 42 52 42H12C9.8 42 8 40.2 8 38V28C8 25.8 9.8 24 12 24Z" fill="#FFC400" stroke="#0F172A" strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M18 28H46" stroke="#FDE68A" strokeWidth={2} strokeLinecap="round" />
      <Rect x={20} y={30} width={10} height={6} rx={1} fill="#FEF9E7" stroke="#0F172A" strokeWidth={1.5} />
      <Rect x={34} y={30} width={10} height={6} rx={1} fill="#FEF9E7" stroke="#0F172A" strokeWidth={1.5} />
      <Circle cx={18} cy={42} r={5} fill="#1E293B" stroke="#0F172A" strokeWidth={2} />
      <Circle cx={46} cy={42} r={5} fill="#1E293B" stroke="#0F172A" strokeWidth={2} />
      <Circle cx={18} cy={42} r={2} fill="#E2E8F0" />
      <Circle cx={46} cy={42} r={2} fill="#E2E8F0" />
      <Rect x={28} y={44} width={8} height={3} rx={1} fill="#B45309" />
    </Svg>
  );
}

const foodTheme = getVerticalTheme('food');
const taxiTheme = getVerticalTheme('taxi');

const VERTICALS = [
  {
    id: 'taxi',
    name: 'Hello Parth Taxi',
    path: '/taxi/user',
    themeBg: taxiTheme.themeBg,
    activeTabBg: taxiTheme.activeTabBg,
    inactiveTabBg: taxiTheme.inactiveTabBg,
  },
  {
    id: 'food',
    name: 'Hello Parth Food',
    path: '/food/user',
    themeBg: foodTheme.themeBg,
    activeTabBg: foodTheme.activeTabBg,
    inactiveTabBg: foodTheme.inactiveTabBg,
  },
];

const DEFAULT_AVATAR = require('../../assets/public/images/profile_avatar.webp');

// Same avatar Food shows: the user's photo, or the default avatar when there is none.
function readStoredProfileImage() {
  try {
    const stored = JSON.parse(window.localStorage.getItem('userInfo') || '{}');
    return stored?.profileImage || '';
  } catch {
    return '';
  }
}

/**
 * The Taxi | Food header of both home screens (location, bell, wallet, avatar, the switcher).
 * The bar is always the brand's dark colour (getVerticalTheme(v).theme), independent of light / dark mode. It starts at
 * the top of the page content: the home screen puts the status-bar spacer above it in the same colour.
 */
export default function SuperAppHomeHeader({
  activeVertical: activeVerticalProp,
  location: locationProp,
  locationTitle,
  locationSubtitle,
  // eslint-disable-next-line no-unused-vars
  savedAddressText,
  handleLocationClick,
  tabsOnly = false,
  /** When true, render only the tabs row — parent supplies the themed background wrapper. */
  embedded = false,
  /** Unread count shown on the bell (Taxi passes its own; Food has its own header). */
  notificationCount = 0,
}) {
  const navigate = useNavigate();
  const reactLocation = useLocation();
  const locationPath = reactLocation.pathname;

  let routeVertical = 'taxi';
  if (locationPath.startsWith('/food/')) {
    routeVertical = 'food';
  } else if (locationPath.startsWith('/taxi/')) {
    routeVertical = 'taxi';
  } else if (['food', 'taxi'].includes(activeVerticalProp)) {
    routeVertical = activeVerticalProp;
  }

  const activeVertical = ['food', 'taxi'].includes(activeVerticalProp)
    ? activeVerticalProp
    : routeVertical;
  const isTaxi = activeVertical === 'taxi';
  const verticalTheme = getVerticalTheme(activeVertical);

  // Wallet balance starts loading as soon as a finger lands on the icon (see shared/utils/walletPrefetch.js).
  const warmWallet = useCallback(() => {
    if (!isUnifiedAuthenticated()) return;
    prefetchWallet(activeVertical);
  }, [activeVertical]);

  // First time: put the destination's header + skeleton up first and let it paint, THEN build the other app.
  // Opened before: the highlight slides on this screen and the new screen is put in straight away.
  // The app swaps Taxi <-> Food in place (replace): the other one is not kept on the back stack, and the screens
  // cross-fade (src/app/_layout.jsx) instead of sliding in from the right.
  const goToVertical = useCallback((verticalId, path) => {
    if (!window.matchMedia('(max-width: 767px)').matches) {
      navigate(path, { replace: true });
      return;
    }
    if (hasVisitedVertical(verticalId)) {
      slideSwitcherPills(verticalId);
      requestAnimationFrame(() => navigate(path, { replace: true }));
      return;
    }
    window.dispatchEvent(new CustomEvent(SWITCH_VERTICAL_EVENT, { detail: { to: verticalId } }));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => navigate(path, { replace: true }));
    });
  }, [navigate]);

  const handleVerticalTabClick = useCallback((verticalId) => {
    if (verticalId === activeVertical) return;
    if (verticalId === 'food') {
      ensureFoodGuestSession();
      prefetchFoodUser();
      goToVertical('food', '/food/user');
      return;
    }
    if (verticalId === 'taxi') {
      // Taxi is login-only — guests stay on Food and see the shared login popup.
      if (!isUnifiedAuthenticated()) {
        window.dispatchEvent(new CustomEvent('show-login-required', {
          detail: { intent: 'taxi' },
        }));
        return;
      }
      prefetchTaxiUser();
      syncThemeForPath('/taxi/user');
      goToVertical('taxi', '/taxi/user');
    }
  }, [goToVertical, activeVertical]);

  // Warm the sibling vertical after this screen has settled so Food <-> Taxi feels instant.
  useEffect(() => {
    return whenAppSettled(() => prefetchSiblingUserVertical(activeVertical));
  }, [activeVertical]);

  const [storedLocation, setStoredLocation] = useState(() => readHelloParthLocation());
  const [profileImage, setProfileImage] = useState(readStoredProfileImage);
  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    const syncProfileImage = () => {
      setProfileImage(readStoredProfileImage());
      setAvatarBroken(false);
    };
    syncProfileImage();
    window.addEventListener('storage', syncProfileImage);
    window.addEventListener('focus', syncProfileImage);
    return () => {
      window.removeEventListener('storage', syncProfileImage);
      window.removeEventListener('focus', syncProfileImage);
    };
  }, [locationPath]);

  useEffect(() => {
    const syncLocation = () => setStoredLocation(readHelloParthLocation());
    syncLocation();
    window.addEventListener('storage', syncLocation);
    window.addEventListener(TAXI_LOCATION_UPDATED_EVENT, syncLocation);
    window.addEventListener(FOOD_LOCATION_UPDATED_EVENT, syncLocation);
    return () => {
      window.removeEventListener('storage', syncLocation);
      window.removeEventListener(TAXI_LOCATION_UPDATED_EVENT, syncLocation);
      window.removeEventListener(FOOD_LOCATION_UPDATED_EVENT, syncLocation);
    };
  }, []);

  const location = locationProp ?? storedLocation;
  const walletPath = isTaxi ? '/taxi/user/wallet' : '/food/user/wallet';
  const notificationsPath = isTaxi ? '/taxi/user/profile/notifications' : '/food/user/notifications';
  const profilePath = isTaxi ? '/taxi/user/profile' : '/food/user/profile';

  const headerLines = useMemo(() => getHeaderLocationLines(location || {}), [location]);
  const displayTitle = locationTitle?.trim() || headerLines.title;
  const displaySubtitle = locationSubtitle?.trim() || headerLines.subtitle;

  const onLocationClick = useCallback(() => {
    if (handleLocationClick) {
      handleLocationClick();
      return;
    }
    if (isTaxi) {
      navigate('/taxi/user/ride/select-location');
    }
  }, [handleLocationClick, isTaxi, navigate]);

  const pill = useSwitcherPill(activeVertical);
  const [tabsWidth, setTabsWidth] = useState(0);
  // the pill is (100% - 10px) / 2 wide and slides by its own width + 2px (web: translateX(calc(100% + 2px)))
  const pillWidth = Math.max(0, (tabsWidth - 10) / 2);

  const tabsRow = (
    <View style={{ position: 'relative', zIndex: 20, paddingHorizontal: 16, paddingTop: tabsOnly && !embedded ? 4 : 0, paddingBottom: 12 }}>
      <View
        onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          width: '100%',
          alignItems: 'center',
          gap: 2,
          borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.25)',
          padding: 4,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        {/* the highlight: one pill that slides between the two tabs */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 4,
            top: 4,
            bottom: 4,
            width: pillWidth,
            borderRadius: 999,
            backgroundColor: getVerticalTheme(activeVertical).activeTab,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
            transform: [{ translateX: Animated.multiply(pill, pillWidth + 2) }],
          }}
        />
        {VERTICALS.map((vertical) => {
          const isActive = vertical.id === activeVertical;
          return (
            <Pressable
              key={vertical.id}
              onPress={() => handleVerticalTabClick(vertical.id)}
              onPressIn={() => {
                if (vertical.id === 'taxi') prefetchTaxiUser();
                if (vertical.id === 'food') prefetchFoodUser();
              }}
              style={{ zIndex: 10, flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999 }}
            >
              {vertical.id === 'food' ? <BurgerIcon size={24} /> : <TaxiIcon size={24} />}
              <Text
                numberOfLines={1}
                style={{ fontSize: 15, lineHeight: 18, fontWeight: '700', color: isActive ? '#ffffff' : 'rgba(255,255,255,0.85)' }}
              >
                {vertical.name.replace('Hello Parth ', '')}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  if (embedded) {
    return tabsRow;
  }

  return (
    <View style={{ position: 'relative', zIndex: 10, width: '100%', backgroundColor: verticalTheme.theme }}>
      {!tabsOnly && (
        <View style={{ position: 'relative', zIndex: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
          {/* Location: exactly Food's location selector (same box, icon, text sizes), so the header is the same in both apps. */}
          <Pressable onPress={onLocationClick} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            {({ pressed }) => (
              <>
                <View style={{ padding: 6, transform: [{ scale: pressed ? 0.95 : 1 }] }}>
                  <MapPin size={16} color="rgba(255,255,255,0.9)" fill="rgba(255,255,255,0.2)" />
                </View>
                {/* Always white: this header is always the brand's dark colour, independent of the app light/dark theme. */}
                <View style={{ flexDirection: 'column', minWidth: 0, flexShrink: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 15, lineHeight: 20, fontWeight: '900', color: '#ffffff', flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.05)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }}
                    >
                      {displayTitle}
                    </Text>
                    <ChevronDown size={12} color="rgba(255,255,255,0.7)" />
                  </View>
                  {displaySubtitle ? (
                    <Text numberOfLines={1} style={{ fontSize: 10, lineHeight: 12.5, fontWeight: '500', marginTop: 2, color: 'rgba(255,255,255,0.8)' }}>
                      {displaySubtitle}
                    </Text>
                  ) : null}
                </View>
              </>
            )}
          </Pressable>

          {/* Bell, wallet and profile avatar — same trio and sizes as Food's header. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <Pressable
              onPress={() => navigate(notificationsPath)}
              accessibilityLabel="Notifications"
              style={({ pressed }) => ({ position: 'relative', alignItems: 'center', justifyContent: 'center', padding: 6, transform: [{ scale: pressed ? 0.9 : 1 }] })}
            >
              <Bell size={24} strokeWidth={2} color="#ffffff" />
              {notificationCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: 15,
                    height: 15,
                    backgroundColor: '#4ade80',
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.8)',
                    zIndex: 10,
                    shadowColor: '#000',
                    shadowOpacity: 0.1,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 8, lineHeight: 10, fontWeight: '600' }}>
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => navigate(walletPath)}
              onPressIn={warmWallet}
              accessibilityLabel="Wallet"
              style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', padding: 6, transform: [{ scale: pressed ? 0.9 : 1 }] })}
            >
              <Wallet size={26} strokeWidth={2.2} color="#ffffff" />
            </Pressable>

            <Pressable
              onPress={() => navigate(profilePath)}
              onPressIn={() => {
                if (isTaxi) preloadTaxiTab(profilePath);
              }}
              accessibilityLabel="Profile"
              style={({ pressed }) => ({
                height: 36,
                width: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 18,
                overflow: 'hidden',
                borderWidth: 1.5,
                borderColor: '#ffffff',
                backgroundColor: '#FFF5E6',
                transform: [{ scale: pressed ? 0.95 : 1 }],
              })}
            >
              <AppImage
                src={!avatarBroken && profileImage ? profileImage : DEFAULT_AVATAR}
                fallback={DEFAULT_AVATAR}
                accessibilityLabel="Profile"
                style={{ height: '100%', width: '100%' }}
                contentFit="cover"
                onError={() => setAvatarBroken(true)}
              />
            </Pressable>
          </View>
        </View>
      )}

      {tabsRow}
    </View>
  );
}
