import React, { useState, useEffect, useRef } from 'react';
import { Animated as RNAnimated, Easing as RNEasing, Pressable, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { MapPin, ChevronDown, Search, Mic, Wallet, Utensils, Soup, Bell } from 'lucide-react-native';
import { Link, useLocation, useNavigate } from '@/lib/router';
import { useProfile } from "@food/context/ProfileContext";
import useNotificationInbox from "@food/hooks/useNotificationInbox";
import VoiceSearchOverlay from "@food/components/user/VoiceSearchOverlay";
import { useVoiceSearch } from "@food/hooks/useVoiceSearch";
import { isModuleAuthenticated } from "@food/utils/auth";
import { prefetchWallet } from "@/shared/utils/walletPrefetch.js";
import SuperAppHomeHeader from "@/shared/components/SuperAppHomeHeader";
import { getAppRoutePath } from '@/shared/utils/nativeShell';
import { AppImage, Text } from '@/native/ui';
import { alpha, colors, makeStyles, radius, shadow, sp } from '@/theme';

// Images for banner - exactly as in FestBanner.jsx
const bannerImages = {
  nonVeg: [
    "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1544025162-d76694265947?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=500&h=500&fit=crop",
  ],
  veg: [
    "https://images.unsplash.com/photo-1585238341267-1cfec2046a55?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&h=500&fit=crop",
    "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&h=500&fit=crop",
  ]
};

const PROFILE_AVATAR = "/assets/images/profile_avatar.webp";

/** Session-level preload so rotation never re-hits the network for the same URLs */
const preloadedBannerPools = new Set();
function preloadBannerPool(pool, poolKey) {
  if (!pool?.length || preloadedBannerPools.has(poolKey)) return;
  preloadedBannerPools.add(poolKey);
  ExpoImage.prefetch(pool, 'memory-disk').catch(() => {});
}

// framer-motion enter / exit of the three rotating food images (spring ~0.8 s)
const spring = Easing.out(Easing.back(1.3));
const enterLeft = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: -100 }, { translateY: 0 }, { rotate: '-45deg' }, { scale: 0.5 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '-15deg' }, { scale: 1 }], easing: spring },
}).duration(800);
const exitLeft = new Keyframe({
  0: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '-15deg' }, { scale: 1 }] },
  100: { opacity: 0, transform: [{ translateX: -100 }, { translateY: 0 }, { rotate: '-45deg' }, { scale: 0.5 }] },
}).duration(800);
const enterRight = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 100 }, { translateY: 0 }, { rotate: '45deg' }, { scale: 0.5 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '15deg' }, { scale: 1 }], easing: spring },
}).duration(800);
const exitRight = new Keyframe({
  0: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '15deg' }, { scale: 1 }] },
  100: { opacity: 0, transform: [{ translateX: 100 }, { translateY: 0 }, { rotate: '45deg' }, { scale: 0.5 }] },
}).duration(800);
const enterCenter = new Keyframe({
  0: { opacity: 0, transform: [{ translateX: 0 }, { translateY: 100 }, { rotate: '0deg' }, { scale: 0.5 }] },
  100: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }, { scale: 1 }], easing: spring },
}).duration(800);
const exitCenter = new Keyframe({
  0: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '0deg' }, { scale: 1 }] },
  100: { opacity: 0, transform: [{ translateX: 0 }, { translateY: 50 }, { rotate: '0deg' }, { scale: 0.5 }] },
}).duration(800);

// placeholder text swap: y 10 -> 0 in, 0 -> -10 out (0.2 s)
const placeholderIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 10 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(200);
const placeholderOut = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: -10 }] },
}).duration(200);

/** y: [0, -bob, 0] (or rotate [0, 5, -5, 0]) forever, like the web's repeat: Infinity transitions */
function useLoop(duration, delay = 0) {
  const v = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    let loop = null;
    const id = setTimeout(() => {
      loop = RNAnimated.loop(RNAnimated.timing(v, { toValue: 1, duration, easing: RNEasing.inOut(RNEasing.ease), useNativeDriver: true }));
      loop.start();
    }, delay);
    return () => {
      clearTimeout(id);
      loop?.stop();
    };
  }, [v, duration, delay]);
  return v;
}

function Sparks({ lastWhite, top }) {
  return (
    <View style={{ position: 'absolute', top, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 2 }}>
      <View style={{ width: 2, height: 8, backgroundColor: '#fff200', borderRadius: 9999, transform: [{ rotate: '-20deg' }] }} />
      <View style={{ width: 2, height: 10, backgroundColor: '#fff200', borderRadius: 9999 }} />
      <View style={{ width: 2, height: 8, backgroundColor: lastWhite ? colors.white : '#fff200', borderRadius: 9999, transform: [{ rotate: '20deg' }] }} />
    </View>
  );
}

