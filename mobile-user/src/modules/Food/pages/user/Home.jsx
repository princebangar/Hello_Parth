// Food home ("delivery" / "takeaway" main tab, kept alive by MainTabKeepAlive). Native conversion of the web Home:
// same requests, caches, filters, veg-mode flow and states. The page scrolls in its own FlatList (restaurant cards
// are the list items, everything above them is the list header); fixed web layers (sticky header, popups, toasts,
// sticky cart, live order strip) are siblings of the list.
import { useBottomNavSpace } from '@/native/ui/useBottomNavSpace';
import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
  startTransition,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  UIManager,
  View,
} from "react-native";
import ReAnimated, { Keyframe } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { StatusBarScrim } from "@/native/ui/StatusBarScrim";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import {
  Star,
  Clock,
  MapPin,
  Search,
  Flame,
  ShoppingBag,
  ShoppingCart,
  Mic,
  SlidersHorizontal,
  Bookmark,
  BadgePercent,
  X,
  ArrowDownUp,
  Timer,
  ShieldCheck,
  IndianRupee,
  UtensilsCrossed,
  AlertCircle,
  Plus,
  Check,
  Zap,
} from "lucide-react-native";
import { useSearchParams, Link, useNavigate, useLocation as useRouterLocation } from "@/lib/router";
import VoiceSearchOverlay from "@food/components/user/VoiceSearchOverlay";
import { useVoiceSearch } from "@food/hooks/useVoiceSearch";
import StickyCartCard from "@food/components/user/StickyCartCard";
import OrderTrackingCard from "@food/components/user/OrderTrackingCard";
import {
  CategoryChipRowSkeleton,
  HeroBannerSkeleton,
  LoadingSkeletonRegion,
  RestaurantGridSkeleton,
} from "@food/components/ui/loading-skeletons";
import { useProfile } from "@food/context/ProfileContext";
import { isModuleAuthenticated } from "@food/utils/auth";
import { isNonVegCategoryScope } from "@food/utils/vegMode";
import { useCart } from "@food/context/CartContext";
import {
  useSearchOverlay,
  useLocationSelector,
} from "@food/components/user/UserLayout";
import { getAppRoutePath } from '@/shared/utils/nativeShell';
import { Sheet, AppImage, Text, TextInput } from "@/native/ui";
import { alpha, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme";

const debugLog = (..._args) => { };
const debugWarn = (..._args) => { };
const debugError = (..._args) => { };

// Import shared food images - prevents duplication
import { foodImages } from "@food/constants/images";

import { useLocation, resolveServiceCity } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";
import { publicGetOnce, restaurantAPI, adminAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import OptimizedImage from "@food/components/OptimizedImage";
import RestaurantImageCarousel from "@food/components/user/RestaurantImageCarousel";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import { compareRestaurantsByAvailabilityAndDistance } from "@food/utils/restaurantBrowseSort";
import { normalizeImageUrl as normalizeServerImageUrl } from "@food/utils/common";
import {
  saveBrowseScroll,
  peekBrowseScroll,
  consumeBrowseScroll,
  restoreBrowseScroll,
  registerBrowseScroller,
  setActiveBrowseScroller,
  reportBrowseScroll,
  notifyBrowseUserIntent,
} from "@food/utils/browseScrollMemory";
import { toFoodUserPath, getRestaurantRouteId } from "@food/utils/mainTabRoutes";
import {
  getCachedExploreIcons,
  setCachedExploreIcons,
  isExploreIconsCacheFresh,
} from "@food/utils/foodPageCache";
import HomeHeader from "@food/components/user/home/HomeHeader";
import QuickSection from "@food/components/user/home/QuickSection";

// Explore More Icons
import exploreOffers from "@food/assets/explore more icons/offers.png";
import exploreGourmet from "@food/assets/explore more icons/gourmet.png";
import exploreCollection from "@food/assets/explore more icons/collection.png";
import useMyStoreEnabled from "@/shared/hooks/useMyStoreEnabled.js";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const BRAND_RED = "#DC2626";
const HOME_BANNER_RED = "#9A1809"; // .home-red-banner-bg
const PROFILE_AVATAR = "/assets/images/profile_avatar.webp";
// shadcn CSS variables used by the web Button / Input defaults (global.css)
const brandInputColor = "#f2f0ea";
const brandBorderColor = "#e6e0d1";

// The web warmed the browser cache with new Image(); natively expo-image prefetches into its disk cache.
function preloadImageUrls(urls = []) {
  const list = (urls || []).filter((src) => typeof src === "string" && /^https?:/i.test(src));
  if (list.length) ExpoImage.prefetch(list, "memory-disk").catch(() => {});
}

// Persistence for back-navigation and refresh speed
const getSessionCache = (key) => {
  try {
    const cached = sessionStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
  } catch (e) { return null; }
};
const setSessionCache = (key, data) => {
  try { sessionStorage.setItem(key, JSON.stringify(data)); } catch (e) { }
};

// v2: added foodTypeScope field — old cache entries without it must be dropped
const HOME_CATEGORIES_CACHE_KEY = 'food_home_categories_v2';
let HOME_RESTAURANTS_CACHE = getSessionCache('food_home_restaurants');
let HOME_CATEGORIES_CACHE = getSessionCache(HOME_CATEGORIES_CACHE_KEY);

// Hero banners: kept per delivery zone, like the lists above, so a refresh shows them at once and updates quietly.
const HOME_BANNERS_CACHE_KEY = 'food_home_hero_banners_v1';
let HOME_BANNERS_CACHE = getSessionCache(HOME_BANNERS_CACHE_KEY); // { zoneId, list }
const getCachedBanners = (zoneId) => {
  const wanted = String(zoneId || '');
  return HOME_BANNERS_CACHE && String(HOME_BANNERS_CACHE.zoneId || '') === wanted && Array.isArray(HOME_BANNERS_CACHE.list) && HOME_BANNERS_CACHE.list.length > 0
    ? HOME_BANNERS_CACHE.list
    : null;
};
const bannerImagesFromList = (list) =>
  (Array.isArray(list) ? list : []).map((b) => (b && typeof b.imageUrl === 'string' ? b.imageUrl : '')).filter(Boolean);

const CACHED_EXPLORE_BOOT = (() => {
  try {
    const cached = getCachedExploreIcons();
    if (!cached || !isExploreIconsCacheFresh()) return null;
    preloadImageUrls(
      (cached.items || [])
        .map((it) => it.imageUrl || it.image)
        .filter(Boolean)
        .map(toExploreIconThumbUrl),
    );
    return cached;
  } catch {
    return null;
  }
})();

function toExploreIconThumbUrl(url) {
  return url;
}

/** animate-pulse gradient block */
function PulseBlock({ style, colorsList }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View pointerEvents="none" style={[style, { opacity: v, overflow: "hidden" }]}>
      <LinearGradient colors={colorsList} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

/** Explore icons: skeleton until logo paints — never show alt/label text in the icon box. */
function ExploreIconImage({ src, fallbackSrc, style }) {
  const t = useTheme();
  const localSrc = fallbackSrc || "";
  const remoteSrc = src && src !== localSrc ? src : "";
  const targetSrc = remoteSrc || localSrc || src || "";
  const [shownSrc, setShownSrc] = useState(targetSrc);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const preferred = remoteSrc || localSrc || "";
    setIsLoaded(false);
    setShownSrc(preferred);
  }, [remoteSrc, localSrc]);

  return (
    <View style={[{ width: "100%", height: "100%" }, style]}>
      {!isLoaded && (
        <PulseBlock
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, borderRadius: radius.xl }}
          colorsList={t.dark ? [colors.gray[700], colors.gray[600], colors.gray[700]] : [colors.gray[200], colors.gray[100], colors.gray[200]]}
        />
      )}
      {shownSrc ? (
        <AppImage
          src={shownSrc}
          style={{ width: "100%", height: "100%", zIndex: 10, opacity: isLoaded ? 1 : 0, borderRadius: radius.xl }}
          contentFit="contain"
          transition={150}
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            if (localSrc && shownSrc !== localSrc) {
              setIsLoaded(false);
              setShownSrc(localSrc);
              return;
            }
            // Keep skeleton rather than broken-image alt text
            setIsLoaded(false);
            setShownSrc("");
          }}
        />
      ) : null}
    </View>
  );
}

// Banner images for hero carousel - will be fetched from API

// Animated placeholder for search - moved outside component to prevent recreation
const placeholders = [
  'Search "burger"',
  'Search "biryani"',
  'Search "pizza"',
  'Search "desserts"',
  'Search "chinese"',
  'Search "thali"',
  'Search "momos"',
  'Search "dosa"',
];

const getRestaurantDisplayName = (restaurant) => {
  const nameCandidates = [
    restaurant?.name,
    restaurant?.restaurantName,
    restaurant?.restaurantName?.english,
    restaurant?.restaurantName?.value,
    restaurant?.onboarding?.step1?.restaurantName,
  ];
  const resolvedName = nameCandidates.find(
    (candidate) =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  return resolvedName ? resolvedName.trim() : "Restaurant";
};

// Symmetrical Scallop Icon Badge (with inline % vector text) to look exactly like the restaurant details page
const ScallopBadge = ({ size = 20, color = "#2563EB" }) => (
  <Svg viewBox="0 0 100 100" width={size} height={size}>
    <Path fill={color} d="M 86.29 42.78 Q 95.00 50.00 86.29 57.22 Q 91.57 67.22 80.76 70.56 Q 81.82 81.82 70.56 80.76 Q 67.22 91.57 57.22 86.29 Q 50.00 95.00 42.78 86.29 Q 32.78 91.57 29.44 80.76 Q 18.18 81.82 19.24 70.56 Q 8.43 67.22 13.71 57.22 Q 5.00 50.00 13.71 42.78 Q 8.43 32.78 19.24 29.44 Q 18.18 18.18 29.44 19.24 Q 32.78 8.43 42.78 13.71 Q 50.00 5.00 57.22 13.71 Q 67.22 8.43 70.56 19.24 Q 81.82 18.18 80.76 29.44 Q 91.57 32.78 86.29 42.78 Z" />
    <SvgText x="50" y="63" textAnchor="middle" fontSize="42" fontWeight="900" fill="white">
      %
    </SvgText>
  </Svg>
);

const formatCouponText = (coupon) => {
  if (!coupon) return "";
  const minOrderValue = Number(coupon.minOrderValue);
  const minOrderText = Number.isFinite(minOrderValue) && minOrderValue > 0 ? ` above ₹${minOrderValue}` : "";
  if (coupon.discountType === "percentage") {
    const discountPercentage = coupon.discountPercentage ?? coupon.discountValue;
    const limitText = coupon.maxDiscount ? ` up to ₹${coupon.maxDiscount}` : "";
    return `${discountPercentage}% OFF${minOrderText}${limitText}`;
  }
  const value = coupon.originalPrice || coupon.discountValue || 0;
  return `Flat ₹${value} OFF${minOrderText}`;
};

// coupon text slides down: enters from top -14, leaves to +14 (0.22 s)
const couponIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -14 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(220);
const couponOut = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: 14 }] },
}).duration(220);

// Restaurant Card Offer Carousel Component - cycles through active coupons
const RestaurantCardOfferCarousel = React.memo(({ coupons }) => {
  const s = useStyles();
  const uniqueCoupons = React.useMemo(() => {
    if (!coupons || coupons.length === 0) return [];
    const map = new Map();
    coupons.forEach(c => {
      const text = formatCouponText(c);
      if (text && !map.has(text)) {
        map.set(text, c);
      }
    });
    return Array.from(map.values());
  }, [coupons]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const couponsKey = uniqueCoupons.map(c => c.couponCode || c.code || "").join(",");

  useEffect(() => {
    if (uniqueCoupons.length <= 1) return undefined;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % uniqueCoupons.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [couponsKey, uniqueCoupons.length]);

  if (uniqueCoupons.length === 0) return null;

  // Static display if only 1 unique coupon exists to prevent layout shifting/unwanted sliding
  if (uniqueCoupons.length === 1) {
    return (
      <View style={s.couponRow}>
        <View style={s.couponIcon}>
          <ScallopBadge />
        </View>
        <View style={s.couponTextBox}>
          <Text numberOfLines={1} style={s.couponText}>{formatCouponText(uniqueCoupons[0])}</Text>
        </View>
      </View>
    );
  }

  const currentCoupon = uniqueCoupons[currentIndex] || uniqueCoupons[0];

  return (
    <View style={s.couponRow}>
      <View style={s.couponIcon}>
        <ScallopBadge />
      </View>
      <View style={s.couponTextBox}>
        <ReAnimated.View
          key={`${currentCoupon.couponCode || currentCoupon.code || currentIndex}-${currentIndex}`}
          entering={couponIn}
          exiting={couponOut}
          style={s.couponAbs}
        >
          <Text numberOfLines={1} style={s.couponText}>{formatCouponText(currentCoupon)}</Text>
        </ReAnimated.View>
      </View>
    </View>
  );
});

/** The web's shining glint: a skewed white gradient sweeping -200% -> 200% across the box, then a pause. */
function Glint({ width, duration, repeatDelay, via = 0.3 }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!width) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(repeatDelay),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, width, duration, repeatDelay]);
  if (!width) return null;
  const w = width * 1.5;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, overflow: "hidden" }}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: w,
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-2 * w, 2 * w] }) }, { skewX: "-20deg" }],
        }}
      >
        <LinearGradient colors={["transparent", alpha(colors.white, via), "transparent"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

/** Hero banner track: translateX(-index * 100%) with the web's 500 ms cubic-bezier slide, swipe + tap. */
function HeroCarousel({ slides, index, transitionEnabled, onSwipeStart, onSwipeEnd, onPress, dots }) {
  const s = useStyles();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!w) return;
    const to = -index * w;
    if (transitionEnabled) {
      Animated.timing(x, { toValue: to, duration: 500, easing: Easing.bezier(0.25, 1, 0.5, 1), useNativeDriver: true }).start();
    } else {
      x.stopAnimation();
      x.setValue(to);
    }
  }, [index, transitionEnabled, w, x]);

  const handlers = useRef({ onSwipeStart, onSwipeEnd });
  handlers.current = { onSwipeStart, onSwipeEnd };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => handlers.current.onSwipeStart?.(),
      onPanResponderRelease: (_e, g) => handlers.current.onSwipeEnd?.(g.dx, g.dy),
      onPanResponderTerminate: (_e, g) => handlers.current.onSwipeEnd?.(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const height = Math.max(w / 1.7, 180);
  return (
    <View
      style={[s.heroShell, { height: w ? height : 180 }]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      {/* Sliding Track for Banners */}
      <Animated.View style={{ flexDirection: "row", width: w * slides.length || "100%", height: "100%", transform: [{ translateX: x }] }}>
        {slides.map((image, i) => (
          <View key={`${i}-${image}`} style={{ width: w || "100%", height: "100%" }}>
            <AppImage src={image} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          </View>
        ))}
      </Animated.View>

      {/* Shining Glint Effect */}
      <Glint width={w} duration={2500} repeatDelay={5000} via={0.3} />

      {/* Clickable Overlay to Navigate */}
      <Pressable style={[StyleSheetAbs, { zIndex: 20 }]} onPress={onPress} accessibilityLabel={`Open hero banner ${index + 1}`} />

      {/* Bottom Right Carousel Pagination Dots */}
      {dots}
    </View>
  );
}

const StyleSheetAbs = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };

/** fade-in-up 0.5s with the card's index delay (first 10 cards) */
function FadeInUp({ index, children, style }) {
  const v = useRef(new Animated.Value(index < 10 ? 0 : 1)).current;
  useEffect(() => {
    if (index >= 10) return;
    Animated.timing(v, { toValue: 1, duration: 500, delay: index * 50, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** whileInView fade-up for the "Recommended For You" cards (they start in view on a phone) */
function RiseIn({ delay, children, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 350, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

function StickyVegToggle({ vegMode, onToggle }) {
  const s = useStyles();
  const x = useRef(new Animated.Value(vegMode ? 22 : 2)).current;
  useEffect(() => {
    Animated.spring(x, { toValue: vegMode ? 22 : 2, stiffness: 500, damping: 30, useNativeDriver: true }).start();
  }, [vegMode, x]);
  return (
    <Pressable onPress={onToggle} style={[s.stickyToggle, { backgroundColor: vegMode ? '#48c479' : s.stickyToggleOff.backgroundColor }]}>
      <Animated.View style={[s.stickyKnob, { transform: [{ translateX: x }] }]} />
    </Pressable>
  );
}

/** 8 expanding rings behind the 100% VEG badge */
function VegRing({ index }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop = null;
    const id = setTimeout(() => {
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2500, easing: Easing.out(Easing.ease), useNativeDriver: true }));
      loop.start();
    }, index * 150);
    return () => {
      clearTimeout(id);
      loop?.stop();
    };
  }, [v, index]);
  const s = useStyles();
  return (
    <Animated.View
      style={[
        s.vegRing,
        {
          opacity: v.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: [0, 0.4, 0.2, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 600 / 112] }) }],
        },
      ]}
    />
  );
}

function Spinner({ size, duration, reverse, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  return (
    <Animated.View
      style={[
        { position: "absolute", width: size, height: size, borderRadius: 9999, borderWidth: 4, borderColor: "transparent" },
        style,
        { transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", reverse ? "-360deg" : "360deg"] }) }] },
      ]}
    />
  );
}

/** spring pop (scale + fade) used by the popups */
function usePop(open, from = 0.8) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      v.setValue(0);
      Animated.spring(v, { toValue: 1, damping: 22, stiffness: 380, mass: 0.7, useNativeDriver: true }).start();
    }
  }, [open, v]);
  return {
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
    scale: v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }),
    v,
  };
}