function Wave({ bottom }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, height: 6, ...(bottom ? { bottom: -6 } : { top: -6 }) }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 10" preserveAspectRatio="none">
        <Path d={bottom ? "M0 5 Q 25 10, 50 5 T 100 5" : "M0 5 Q 25 0, 50 5 T 100 5"} fill="none" stroke="#fff200" strokeWidth="2" opacity={0.6} />
      </Svg>
    </View>
  );
}

function FoodTrio({ vegMode, imgIndex, displayImages, side, center, gap, bob, s }) {
  const leftY = useLoop(3500);
  const rightY = useLoop(4000, 400);
  const centerRot = useLoop(6000);
  const bobY = (v) => v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -bob, 0] });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap, height: center, width: '100%' }}>
      <RNAnimated.View style={{ width: side, height: side, zIndex: 10, transform: [{ translateY: bobY(leftY) }] }}>
        <Animated.View key={`img-left-${vegMode}-${imgIndex}`} entering={enterLeft} exiting={exitLeft} style={[s.slotFill, { transform: [{ rotate: '-15deg' }] }]}>
          <AppImage src={displayImages[0]} style={[s.sideImg, { transform: [{ rotate: '12deg' }] }]} contentFit="cover" transition={0} />
        </Animated.View>
      </RNAnimated.View>

      <RNAnimated.View
        style={{
          width: center,
          height: center,
          zIndex: 30,
          transform: [{ rotate: centerRot.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: ['0deg', '5deg', '-5deg', '0deg'] }) }],
        }}
      >
        <Animated.View key={`img-center-${vegMode}-${imgIndex}`} entering={enterCenter} exiting={exitCenter} style={s.slotFill}>
          <AppImage src={displayImages[1]} style={s.centerImg} contentFit="cover" transition={0} />
        </Animated.View>
      </RNAnimated.View>

      <RNAnimated.View style={{ width: side, height: side, zIndex: 10, transform: [{ translateY: bobY(rightY) }] }}>
        <Animated.View key={`img-right-${vegMode}-${imgIndex}`} entering={enterRight} exiting={exitRight} style={[s.slotFill, { transform: [{ rotate: '15deg' }] }]}>
          <AppImage src={displayImages[2]} style={[s.sideImg, { backgroundColor: colors.white, transform: [{ rotate: '-12deg' }] }]} contentFit="cover" transition={0} />
        </Animated.View>
      </RNAnimated.View>
    </View>
  );
}

function VegToggle({ vegMode, onToggle }) {
  const x = useRef(new RNAnimated.Value(vegMode ? 24 : 2)).current;
  useEffect(() => {
    RNAnimated.spring(x, { toValue: vegMode ? 24 : 2, stiffness: 500, damping: 30, useNativeDriver: true }).start();
  }, [vegMode, x]);
  return (
    <Pressable
      onPress={onToggle}
      style={{
        width: 44,
        height: 20,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: alpha(colors.white, 0.2),
        backgroundColor: vegMode ? '#48c479' : alpha(colors.gray[500], 0.6),
        ...shadow.lg,
      }}
    >
      <RNAnimated.View
        style={{ position: 'absolute', top: 1, width: 16, height: 16, borderRadius: 9999, backgroundColor: colors.white, ...shadow.md, transform: [{ translateX: x }] }}
      />
    </Pressable>
  );
}

export default function HomeHeader({
  location,
  handleSearchFocus,
  placeholderIndex,
  placeholders,
  vegMode = false,
  handleVegModeChange,
  vegModeToggleRef,
  handleVoiceSearchClick,
  isTabActive = true,
  // Banner Props integrated
  videoUrl = "",
  hideFoodImages = false,
  showBanner = false,
  activeVertical = "food",
  hideSearchRow = false,
}) {
  if (activeVertical === "taxi" || hideSearchRow) {
    return <SuperAppHomeHeader activeVertical="taxi" location={location} />;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return (
    <FoodHomeHeader
      location={location}
      handleSearchFocus={handleSearchFocus}
      placeholderIndex={placeholderIndex}
      placeholders={placeholders}
      vegMode={vegMode}
      handleVegModeChange={handleVegModeChange}
      vegModeToggleRef={vegModeToggleRef}
      handleVoiceSearchClick={handleVoiceSearchClick}
      isTabActive={isTabActive}
      videoUrl={videoUrl}
      hideFoodImages={hideFoodImages}
      showBanner={showBanner}
    />
  );
}

function FoodHomeHeader({
  location,
  handleSearchFocus,
  placeholderIndex,
  placeholders,
  vegMode,
  handleVegModeChange,
  vegModeToggleRef,
  handleVoiceSearchClick,
  isTabActive,
  hideFoodImages,
  showBanner,
}) {
  const s = useStyles();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { userProfile } = useProfile();
  const [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);
  const voiceSearch = useVoiceSearch((transcript) => {
    navigate(`/food/user/search?q=${encodeURIComponent(transcript)}&mode=delivery`);
    setIsVoiceOverlayOpen(false);
  });
  // Bell badge only - starts after the home screen's own requests (see shared/utils/backgroundRequests.js).
  const { unreadCount: broadcastUnread } = useNotificationInbox("user", {
    background: true,
    pollMs: 60000,
    enabled: isTabActive,
  });
  const readUnreadFromStorage = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('food_user_notifications') || '[]')
      if (!Array.isArray(saved)) return 0
      return saved.filter((n) => {
        if (n?.read) return false
        const id = String(n?.id || '')
        const title = String(n?.title || '')
        const message = String(n?.message || '')
        if (id === '1' || id === '2') return false
        if (title === 'Order Confirmed' && message.includes('#12345')) return false
        if (title === 'Special Offer' && message.includes('50% off')) return false
        return true
      }).length
    } catch { return 0 }
  }

  const [localUnread, setLocalUnread] = useState(readUnreadFromStorage);

  useEffect(() => {
    const handler = (e) => setLocalUnread(e?.detail?.count ?? readUnreadFromStorage())
    window.addEventListener('notificationsUpdated', handler)
    window.addEventListener('focus', handler)
    return () => {
      window.removeEventListener('notificationsUpdated', handler)
      window.removeEventListener('focus', handler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLocalUnread(readUnreadFromStorage())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerLocation.pathname]);

  const unreadCount = broadcastUnread + localUnread;

  // Wallet balance starts loading as soon as a finger lands on the icon (see shared/utils/walletPrefetch.js).
  const warmWallet = () => {
    if (!isModuleAuthenticated('user')) return;
    prefetchWallet('food');
  };

  // FestBanner Logic
  const [imgIndex, setImgIndex] = useState(0);
  const currentPool = vegMode ? bannerImages.veg : bannerImages.nonVeg;
  const poolKey = vegMode ? "veg" : "nonVeg";

  // Load every banner URL once per mode — animation keeps running from cache
  useEffect(() => {
    preloadBannerPool(currentPool, poolKey);
  }, [currentPool, poolKey]);

  useEffect(() => {
    if (!showBanner || !isTabActive) return undefined;
    const timer = setInterval(() => {
      setImgIndex(prev => (prev + 1) % currentPool.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [currentPool.length, showBanner, isTabActive]);

  useEffect(() => {
    setImgIndex(0);
  }, [vegMode]);

  const displayImages = [
    currentPool[(imgIndex) % currentPool.length],
    currentPool[(imgIndex + 1) % currentPool.length],
    currentPool[(imgIndex + 2) % currentPool.length]
  ];

  const areaTitle = (() => {
    const area = location?.area || location?.subLocality || location?.mainTitle || location?.neighborhood;
    const city = (location?.city || "").toLowerCase();
    const state = (location?.state || "").toLowerCase();

    if (area && !/^-?\d+(\.\d+)?$/.test(area.trim())) {
      const areaLower = area.toLowerCase();
      if (areaLower !== city && areaLower !== state) {
        return area;
      }
    }

    if (location?.address && location.address !== "Select location") {
      const parts = location.address.split(',').map(p => p.trim());
      for (const part of parts) {
        const partLower = part.toLowerCase();
        if (partLower &&
          partLower !== city &&
          partLower !== state &&
          !/^-?\d/.test(part) &&
          part.length > 2) {
          return part;
        }
      }
    }

    return location?.area || location?.city || "Select Location";
  })();

  const areaSubtitle = (() => {
    const state = location?.state || "";
    const pincode = location?.pincode || "";

    if (state && pincode) return `${state}, ${pincode}`;
    if (state) return state;
    if (pincode) return pincode;

    const addr = location?.address || "";
    if (addr && addr.length > 10) {
      return addr.split(',').slice(1, 3).join(',').trim() || "Pinpoint location";
    }

    return "Pinpoint location";
  })();

  const requireLogin = () => {
    if (!isModuleAuthenticated('user')) {
      window.dispatchEvent(new CustomEvent('show-login-required'));
      return false;
    }
    return true;
  };

  return (
    <View style={s.root}>
      {/* Row 1: Location + actions (top of unified header — match Taxi header spacing) */}
      <View style={s.row1}>
        {/* Left: Location Selector */}
        <Link to="/food/user/address-selector" state={{ from: getAppRoutePath() }} style={s.locLink}>
          {({ pressed }) => (
            <>
              <View style={[s.pinBox, pressed && { transform: [{ scale: 0.95 }] }]}>
                <MapPin size={16} color={alpha(colors.white, 0.9)} fill={alpha(colors.white, 0.2)} />
              </View>
              <View style={{ minWidth: 0, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp(1) }}>
                  <Text numberOfLines={1} style={s.areaTitle}>{areaTitle}</Text>
                  <ChevronDown size={12} color={alpha(colors.white, 0.7)} />
                </View>
                <Text numberOfLines={1} style={s.areaSub}>{areaSubtitle}</Text>
              </View>
            </>
          )}
        </Link>

        {/* Right: Actions Column (Wallet, Profile, Veg Toggle) */}
        <View style={s.actions}>
          {/* Notification Bell */}
          <Pressable
            onPress={() => {
              if (requireLogin()) navigate('/food/user/notifications')
            }}
            style={({ pressed }) => [s.iconBtn, pressed && { transform: [{ scale: 0.9 }] }]}
          >
            <Bell size={24} color={colors.white} strokeWidth={2} />
            {unreadCount > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPressIn={warmWallet}
            onPress={() => {
              if (requireLogin()) navigate('/food/user/wallet', { state: { from: '/food/user' } });
            }}
            style={({ pressed }) => [s.iconBtn, pressed && { transform: [{ scale: 0.9 }] }]}
          >
            <Wallet size={26} color={colors.white} strokeWidth={2.2} />
          </Pressable>

          {/* Profile Photo - Increased size for better clarity */}
          <Pressable
            onPress={() => {
              if (requireLogin()) navigate('/food/user/profile', { state: { from: routerLocation.pathname } });
            }}
            style={({ pressed }) => [s.avatar, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <AppImage src={userProfile?.profileImage || PROFILE_AVATAR} fallback={PROFILE_AVATAR} style={s.avatarImg} contentFit="cover" />
          </Pressable>
        </View>
      </View>

      {/* Row 2: Hello Parth Food / Taxi tabs */}
      <SuperAppHomeHeader activeVertical="food" tabsOnly embedded location={location} />

      {/* Below tabs: fixed 255px — same as Taxi SuperAppHero */}
      <View style={s.block}>
        {/* Search + Veg toggle */}
        <View style={s.searchRow}>
          <Pressable onPress={handleSearchFocus} style={({ pressed }) => [s.search, pressed && { transform: [{ scale: 0.98 }] }]}>
            <Search size={20} color="#DC2626" strokeWidth={3} style={{ marginRight: sp(2) }} />

            <View style={s.placeholderBox}>
              <Animated.View key={placeholderIndex} entering={placeholderIn} exiting={placeholderOut} style={s.placeholderAnim}>
                <Text numberOfLines={1} style={s.placeholderText}>
                  {placeholders?.[placeholderIndex] || 'Search'}
                </Text>
              </Animated.View>
            </View>

            <Pressable
              hitSlop={8}
              onPress={() => {
                voiceSearch.clearError();
                void voiceSearch.startListening();
                setIsVoiceOverlayOpen(true);
                handleVoiceSearchClick?.();
              }}
              style={s.micBox}
            >
              <Mic size={20} color={colors.gray[400]} />
            </Pressable>
          </Pressable>

          <VoiceSearchOverlay
            isOpen={isVoiceOverlayOpen}
            onClose={() => {
              voiceSearch.stopListening();
              setIsVoiceOverlayOpen(false);
            }}
            onSearchResult={(transcript) => {
              navigate(`/food/user/search?q=${encodeURIComponent(transcript)}&mode=delivery`);
            }}
            voiceSearch={voiceSearch}
            autoStart={false}
          />

          <View ref={vegModeToggleRef} collapsable={false} style={s.vegCol}>
            <Text style={s.vegLabel}>Veg Mode</Text>
            <VegToggle vegMode={vegMode} onToggle={() => handleVegModeChange?.(!vegMode)} />
          </View>
        </View>

        {/* Fest promo — title, pill & animation fill space below search */}
        {showBanner && (
          <View style={s.fest}>
            {!hideFoodImages && (
              <>
                <TitlePop key={vegMode ? 'veg-title' : 'nonveg-title'}>
                  <Text style={s.festTitle}>{vegMode ? 'VEGGIE DELIGHT' : 'FLAVOUR FEST'}</Text>
                </TitlePop>

                <View style={s.pill}>
                  <View>
                    <Sparks top={-10} />
                    <Utensils size={20} color="#fff200" />
                  </View>

                  <View style={{ paddingHorizontal: sp(2) }}>
                    <Wave />
                    <Text numberOfLines={1} style={s.pillText}>
                      {vegMode ? 'Pure Veg Magic!' : 'Good Food, Great Mood!'}
                    </Text>
                    <Wave bottom />
                  </View>

                  <View>
                    <Sparks top={-10} lastWhite />
                    <Soup size={24} color="#fff200" />
                  </View>
                </View>

                <FoodTrio vegMode={vegMode} imgIndex={imgIndex} displayImages={displayImages} side={52} center={72} gap={sp(3)} bob={5} s={s} />
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/** spring scale 0.8 -> 1 + fade in, re-run when the key (veg / non-veg title) changes */
function TitlePop({ children }) {
  const v = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    RNAnimated.spring(v, { toValue: 1, damping: 10, stiffness: 100, useNativeDriver: true }).start();
  }, [v]);
  return (
    <RNAnimated.View style={{ opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
      {children}
    </RNAnimated.View>
  );
}

const useStyles = makeStyles(() => ({
  root: { zIndex: 10, width: '100%', paddingBottom: sp(2), overflow: 'hidden' },
  row1: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(2) },
  locLink: { flexDirection: 'row', alignItems: 'center', gap: sp(2), minWidth: 0, flex: 1, zIndex: 50 },
  pinBox: { backgroundColor: alpha(colors.white, 0.1), padding: sp(1.5), borderRadius: radius.xl },
  areaTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '900',
    color: colors.white,
    flexShrink: 1,
    textShadowColor: alpha(colors.black, 0.15),
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  areaSub: { fontSize: 10, lineHeight: 12, fontWeight: '500', color: alpha(colors.white, 0.8), marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: sp(3), flexShrink: 0 },
  iconBtn: { alignItems: 'center', justifyContent: 'center', padding: sp(1.5) },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 15,
    height: 15,
    backgroundColor: colors.green[400],
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    zIndex: 10,
    ...shadow.DEFAULT,
  },
  badgeText: { fontSize: 8, lineHeight: 9, fontWeight: '600', color: colors.white },
  avatar: { height: 36, width: 36, borderRadius: 9999, borderWidth: 1.5, borderColor: colors.white, overflow: 'hidden', backgroundColor: '#FFF5E6' },
  avatarImg: { width: '100%', height: '100%' },
  block: { height: 255, flexDirection: 'column', overflow: 'hidden', paddingHorizontal: sp(4), paddingBottom: sp(2), paddingTop: sp(2.5) },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), flexShrink: 0 },
  search: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderWidth: 1,
    borderColor: alpha(colors.black, 0.05),
    ...shadow.xl,
  },
  placeholderBox: { flex: 1, overflow: 'hidden', height: 20 },
  placeholderAnim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' },
  placeholderText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.gray[400] },
  micBox: { flexDirection: 'row', alignItems: 'center', gap: sp(3), paddingLeft: sp(3), borderLeftWidth: 1, borderLeftColor: colors.gray[100], marginLeft: sp(1) },
  vegCol: { alignItems: 'center', gap: sp(1), flexShrink: 0 },
  vegLabel: {
    fontSize: 9,
    lineHeight: 9,
    fontWeight: '900',
    color: colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    textShadowColor: alpha(colors.black, 0.25),
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  fest: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', paddingTop: sp(5) },
  festTitle: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '900',
    color: colors.white,
    fontStyle: 'italic',
    textTransform: 'uppercase',
    textAlign: 'center',
    // -webkit-text-stroke: 1px #5a0000 (+ drop-shadow-md)
    textShadowColor: '#5a0000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    paddingHorizontal: sp(4),
    paddingVertical: sp(1),
    backgroundColor: alpha(colors.white, 0.1),
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    ...shadow.xl,
  },
  pillText: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.white,
    textShadowColor: alpha(colors.black, 0.25),
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  slotFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sideImg: { width: '100%', height: '100%', borderRadius: radius['2xl'], borderWidth: 3, borderColor: colors.white, ...shadow['2xl'] },
  centerImg: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.white,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 27,
    shadowOffset: { width: 0, height: 22 },
  },
}));