export default function Home({ homeMode = null, isTabActive = true }) {
  const bottomNavSpace = useBottomNavSpace();
  const s = useStyles();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const navigate = useNavigate();
  const routerLocation = useRouterLocation();
  const hasRestoredBrowseScrollRef = useRef(false);
  const HERO_BANNER_AUTO_SLIDE_MS = 3500;
  const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [heroSearch, setHeroSearch] = useState("");
  const [takeawaySearchOpen, setTakeawaySearchOpen] = useState(false);
  const { openSearch, closeSearch, searchValue, setSearchValue } =
    useSearchOverlay();
  const { openLocationSelector } = useLocationSelector();
  const { userProfile, vegMode, setVegMode: setVegModeContext, vegModeOption, setVegModeOption, orderType, setOrderType } = useProfile();
  // homeMode lets MainTabKeepAlive mount Delivery + Takeaway Home side-by-side
  // without both instances fighting over global orderType / pathname.
  const isTakeawayPage =
    homeMode === "takeaway" ||
    (!homeMode &&
      (routerLocation.pathname === "/food/takeaway" ||
        routerLocation.pathname.startsWith("/food/takeaway/") ||
        routerLocation.pathname.startsWith("/food/user/takeaway")));
  const effectiveOrderType =
    homeMode === "takeaway" || homeMode === "delivery"
      ? homeMode
      : isTakeawayPage
        ? "takeaway"
        : orderType;

  useEffect(() => {
    if (homeMode) return;
    if (isTakeawayPage) {
      if (orderType !== "takeaway") setOrderType("takeaway");
    } else if (routerLocation.pathname.includes("/dining")) {
      if (orderType !== "dining") setOrderType("dining");
    } else {
      // Default home paths set back to delivery if they were takeaway/dining
      const isHome = routerLocation.pathname === "/food/user" ||
        routerLocation.pathname === "/food/user/" ||
        routerLocation.pathname === "/user" ||
        routerLocation.pathname === "/user/" ||
        routerLocation.pathname === "/food" ||
        routerLocation.pathname === "/food/";
      if (isHome && orderType !== "delivery") {
        setOrderType("delivery");
      }
    }
  }, [homeMode, isTakeawayPage, routerLocation.pathname, orderType, setOrderType]);

  useEffect(() => {
    if (!isTakeawayPage) {
      setTakeawaySearchOpen(false);
      setHeroSearch("");
    }
  }, [isTakeawayPage]);

  const [prevVegMode, setPrevVegMode] = useState(vegMode);
  const [showVegModePopup, setShowVegModePopup] = useState(false);
  const [showSwitchOffPopup, setShowSwitchOffPopup] = useState(false);
  const [isApplyingVegMode, setIsApplyingVegMode] = useState(false);
  const [isSwitchingOffVegMode, setIsSwitchingOffVegMode] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0, triangleLeft: 0 });
  const vegModeToggleRef = useRef(null); // the toggle in the home header
  const stickyVegToggleRef = useRef(null); // the one in the sticky bar (only while it shows)
  const [isStickyHeaderVisible, setIsStickyHeaderVisible] = useState(false);
  const [showStickySearch, setShowStickySearch] = useState(false);
  const scrollYRef = useRef(0);
  const listRef = useRef(null);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);
  // "categories-section" bottom inside the scroll content (the web measured it with getBoundingClientRect)
  const layoutRef = useRef({ foodY: 0, catY: 0, catH: 0 });
  const categoriesBottom = () => {
    const l = layoutRef.current;
    return l.catH ? l.foodY + l.catY + l.catH : Infinity;
  };

  const handleScrollHeader = useCallback((currentScrollY) => {
    const sectionBottom = categoriesBottom();
    if (sectionBottom === Infinity) return;
    const past = currentScrollY > sectionBottom;
    // Sticky header visibility
    setIsStickyHeaderVisible((prev) => (prev === past ? prev : past));
    setShowStickySearch((prev) => (prev === past ? prev : past));
  }, []);

  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(true);
  const [publicOffers, setPublicOffers] = useState([]);

  useEffect(() => {
    let active = true;
    const fetchOffers = async () => {
      try {
        const response = await restaurantAPI.getPublicOffers();
        if (!active) return;
        const list = response?.data?.data?.allOffers || response?.data?.allOffers || [];
        const activeOffers = list.filter((o) => {
          if (o.showInCart === false) return false;
          if (o.status && o.status !== "active") return false;
          return true;
        });
        setPublicOffers(activeOffers);
      } catch (err) {
        debugError("Error fetching public offers for Home page:", err);
      }
    };
    fetchOffers();
    return () => {
      active = false;
    };
  }, []);

  const initialZoneIdForBanners = (() => {
    try {
      return localStorage.getItem('userZoneId') || '';
    } catch {
      return '';
    }
  })();
  const [heroBannerImages, setHeroBannerImages] = useState(() => bannerImagesFromList(getCachedBanners(initialZoneIdForBanners)));
  const [heroBannersData, setHeroBannersData] = useState(() => getCachedBanners(initialZoneIdForBanners) || []); // Store full banner data with linked restaurants
  const [loadingBanners, setLoadingBanners] = useState(() => !getCachedBanners(initialZoneIdForBanners));
  const [landingCategories, setLandingCategories] = useState([]);
  const [landingExploreMore, setLandingExploreMore] = useState(
    () => CACHED_EXPLORE_BOOT?.items || [],
  );
  const [exploreMoreHeading, setExploreMoreHeading] = useState(
    () => CACHED_EXPLORE_BOOT?.heading || "Explore More",
  );
  const [festBannerImageUrl, setFestBannerImageUrl] = useState(() => {
    try { return localStorage.getItem("CACHED_FEST_BANNER") || null; }
    catch (e) { return null; }
  });
  const [festBannerTopColor, setFestBannerTopColor] = useState(() => {
    try { return localStorage.getItem("CACHED_FEST_BANNER_COLOR") || ''; } catch (e) { return ''; }
  });

  const [recommendedRestaurantIds, setRecommendedRestaurantIds] = useState([]);
  const [under250PriceLimit, setUnder250PriceLimit] = useState(250);
  const [
    recommendedRestaurantsFromSettings,
    setRecommendedRestaurantsFromSettings,
  ] = useState([]);
  const [restaurantsData, setRestaurantsData] = useState(HOME_RESTAURANTS_CACHE || []);
  const [loadingRestaurants, setLoadingRestaurants] = useState(!HOME_RESTAURANTS_CACHE || (Array.isArray(HOME_RESTAURANTS_CACHE) && HOME_RESTAURANTS_CACHE.length === 0));
  const [realCategories, setRealCategories] = useState(HOME_CATEGORIES_CACHE || []);
  const [loadingRealCategories, setLoadingRealCategories] = useState(!HOME_CATEGORIES_CACHE);
  const [menuCategories, setMenuCategories] = useState([]);
  const [loadingMenuCategories, setLoadingMenuCategories] = useState(false);
  const [restaurantDietMeta, setRestaurantDietMeta] = useState({});
  const [showAllCategoriesModal, setShowAllCategoriesModal] = useState(false);
  const [availabilityTick, setAvailabilityTick] = useState(Date.now());
  const RESTAURANTS_BATCH_SIZE = 9;
  const [visibleRestaurantCount, setVisibleRestaurantCount] = useState(() => {
    const pending = peekBrowseScroll(getAppRoutePath());
    const n = Number(pending?.visibleCount);
    if (Number.isFinite(n) && n > RESTAURANTS_BATCH_SIZE) {
      return Math.floor(n);
    }
    return RESTAURANTS_BATCH_SIZE;
  });
  // Only the first few restaurant cards are built in the opening frame (they are the heavy part of this screen); the
  // rest follow right after it has painted, so opening Food - above all coming back from Taxi - is not held up by them.
  const [firstPaintLimit, setFirstPaintLimit] = useState(() => (visibleRestaurantCount > RESTAURANTS_BATCH_SIZE ? Infinity : 3));
  useEffect(() => {
    if (firstPaintLimit === Infinity) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setFirstPaintLimit(Infinity));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [firstPaintLimit]);
  const publicCategoriesCacheRef = useRef(new Map());
  const publicCategoriesInFlightRef = useRef(new Map());
  const isHandlingSwitchOff = useRef(false);
  const slugifyCategory = useCallback(
    (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    [],
  );

  // Stable list of restaurant ids for menu-category union so we don't refetch menus
  // when `restaurantsData` changes for reasons like distance recalculation or outletTimings enrichment.
  const menuUnionRestaurantIdsKey = useMemo(() => {
    if (!Array.isArray(restaurantsData) || restaurantsData.length === 0) return "";
    return restaurantsData
      .map((r) => String(r?.restaurantId || r?.id || "").trim())
      .filter(Boolean)
      .sort()
      .join(",");
  }, [restaurantsData]);

  const normalizeImageUrl = useCallback(
    (imageUrl) => normalizeServerImageUrl(imageUrl, BACKEND_ORIGIN),
    [BACKEND_ORIGIN],
  );

  const extractImageFromValue = useCallback(
    (value) => {
      if (!value) return "";

      if (typeof value === "string") {
        return normalizeImageUrl(value);
      }

      if (typeof value === "object") {
        const candidate =
          value.url ||
          value.secure_url ||
          value.imageUrl ||
          value.imageURL ||
          value.image ||
          value.src ||
          value.path ||
          value.location ||
          value.link ||
          value.href ||
          "";
        return typeof candidate === "string"
          ? normalizeImageUrl(candidate)
          : "";
      }

      return "";
    },
    [normalizeImageUrl],
  );

  const buildRestaurantImageCandidates = useCallback(
    (value) => {
      const normalized = extractImageFromValue(value);
      if (!normalized) return [];
      return [normalized];
    },
    [extractImageFromValue],
  );

  const extractImages = useCallback(
    (source) => {
      if (!source) return [];

      const normalizedImages = (Array.isArray(source)
        ? source.flatMap((entry) => buildRestaurantImageCandidates(entry))
        : buildRestaurantImageCandidates(source)
      )
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean);

      // De-duplicate image urls while preserving order.
      return normalizedImages.filter(
        (value, index) => normalizedImages.indexOf(value) === index,
      );
    },
    [buildRestaurantImageCandidates],
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setAvailabilityTick(Date.now());
    }, 60000);

    return () => clearInterval(intervalId);
  }, []);

  // Global admin > Customization Settings > My Store
  const myStoreEnabled = useMyStoreEnabled();

  // Merge API explore items with fallback to ensure all 4 cards are shown
  const finalExploreItems = useMemo(() => {
    const allItems = [
      {
        id: "my-store",
        label: "My Store",
        // No bundled icon: only the one uploaded in admin, with the skeleton until it has loaded
        image: "",
        fallbackImage: "",
        href: "/food/user/my-store",
      },
      {
        id: "under-250",
        label: "Under 250",
        // Local asset always used for first paint; remote admin icon swaps in when ready
        image: exploreOffers,
        fallbackImage: exploreOffers,
        href: "/food/user/under-250",
      },
      {
        id: "offers",
        label: "Offers",
        image: exploreOffers,
        fallbackImage: exploreOffers,
        href: "/food/user/offers",
      },
      {
        id: "gourmet",
        label: "Gourmet",
        image: exploreGourmet,
        fallbackImage: exploreGourmet,
        href: "/food/user/gourmet",
      },
      {
        id: "collection",
        label: "Collections",
        image: exploreCollection,
        fallbackImage: exploreCollection,
        href: "/food/user/profile/favorites",
      },
    ];

    // Global admin can switch My Store off: then Explore More is the original four icons.
    const fallback = myStoreEnabled ? allItems : allItems.filter((item) => item.id !== "my-store");

    if (!landingExploreMore || landingExploreMore.length === 0) return fallback;

    return fallback.map((item) => {
      const itemLabel = item.label.toLowerCase();
      const apiItem = landingExploreMore.find((ai) => {
        const label = String(ai.label || ai.name || "").toLowerCase().trim();
        const linkType = String(ai.linkType || "").toLowerCase().trim();
        const link = String(ai.link || ai.targetPath || "").toLowerCase();
        return (
          label === itemLabel ||
          linkType === item.id ||
          link.includes(item.id) ||
          (item.id === "under-250" &&
            (label.includes("under 250") ||
              label.includes("under-250") ||
              label.includes("under ₹250") ||
              label.includes("under rs")))
        );
      });
      if (apiItem) {
        const href = apiItem.link
          ? apiItem.link.startsWith("/")
            ? apiItem.link
            : `/${apiItem.link}`
          : item.href;
        const remote =
          toExploreIconThumbUrl(
            normalizeImageUrl(apiItem.imageUrl || apiItem.iconUrl || apiItem.image || "") ||
              "",
          ) || "";
        return {
          ...item,
          // Keep bundled PNG as fallbackImage forever; remote only via image when different
          image: remote || item.image,
          fallbackImage: item.fallbackImage,
          href,
        };
      }
      return item;
    });
  }, [landingExploreMore, normalizeImageUrl, myStoreEnabled]);
  // More than four icons don't fit in one row on a phone: the row slides sideways instead.
  const exploreSlides = finalExploreItems.length > 4;

  // Warm Explore thumbs as soon as URLs are known
  useEffect(() => {
    preloadImageUrls(finalExploreItems.map((item) => item.image).filter(Boolean));
  }, [finalExploreItems]);

  const normalizedLandingCategories = useMemo(() => {
    return (landingCategories || []).map((category, index) => ({
      id: category.id || category._id || `landing-category-${index}`,
      name: category.label || category.name || "Category",
      image:
        normalizeImageUrl(category.imageUrl || category.image) ||
        foodImages[index % foodImages.length] ||
        foodImages[0],
      slug:
        category.slug || slugifyCategory(category.label || category.name || ""),
      label: category.label || category.name || "Category",
    }));
  }, [landingCategories, normalizeImageUrl, slugifyCategory]);

  const displayCategories = useMemo(() => {
    const filterByVeg = (cats) => {
      if (!vegMode) return cats;
      return cats.filter((cat) => !isNonVegCategoryScope(cat));
    };
    if (realCategories.length > 0) return filterByVeg(realCategories);
    if (menuCategories.length > 0) return filterByVeg(menuCategories);
    return filterByVeg(normalizedLandingCategories);
  }, [menuCategories, realCategories, normalizedLandingCategories, vegMode]);

  useEffect(() => {
    preloadImageUrls(
      (displayCategories || [])
        .slice(0, 12)
        .map((cat) => cat.image)
        .filter(Boolean),
    );
  }, [displayCategories]);

  // Swipe functionality for hero banner carousel
  const isSwiping = useRef(false);
  const autoSlideIntervalRef = useRef(null);

  // Sync prevVegMode when vegMode changes from context
  useEffect(() => {
    if (vegMode !== prevVegMode && !isHandlingSwitchOff.current) {
      setPrevVegMode(vegMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vegMode]);

  // Keep persisted Veg Mode preference; only reset popup UI state on mount.
  useEffect(() => {
    setPrevVegMode(vegMode);
    setShowVegModePopup(false);
    setShowSwitchOffPopup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Popup right-aligned under the veg toggle (the web read getBoundingClientRect)
  const measureVegToggle = useCallback((done) => {
    // Both toggles used to share one ref: after the sticky bar hid it was null (or pointed at a hidden view measuring
    // 0,0), and the popup opened in the top-left corner. Measure the toggle that is on screen; if a measurement still
    // comes back empty, put the popup under the header's top-right corner.
    const node = stickyVegToggleRef.current || vegModeToggleRef.current;
    const screenWidth = Dimensions.get("window").width;
    const popupWidth = Math.min(screenWidth - 32, 320);
    const fallback = () => {
      const left = screenWidth - popupWidth - 16;
      setPopupPosition({ top: insets.top + 120, left, triangleLeft: popupWidth - 36 });
      done?.();
    };
    if (!node?.measureInWindow) {
      fallback();
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (!width || !height || (x === 0 && y === 0)) {
        fallback();
        return;
      }
      const right = x + width;
      let left = right - popupWidth;
      left = Math.max(16, Math.min(left, screenWidth - popupWidth - 16));
      const triangleLeft = x + width / 2 - left;
      setPopupPosition({
        top: y + height + 10,
        left,
        triangleLeft,
      });
      done?.();
    });
  }, [insets.top]);

  // Handle vegMode toggle - show popup when turned ON or OFF
  const handleVegModeChange = (newValue) => {
    // Skip if we're handling switch off confirmation
    if (isHandlingSwitchOff.current) {
      return;
    }

    if (newValue && !prevVegMode) {
      // Veg mode was just turned ON
      measureVegToggle(() => setShowVegModePopup(true));
      // Don't update context yet - wait for user to apply or cancel
    } else if (!newValue && prevVegMode) {
      // Veg mode was just turned OFF - show switch off confirmation popup
      isHandlingSwitchOff.current = true;
      setShowSwitchOffPopup(true);
      // Don't update context yet - wait for user to confirm
    } else {
      // Normal state change - update context directly
      setVegModeContext(newValue);
      setPrevVegMode(newValue);
    }
  };

  // Keep index within current banner bounds after admin updates/reloads.
  useEffect(() => {
    setCurrentBannerIndex((prev) => {
      if (heroBannerImages.length === 0) return 0;
      return Math.min(prev, heroBannerImages.length - 1);
    });
  }, [heroBannerImages.length]);

  // Preload hero images to avoid white blink during slide transition.
  useEffect(() => {
    preloadImageUrls(heroBannerImages);
  }, [heroBannerImages]);

  const startHeroBannerAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) {
      clearInterval(autoSlideIntervalRef.current);
    }

    if (heroBannerImages.length <= 1) return;

    autoSlideIntervalRef.current = setInterval(() => {
      if (!isSwiping.current) {
        setIsTransitionEnabled(true);
        setCurrentBannerIndex((prev) => {
          if (prev >= heroBannerImages.length) return prev;
          return prev + 1;
        });
      }
    }, HERO_BANNER_AUTO_SLIDE_MS);
  }, [heroBannerImages.length, HERO_BANNER_AUTO_SLIDE_MS]);

  // Handle snap-back when reaching the cloned slide at the end
  useEffect(() => {
    if (currentBannerIndex === heroBannerImages.length && heroBannerImages.length > 1) {
      const timer = setTimeout(() => {
        setIsTransitionEnabled(false);
        setCurrentBannerIndex(0);
      }, 500); // match transition duration
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [currentBannerIndex, heroBannerImages.length]);

  // Re-enable transition after snap-back
  useEffect(() => {
    if (!isTransitionEnabled && currentBannerIndex === 0) {
      const timer = setTimeout(() => {
        setIsTransitionEnabled(true);
      }, 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isTransitionEnabled, currentBannerIndex]);

  // Auto-cycle hero banner images
  useEffect(() => {
    startHeroBannerAutoSlide();

    return () => {
      if (autoSlideIntervalRef.current) {
        clearInterval(autoSlideIntervalRef.current);
      }
    };
  }, [startHeroBannerAutoSlide]);

  // Helper function to reset auto-slide timer
  const resetAutoSlide = useCallback(() => {
    startHeroBannerAutoSlide();
  }, [startHeroBannerAutoSlide]);

  // Swipe handlers for hero banner carousel (the web's touch handlers)
  const handleSwipeStart = () => {
    isSwiping.current = true;
  };

  const handleSwipeEnd = (deltaX, deltaYRaw) => {
    if (!isSwiping.current || heroBannerImages.length === 0) return;

    const deltaY = Math.abs(deltaYRaw);
    const minSwipeDistance = 50; // Minimum distance for a swipe

    // Check if it's a horizontal swipe (not vertical scroll)
    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > deltaY) {
      if (deltaX > 0) {
        // Swipe right - go to previous image
        if (currentBannerIndex === 0) {
          setIsTransitionEnabled(false);
          setCurrentBannerIndex(heroBannerImages.length);
          setTimeout(() => {
            setIsTransitionEnabled(true);
            setCurrentBannerIndex(heroBannerImages.length - 1);
          }, 50);
        } else {
          setIsTransitionEnabled(true);
          setCurrentBannerIndex((prev) => prev - 1);
        }
      } else {
        // Swipe left - go to next image
        setIsTransitionEnabled(true);
        setCurrentBannerIndex((prev) => {
          if (prev >= heroBannerImages.length) return prev;
          return prev + 1;
        });
      }
      // Reset auto-slide timer after manual swipe
      resetAutoSlide();
    }

    // Reset swipe state after a short delay
    setTimeout(() => {
      isSwiping.current = false;
    }, 300);
  };

  const [activeFilters, setActiveFilters] = useState(new Set());
  const [sortBy, setSortBy] = useState(null); // null, 'price-low', 'price-high', 'rating-high', 'rating-low'
  const [selectedCuisine, setSelectedCuisine] = useState(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);
  const voiceSearch = useVoiceSearch((transcript) => {
    navigate(`/food/user/search?q=${encodeURIComponent(transcript)}&mode=${homeMode === "takeaway" ? "takeaway" : "delivery"}`);
    setIsVoiceOverlayOpen(false);
  });
  const [appliedFilters, setAppliedFilters] = useState({
    activeFilters: new Set(),
    sortBy: null,
    selectedCuisine: null,
  });
  const [isLoadingFilterResults, setIsLoadingFilterResults] = useState(false);
  const [activeFilterTab, setActiveFilterTab] = useState("sort");
  // Show skeletons immediately while loading — delayed toggles caused visible layout swap (CLS).
  const showBannerSkeleton = loadingBanners;
  const {
    addFavorite,
    removeFavorite,
    isFavorite,
    getFavorites,
    getDefaultAddress,
  } = useProfile();
  const { cart } = useCart();
  const { location } = useLocation();
  const {
    zoneId,
    isOutOfService,
    loading: zoneLoading,
  } = useZone(location);
  const [showToast, setShowToast] = useState(false);
  const [showManageCollections, setShowManageCollections] = useState(false);
  const [selectedRestaurantSlug, setSelectedRestaurantSlug] = useState(null);

  // Fetch hero banners from public API (no auth required)
  useEffect(() => {
    if (zoneLoading) return undefined;
    let cancelled = false;
    // Banners already on screen (from this tab's cache) stay while the fresh list is fetched.
    if (!getCachedBanners(zoneId)) setLoadingBanners(true);
    publicGetOnce("/food/hero-banners/public", zoneId ? { params: { zoneId } } : {})
      .then((response) => {
        if (cancelled) return;
        const data = response?.data?.data;
        const list = Array.isArray(data?.banners)
          ? data.banners
          : Array.isArray(data)
            ? data
            : [];
        const images = list
          .map((b) => (b && typeof b.imageUrl === "string" ? b.imageUrl : ""))
          .filter(Boolean);
        setHeroBannerImages(images);
        setHeroBannersData(list);
        setCurrentBannerIndex(0);
        HOME_BANNERS_CACHE = { zoneId: zoneId || '', list };
        setSessionCache(HOME_BANNERS_CACHE_KEY, HOME_BANNERS_CACHE);
      })
      .catch((err) => {
        if (cancelled) return;
        debugError("Failed to fetch hero banners", err);
        setHeroBannerImages([]);
        setHeroBannersData([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBanners(false);
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, zoneLoading]);

  // Old backend endpoint removed: keep UI stable with empty categories.
  useEffect(() => {
    setLoadingRealCategories(true);
    setRealCategories([]);
    setLoadingRealCategories(false);
  }, []);

  // Fetch explore icons and landing settings from public APIs
  useEffect(() => {
    if (zoneLoading) return undefined;
    let cancelled = false;
    const reqConfig = zoneId ? { params: { zoneId } } : {};
    Promise.all([
      publicGetOnce("/food/explore-icons/public", reqConfig)
        .catch(() => ({ data: { data: {} } })),
      publicGetOnce("/food/landing/settings/public", reqConfig)
        .catch(() => ({ data: { data: {} } })),
    ])
      .then(([exploreRes, settingsRes]) => {
        if (cancelled) return;
        const exploreData = exploreRes?.data?.data;
        const items = Array.isArray(exploreData?.items)
          ? exploreData.items
          : Array.isArray(exploreData)
            ? exploreData
            : [];
        const mappedItems = items.map((it) => ({
          ...it,
          imageUrl: it.imageUrl || it.iconUrl,
          label: it.label || it.name,
        }));
        setLandingExploreMore(mappedItems);
        const settings = settingsRes?.data?.data || {};
        const heading = settings.exploreMoreHeading || "Explore More";
        setExploreMoreHeading(heading);
        setRecommendedRestaurantIds(settings.recommendedRestaurantIds || []);
        setUnder250PriceLimit(Number(settings.under250PriceLimit) || 250);
        setRecommendedRestaurantsFromSettings(
          settings.recommendedRestaurants || [],
        );
        const newBannerUrl = typeof settings.festBannerImageUrl === "string" ? settings.festBannerImageUrl : "";
        const newTopColor = typeof settings.festBannerTopColor === "string" && settings.festBannerTopColor ? settings.festBannerTopColor : '';
        setFestBannerImageUrl(newBannerUrl);
        setFestBannerTopColor(newTopColor);
        try { localStorage.setItem("CACHED_FEST_BANNER", newBannerUrl); } catch (e) {}
        try { localStorage.setItem("CACHED_FEST_BANNER_COLOR", newTopColor); } catch (e) {}
        // (web: theme-color meta) — natively the header paints under the translucent status bar itself.
        setCachedExploreIcons({ items: mappedItems, heading });
        preloadImageUrls(
          mappedItems
            .map((it) => toExploreIconThumbUrl(it.imageUrl || it.image))
            .filter(Boolean),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setLandingExploreMore([]);
          setExploreMoreHeading("Explore More");
          setRecommendedRestaurantsFromSettings([]);
          setFestBannerImageUrl("");
          try { localStorage.setItem("CACHED_FEST_BANNER", ""); } catch (e) {}
        }
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, zoneLoading]);

  // Memoize cartCount to prevent recalculation on every render - use cart directly
  const cartCount = useMemo(
    () => cart.reduce((total, item) => total + (item.quantity || 0), 0),
    [cart],
  );

  const defaultSavedAddress = useMemo(
    () => getDefaultAddress?.() || null,
    [getDefaultAddress],
  );

  const defaultSavedAddressLocation = useMemo(() => {
    const coords = defaultSavedAddress?.location?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = parseFloat(coords[0]);
      const lat = parseFloat(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng };
      }
    }

    const lat = parseFloat(
      defaultSavedAddress?.latitude || defaultSavedAddress?.lat,
    );
    const lng = parseFloat(
      defaultSavedAddress?.longitude || defaultSavedAddress?.lng,
    );
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }

    return null;
  }, [defaultSavedAddress]);

  const effectiveLocation = location;
  // Prefer selected/saved delivery address for distance so home cards match cart bill.
  const distanceOrigin = useMemo(() => {
    if (
      Number.isFinite(defaultSavedAddressLocation?.latitude) &&
      Number.isFinite(defaultSavedAddressLocation?.longitude)
    ) {
      return defaultSavedAddressLocation;
    }
    if (
      Number.isFinite(effectiveLocation?.latitude) &&
      Number.isFinite(effectiveLocation?.longitude)
    ) {
      return {
        latitude: Number(effectiveLocation.latitude),
        longitude: Number(effectiveLocation.longitude),
      };
    }
    return null;
  }, [defaultSavedAddressLocation, effectiveLocation]);
  // Single zone hook — duplicate useZone(location) caused double detect + loading flicker.
  const effectiveZoneId = zoneId;

  // The zone check (a request of its own) runs on every open, but when the page already has something to show - the
  // saved lists from this tab - it must not blank them behind a skeleton while it finishes.
  const hasCategoriesToShow = Array.isArray(realCategories) && realCategories.length > 0;
  const hasRestaurantsToShow = Array.isArray(restaurantsData) && restaurantsData.length > 0;
  const showCategorySkeleton = loadingRealCategories || loadingMenuCategories || (zoneLoading && !hasCategoriesToShow);
  const showRestaurantSkeleton = isLoadingFilterResults || loadingRestaurants || (zoneLoading && !hasRestaurantsToShow);
  // While zone/restaurants are settling, never surface a real "0 restaurants" count.
  const isRestaurantsResolving =
    loadingRestaurants ||
    isLoadingFilterResults ||
    (zoneLoading && !hasRestaurantsToShow);

  // Only flip restaurant loading when the zone actually changes (not every detect flicker).
  const prevResolvedZoneIdRef = useRef(zoneId);
  useEffect(() => {
    if (zoneLoading) return;
    if (prevResolvedZoneIdRef.current === zoneId) return;
    prevResolvedZoneIdRef.current = zoneId;
    setLoadingRealCategories(true);
    setLoadingRestaurants(true);
  }, [zoneId, zoneLoading]);

  // Fetch categories (zone-aware) for the homepage category rail.
  useEffect(() => {
    if (zoneLoading) return undefined;

    let cancelled = false;
    const run = async () => {
      const zoneKey = String(zoneId || "global");
      try {
        // Dedupe repeated calls (zone settling). Cache per zoneKey and share in-flight request.
        const cached = publicCategoriesCacheRef.current.get(zoneKey);
        if (cached) {
          if (!cancelled) {
            setRealCategories(cached);
            setLoadingRealCategories(false);
          }
          return;
        }

        const inFlight = publicCategoriesInFlightRef.current.get(zoneKey);
        if (inFlight) {
          const categories = await inFlight;
          if (!cancelled) {
            setRealCategories(categories);
            setLoadingRealCategories(false);
          }
          return;
        }

        setLoadingRealCategories(true);
        const promise = (async () => {
          const res = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {});
          const list =
            res?.data?.data?.categories ||
            res?.data?.categories ||
            [];
          const categories = Array.isArray(list)
            ? list.map((cat, idx) => ({
              id: String(cat?.id || cat?._id || cat?.slug || idx),
              name: cat?.name || "",
              slug: cat?.slug || String(cat?.name || "").toLowerCase().replace(/\s+/g, "-"),
              image:
                normalizeImageUrl(cat?.image || cat?.imageUrl) ||
                foodImages[idx % foodImages.length] ||
                foodImages[0],
              type: cat?.type || "",
              foodTypeScope: cat?.foodTypeScope || "",
            }))
            : [];

          publicCategoriesCacheRef.current.set(zoneKey, categories);
          return categories;
        })();

        publicCategoriesInFlightRef.current.set(zoneKey, promise);
        const categories = await promise;
        publicCategoriesInFlightRef.current.delete(zoneKey);

        if (!cancelled) {
          setRealCategories(categories);
          HOME_CATEGORIES_CACHE = categories;
          setSessionCache(HOME_CATEGORIES_CACHE_KEY, categories);
        }
      } catch (err) {
        debugWarn("Failed to fetch categories:", err);
        if (!cancelled) setRealCategories(HOME_CATEGORIES_CACHE || []);
      } finally {
        if (!cancelled) setLoadingRealCategories(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [zoneId, zoneLoading, normalizeImageUrl]);

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("food");

  // Simple filter toggle function
  const toggleFilter = (filterId) => {
    setActiveFilters((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filterId)) {
        newSet.delete(filterId);
      } else {
        newSet.add(filterId);
      }
      return newSet;
    });
  };

  // Filter sheet: section positions for the tab rail (the web used an IntersectionObserver)
  const filterSectionY = useRef({});
  const [activeScrollSection, setActiveScrollSection] = useState("sort");
  const rightContentRef = useRef(null);
  const rightContentHeight = useRef(0);
  const restaurantsRequestSeqRef = useRef(0);
  const menuUnionRequestSeqRef = useRef(0);
  const menuUnionCacheRef = useRef(new Map());

  const onFilterScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const h = rightContentHeight.current || e.nativeEvent.layoutMeasurement.height;
    // rootMargin "-20% 0px -70% 0px": the section crossing the band 20%..30% from the top is the active one
    const bandTop = y + h * 0.2;
    const bandBottom = y + h * 0.3;
    const entries = Object.entries(filterSectionY.current);
    for (const [id, box] of entries) {
      if (box && box.y < bandBottom && box.y + box.h > bandTop) {
        if (id !== activeScrollSection) {
          setActiveScrollSection(id);
          setActiveFilterTab(id);
        }
        break;
      }
    }
  };

  // Fetch restaurants from API with filters
  const fetchRestaurants = useCallback(
    async (filters = {}) => {
      if (!effectiveZoneId) {
        setRestaurantsData([]);
        setLoadingRestaurants(false);
        return;
      }

      const requestSeq = ++restaurantsRequestSeqRef.current;
      try {
        // Soft refresh: keep cached list visible — don't flash full-page skeleton
        if (!(Array.isArray(HOME_RESTAURANTS_CACHE) && HOME_RESTAURANTS_CACHE.length > 0)) {
          setLoadingRestaurants(true);
        }

        // Build query parameters from filters
        const params = {};

        // Use saved/selected delivery address coords (same origin as cart bill).
        if (
          Number.isFinite(distanceOrigin?.latitude) &&
          Number.isFinite(distanceOrigin?.longitude)
        ) {
          params.lat = Number(distanceOrigin.latitude);
          params.lng = Number(distanceOrigin.longitude);
        }

        // Limit results for performance
        params.limit = 40;

        // Sort by
        if (filters.sortBy || sortBy) {
          params.sortBy = filters.sortBy || sortBy;
        }

        // Order Type (Takeaway/Delivery)
        if (effectiveOrderType) {
          params.orderType = effectiveOrderType;
        }

        // Cuisine
        if (filters.selectedCuisine) {
          params.cuisine = filters.selectedCuisine;
        }

        // Rating filters
        if (filters.activeFilters?.has("rating-45-plus")) {
          params.minRating = 4.5;
        } else if (filters.activeFilters?.has("rating-4-plus")) {
          params.minRating = 4.0;
        } else if (filters.activeFilters?.has("rating-35-plus")) {
          params.minRating = 3.5;
        }

        // Delivery time filters
        if (filters.activeFilters?.has("delivery-under-30")) {
          params.maxDeliveryTime = 30;
        } else if (filters.activeFilters?.has("delivery-under-45")) {
          params.maxDeliveryTime = 45;
        }

        // Distance filters
        if (filters.activeFilters?.has("distance-under-1km")) {
          params.radiusKm = 1.0;
        } else if (filters.activeFilters?.has("distance-under-2km")) {
          params.radiusKm = 2.0;
        }

        // Price filters
        if (filters.activeFilters?.has("price-under-200")) {
          params.maxPrice = 200;
        } else if (filters.activeFilters?.has("price-under-500")) {
          params.maxPrice = 500;
        }

        // Offers filter
        if (filters.activeFilters?.has("has-offers")) {
          params.hasOffers = "true";
        }

        // Trust filters
        if (filters.activeFilters?.has("top-rated")) {
          params.topRated = "true";
        } else if (filters.activeFilters?.has("trusted")) {
          params.trusted = "true";
        }

        if (effectiveZoneId) {
          params.zoneId = effectiveZoneId;
        } else {
          // Zone id vanished mid-request — keep resolving state, don't flash 0.
          setLoadingRestaurants(true);
          return;
        }

        // Zone-based delivery: do NOT filter by city name.
        const resolvedCity = resolveServiceCity({
          locality: effectiveLocation?.city || "",
          formattedAddress:
            effectiveLocation?.formattedAddress ||
            effectiveLocation?.address ||
            "",
          fallback: "",
        });
        const normalizedUserCity = String(resolvedCity || effectiveLocation?.city || "")
          .trim()
          .toLowerCase();
        const hasUsableUserCity =
          normalizedUserCity &&
          normalizedUserCity !== "current location" &&
          normalizedUserCity !== "unknown city" &&
          normalizedUserCity !== "select location";
        if (!effectiveZoneId && hasUsableUserCity) {
          params.city = resolvedCity || String(effectiveLocation.city).trim();
        }

        debugLog("Fetching restaurants with params:", params);
        const response = await restaurantAPI.getRestaurants(params);

        // If a newer request started, ignore this response to avoid races/flicker.
        if (requestSeq !== restaurantsRequestSeqRef.current) return;

        if (
          response.data &&
          response.data.success &&
          response.data.data &&
          response.data.data.restaurants
        ) {
          const restaurantsArray = response.data.data.restaurants;

          if (restaurantsArray.length === 0) {
            setRestaurantsData([]);
            if (requestSeq === restaurantsRequestSeqRef.current) {
              setLoadingRestaurants(false);
            }
            return;
          }

          const transformedRestaurants = restaurantsArray
            .filter((restaurant) => {
              if (effectiveOrderType === "takeaway" || isTakeawayPage) {
                if (!restaurant.takeawaySettings?.isEnabled && !restaurant.takeawayAvailable) {
                  return false;
                }
              }
              return true
            })
            .map((restaurant) => {
              // Use restaurant data if available, otherwise use defaults
              const deliveryTime =
                restaurant.estimatedDeliveryTime || "25-30 mins";

              // Use pre-calculated distance from backend
              const distance = restaurant.distance || null;
              const distanceInKm = Number.isFinite(Number(restaurant.distanceInKm))
                ? Number(restaurant.distanceInKm)
                : null;
              const topOrder = Number.isFinite(Number(restaurant.__topOrder ?? restaurant.topOrder))
                ? Number(restaurant.__topOrder ?? restaurant.topOrder)
                : 1000000;

              // Get first cuisine or default
              const cuisine =
                restaurant.cuisines && restaurant.cuisines.length > 0
                  ? restaurant.cuisines[0]
                  : "Multi-cuisine";

              // Legacy-safe image extraction (supports old schema variants).
              const coverImages = extractImages([
                ...(Array.isArray(restaurant.coverImages) ? restaurant.coverImages : [restaurant.coverImages]).filter(Boolean),
                restaurant.coverImage,
              ]);

              const profileImageCandidates = extractImages([
                ...buildRestaurantImageCandidates(restaurant.profileImage),
                ...buildRestaurantImageCandidates(
                  restaurant.onboarding?.step2?.profileImageUrl,
                ),
                ...buildRestaurantImageCandidates(restaurant.image),
                ...buildRestaurantImageCandidates(restaurant.imageUrl),
              ]);
              const profileImageUrl = profileImageCandidates[0] || "";

              const allImages = Array.from(
                new Set(
                  [
                    ...coverImages,
                    ...profileImageCandidates,
                  ].filter(Boolean),
                ),
              );

              // Keep single image for backward compatibility
              const image = allImages[0] || profileImageUrl || "";
              const offerText = restaurant.offer || null;

              return {
                id: restaurant.restaurantId || restaurant._id,
                mongoId: restaurant._id || null,
                name: getRestaurantDisplayName(restaurant),
                cuisine: cuisine,
                cuisines: Array.isArray(restaurant.cuisines)
                  ? restaurant.cuisines
                  : [],
                rating: Number(restaurant.rating) || 0,
                totalRatings: Number(restaurant.totalRatings) || 0,
                deliveryTime:
                  (effectiveOrderType === "takeaway" || isTakeawayPage)
                    ? (restaurant.preparationTime || "20-25 mins")
                    : (restaurant.deliveryTime ||
                      restaurant.estimatedDeliveryTime ||
                      (restaurant.estimatedDeliveryTimeMinutes
                        ? `${restaurant.estimatedDeliveryTimeMinutes} mins`
                        : deliveryTime)),
                takeawaySettings: restaurant.takeawaySettings || null,
                distance: distance,
                distanceInKm: distanceInKm, // Store numeric distance for sorting
                topOrder,
                __topOrder: topOrder,
                image: image,
                images: allImages, // Array of cover images for carousel (separate from menu images)
                priceRange: restaurant.priceRange || "$$", // Use from API or default
                featuredDish:
                  restaurant.featuredDish ||
                  (Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length > 0
                    ? restaurant.recommendedDishes[0].name
                    : (restaurant.cuisines && restaurant.cuisines.length > 0
                      ? `${restaurant.cuisines[0]} Special`
                      : "Special Dish")),
                featuredPrice: restaurant.featuredPrice ||
                  (Array.isArray(restaurant.recommendedDishes) && restaurant.recommendedDishes.length > 0
                    ? restaurant.recommendedDishes[0].price
                    : 249),
                offer: offerText,
                slug: restaurant.slug,
                restaurantId: restaurant.restaurantId,
                pureVegRestaurant: restaurant.pureVegRestaurant === true,
                location: restaurant.location, // Store location for distance recalculation
                isActive: restaurant.isActive !== false, // Default to true if not specified
                isAcceptingOrders: restaurant.isAcceptingOrders !== false, // Default to true if not specified
                openDays: Array.isArray(restaurant.openDays)
                  ? restaurant.openDays
                  : [],
                deliveryTimings: restaurant.deliveryTimings || null,
                outletTimings: restaurant.outletTimings || null,
                openingTime: restaurant.openingTime || restaurant?.deliveryTimings?.openingTime || null,
                closingTime: restaurant.closingTime || restaurant?.deliveryTimings?.closingTime || null,
                recommendedDishes: Array.isArray(restaurant.recommendedDishes) ? restaurant.recommendedDishes : [],
                hasDishes: restaurant.hasDishes === true || (restaurant.totalMenuItems > 0),
                totalMenuItems: restaurant.totalMenuItems || 0,
              };
            });

          // Commit list + end loading in the same turn so UI never paints "0" in between.
          setRestaurantsData(transformedRestaurants);
          HOME_RESTAURANTS_CACHE = transformedRestaurants;
          setSessionCache('food_home_restaurants', transformedRestaurants);
          if (requestSeq === restaurantsRequestSeqRef.current) {
            setLoadingRestaurants(false);
          }
        } else {
          debugWarn("Invalid API response structure:", response.data);
          setRestaurantsData([]);
          if (requestSeq === restaurantsRequestSeqRef.current) {
            setLoadingRestaurants(false);
          }
        }
      } catch (error) {
        debugError("Error fetching restaurants:", error);
        setRestaurantsData([]);
        if (requestSeq === restaurantsRequestSeqRef.current) {
          setLoadingRestaurants(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      extractImages,
      buildRestaurantImageCandidates,
      distanceOrigin?.latitude,
      distanceOrigin?.longitude,
      effectiveLocation?.latitude,
      effectiveLocation?.longitude,
      effectiveZoneId,
      effectiveOrderType,
      isTakeawayPage,
    ],
  );

  const applyFiltersAndRefetch = useCallback(
    async (
      nextActiveFilters = activeFilters,
      nextSortBy = sortBy,
      nextSelectedCuisine = selectedCuisine,
    ) => {
      const nextFilterState = {
        activeFilters: new Set(nextActiveFilters),
        sortBy: nextSortBy,
        selectedCuisine: nextSelectedCuisine,
      };

      setAppliedFilters(nextFilterState);
      setIsLoadingFilterResults(true);

      try {
        await fetchRestaurants(nextFilterState);
      } catch (error) {
        debugError("Error applying filters:", error);
      } finally {
        setIsLoadingFilterResults(false);
      }
    },
    [activeFilters, sortBy, selectedCuisine, fetchRestaurants],
  );

  // Fetch when filters/orderType/zone settle. Wait for zoneLoading so we never
  // skip a fetch and get stuck on "Finding Restaurants For You".
  useEffect(() => {
    if (zoneLoading) return undefined;
    if (!effectiveZoneId) {
      setRestaurantsData([]);
      setLoadingRestaurants(false);
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchRestaurants(appliedFilters);
    }, 50);
    return () => clearTimeout(timer);
  }, [appliedFilters, fetchRestaurants, effectiveOrderType, zoneLoading, effectiveZoneId]);

  // Pull to refresh: the restaurant list goes back to its skeleton while it reloads.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadingRestaurants(true);
    try {
      await fetchRestaurants(appliedFilters);
    } finally {
      setLoadingRestaurants(false);
      setRefreshing(false);
    }
  }, [fetchRestaurants, appliedFilters]);

  // IMPORTANT:
  // Homepage must NOT eagerly hit /menu for every restaurant (N+1 storm).
  // Menu meta is only needed for Veg Mode diet filtering.
  useEffect(() => {
    const restaurantIds = menuUnionRestaurantIdsKey
      ? menuUnionRestaurantIdsKey.split(",").filter(Boolean)
      : [];
    const shouldFetchMenuMeta = Boolean(vegMode);

    const fetchMenuCategories = async () => {
      const requestSeq = ++menuUnionRequestSeqRef.current;

      if (!menuUnionRestaurantIdsKey || !shouldFetchMenuMeta) {
        setMenuCategories([]);
        if (!vegMode) setRestaurantDietMeta({});
        setLoadingMenuCategories(false);
        return;
      }

      setLoadingMenuCategories(true);
      try {
        const categoryMap = new Map();
        const menuCache = menuUnionCacheRef.current;
        const menuResponses = [];

        for (let index = 0; index < restaurantIds.length; index += 4) {
          const batchIds = restaurantIds.slice(index, index + 4);
          const batchResponses = await Promise.all(
            batchIds.map(async (id) => {
              if (!id) return { id: null, menu: null };

              if (menuCache.has(id)) {
                return { id, menu: menuCache.get(id) };
              }

              try {
                const response = await restaurantAPI.getMenuByRestaurantId(id);
                const menu = response?.data?.data?.menu || null;
                menuCache.set(id, menu);
                return { id, menu };
              } catch {
                menuCache.set(id, null);
                return { id, menu: null };
              }
            }),
          );

          if (requestSeq !== menuUnionRequestSeqRef.current) return;
          menuResponses.push(...batchResponses);
        }

        if (requestSeq !== menuUnionRequestSeqRef.current) return;

        const nextDietMeta = {};

        menuResponses.forEach(({ id, menu }) => {
          let hasVeg = false;
          let hasNonVeg = false;
          const markItemDiet = (item) => {
            const foodType = String(item?.foodType || "")
              .trim()
              .toLowerCase();
            if (foodType === "veg" || item?.isVeg === true) {
              hasVeg = true;
              return "veg";
            }
            if (
              foodType === "non-veg" ||
              foodType === "non veg" ||
              foodType === "nonveg" ||
              foodType.includes("non") ||
              item?.isVeg === false
            ) {
              hasNonVeg = true;
              return "non-veg";
            }
            return "unknown";
          };
          const sections = Array.isArray(menu?.sections) ? menu.sections : [];
          sections.forEach((section) => {
            const sectionItems = Array.isArray(section?.items)
              ? section.items
              : [];
            let sectionHasVeg = false;
            sectionItems.forEach((item) => {
              if (markItemDiet(item) === "veg") sectionHasVeg = true;
            });

            const subsections = Array.isArray(section?.subsections)
              ? section.subsections
              : [];
            subsections.forEach((subsection) => {
              const subsectionItems = Array.isArray(subsection?.items)
                ? subsection.items
                : [];
              subsectionItems.forEach((item) => {
                if (markItemDiet(item) === "veg") sectionHasVeg = true;
              });
            });

            const categoryName = String(section?.name || "").trim();
            if (!categoryName) return;

            const slug = slugifyCategory(categoryName);
            if (!slug) return;

            // Skip non-veg-only sections when veg mode is on
            if (vegMode && !sectionHasVeg) return;

            let image = "";
            if (Array.isArray(section?.items) && section.items.length > 0) {
              image = normalizeImageUrl(section.items[0]?.image);
            }
            if (!image && Array.isArray(section?.subsections)) {
              for (const subsection of section.subsections) {
                if (
                  Array.isArray(subsection?.items) &&
                  subsection.items.length > 0
                ) {
                  image = normalizeImageUrl(subsection.items[0]?.image);
                  if (image) break;
                }
              }
            }

            if (!categoryMap.has(slug)) {
              categoryMap.set(slug, {
                id: slug,
                name: categoryName,
                slug,
                label: categoryName,
                image: image || "",
              });
            } else if (image && !categoryMap.get(slug).image) {
              categoryMap.get(slug).image = image;
            }
          });

          if (id) {
            nextDietMeta[id] = {
              hasVeg,
              hasNonVeg,
              isPureVeg: hasVeg && !hasNonVeg,
            };
          }
        });

        const categories = Array.from(categoryMap.values())
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((category, index) => ({
            ...category,
            image:
              category.image ||
              foodImages[index % foodImages.length] ||
              foodImages[0],
          }));

        setMenuCategories(categories);
        setRestaurantDietMeta(nextDietMeta);
      } finally {
        if (requestSeq === menuUnionRequestSeqRef.current) {
          setLoadingMenuCategories(false);
        }
      }
    };

    fetchMenuCategories();
  }, [
    menuUnionRestaurantIdsKey,
    normalizeImageUrl,
    slugifyCategory,
    vegMode,
  ]);

  const matchesVegMode = useCallback(
    (restaurant) => {
      if (!vegMode) return true;
      if (vegModeOption !== "pure-veg") return true; // "all": show all restaurants; dishes filtered elsewhere

      const id = String(
        restaurant?.id || restaurant?.restaurantId || restaurant?.mongoId || "",
      );
      const meta = id ? restaurantDietMeta?.[id] : null;

      // Menu scan available — evidence wins over the restaurant flag
      if (meta) {
        if (meta.hasNonVeg === true) return false;
        if (meta.isPureVeg === true) return true;
        if (meta.hasVeg === true && meta.hasNonVeg === false) return true;
        return false;
      }

      // Meta not loaded yet — provisional trust of admin pure-veg flag
      return restaurant?.pureVegRestaurant === true;
    },
    [vegMode, vegModeOption, restaurantDietMeta],
  );

  const matchesTakeawayName = useCallback((restaurant, q) => {
    const name = String(restaurant?.name || restaurant?.restaurantName || "")
      .trim()
      .toLowerCase();
    const slug = String(restaurant?.slug || "")
      .trim()
      .toLowerCase()
      .replace(/-/g, " ");
    return name.includes(q) || slug.includes(q);
  }, []);

  // Filter restaurants and foods based on active filters
  const filteredRestaurants = useMemo(() => {
    let result = (restaurantsData || []).filter(matchesVegMode);

    if (effectiveOrderType === "takeaway" || isTakeawayPage) {
      result = result.filter(
        (restaurant) =>
          restaurant?.takeawaySettings?.isEnabled === true ||
          restaurant?.takeawayAvailable === true,
      );

      if (heroSearch.trim()) {
        const q = heroSearch.trim().toLowerCase();
        result = result.filter((restaurant) => matchesTakeawayName(restaurant, q));
      }
    }

    // Online first → pinned top order → nearest distance (same when all offline)
    const sortedResult = result
      .map((restaurant, index) => ({ restaurant, index }))
      .sort((a, b) => {
        const byBrowse = compareRestaurantsByAvailabilityAndDistance(
          a.restaurant,
          b.restaurant,
          { now: new Date(availabilityTick) },
        );
        if (byBrowse !== 0) return byBrowse;
        return a.index - b.index;
      })
      .map((item) => item.restaurant);

    return sortedResult;
  }, [restaurantsData, matchesVegMode, effectiveOrderType, isTakeawayPage, heroSearch, matchesTakeawayName, availabilityTick]);

  // Stable browse path — don't use restaurant URL while Home stays mounted underneath
  const homeBrowsePath =
    homeMode === "takeaway" || isTakeawayPage
      ? "/user/takeaway"
      : homeMode === "delivery"
        ? "/user"
        : routerLocation.pathname || "/user";

  const rememberHomeBrowsePosition = useCallback((focusId) => {
    saveBrowseScroll({
      path: homeBrowsePath,
      scrollY: scrollYRef.current,
      focusId,
      visibleCount: visibleRestaurantCount,
    });
  }, [visibleRestaurantCount, homeBrowsePath]);

  // Category open from Home: lock current scroll (often top) so back lands here — not mid-page.
  const rememberLeaveForCategory = useCallback(() => {
    const y = Math.max(0, scrollYRef.current || 0);
    const tabKey =
      homeMode === "takeaway" || isTakeawayPage ? "takeaway" : "delivery";
    try {
      sessionStorage.setItem(`main_tab_scroll_${tabKey}`, String(y));
    } catch {
      // ignore
    }
    saveBrowseScroll({
      path: homeBrowsePath,
      scrollY: y,
      focusId: null,
      visibleCount: visibleRestaurantCount,
    });
  }, [homeBrowsePath, homeMode, isTakeawayPage, visibleRestaurantCount]);

  // Allow restore again after leaving for restaurant (tabs stay mounted now)
  useEffect(() => {
    if (!isTabActive) {
      hasRestoredBrowseScrollRef.current = false;
    }
  }, [isTabActive]);

  // After back from restaurant details: restore exact scroll offset (list already in memory)
  useLayoutEffect(() => {
    if (!isTabActive) return undefined;
    if (hasRestoredBrowseScrollRef.current) return undefined;

    const browsePath = homeBrowsePath;
    const pending = peekBrowseScroll(browsePath);
    if (!pending) return undefined;

    const targetY = Math.max(0, Number(pending.scrollY) || 0);
    listRef.current?.scrollToOffset({ offset: targetY, animated: false });
    scrollYRef.current = targetY;

    if (loadingRestaurants) return undefined;
    if (!Array.isArray(filteredRestaurants) || filteredRestaurants.length === 0) return undefined;

    let needed = Math.min(
      Math.max(Number(pending.visibleCount) || 0, RESTAURANTS_BATCH_SIZE),
      filteredRestaurants.length,
    );

    if (pending.focusId) {
      const focusKey = String(pending.focusId);
      const focusIndex = filteredRestaurants.findIndex((r) => {
        const slug = String(r.slug || r.name || "")
          .toLowerCase()
          .replace(/[\s/]+/g, "-");
        return (
          String(r.mongoId || "") === focusKey ||
          String(r.id || "") === focusKey ||
          slug === focusKey
        );
      });
      if (focusIndex >= 0) {
        needed = Math.min(
          Math.max(needed, focusIndex + 1, RESTAURANTS_BATCH_SIZE),
          filteredRestaurants.length,
        );
      }
    }

    if (needed > visibleRestaurantCount) {
      setVisibleRestaurantCount(needed);
      return undefined;
    }

    if (pending.focusId) {
      // web: the focused card must be in the DOM before restoring
      const focusKey = String(pending.focusId);
      const inList = visibleRestaurants.some((r) => String(r.mongoId || r.id || '') === focusKey);
      if (!inList && needed < filteredRestaurants.length) {
        setVisibleRestaurantCount((prev) =>
          Math.min(prev + RESTAURANTS_BATCH_SIZE, filteredRestaurants.length),
        );
        return undefined;
      }
    }

    const saved = consumeBrowseScroll(browsePath);
    if (!saved) return undefined;
    hasRestoredBrowseScrollRef.current = true;
    return restoreBrowseScroll(saved);
  }, [
    isTabActive,
    loadingRestaurants,
    filteredRestaurants,
    visibleRestaurantCount,
    RESTAURANTS_BATCH_SIZE,
    homeBrowsePath,
  ]);

  const restaurantLazyLoadResetKey = useMemo(() => {
    const activeFilterKey = Array.from(activeFilters).sort().join("|");
    return `${restaurantsData.length}:${activeFilterKey}:${selectedCuisine || ""}:${sortBy || ""}:${vegMode ? "1" : "0"}:${vegModeOption}:${heroSearch || ""}`;
  }, [activeFilters, restaurantsData.length, selectedCuisine, sortBy, vegMode, vegModeOption, heroSearch]);

  const isTakeawayActive = effectiveOrderType === "takeaway" || isTakeawayPage;
  const takeawaySearchQuery = isTakeawayActive ? heroSearch.trim() : "";
  const isTakeawaySearching = takeawaySearchQuery.length > 0;
  const showTakeawaySearchEmpty =
    isTakeawayActive &&
    isTakeawaySearching &&
    !loadingRestaurants &&
    !showRestaurantSkeleton &&
    filteredRestaurants.length === 0;

  const takeawaySectionSubtitle = useMemo(() => {
    if (isRestaurantsResolving) return "Finding Restaurants For You";
    if (!isTakeawayActive) {
      return `${filteredRestaurants.length} Restaurants Delivering to You`;
    }
    if (isTakeawaySearching) {
      if (filteredRestaurants.length === 0) return null;
      return filteredRestaurants.length === 1
        ? `1 result for "${takeawaySearchQuery}"`
        : `${filteredRestaurants.length} results for "${takeawaySearchQuery}"`;
    }
    return `${filteredRestaurants.length} Restaurant${filteredRestaurants.length === 1 ? "" : "s"} near you`;
  }, [
    isRestaurantsResolving,
    isTakeawayActive,
    isTakeawaySearching,
    filteredRestaurants.length,
    takeawaySearchQuery,
  ]);

  const takeawaySectionTitle = useMemo(() => {
    if (!isTakeawayActive) return "Featured Restaurants";
    if (isTakeawaySearching) return "Search Results";
    return "Takeaway Restaurants";
  }, [isTakeawayActive, isTakeawaySearching]);

  const visibleRestaurants = useMemo(
    () => filteredRestaurants.slice(0, Math.min(visibleRestaurantCount, firstPaintLimit)),
    [filteredRestaurants, visibleRestaurantCount, firstPaintLimit],
  );

  const hasMoreRestaurants =
    visibleRestaurantCount < filteredRestaurants.length;

  // This page's list in the shared browse-scroll registry (the web scrolled the window, which every helper could read).
  const visibleRestaurantsRef = useRef(visibleRestaurants);
  visibleRestaurantsRef.current = visibleRestaurants;
  useEffect(() => registerBrowseScroller(homeBrowsePath, {
    scrollTo: (y) => listRef.current?.scrollToOffset({ offset: y, animated: false }),
    getContentHeight: () => contentHeightRef.current,
    getViewportHeight: () => viewportHeightRef.current,
    scrollToFocus: (focusId) => {
      const index = visibleRestaurantsRef.current.findIndex((r) => String(r.mongoId || r.id || '') === String(focusId));
      if (index < 0) return false;
      try {
        listRef.current?.scrollToIndex({ index, animated: false, viewOffset: 72 });
        return true;
      } catch {
        return false;
      }
    },
  }), [homeBrowsePath]);
  useEffect(() => {
    if (isTabActive) setActiveBrowseScroller(homeBrowsePath);
  }, [isTabActive, homeBrowsePath]);

  const loadMoreRestaurants = useCallback(() => {
    setVisibleRestaurantCount((previous) =>
      Math.min(previous + RESTAURANTS_BATCH_SIZE, filteredRestaurants.length),
    );
  }, [filteredRestaurants.length, RESTAURANTS_BATCH_SIZE]);

  useEffect(() => {
    // Don't collapse the list while Home is hidden under restaurant/category
    if (!isTabActive) return;

    // Keep expanded list when returning from a restaurant (browse scroll pending)
    const pending = peekBrowseScroll(homeBrowsePath);
    if (pending?.visibleCount) {
      const needed = Math.min(
        Math.max(Number(pending.visibleCount) || 0, RESTAURANTS_BATCH_SIZE),
        Math.max(filteredRestaurants.length, Number(pending.visibleCount) || 0),
      );
      setVisibleRestaurantCount(needed);
      return;
    }
    if (hasRestoredBrowseScrollRef.current) return;

    setVisibleRestaurantCount(
      Math.min(RESTAURANTS_BATCH_SIZE, filteredRestaurants.length),
    );
  }, [
    restaurantLazyLoadResetKey,
    filteredRestaurants.length,
    RESTAURANTS_BATCH_SIZE,
    homeBrowsePath,
    isTabActive,
  ]);

  useEffect(() => {
    if (visibleRestaurantCount <= filteredRestaurants.length) return;
    setVisibleRestaurantCount(filteredRestaurants.length);
  }, [filteredRestaurants.length, visibleRestaurantCount]);

  // Infinite scroll (the web's IntersectionObserver on the load-more sentinel, rootMargin 240px)
  const handleEndReached = useCallback(() => {
    if (!hasMoreRestaurants) return;
    if (!isTabActive) return;
    if (showRestaurantSkeleton || loadingRestaurants || isLoadingFilterResults) return;
    startTransition(() => {
      loadMoreRestaurants();
    });
  }, [hasMoreRestaurants, isTabActive, showRestaurantSkeleton, loadingRestaurants, isLoadingFilterResults, loadMoreRestaurants]);

  const recommendedForYouRestaurants = useMemo(() => {
    const idsInOrder = (recommendedRestaurantIds || []).map((id) => String(id));
    const hasIds = idsInOrder.length > 0;
    const fromSettings = Array.isArray(recommendedRestaurantsFromSettings)
      ? recommendedRestaurantsFromSettings.filter(r => !r.zoneId || !zoneId || String(r.zoneId) === String(zoneId))
      : [];

    // Primary source: restaurants returned by landing settings API (already admin-selected).
    const fromSettingsMapped = fromSettings.map((restaurant) => {
      const restaurantId = restaurant?._id ? String(restaurant._id) : "";
      const cuisine =
        Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length > 0
          ? restaurant.cuisines[0]
          : "Multi-cuisine";
      const imageCandidates = extractImages([
        ...(Array.isArray(restaurant?.coverImages)
          ? restaurant.coverImages
          : [restaurant?.coverImages]
        ).filter(Boolean),
        restaurant?.profileImage,
      ]);
      const image = imageCandidates[0] || foodImages[0];

      return {
        id: restaurant?.restaurantId || restaurantId,
        mongoId: restaurantId,
        name: getRestaurantDisplayName(restaurant),
        cuisine,
        rating: Number(restaurant?.rating) || 0,
        distance: "",
        deliveryTime: "",
        image: normalizeImageUrl(image) || foodImages[0],
        images: imageCandidates.length > 0 ? imageCandidates : [foodImages[0]],
        slug: restaurant?.slug || restaurant?.restaurantId || restaurantId,
        offer: null,
        pureVegRestaurant: restaurant?.pureVegRestaurant === true,
        isActive: restaurant?.isActive !== false,
        isAcceptingOrders: restaurant?.isAcceptingOrders !== false,
        openingTime: restaurant?.openingTime || null,
        closingTime: restaurant?.closingTime || null,
        openDays: Array.isArray(restaurant?.openDays) ? restaurant.openDays : [],
      };
    });

    // Keep admin-selected order when IDs exist.
    const orderedFromSettings = hasIds
      ? idsInOrder
        .map((id) =>
          fromSettingsMapped.find(
            (restaurant) => String(restaurant.mongoId) === id,
          ),
        )
        .filter(Boolean)
      : fromSettingsMapped;

    // Fallback: if settings payload misses some entries, recover them from fetched restaurant list by ID.
    const existingIds = new Set(
      orderedFromSettings.map((restaurant) =>
        String(restaurant.mongoId || restaurant.id),
      ),
    );
    const fromFetchedMissing = (restaurantsData || []).filter((restaurant) => {
      const mongoId = String(restaurant.mongoId || "");
      return (
        hasIds && idsInOrder.includes(mongoId) && !existingIds.has(mongoId)
      );
    });

    return [...orderedFromSettings, ...fromFetchedMissing]
      .filter(matchesVegMode)
      .slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    recommendedRestaurantIds,
    recommendedRestaurantsFromSettings,
    restaurantsData,
    extractImages,
    normalizeImageUrl,
    matchesVegMode,
  ]);

  const handleSearchFocus = useCallback(() => {
    if (effectiveOrderType === "takeaway" || isTakeawayPage) {
      LayoutAnimation.configureNext(LayoutAnimation.create(240, "easeInEaseOut", "opacity"));
      setTakeawaySearchOpen(true);
      return;
    }
    navigate("/food/user/search?mode=delivery");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, orderType, isTakeawayPage]);

  // Animated placeholder cycling - same as RestaurantDetails highlight offer animation
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 2000); // Change placeholder every 2 seconds (same as RestaurantDetails)

    return () => clearInterval(interval);
  }, []); // placeholders is a constant, no need for dependency

  const closeTakeawaySearch = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(240, "easeInEaseOut", "opacity"));
    setHeroSearch("");
    setTakeawaySearchOpen(false);
  };

  // ------------------------------------------------------------------ hero banner
  const heroBannerSection = (() => {
    if (showBannerSkeleton) {
      return (
        <View style={s.heroPad}>
          <HeroBannerSkeleton style={{ height: 144, borderRadius: radius["2xl"] }} />
        </View>
      );
    }

    if (heroBannerImages.length === 0) return null;

    // Create the slides array with the first banner duplicated at the end
    const slides = heroBannerImages.length > 1
      ? [...heroBannerImages, heroBannerImages[0]]
      : heroBannerImages;

    const activeDotIndex = currentBannerIndex === heroBannerImages.length
      ? 0
      : currentBannerIndex;

    return (
      <View style={s.heroPad}>
        <HeroCarousel
          slides={slides}
          index={currentBannerIndex}
          transitionEnabled={isTransitionEnabled}
          onSwipeStart={handleSwipeStart}
          onSwipeEnd={handleSwipeEnd}
          onPress={() => {
            const actualIndex = currentBannerIndex === heroBannerImages.length ? 0 : currentBannerIndex;
            const bannerData = heroBannersData[actualIndex];
            const allLinked = bannerData?.linkedRestaurants || [];
            const linkedRestaurants = zoneId ? allLinked.filter(r => !r.zoneId || String(r.zoneId) === String(zoneId)) : allLinked;
            if (linkedRestaurants.length > 0) {
              const firstRestaurant = linkedRestaurants[0];
              const restaurantId =
                getRestaurantRouteId(firstRestaurant) ||
                firstRestaurant.restaurantId ||
                firstRestaurant._id;
              if (restaurantId) {
                navigate(toFoodUserPath(`/user/restaurants/${restaurantId}`));
              }
            }
          }}
          dots={heroBannerImages.length > 1 ? (
            <View style={s.dots}>
              {heroBannerImages.map((_, dotIndex) => (
                <Pressable
                  key={dotIndex}
                  hitSlop={6}
                  onPress={() => {
                    setIsTransitionEnabled(true);
                    setCurrentBannerIndex(dotIndex);
                    resetAutoSlide();
                  }}
                  style={activeDotIndex === dotIndex ? s.dotActive : s.dot}
                  accessibilityLabel={`Go to banner ${dotIndex + 1}`}
                />
              ))}
            </View>
          ) : null}
        />
      </View>
    );
  })();

  const isDeliveryView = effectiveOrderType !== "takeaway" && !isTakeawayPage;
  const headerColor = festBannerImageUrl && isDeliveryView && festBannerTopColor ? festBannerTopColor : HOME_BANNER_RED;

  const requireLoginOr = (fn) => {
    if (!isModuleAuthenticated('user')) {
      window.dispatchEvent(new CustomEvent('show-login-required'));
      return;
    }
    fn();
  };

  // ------------------------------------------------------------------ list header (everything above the cards)
  const listHeader = (
    <View>
      <View style={s.topWrap}>
        {/* Brand Top Section (Red Theme) */}
        <View style={[s.brandTop, { backgroundColor: headerColor, paddingTop: insets.top }]}>
          {!!festBannerImageUrl && (
            <View
              style={[StyleSheetAbs, { zIndex: 0, opacity: isDeliveryView ? 1 : 0 }]}
              pointerEvents={isDeliveryView ? "auto" : "none"}
            >
              <AppImage
                src={festBannerImageUrl}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={200}
                onError={() => {
                  setFestBannerImageUrl("");
                  setFestBannerTopColor("");
                  try { localStorage.setItem("CACHED_FEST_BANNER", ""); } catch (e) {}
                  try { localStorage.setItem("CACHED_FEST_BANNER_COLOR", ""); } catch (e) {}
                }}
              />
            </View>
          )}
          <View style={{ zIndex: 10 }}>
            {isDeliveryView ? (
              <HomeHeader
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                location={effectiveLocation}
                handleSearchFocus={handleSearchFocus}
                placeholderIndex={placeholderIndex}
                placeholders={placeholders}
                vegMode={vegMode}
                handleVegModeChange={handleVegModeChange}
                vegModeToggleRef={vegModeToggleRef}
                isTabActive={isTabActive}
                // Pass Banner Props to Unified Component
                showBanner={activeTab === "food" && isDeliveryView}
                videoUrl={""}
                hideFoodImages={!!festBannerImageUrl}
              />
            ) : (
              <View style={s.takeawayHead}>
                <View style={s.takeawayRow}>
                  <View>
                    <Text style={s.selfPickup}>Self-Pickup</Text>
                    <Text style={s.takeawayTitle}>Takeaway</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3) }}>
                    <Pressable
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.create(240, "easeInEaseOut", "opacity"));
                        setTakeawaySearchOpen(true);
                      }}
                      style={({ pressed }) => [s.roundBtn, takeawaySearchOpen ? { backgroundColor: colors.white } : null, pressed && { transform: [{ scale: 0.95 }] }]}
                      accessibilityLabel="Search takeaway restaurants"
                    >
                      <Search size={20} color={takeawaySearchOpen ? BRAND_RED : colors.white} strokeWidth={2.5} />
                    </Pressable>
                    <Link
                      to="/food/user/cart"
                      state={{ from: routerLocation.pathname }}
                      style={({ pressed }) => [s.roundBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                    >
                      <ShoppingCart size={20} color={colors.white} strokeWidth={2.5} />
                      {cartCount > 0 && (
                        <View style={s.cartBadge}>
                          <Text style={s.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
                        </View>
                      )}
                    </Link>
                    <Pressable
                      onPress={() => requireLoginOr(() => navigate("/food/user/profile", { state: { from: routerLocation.pathname } }))}
                      style={({ pressed }) => [s.takeawayAvatar, pressed && { transform: [{ scale: 0.95 }] }]}
                    >
                      <AppImage src={userProfile?.profileImage || PROFILE_AVATAR} fallback={PROFILE_AVATAR} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                    </Pressable>
                  </View>
                </View>

                {takeawaySearchOpen && (
                  <View style={s.takeawaySearch}>
                    <Search size={16} color={BRAND_RED} strokeWidth={2.5} style={{ marginLeft: sp(2) }} />
                    <View style={{ flex: 1, paddingHorizontal: sp(3) }}>
                      <TextInput
                        autoFocus
                        value={heroSearch}
                        onChangeText={setHeroSearch}
                        placeholder="Search takeaway restaurants..."
                        placeholderTextColor={colors.gray[400]}
                        style={s.takeawayInput}
                      />
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5) }}>
                      {!!heroSearch && (
                        <Pressable onPress={() => setHeroSearch("")} style={s.clearCircle} accessibilityLabel="Clear search">
                          <X size={14} color={t.dark ? colors.gray[300] : colors.gray[500]} strokeWidth={2.5} />
                        </Pressable>
                      )}
                      <Pressable onPress={closeTakeawaySearch} style={s.closeCircle} accessibilityLabel="Close search">
                        <X size={16} color={BRAND_RED} strokeWidth={2.5} />
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {activeTab === "food" ? (
          <View
            style={{ backgroundColor: "transparent" }}
            onLayout={(e) => {
              layoutRef.current.foodY = e.nativeEvent.layout.y;
            }}
          >
            {!isDeliveryView && (
              <View style={s.pickupBlock}>
                <View style={{ gap: sp(1) }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
                    <View style={s.pickupIcon}>
                      <ShoppingBag size={24} color={colors.green[600]} />
                    </View>
                    <Text style={s.pickupTitle}>Pickup Restaurants</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: sp(1.5), marginLeft: sp(1) }}>
                    <PulseDot />
                    <Text style={s.pickupSub}>Order online, skip the queue & pickup yourself</Text>
                  </View>
                </View>
                <LinearGradient
                  colors={t.dark ? [colors.gray[800], colors.gray[700], "transparent"] : [colors.gray[100], colors.gray[200], "transparent"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ height: 1, marginTop: sp(3), marginBottom: sp(1) }}
                />
              </View>
            )}

            {/* "What's on your mind today?" Section */}
            {isDeliveryView && (
              <View
                style={s.categoriesSection}
                onLayout={(e) => {
                  layoutRef.current.catY = e.nativeEvent.layout.y;
                  layoutRef.current.catH = e.nativeEvent.layout.height;
                }}
              >
                {/* Categories Horizontal Slider */}
                <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
                  {displayCategories.slice(0, 12).map((category, index) => (
                    <Link
                      key={category.id || index}
                      to={`/food/user/category/${category.slug}`}
                      state={{ from: '/food/user' }}
                      onPress={rememberLeaveForCategory}
                      style={s.catItem}
                    >
                      {({ pressed }) => (
                        <>
                          <View style={[s.catCircle, pressed && { transform: [{ scale: 0.95 }] }]}>
                            {/* Shining Glint Effect */}
                            <Glint width={80} duration={2000} repeatDelay={3000 + index * 500} via={0.4} />
                            <OptimizedImage
                              src={category.image}
                              alt={category.name}
                              style={{ width: "100%", height: "100%" }}
                              priority={index < 6}
                            />
                          </View>
                          <Text numberOfLines={1} style={s.catName}>{category.name}</Text>
                        </>
                      )}
                    </Link>
                  ))}

                  {/* See All Card */}
                  {displayCategories.length > 0 && (
                    <Link to="/food/user/categories" state={{ from: '/food/user' }} style={s.catItem}>
                      {({ pressed }) => (
                        <>
                          <View style={[s.catCircle, s.seeAllCircle, pressed && { transform: [{ scale: 0.95 }] }]}>
                            <UtensilsCrossed size={32} color={colors.red[500]} />
                          </View>
                          <Text numberOfLines={1} style={s.catName}>
                            See all <Text style={s.seeAllArrow}>▼</Text>
                          </Text>
                        </>
                      )}
                    </Link>
                  )}
                </ScrollView>
              </View>
            )}

            {/* Admin Hero Banners Section - Now below categories */}
            {heroBannerSection}

            {/* Filters Sticky Sidebar Header - Hidden for takeaway as per request */}
            {isDeliveryView && (
              <View style={s.filterBar}>
                <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                  <Pressable
                    onPress={() => setIsFilterOpen(true)}
                    style={({ pressed }) => [s.filtersBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    <SlidersHorizontal size={16} color={t.dark ? colors.white : colors.black} />
                    <Text style={s.filtersBtnText}>Filters</Text>
                  </Pressable>

                  {[
                    { id: "delivery-under-30", label: "Under 30 mins" },
                    { id: "delivery-under-45", label: "Under 45 mins" },
                    { id: "distance-under-1km", label: "Under 1km", icon: MapPin },
                    { id: "distance-under-2km", label: "Under 2km", icon: MapPin },
                  ].map((filter) => {
                    const Icon = filter.icon;
                    const isActive = activeFilters.has(filter.id);
                    const fg = isActive ? colors.white : t.dark ? colors.gray[300] : colors.gray[700];
                    return (
                      <Pressable
                        key={filter.id}
                        onPress={() => {
                          const nextFilters = new Set(activeFilters);
                          if (nextFilters.has(filter.id)) {
                            nextFilters.delete(filter.id);
                          } else {
                            nextFilters.add(filter.id);
                          }
                          setActiveFilters(nextFilters);
                          void applyFiltersAndRefetch(
                            nextFilters,
                            sortBy,
                            selectedCuisine,
                          );
                        }}
                        style={({ pressed }) => [s.chip, isActive ? s.chipActive : s.chipIdle, pressed && { transform: [{ scale: 0.95 }] }]}
                      >
                        {Icon && <Icon size={14} color={fg} fill={isActive ? colors.white : "none"} />}
                        <Text style={[s.chipText, { color: fg }]}>{filter.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          <QuickSection />
        )}
      </View>

      {isDeliveryView && recommendedForYouRestaurants.length > 0 && (
        <View style={{ paddingTop: sp(1) }}>
          <Text style={s.recoHeading}>Recommended For You</Text>

          <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recoRow}>
            {recommendedForYouRestaurants.map((restaurant, index) => {
              const restaurantRouteId = getRestaurantRouteId(restaurant);
              const rawSlug = restaurant.slug || restaurant.name;
              const restaurantSlug = String(rawSlug || "")
                .toLowerCase()
                .replace(/[\s/]+/g, "-");
              const linkId = restaurantRouteId || restaurantSlug;
              const rated = Number(restaurant.rating) > 0;
              return (
                <RiseIn key={`recommended-${restaurant.mongoId || restaurant.id || linkId}`} delay={index * 50} style={{ width: 150 }}>
                  <Link
                    to={toFoodUserPath(`/user/restaurants/${linkId}`)}
                    state={{ from: homeBrowsePath, restaurantData: restaurant }}
                    onPress={() =>
                      rememberHomeBrowsePosition(
                        restaurant.mongoId || restaurant.id || linkId,
                      )
                    }
                    style={s.recoCard}
                  >
                    <View style={s.recoImage}>
                      <RestaurantImageCarousel
                        restaurant={restaurant}
                        backendOrigin={BACKEND_ORIGIN}
                        style={{ height: 96 }}
                        roundedClass="rounded-t-[20px]"
                        backFrom={homeBrowsePath}
                        focusId={restaurant.mongoId || restaurant.id || linkId}
                        visibleCount={visibleRestaurantCount}
                      />
                      <View style={[s.recoRating, rated ? s.recoRatingOn : s.recoRatingNew]}>
                        <Text style={[s.recoRatingText, { color: rated ? colors.white : colors.gray[600] }]}>
                          {rated ? Number(restaurant.rating).toFixed(1) : "NEW"}
                        </Text>
                      </View>
                    </View>
                    <View style={{ padding: sp(2.5) }}>
                      <Text numberOfLines={1} style={s.recoName}>{restaurant.name}</Text>
                      <View style={s.recoTag}>
                        <Flame size={14} color={BRAND_RED} fill={BRAND_RED} />
                        <Text style={s.recoTagText}>Near & Fast</Text>
                      </View>
                    </View>
                  </Link>
                </RiseIn>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Explore More Section */}
      {isDeliveryView && (
        <View style={{ paddingTop: sp(2) }}>
          <View style={s.exploreHead}>
            <Text style={s.exploreHeading}>{exploreMoreHeading}</Text>
            <View style={s.exploreLine} />
          </View>
          <ExploreRow
            items={finalExploreItems.slice(0, 5)}
            slides={exploreSlides}
          />
        </View>
      )}

      {/* Restaurants - Enhanced with Animations */}
      <View style={{ paddingTop: isDeliveryView ? sp(3) : sp(1) }}>
        <View style={{ paddingHorizontal: sp(4), marginBottom: sp(3) }}>
          {!showTakeawaySearchEmpty && (
            <View style={{ gap: sp(1) }}>
              {!!takeawaySectionSubtitle && (
                <Text style={s.sectionSubtitle}>{takeawaySectionSubtitle}</Text>
              )}
              <Text style={s.sectionTitle}>{takeawaySectionTitle}</Text>
            </View>
          )}
        </View>
        {/* Loading Overlay */}
        {showRestaurantSkeleton && (
          <View style={s.skeletonWrap}>
            <LoadingSkeletonRegion label="Loading restaurants" style={{ padding: sp(1) }}>
              <RestaurantGridSkeleton count={3} compact style={{ gap: sp(3) }} />
            </LoadingSkeletonRegion>
          </View>
        )}
        {!showRestaurantSkeleton &&
          showTakeawaySearchEmpty &&
          visibleRestaurants.length === 0 && (
            <View style={s.takeawayEmpty}>
              <View style={s.takeawayEmptyIcon}>
                <Search size={28} color={t.dark ? colors.gray[500] : colors.gray[300]} />
              </View>
              <Text style={s.takeawayEmptyTitle}>
                No takeaway restaurants found for &quot;{takeawaySearchQuery}&quot;
              </Text>
              <Text style={s.takeawayEmptySub}>Search by restaurant name only</Text>
            </View>
          )}
      </View>
    </View>
  );

  const renderRestaurant = ({ item: restaurant, index }) => {
    const nameStr =
      typeof restaurant?.name === "string"
        ? restaurant.name.trim()
        : "";
    const fallbackSlugSource =
      nameStr ||
      (typeof restaurant?.restaurantName === "string"
        ? restaurant.restaurantName.trim()
        : "") ||
      String(
        restaurant?.slug ||
        restaurant?.id ||
        restaurant?._id ||
        `restaurant-${index}`,
      );
    const rawSlug = (typeof restaurant?.slug === "string" && restaurant.slug.trim()) ? restaurant.slug.trim() : fallbackSlugSource;
    const restaurantSlug = rawSlug.toLowerCase().replace(/[\s/]+/g, "-");
    const restaurantRouteId = getRestaurantRouteId(restaurant) || restaurantSlug;
    const availability = getRestaurantAvailabilityStatus(
      restaurant,
      new Date(availabilityTick),
    );
    // Direct favorite check - isFavorite is already memoized in context
    const favorite = isFavorite(restaurantSlug);

    const restaurantCoupons = restaurant.hasDishes === false ? [] : publicOffers.filter((o) => {
      // 1. Restaurant Scope check
      if (String(o?.restaurantScope) === "selected") {
        const couponRestId = String(o.restaurantId || "").trim();
        const rId = String(restaurant.restaurantId || "").trim();
        const id = String(restaurant.id || "").trim();
        const mongoId = String(restaurant.mongoId || "").trim();
        if (!(couponRestId === rId || couponRestId === id || couponRestId === mongoId)) {
          return false;
        }
      }

      // 2. Order/Tab Type check (couponType: 'delivery', 'takeaway', 'all')
      const cType = String(o.couponType || "all").trim().toLowerCase();

      if (isTakeawayActive) {
        return cType === "takeaway" || cType === "all";
      }
      return cType === "delivery" || cType === "all";
    });

    const handleToggleFavorite = () => {
      if (favorite) {
        // If already bookmarked, show Manage Collections modal
        setSelectedRestaurantSlug(restaurantSlug);
        setShowManageCollections(true);
      } else {
        // Add to favorites and show toast
        addFavorite({
          slug: restaurantSlug,
          name: restaurant.name,
          cuisine: restaurant.cuisine,
          rating: restaurant.rating,
          deliveryTime: restaurant.deliveryTime,
          distance: restaurant.distance,
          priceRange: restaurant.priceRange,
          image: restaurant.image,
        });
        setShowToast(true);
        setTimeout(() => {
          setShowToast(false);
        }, 3000);
      }
    };

    const offline = availability.reason === "inactive" || availability.reason === "not-accepting-orders";
    const ratingCount = (() => {
      const count = Number(restaurant.totalRatings) || 0;
      if (count === 1) return "1 rating";
      if (count < 100) return `${count} ratings`;
      if (count < 1000) return `${Math.floor(count / 100) * 100}+ ratings`;
      return `${(count / 1000).toFixed(1)}K+ ratings`;
    })();

    return (
      <FadeInUp index={index} style={[s.cardOuter, (isLoadingFilterResults || loadingRestaurants) && { opacity: 0.5 }]}>
        <Link
          to={toFoodUserPath(`/user/restaurants/${restaurantRouteId}`)}
          state={{ from: homeBrowsePath, restaurantData: restaurant }}
          onPress={() =>
            rememberHomeBrowsePosition(
              restaurant.mongoId || restaurant.id || restaurantRouteId,
            )
          }
          // closed / offline cards are not dimmed: the CLOSED / OFFLINE badge says it, the card stays readable
          style={s.card}
        >
          {/* Image Section with Carousel */}
          <View>
            <RestaurantImageCarousel
              restaurant={restaurant}
              priority={index < 2}
              backendOrigin={BACKEND_ORIGIN}
              backFrom={homeBrowsePath}
              focusId={restaurant.mongoId || restaurant.id || restaurantRouteId}
              visibleCount={visibleRestaurantCount}
              style={{ height: 184 }}
            />

            {/* Bookmark Icon - Top Right */}
            <View style={s.bookmarkWrap}>
              <Pressable
                onPress={handleToggleFavorite}
                accessibilityLabel={favorite ? "Remove from favorites" : "Add to favorites"}
                style={[s.bookmarkBtn, favorite ? { backgroundColor: colors.red[500] } : { backgroundColor: alpha(colors.white, 0.9) }]}
              >
                <Bookmark size={18} color={favorite ? colors.white : colors.gray[800]} fill={favorite ? colors.white : "none"} />
              </Pressable>
            </View>
          </View>

          {/* Content Section */}
          <View style={s.cardContent}>
            {/* Restaurant Name & Rating */}
            <View style={s.nameRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={s.restName}>{restaurant.name}</Text>
                <View style={s.timeRow}>
                  {/* Delivery Time & Distance moved here - Green Theme with Zap icon */}
                  <Zap size={14} color="#257d3c" fill="#257d3c" strokeWidth={2.5} />
                  <Text style={s.timeText}>{restaurant.deliveryTime}</Text>
                  <Text style={[s.timeText, { marginHorizontal: sp(1), fontWeight: "700" }]}>|</Text>
                  <Text style={s.timeText}>{restaurant.distance}</Text>
                </View>

                {/* Offer Badge - Animated Carousel */}
                <RestaurantCardOfferCarousel coupons={restaurantCoupons} />
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <View style={s.ratingBadge}>
                  <Star size={12} color={colors.white} fill={colors.white} strokeWidth={0} />
                  <Text style={s.ratingText}>
                    {Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}
                  </Text>
                </View>
                {Number(restaurant.rating) > 0 && (
                  <Text style={s.ratingCount}>{ratingCount}</Text>
                )}
              </View>
            </View>

            {/* Closes in / Opening time badge moved here */}
            <View style={s.availRow}>
              {!availability.isOpen && (
                <View style={[s.availBadge, offline ? s.availOffline : s.availClosed]}>
                  {offline ? (
                    <>
                      <AlertCircle size={12} color={t.dark ? colors.red[400] : colors.red[500]} strokeWidth={2.5} />
                      <Text style={[s.availText, { color: t.dark ? colors.red[400] : colors.red[600] }]}>Offline</Text>
                    </>
                  ) : availability.openingTime ? (
                    <>
                      <Clock size={12} color={t.dark ? colors.gray[400] : colors.gray[500]} strokeWidth={2.5} />
                      <Text style={[s.availText, { color: t.dark ? colors.gray[400] : colors.gray[600] }]}>Opens at {availability.openingTime}</Text>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={12} color={t.dark ? colors.gray[400] : colors.gray[500]} strokeWidth={2.5} />
                      <Text style={[s.availText, { color: t.dark ? colors.gray[400] : colors.gray[600] }]}>Closed</Text>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
        </Link>
      </FadeInUp>
    );
  };

  const listFooter = (
    <View style={s.footer}>
      {hasMoreRestaurants && !showRestaurantSkeleton && (
        <Pressable onPress={loadMoreRestaurants} style={({ pressed }) => [s.loadMore, pressed && { borderColor: colors.gray[400] }]}>
          <Text style={s.loadMoreText}>Load more restaurants</Text>
        </Pressable>
      )}
    </View>
  );

  // ------------------------------------------------------------------ veg popup animations
  const vegPop = usePop(showVegModePopup, 0.8);
  const switchOffPop = usePop(showSwitchOffPopup, 0.9);
  const toastAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(toastAnim, { toValue: showToast ? 1 : 0, damping: 25, useNativeDriver: true }).start();
  }, [showToast, toastAnim]);

  const closeVegPopup = () => {
    setShowVegModePopup(false);
    // Revert veg mode to OFF if popup is closed without applying
    setVegModeContext(false);
    setPrevVegMode(false);
  };

  const keepVegMode = () => {
    setShowSwitchOffPopup(false);
    isHandlingSwitchOff.current = false;
    setVegModeContext(true);
    // prevVegMode stays true (from before), which is correct
  };

  const filterOptionStyle = (active) => [s.optBox, active ? s.optBoxActive : s.optBoxIdle];
  const optTextColor = (active) => (active ? BRAND_RED : t.dark ? colors.gray[300] : colors.gray[700]);
  const optIconColor = (active) => (active ? BRAND_RED : t.dark ? colors.gray[400] : colors.gray[600]);
  const sectionLayout = (id) => (e) => {
    filterSectionY.current[id] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
  };
  const filterTile = (id, label, Icon, starStyle) => {
    const active = activeFilters.has(id);
    return (
      <Pressable key={id} onPress={() => toggleFilter(id)} style={[filterOptionStyle(active), s.optTile]}>
        {starStyle ? (
          <Icon size={24} color={active ? BRAND_RED : t.dark ? colors.gray[500] : colors.gray[400]} fill={active ? BRAND_RED : "none"} />
        ) : (
          <Icon size={24} color={optIconColor(active)} strokeWidth={1.5} />
        )}
        <Text style={[s.optText, { color: optTextColor(active) }]}>{label}</Text>
      </Pressable>
    );
  };
  const filterRow = (id, label) => {
    const active = activeFilters.has(id);
    return (
      <Pressable key={id} onPress={() => toggleFilter(id)} style={[filterOptionStyle(active), s.optRow]}>
        <Text style={[s.optText, { color: optTextColor(active) }]}>{label}</Text>
      </Pressable>
    );
  };
  const filtersDirty = activeFilters.size > 0 || sortBy || selectedCuisine;

  return (
    <View style={s.root}>
      {isTabActive && <StatusBar style="light" />}

      <FlatList
        ref={listRef}
        data={visibleRestaurants}
        keyExtractor={(restaurant, index) => String(restaurant?.id || restaurant?._id || restaurant?.slug || index)}
        renderItem={renderRestaurant}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        contentContainerStyle={[s.listContent, { paddingBottom: bottomNavSpace }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[BRAND_RED]} progressViewOffset={insets.top + 8} />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollYRef.current = y;
          reportBrowseScroll(homeBrowsePath, y);
          handleScrollHeader(y);
        }}
        scrollEventThrottle={32}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.6}
        initialNumToRender={3}
        windowSize={9}
        removeClippedSubviews={false}
        onScrollBeginDrag={notifyBrowseUserIntent}
        onContentSizeChange={(_w, h) => {
          contentHeightRef.current = h;
        }}
        onLayout={(e) => {
          viewportHeightRef.current = e.nativeEvent.layout.height;
        }}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
        }}
      />

      {/* Takeaway has no sticky header: keep its list from scrolling under the status bar icons */}
      {!isDeliveryView && <StatusBarScrim color={headerColor} />}

      {/* Dynamic Sticky Header (Search + Slider + Filters) */}
      {isStickyHeaderVisible && activeTab === "food" && isDeliveryView && (
        <StickyFade style={s.sticky}>
          <View style={{ height: insets.top, backgroundColor: headerColor }} />
          {/* Search Bar + Veg Mode Row (Always visible when sticky) */}
          {showStickySearch && (
            <View style={s.stickySearchRow}>
              <Pressable style={s.stickySearch} onPress={handleSearchFocus}>
                <Search size={20} color={t.dark ? "#a14b84" : BRAND_RED} strokeWidth={2.5} style={{ marginRight: sp(3) }} />
                <View style={{ flex: 1, height: 20, overflow: "hidden" }}>
                  <Text style={s.stickyPlaceholder}>Search "biryani"</Text>
                </View>
                <View style={s.stickyDivider} />
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    voiceSearch.clearError();
                    void voiceSearch.startListening();
                    setIsVoiceOverlayOpen(true);
                  }}
                >
                  <Mic size={20} color={t.dark ? "#a14b84" : BRAND_RED} />
                </Pressable>
              </Pressable>

              {/* Veg Mode Toggle in Sticky Header */}
              <View ref={stickyVegToggleRef} collapsable={false} style={{ alignItems: "center", gap: sp(1) }}>
                <Text style={s.stickyVegLabel}>Veg Mode</Text>
                <StickyVegToggle vegMode={vegMode} onToggle={() => handleVegModeChange(!vegMode)} />
              </View>
            </View>
          )}

          {/* Categories Slider (Increased Icon Size) */}
          <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stickyCatRow}>
            {displayCategories.slice(0, 12).map((category, index) => (
              <Link
                key={`sticky-${category.id || index}`}
                to={`/food/user/category/${category.slug}`}
                onPress={rememberLeaveForCategory}
                style={s.stickyCatItem}
              >
                {({ pressed }) => (
                  <>
                    <View style={[s.stickyCatCircle, pressed && { transform: [{ scale: 0.95 }] }]}>
                      <OptimizedImage src={category.image} alt={category.name} style={{ width: "100%", height: "100%" }} priority={index < 6} />
                    </View>
                    <Text numberOfLines={1} style={s.stickyCatName}>{category.name}</Text>
                  </>
                )}
              </Link>
            ))}

            {/* See All Sticky Card */}
            {displayCategories.length > 0 && (
              <Link to="/food/user/categories" state={{ from: '/food/user' }} style={s.stickyCatItem}>
                {({ pressed }) => (
                  <>
                    <View style={[s.stickyCatCircle, s.seeAllCircle, pressed && { transform: [{ scale: 0.95 }] }]}>
                      <UtensilsCrossed size={28} color={colors.red[500]} />
                    </View>
                    <Text numberOfLines={1} style={s.stickyCatName}>
                      See all <Text style={s.seeAllArrow}>▼</Text>
                    </Text>
                  </>
                )}
              </Link>
            )}
          </ScrollView>
        </StickyFade>
      )}

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

      {/* Filter Modal - Bottom Sheet */}
      <Sheet open={isFilterOpen} onClose={() => setIsFilterOpen(false)} style={[s.filterSheet, { height: Dimensions.get("window").height * 0.85 }]}>
        {/* Header */}
        <View style={s.filterHeader}>
          <Text style={s.filterTitle}>Filters and sorting</Text>
          <Pressable
            onPress={() => {
              setActiveFilters(new Set());
              setSortBy(null);
              setSelectedCuisine(null);
            }}
          >
            <Text style={s.clearAllText}>Clear all</Text>
          </Pressable>
        </View>

        {/* Body */}
        <View style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}>
          {/* Left Sidebar - Tabs */}
          <View style={s.tabRail}>
            {[
              { id: "sort", label: "Sort By", icon: ArrowDownUp },
              { id: "time", label: "Time", icon: Timer },
              { id: "rating", label: "Rating", icon: Star },
              { id: "distance", label: "Distance", icon: MapPin },
              { id: "price", label: "Dish Price", icon: IndianRupee },
              { id: "offers", label: "Offers", icon: BadgePercent },
              { id: "trust", label: "Trust", icon: ShieldCheck },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive =
                activeScrollSection === tab.id ||
                activeFilterTab === tab.id;
              const c = isActive ? BRAND_RED : t.dark ? colors.gray[400] : colors.gray[500];
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => {
                    setActiveFilterTab(tab.id);
                    const section = filterSectionY.current[tab.id];
                    if (section) {
                      rightContentRef.current?.scrollTo({ y: section.y, animated: true });
                    }
                  }}
                  style={[s.tabItem, isActive && { backgroundColor: t.dark ? "#1a1a1a" : colors.white }]}
                >
                  {isActive && <View style={s.tabMarker} />}
                  <Icon size={20} color={c} strokeWidth={1.5} />
                  <Text style={[s.tabLabel, { color: c }]}>{tab.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Right Content Area - Scrollable */}
          <ScrollView
            ref={rightContentRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: sp(4) }}
            onLayout={(e) => {
              rightContentHeight.current = e.nativeEvent.layout.height;
            }}
            onScroll={onFilterScroll}
            scrollEventThrottle={32}
          >
            {/* Sort By Tab */}
            <View onLayout={sectionLayout("sort")} style={s.optSection}>
              <Text style={s.optHeading}>Sort by</Text>
              <View style={{ gap: sp(3) }}>
                {[
                  { id: null, label: "Relevance" },
                  { id: "price-low", label: "Price: Low to High" },
                  { id: "price-high", label: "Price: High to Low" },
                  { id: "rating-high", label: "Rating: High to Low" },
                  { id: "rating-low", label: "Rating: Low to High" },
                ].map((option) => (
                  <Pressable
                    key={option.id || "relevance"}
                    onPress={() => setSortBy(option.id)}
                    style={[filterOptionStyle(sortBy === option.id), s.optRow]}
                  >
                    <Text style={[s.optText, { color: optTextColor(sortBy === option.id) }]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Time Tab */}
            <View onLayout={sectionLayout("time")} style={s.optSection}>
              <Text style={s.optHeading}>{isTakeawayActive ? "Estimated Readiness" : "Estimated Time"}</Text>
              <View style={s.optGrid}>
                {filterTile("delivery-under-30", isTakeawayActive ? "Within 30 mins" : "Under 30 mins", Timer)}
                {filterTile("delivery-under-45", isTakeawayActive ? "Within 45 mins" : "Under 45 mins", Timer)}
              </View>
            </View>

            {/* Rating Tab */}
            <View onLayout={sectionLayout("rating")} style={s.optSection}>
              <Text style={s.optHeading}>Restaurant Rating</Text>
              <View style={s.optGrid}>
                {filterTile("rating-35-plus", "Rated 3.5+", Star, true)}
                {filterTile("rating-4-plus", "Rated 4.0+", Star, true)}
                {filterTile("rating-45-plus", "Rated 4.5+", Star, true)}
              </View>
            </View>

            {/* Distance Tab */}
            <View onLayout={sectionLayout("distance")} style={s.optSection}>
              <Text style={s.optHeading}>Distance</Text>
              <View style={s.optGrid}>
                {filterTile("distance-under-1km", "Under 1 km", MapPin)}
                {filterTile("distance-under-2km", "Under 2 km", MapPin)}
              </View>
            </View>

            {/* Price Tab */}
            <View onLayout={sectionLayout("price")} style={s.optSection}>
              <Text style={s.optHeading}>Dish Price</Text>
              <View style={{ gap: sp(3) }}>
                {filterRow("price-under-200", "Under ₹200")}
                {filterRow("price-under-500", "Under ₹500")}
              </View>
            </View>

            {/* Trust Markers Tab */}
            <View onLayout={sectionLayout("trust")} style={s.optSection}>
              <Text style={s.optHeading}>Trust Markers</Text>
              <View style={{ gap: sp(3) }}>
                {filterRow("top-rated", "Top Rated")}
                {filterRow("trusted", "Trusted by 1000+ users")}
              </View>
            </View>

            {/* Offers Tab */}
            <View onLayout={sectionLayout("offers")} style={s.optSection}>
              <Text style={s.optHeading}>Offers</Text>
              <View style={{ gap: sp(3) }}>
                {filterRow("has-offers", "Restaurants with offers")}
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Footer */}
        <View style={s.filterFooter}>
          <Pressable onPress={() => setIsFilterOpen(false)} style={{ flex: 1, paddingVertical: sp(3), alignItems: "center" }}>
            <Text style={s.filterCloseText}>Close</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              setIsFilterOpen(false);
              await applyFiltersAndRefetch(
                activeFilters,
                sortBy,
                selectedCuisine,
              );
            }}
            disabled={isLoadingFilterResults}
            style={({ pressed }) => [s.showResults, { backgroundColor: filtersDirty ? (pressed ? "#991B1B" : BRAND_RED) : colors.gray[200] }]}
          >
            <Text style={[s.showResultsText, { color: filtersDirty ? colors.white : colors.gray[500] }]}>
              {isLoadingFilterResults
                ? "Loading..."
                : filtersDirty
                  ? `Show results`
                  : "Show results"}
            </Text>
          </Pressable>
        </View>
      </Sheet>

      {/* Veg Mode Popup */}
      <Modal visible={showVegModePopup} transparent statusBarTranslucent animationType="fade" onRequestClose={closeVegPopup}>
        <Pressable style={[StyleSheetAbs, { backgroundColor: alpha(colors.black, 0.3) }]} onPress={closeVegPopup} />
        <Animated.View
          style={[
            s.vegPopup,
            {
              top: popupPosition.top,
              left: popupPosition.left,
              width: Math.min(Dimensions.get("window").width - 32, 320),
              opacity: vegPop.opacity,
              transform: [{ translateY: vegPop.v.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }, { scale: vegPop.scale }],
            },
          ]}
        >
          {/* Pointer Triangle */}
          <View style={[s.vegTriangle, { left: popupPosition.triangleLeft - 6 }]} />

          {/* Title */}
          <Text style={s.vegPopupTitle}>See veg dishes from</Text>

          {/* Radio Options */}
          <View style={{ gap: sp(2), marginBottom: sp(4) }}>
            {[
              { value: "all", label: "All restaurants" },
              { value: "pure-veg", label: "Pure Veg restaurants only" },
            ].map((opt) => {
              const checked = vegModeOption === opt.value;
              return (
                <Pressable key={opt.value} onPress={() => setVegModeOption(opt.value)} style={({ pressed }) => [s.radioRow, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] }]}>
                  <View style={[s.radio, checked ? s.radioOn : s.radioOff]}>
                    {checked && <View style={s.radioDot} />}
                  </View>
                  <Text style={s.radioLabel}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Apply Button */}
          <Pressable
            onPress={() => {
              setShowVegModePopup(false);
              setIsApplyingVegMode(true);
              // Confirm veg mode is ON by updating context and prevVegMode
              setVegModeContext(true);
              setPrevVegMode(true);
              // Simulate applying veg mode settings
              setTimeout(() => {
                setIsApplyingVegMode(false);
              }, 2000);
            }}
            style={({ pressed }) => [s.applyBtn, pressed && { backgroundColor: "#991B1B" }]}
          >
            <Text style={s.applyText}>Apply</Text>
          </Pressable>
        </Animated.View>
      </Modal>

      {/* Switch Off Veg Mode Popup */}
      <Modal visible={showSwitchOffPopup} transparent statusBarTranslucent animationType="fade" onRequestClose={keepVegMode}>
        <Pressable style={[StyleSheetAbs, { backgroundColor: alpha(colors.black, 0.5) }]} onPress={keepVegMode} />
        <View style={s.centerWrap} pointerEvents="box-none">
          <Animated.View style={[s.switchCard, { opacity: switchOffPop.opacity, transform: [{ scale: switchOffPop.scale }] }]}>
            {/* Warning Icon */}
            <View style={{ alignItems: "center", marginBottom: sp(4) }}>
              <View style={s.warnCircle}>
                <View style={s.warnInner}>
                  <AlertCircle size={64} color={colors.white} strokeWidth={2.5} />
                </View>
              </View>
            </View>

            {/* Title */}
            <Text style={s.switchTitle}>Switch off Veg Mode?</Text>

            {/* Description */}
            <Text style={s.switchDesc}>
              You'll see all restaurants, including those serving non-veg
              dishes
            </Text>

            {/* Buttons */}
            <View style={{ gap: sp(3) }}>
              <Pressable
                onPress={() => {
                  setShowSwitchOffPopup(false);
                  setIsSwitchingOffVegMode(true);
                  // Simulate switching off veg mode
                  setTimeout(() => {
                    setIsSwitchingOffVegMode(false);
                    isHandlingSwitchOff.current = false;
                    setVegModeContext(false);
                    setPrevVegMode(false); // Set to false to match current state (veg mode is OFF)
                  }, 2000);
                }}
                style={({ pressed }) => [s.switchBtn, pressed && { backgroundColor: colors.red[50] }]}
              >
                <Text style={[s.switchBtnText, { color: colors.red[600] }]}>Switch off</Text>
              </Pressable>

              <Pressable onPress={keepVegMode} style={({ pressed }) => [s.switchBtn, pressed && { backgroundColor: colors.gray[200] }]}>
                <Text style={[s.switchBtnText, { color: colors.gray[900] }]}>Keep using this mode</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* All Categories Modal */}
      <Modal visible={showAllCategoriesModal} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setShowAllCategoriesModal(false)}>
        <Pressable style={[StyleSheetAbs, { backgroundColor: alpha(colors.black, 0.4) }]} onPress={() => setShowAllCategoriesModal(false)} />
        <View style={s.allCatPanel}>
          {/* Header */}
          <View style={s.allCatHeader}>
            <Text style={s.allCatTitle}>All Categories</Text>
            <Pressable onPress={() => setShowAllCategoriesModal(false)} style={{ padding: sp(1.5), borderRadius: 9999 }} accessibilityLabel="Close">
              <X size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />
            </Pressable>
          </View>

          {/* Categories Grid - Scrollable */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={s.allCatGrid}>
            {displayCategories.map((category, index) => {
              const categoryData = {
                name: category.name || category.label,
                image: category.image || category.imageUrl,
                slug: category.slug,
              };
              return (
                <Link
                  key={category.id || index}
                  to={toFoodUserPath(`/user/category/${categoryData.slug || categoryData.name.toLowerCase().replace(/\s+/g, "-")}`)}
                  onPress={() => {
                    rememberLeaveForCategory();
                    setShowAllCategoriesModal(false);
                  }}
                  style={s.allCatCell}
                >
                  <View style={s.allCatCircle}>
                    <OptimizedImage src={categoryData.image} alt={categoryData.name} style={{ width: "100%", height: "100%" }} priority={index < 8} />
                  </View>
                  <Text style={s.allCatName}>{categoryData.name}</Text>
                </Link>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* Applying Veg Mode */}
      <Modal visible={isApplyingVegMode} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={s.fullOverlay}>
          <View style={{ width: "100%", height: 128, alignItems: "center", justifyContent: "center" }}>
            {/* Animated circles - positioned absolutely at the center */}
            {[...Array(8)].map((_, i) => (
              <VegRing key={i} index={i} />
            ))}

            {/* 100% VEG badge - absolute positioning at exact center */}
            <View style={s.vegBadge}>
              <Text style={s.vegBadgeText}>100%</Text>
              <Text style={[s.vegBadgeText, { marginTop: 2 }]}>VEG</Text>
            </View>

            {/* Text below badge */}
            <Text style={s.vegExplore}>Explore veg dishes from all restaurants</Text>
          </View>
        </View>
      </Modal>

      {/* Loading Screen - Switching Off Veg Mode */}
      <Modal visible={isSwitchingOffVegMode} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={s.fullOverlay}>
          <View style={{ alignItems: "center", gap: sp(6) }}>
            {/* Two Circles Spinning in Opposite Directions */}
            <View style={{ width: 64, height: 64, alignItems: "center", justifyContent: "center" }}>
              <Spinner size={64} duration={1500} style={{ borderTopColor: s.pinkArc.color, borderRightColor: s.pinkArc.color }} />
              <Spinner size={48} duration={1000} reverse style={{ borderRightColor: s.pinkArc.color }} />
            </View>

            {/* Loading Text */}
            <View style={{ alignItems: "center" }}>
              <Text style={[s.switchingText, { marginBottom: sp(1) }]}>Switching off</Text>
              <Text style={s.switchingText}>Veg Mode for you</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast Notification - Fixed to viewport bottom */}
      <Animated.View
        pointerEvents="none"
        style={[
          s.toast,
          {
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) }],
          },
        ]}
      >
        <Text style={s.toastText}>Added to bookmark</Text>
      </Animated.View>

      {/* Manage Collections Modal */}
      <Sheet open={showManageCollections} onClose={() => setShowManageCollections(false)} backdropOpacity={0.4} style={{ backgroundColor: colors.white }}>
        {/* Header */}
        <View style={s.mcHeader}>
          <Text style={s.mcTitle}>Manage Collections</Text>
          <Pressable onPress={() => setShowManageCollections(false)} style={s.mcClose}>
            <X size={16} color={colors.white} />
          </Pressable>
        </View>

        {/* Collections List */}
        <ScrollView style={{ maxHeight: Dimensions.get("window").height * 0.6 }} contentContainerStyle={{ paddingHorizontal: sp(4), paddingVertical: sp(4), gap: sp(2) }}>
          {/* Bookmarks Collection */}
          <View style={s.mcRow}>
            <View style={s.mcIcon}>
              <Bookmark size={24} color={colors.red[500]} fill={colors.red[500]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={s.mcRowTitle}>Bookmarks</Text>
                {selectedRestaurantSlug ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      const checked = !isFavorite(selectedRestaurantSlug);
                      if (!checked) {
                        removeFavorite(selectedRestaurantSlug);
                        setSelectedRestaurantSlug(null);
                        setShowManageCollections(false);
                      }
                    }}
                    style={[s.checkbox, isFavorite(selectedRestaurantSlug) ? { backgroundColor: colors.green[500], borderColor: colors.green[500] } : { borderColor: colors.green[500] }]}
                  >
                    {isFavorite(selectedRestaurantSlug) && <Check size={14} color={colors.white} strokeWidth={3} />}
                  </Pressable>
                ) : (
                  <View style={[s.checkbox, { backgroundColor: colors.red[500], borderColor: colors.red[500] }]}>
                    <Check size={12} color={colors.white} />
                  </View>
                )}
              </View>
              <Text style={s.mcCount}>
                {getFavorites().length} restaurant
                {getFavorites().length !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {/* Create new Collection */}
          <Pressable style={({ pressed }) => [s.mcRow, pressed && { backgroundColor: colors.gray[50] }]} onPress={() => setShowManageCollections(false)}>
            <View style={s.mcIcon}>
              <Plus size={24} color={colors.red[500]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mcRowTitle}>Create new Collection</Text>
            </View>
          </Pressable>
        </ScrollView>

        {/* Done Button */}
        <View style={{ borderTopWidth: 1, borderTopColor: colors.gray[200], paddingHorizontal: sp(4), paddingVertical: sp(4) }}>
          <Pressable
            onPress={() => {
              setSelectedRestaurantSlug(null);
              setShowManageCollections(false);
            }}
            style={({ pressed }) => [s.doneBtn, pressed && { backgroundColor: colors.gray[400] }]}
          >
            <Text style={s.doneText}>Done</Text>
          </Pressable>
        </View>
      </Sheet>

      <StickyCartCard />
      {/* Live order strip: only on homepage (not in UserLayout) */}
      <OrderTrackingCard hasBottomNav />
    </View>
  );
}

/** Explore More row: 4-column grid, or a sideways slider (4½ icons visible) when there are 5 items. */
function ExploreRow({ items, slides }) {
  const s = useStyles();
  const [w, setW] = useState(0);
  const gap = 6;
  const cell = slides ? (w - 24) / 4.5 : (w - gap * 3) / 4;
  const renderItem = (item, index) => (
    <ExploreCell key={item.id} item={item} index={index} width={cell} />
  );
  return (
    <View style={{ paddingHorizontal: 18, paddingBottom: sp(4) }} onLayout={(e) => setW(e.nativeEvent.layout.width - 36)}>
      {w > 0 && (slides ? (
        <ScrollView style={{ flexGrow: 0 }}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cell + gap}
          decelerationRate="fast"
          contentContainerStyle={{ gap }}
        >
          {items.map(renderItem)}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: "row", gap }}>{items.map(renderItem)}</View>
      ))}
      {!w && <View style={s.exploreSpacer} />}
    </View>
  );
}

function ExploreCell({ item, width }) {
  const s = useStyles();
  return (
    <Link to={item.href} state={{ from: '/food/user' }} accessibilityLabel={item.label} style={{ width }}>
      {({ pressed }) => (
        <View style={[{ alignItems: "center", gap: sp(1.5) }, pressed && { transform: [{ scale: 0.95 }] }]}>
          <View style={s.exploreTile}>
            <ExploreIconImage
              src={item.image}
              fallbackSrc={item.fallbackImage === "" ? "" : item.fallbackImage || exploreOffers}
            />
          </View>
          <Text numberOfLines={1} style={s.exploreLabel}>{item.label}</Text>
        </View>
      )}
    </Link>
  );
}

function StickyFade({ children, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}

function PulseDot() {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: colors.red[500], opacity: v }} />;
}

const useStyles = makeStyles((t) => {
  const pageBg = t.dark ? "#0a0a0a" : colors.white;
  const cardBg = t.dark ? "#1a1a1a" : colors.white;
  return {
    root: { flex: 1, backgroundColor: pageBg },
    listContent: { paddingBottom: sp(16), backgroundColor: pageBg },
    topWrap: { overflow: "hidden", backgroundColor: pageBg },
    brandTop: { overflow: "hidden", borderBottomLeftRadius: 32, borderBottomRightRadius: 32, marginBottom: sp(2), ...shadow.lg },
    // takeaway header
    takeawayHead: { paddingHorizontal: sp(4), paddingTop: sp(2), paddingBottom: sp(4) },
    takeawayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    selfPickup: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: colors.gray[200], textTransform: "uppercase", letterSpacing: 2, marginBottom: 2 },
    takeawayTitle: { ...fontSize.xl, fontWeight: "700", color: colors.white },
    roundBtn: { padding: sp(2.5), borderRadius: 9999, backgroundColor: t.dark ? alpha(colors.black, 0.2) : alpha(colors.white, 0.2), alignItems: "center", justifyContent: "center" },
    cartBadge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: BRAND_RED,
      height: 18,
      minWidth: 18,
      borderRadius: 9999,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: t.dark ? "#1a1a1a" : colors.white,
      paddingHorizontal: 2,
    },
    cartBadgeText: { fontSize: 9, lineHeight: 11, fontWeight: "700", color: colors.white },
    takeawayAvatar: { height: 40, width: 40, borderRadius: 9999, borderWidth: 1.5, borderColor: colors.white, overflow: "hidden", backgroundColor: "#FFF5E6" },
    takeawaySearch: {
      marginTop: sp(3),
      backgroundColor: t.dark ? "#1a1a1a" : colors.gray[50],
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.gray[200],
      padding: sp(2),
      flexDirection: "row",
      alignItems: "center",
    },
    takeawayInput: { height: 24, fontSize: 13, fontWeight: "700", color: t.dark ? colors.white : colors.gray[700], padding: 0 },
    clearCircle: { height: 28, width: 28, borderRadius: 9999, alignItems: "center", justifyContent: "center", backgroundColor: t.dark ? colors.gray[700] : alpha(colors.gray[200], 0.9) },
    closeCircle: { height: 28, width: 28, borderRadius: 9999, alignItems: "center", justifyContent: "center", backgroundColor: alpha(BRAND_RED, 0.1) },
    pickupBlock: { paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(1), backgroundColor: pageBg },
    pickupIcon: { padding: sp(2), backgroundColor: t.dark ? alpha(colors.green[900], 0.3) : colors.green[100], borderRadius: radius.xl },
    pickupTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
    pickupSub: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: colors.gray[500], flexShrink: 1 },
    // categories
    categoriesSection: { paddingVertical: sp(2.5), backgroundColor: pageBg },
    catRow: { gap: sp(1.5), paddingBottom: sp(2), paddingHorizontal: sp(4) },
    catItem: { width: 92, alignItems: "center", gap: sp(2.5) },
    catCircle: {
      width: 80,
      height: 80,
      borderRadius: 9999,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: t.dark ? colors.gray[800] : colors.gray[100],
      backgroundColor: cardBg,
      ...shadow.md,
    },
    seeAllCircle: {
      alignItems: "center",
      justifyContent: "center",
      borderColor: t.dark ? alpha(colors.red[950], 0.3) : colors.red[100],
      backgroundColor: t.dark ? alpha(colors.red[950], 0.2) : colors.red[50],
    },
    catName: { fontSize: 10, lineHeight: 12, fontWeight: "700", color: t.dark ? colors.gray[300] : colors.gray[600], textAlign: "center", width: "100%", paddingHorizontal: 2 },
    seeAllArrow: { fontSize: 7, color: colors.red[500] },
    // hero
    heroPad: { paddingHorizontal: sp(4), paddingVertical: sp(2) },
    heroShell: { width: "100%", overflow: "hidden", borderRadius: radius["2xl"], backgroundColor: colors.white, ...shadow.sm },
    dots: { position: "absolute", bottom: sp(3), right: sp(3), zIndex: 30, flexDirection: "row", alignItems: "center", gap: sp(1.5) },
    dot: { width: 6, height: 6, borderRadius: 9999, backgroundColor: alpha(colors.white, 0.5) },
    dotActive: { width: 16, height: 6, borderRadius: 9999, backgroundColor: colors.white, ...shadow.sm },
    // filter chips
    filterBar: {
      paddingVertical: sp(2.5),
      backgroundColor: t.dark ? alpha("#0a0a0a", 0.95) : alpha(colors.white, 0.95),
      borderBottomWidth: 1,
      borderBottomColor: t.dark ? alpha(colors.white, 0.05) : colors.gray[100],
      zIndex: 40,
      ...shadow.sm,
    },
    filterRow: { gap: sp(2), paddingHorizontal: sp(4), alignItems: "center" },
    filtersBtn: {
      height: 36,
      paddingHorizontal: sp(4),
      borderRadius: 9999,
      flexDirection: "row",
      alignItems: "center",
      gap: sp(1.5),
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: colors.gray[200],
      ...shadow.sm,
    },
    filtersBtnText: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: t.dark ? colors.white : colors.black, textTransform: "uppercase", letterSpacing: -0.3 },
    chip: { height: 36, paddingHorizontal: sp(4), borderRadius: 9999, flexDirection: "row", alignItems: "center", gap: sp(2), borderWidth: 1, ...shadow.sm },
    chipActive: { backgroundColor: BRAND_RED, borderColor: BRAND_RED },
    chipIdle: { backgroundColor: cardBg, borderColor: t.dark ? colors.gray[800] : colors.gray[100] },
    chipText: { fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: -0.3 },
    // recommended
    recoHeading: { ...fontSize.xs, fontWeight: "600", color: t.dark ? colors.gray[500] : colors.gray[400], letterSpacing: 1.2, textTransform: "uppercase", marginBottom: sp(2), paddingHorizontal: sp(4) },
    recoRow: { gap: 14, paddingBottom: sp(4), paddingHorizontal: sp(4) },
    recoCard: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: t.dark ? colors.gray[800] : alpha(colors.gray[200], 0.7), backgroundColor: cardBg, ...shadow.md },
    recoImage: { height: 96, backgroundColor: colors.gray[50] },
    recoRating: { position: "absolute", bottom: sp(2), left: sp(2), paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: radius.lg, borderWidth: 1, borderColor: alpha(colors.white, 0.1), ...shadow.lg },
    recoRatingOn: { backgroundColor: alpha(colors.black, 0.8) },
    recoRatingNew: { backgroundColor: alpha(colors.gray[200], 0.9) },
    recoRatingText: { fontSize: 10, lineHeight: 14, fontWeight: "500" },
    recoName: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900], letterSpacing: -0.3 },
    recoTag: { flexDirection: "row", alignItems: "center", gap: sp(1), marginTop: sp(1) },
    recoTagText: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: BRAND_RED, textTransform: "uppercase", letterSpacing: 0.5 },
    // explore
    exploreHead: { paddingHorizontal: sp(4), marginBottom: sp(3), flexDirection: "row", alignItems: "center", gap: sp(2) },
    exploreHeading: { fontSize: 11, lineHeight: 14, fontWeight: "900", color: colors.gray[400], textTransform: "uppercase", letterSpacing: 1.1 },
    exploreLine: { height: 1, flex: 1, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] },
    exploreSpacer: { height: 90 },
    exploreTile: {
      width: "100%",
      aspectRatio: 1,
      borderRadius: radius["2xl"],
      backgroundColor: cardBg,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.gray[100],
      padding: sp(1),
      ...shadow.sm,
    },
    exploreLabel: { fontSize: 9, lineHeight: 11, fontWeight: "700", color: t.dark ? colors.gray[400] : colors.gray[500], textAlign: "center", letterSpacing: -0.4, textTransform: "uppercase", width: "100%", paddingHorizontal: 2 },
    // restaurants
    sectionSubtitle: { fontSize: 11, lineHeight: 16, fontWeight: "600", color: "#5d80a3", letterSpacing: 1.65, textTransform: "uppercase" },
    sectionTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.gray[200] : "#364d66", letterSpacing: -0.4 },
    skeletonWrap: { minHeight: 360, marginHorizontal: sp(4), borderRadius: radius.lg, backgroundColor: t.dark ? alpha("#1a1a1a", 0.94) : alpha(colors.white, 0.94) },
    takeawayEmpty: { alignItems: "center", justifyContent: "center", paddingVertical: sp(14), paddingHorizontal: sp(6) },
    takeawayEmptyIcon: { width: 64, height: 64, borderRadius: 9999, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: sp(4) },
    takeawayEmptyTitle: { ...fontSize.base, fontWeight: "700", color: t.dark ? colors.gray[200] : colors.gray[800], textAlign: "center" },
    takeawayEmptySub: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: sp(1.5), maxWidth: 320, textAlign: "center" },
    cardOuter: { paddingHorizontal: sp(4), paddingTop: sp(1), paddingBottom: sp(3.5) },
    card: {
      overflow: "hidden",
      borderWidth: 1,
      borderColor: t.dark ? alpha(colors.gray[800], 0.8) : alpha(colors.gray[200], 0.7),
      backgroundColor: cardBg,
      borderRadius: 20,
      ...shadow.sm,
    },
    bookmarkWrap: { position: "absolute", top: sp(3), right: sp(3), zIndex: 10 },
    bookmarkBtn: { height: 36, width: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", ...shadow.xl },
    cardContent: { padding: sp(3), paddingTop: sp(3) },
    nameRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(2), marginBottom: sp(1) },
    restName: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: t.dark ? colors.white : "#1c1c1c", letterSpacing: -0.3 },
    timeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp(1), marginTop: sp(1) },
    timeText: { ...fontSize.sm, fontWeight: "600", color: "#257d3c" },
    couponRow: { flexDirection: "row", alignItems: "center", gap: sp(2), marginTop: sp(2), overflow: "hidden", height: 20 },
    couponIcon: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
    couponTextBox: { flex: 1, height: "100%", overflow: "hidden", minWidth: 0, justifyContent: "center" },
    couponAbs: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "center" },
    couponText: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: t.dark ? colors.slate[300] : colors.slate[700], letterSpacing: 0.3 },
    ratingBadge: { backgroundColor: "#257d3c", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: sp(1) },
    ratingText: { fontSize: 13, lineHeight: 16, fontWeight: "700", color: colors.white, letterSpacing: -0.2 },
    ratingCount: { fontSize: 10, lineHeight: 14, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: 2 },
    availRow: { flexDirection: "row", alignItems: "center", gap: sp(1), marginTop: sp(1) },
    availBadge: { flexDirection: "row", alignItems: "center", gap: sp(1.5), paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: radius.md, borderWidth: 1 },
    availOffline: { backgroundColor: t.dark ? alpha(colors.red[950], 0.2) : colors.red[50], borderColor: t.dark ? alpha(colors.red[900], 0.3) : colors.red[100] },
    availClosed: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], borderColor: t.dark ? colors.gray[700] : colors.gray[200] },
    availText: { fontSize: 10, lineHeight: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.25 },
    footer: { alignItems: "center", paddingTop: sp(2), gap: sp(2), paddingHorizontal: sp(4), paddingBottom: sp(8) },
    loadMore: { height: 36, paddingHorizontal: sp(4), borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300], alignItems: "center", justifyContent: "center", backgroundColor: t.dark ? alpha(brandInputColor, 0.3) : colors.white, ...shadow.xs },
    loadMoreText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.white : "#2e1f12" },
    // sticky header
    sticky: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      // solid: the native app has no backdrop blur, a see-through bar showed the list scrolling behind it
      backgroundColor: t.dark ? "#0a0a0a" : colors.white,
      borderBottomWidth: 1,
      borderBottomColor: t.dark ? alpha(colors.white, 0.06) : colors.gray[100],
      ...shadow.lg,
    },
    stickySearchRow: { paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(2), flexDirection: "row", alignItems: "center", gap: sp(3) },
    stickySearch: {
      flex: 1,
      backgroundColor: cardBg,
      borderRadius: radius["2xl"],
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: sp(4),
      paddingVertical: sp(3),
      borderWidth: 2,
      borderColor: t.dark ? alpha(BRAND_RED, 0.5) : alpha(BRAND_RED, 0.3),
      ...shadow.md,
    },
    stickyPlaceholder: { ...fontSize.base, lineHeight: 20, fontWeight: "500", color: colors.gray[400] },
    stickyDivider: { height: 20, width: 1, backgroundColor: t.dark ? alpha(colors.white, 0.1) : colors.gray[200], marginHorizontal: sp(2) },
    stickyVegLabel: { fontSize: 8, lineHeight: 8, fontWeight: "900", color: t.dark ? colors.gray[400] : colors.gray[500], textTransform: "uppercase", letterSpacing: 0.8 },
    stickyToggle: { width: 40, height: 18, borderRadius: 9999, borderWidth: 1, borderColor: t.dark ? alpha(colors.white, 0.1) : colors.gray[200], ...shadow.sm },
    stickyToggleOff: { backgroundColor: t.dark ? colors.gray[700] : colors.gray[300] },
    stickyKnob: { position: "absolute", top: 1, width: 14, height: 14, borderRadius: 9999, backgroundColor: colors.white, ...shadow.sm },
    stickyCatRow: { gap: sp(5), paddingTop: sp(3), paddingBottom: sp(2), paddingHorizontal: sp(4) },
    stickyCatItem: { width: 74, alignItems: "center", gap: sp(1.5) },
    stickyCatCircle: {
      width: 72,
      height: 72,
      borderRadius: 9999,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: t.dark ? alpha(colors.white, 0.1) : colors.gray[100],
      backgroundColor: t.dark ? alpha(colors.white, 0.05) : colors.white,
      ...shadow.md,
    },
    stickyCatName: { fontSize: 9, lineHeight: 12, fontWeight: "700", color: t.dark ? colors.gray[300] : colors.gray[700], textAlign: "center", width: "100%", textTransform: "uppercase", letterSpacing: -0.4 },
    // filter sheet
    filterSheet: { backgroundColor: cardBg },
    filterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : brandBorderColor },
    filterTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
    clearAllText: { ...fontSize.sm, fontWeight: "500", color: BRAND_RED },
    tabRail: { width: 96, backgroundColor: t.dark ? "#0a0a0a" : colors.gray[50], borderRightWidth: 1, borderRightColor: t.dark ? colors.gray[800] : brandBorderColor },
    tabItem: { alignItems: "center", gap: sp(1), paddingVertical: sp(4), paddingHorizontal: sp(2) },
    tabMarker: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: BRAND_RED, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
    tabLabel: { ...fontSize.xs, lineHeight: 14, fontWeight: "500", textAlign: "center" },
    optSection: { marginBottom: sp(8) },
    optHeading: { ...fontSize.lg, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(4) },
    optGrid: { flexDirection: "row", flexWrap: "wrap", gap: sp(3) },
    optBox: { borderRadius: radius.xl, borderWidth: 1 },
    optBoxActive: { borderColor: BRAND_RED, backgroundColor: t.dark ? alpha(colors.green[900], 0.2) : "#F9F9FB" },
    optBoxIdle: { borderColor: t.dark ? colors.gray[800] : colors.gray[200] },
    optTile: { width: "47.5%", alignItems: "center", gap: sp(2), padding: sp(4) },
    optRow: { paddingHorizontal: sp(4), paddingVertical: sp(3) },
    optText: { ...fontSize.sm, fontWeight: "500" },
    filterFooter: { flexDirection: "row", alignItems: "center", gap: sp(4), paddingHorizontal: sp(4), paddingVertical: sp(4), borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : brandBorderColor, backgroundColor: cardBg },
    filterCloseText: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700] },
    showResults: { flex: 1, paddingVertical: sp(3), borderRadius: radius.xl, alignItems: "center" },
    showResultsText: { ...fontSize.base, fontWeight: "600" },
    // veg popup
    vegPopup: { position: "absolute", zIndex: 9999, backgroundColor: cardBg, borderRadius: radius["2xl"], padding: sp(4), ...shadow["2xl"] },
    vegTriangle: { position: "absolute", top: -6, width: 12, height: 12, backgroundColor: cardBg, transform: [{ rotate: "45deg" }] },
    vegPopupTitle: { ...fontSize.base, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(3) },
    radioRow: { flexDirection: "row", alignItems: "center", gap: sp(2.5), padding: sp(1.5), borderRadius: radius.lg },
    radio: { width: 16, height: 16, borderRadius: 9999, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    radioOn: { borderColor: t.dark ? colors.green[500] : colors.green[600], backgroundColor: t.dark ? colors.green[500] : colors.green[600] },
    radioOff: { borderColor: t.dark ? colors.gray[600] : colors.gray[300], backgroundColor: t.dark ? "#2a2a2a" : colors.white },
    radioDot: { width: 6, height: 6, borderRadius: 9999, backgroundColor: colors.white },
    radioLabel: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.white : colors.gray[900] },
    applyBtn: { width: "100%", backgroundColor: BRAND_RED, paddingVertical: sp(2.5), borderRadius: radius.xl, alignItems: "center", marginBottom: sp(2) },
    applyText: { ...fontSize.sm, fontWeight: "600", color: colors.white },
    centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: sp(4) },
    switchCard: { backgroundColor: colors.white, borderRadius: radius["2xl"], width: "85%", maxWidth: 384, padding: sp(6), ...shadow["2xl"] },
    warnCircle: { width: 80, height: 80, borderRadius: 9999, backgroundColor: colors.pink[100], alignItems: "center", justifyContent: "center" },
    warnInner: { width: 80, height: 80, borderRadius: 9999, backgroundColor: alpha(colors.red[500], 0.9), alignItems: "center", justifyContent: "center" },
    switchTitle: { ...fontSize["2xl"], fontWeight: "700", color: colors.gray[900], textAlign: "center", marginBottom: sp(2) },
    switchDesc: { ...fontSize.sm, color: colors.gray[600], textAlign: "center", marginBottom: sp(6) },
    switchBtn: { width: "100%", paddingVertical: sp(1), borderRadius: radius.xl, alignItems: "center" },
    switchBtnText: { ...fontSize.base, fontWeight: "400" },
    // all categories
    allCatPanel: { position: "absolute", left: 0, right: 0, bottom: 0, top: 48, backgroundColor: cardBg, borderTopLeftRadius: radius["3xl"], borderTopRightRadius: radius["3xl"], overflow: "hidden", ...shadow["2xl"] },
    allCatHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(5), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[200] },
    allCatTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
    allCatGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: sp(4), paddingVertical: sp(4), rowGap: sp(4), columnGap: sp(4) },
    allCatCell: { width: "29.5%", alignItems: "center", gap: sp(2) },
    allCatCircle: { width: 80, height: 80, borderRadius: 9999, overflow: "hidden", backgroundColor: colors.white, ...shadow.md },
    allCatName: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.gray[200] : colors.gray[800], textAlign: "center", paddingHorizontal: sp(1) },
    // veg mode full-screen states
    fullOverlay: { flex: 1, backgroundColor: pageBg, alignItems: "center", justifyContent: "center" },
    vegRing: { position: "absolute", width: 112, height: 112, borderRadius: 9999, borderWidth: 1, borderColor: t.dark ? colors.green[600] : colors.green[300] },
    vegBadge: {
      position: "absolute",
      zIndex: 10,
      width: 112,
      height: 112,
      borderRadius: 9999,
      borderWidth: 2,
      borderColor: t.dark ? colors.green[500] : colors.green[600],
      backgroundColor: cardBg,
      alignItems: "center",
      justifyContent: "center",
      ...shadow.sm,
    },
    vegBadgeText: { color: t.dark ? colors.green[400] : colors.green[600], fontWeight: "800", fontSize: 30, lineHeight: 30 },
    vegExplore: { ...fontSize.xl, fontWeight: "400", color: t.dark ? colors.gray[200] : colors.gray[800], textAlign: "center", zIndex: 10, marginTop: 224, width: "100%" },
    pinkArc: { color: t.dark ? colors.pink[400] : colors.pink[500] },
    switchingText: { ...fontSize.xl, fontWeight: "400", color: t.dark ? colors.gray[200] : colors.gray[800] },
    // bookmark toast
    toast: { position: "absolute", bottom: sp(20), alignSelf: "center", zIndex: 10001, backgroundColor: colors.black, paddingHorizontal: sp(6), paddingVertical: sp(3), borderRadius: radius.lg, ...shadow["2xl"] },
    toastText: { ...fontSize.sm, fontWeight: "500", color: colors.white },
    // manage collections
    mcHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingTop: sp(6), paddingBottom: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
    mcTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900] },
    mcClose: { height: 32, width: 32, borderRadius: 9999, backgroundColor: colors.gray[700], alignItems: "center", justifyContent: "center" },
    mcRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: sp(3), padding: sp(3), borderRadius: radius.lg },
    mcIcon: { height: 48, width: 48, borderRadius: radius.lg, backgroundColor: colors.pink[100], alignItems: "center", justifyContent: "center" },
    mcRowTitle: { ...fontSize.base, fontWeight: "500", color: colors.gray[900] },
    mcCount: { ...fontSize.sm, color: colors.gray[500], marginTop: sp(1) },
    checkbox: { height: 20, width: 20, borderRadius: radius.sm, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    doneBtn: { width: "100%", backgroundColor: colors.gray[300], paddingVertical: sp(3), borderRadius: radius.lg, alignItems: "center" },
    doneText: { ...fontSize.sm, fontWeight: "500", color: colors.gray[700] },
  };
});

