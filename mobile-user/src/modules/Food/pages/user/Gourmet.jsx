import React, { useState, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { ArrowLeft, Star, Clock, Bookmark, BadgePercent, Utensils } from "lucide-react-native";
import { Link, useNavigate } from "@/lib/router";
import { toast } from "@/lib/toast";
import { Screen, Text, AppImage } from "@/native/ui";
import { alpha, brand, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme";
import api from "@food/api";
import useAppBackNavigation from "@food/hooks/useAppBackNavigation";
import { API_BASE_URL } from "@food/api/config";
import OptimizedImage from "@food/components/OptimizedImage";
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons";
import { useDelayedLoading } from "@food/hooks/useDelayedLoading";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";
import { useProfile } from "@food/context/ProfileContext";
import { filterRestaurantsForVegMode } from "@food/utils/vegMode";

// Import banner
import gourmetBanner from "@food/assets/gourmet_new_banner.png";
const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

// Calculate distance if coordinates are available
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

/** "animate-pulse" green dot */
function PulseDot({ style }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]} />;
}

export default function Gourmet() {
  const navigate = useNavigate();
  const goBack = useAppBackNavigation();
  const t = useTheme();
  const s = useStyles();
  const { height } = useWindowDimensions();
  const [favorites, setFavorites] = useState(new Set());
  const [gourmetRestaurants, setGourmetRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const { location } = useLocation();
  const { zoneId } = useZone(location);
  const { vegMode, vegModeOption } = useProfile();
  const showGourmetSkeleton = useDelayedLoading(loading);

  // banner image: animate-in fade-in zoom-in duration-1000 (opacity 0 -> 1, scale 0 -> 1)
  const bannerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(bannerAnim, { toValue: 1, duration: 1000, easing: Easing.ease, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [bannerAnim]);

  const visibleGourmetRestaurants = useMemo(() => {
    let list = gourmetRestaurants;
    if (zoneId) {
      list = list.filter((r) => !r.zoneId || String(r.zoneId) === String(zoneId));
    }
    return filterRestaurantsForVegMode(list, { vegMode, vegModeOption });
  }, [gourmetRestaurants, vegMode, vegModeOption, zoneId]);

  const backendOrigin = (API_BASE_URL || "").replace(/\/api\/v1\/?$/, "");

  const resolveImageUrl = (url) => {
    if (typeof url !== "string") return "";
    const trimmed = url.trim();
    if (!trimmed) return "";
    if (/^(https?:|\/\/|data:|blob:)/i.test(trimmed)) return trimmed;
    if (!backendOrigin) return trimmed;
    return `${backendOrigin.replace(/\/$/, "")}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
  };

  // Fetch Gourmet restaurants from public API
  useEffect(() => {
    const fetchGourmetRestaurants = async () => {
      try {
        setLoading(true);
        setError(null);
        const reqConfig = zoneId ? { params: { zoneId } } : {};
        const response = await api.get("/food/hero-banners/gourmet/public", reqConfig);
        const data = response?.data?.data;
        const list = data?.restaurants ?? (Array.isArray(data) ? data : []);
        setGourmetRestaurants(list);
      } catch (err) {
        debugError("Error fetching Gourmet restaurants:", err);
        const errorMessage = err?.response?.data?.message || err?.message || "Failed to load Gourmet restaurants";
        setError(errorMessage);
        toast.error(errorMessage);
        setGourmetRestaurants([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGourmetRestaurants();
  }, [zoneId, reloadKey]);

  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const renderRestaurant = ({ item }) => {
    const restaurant = item.restaurant || item;
    const restaurantSlug =
      restaurant.slug ||
      restaurant.restaurantName?.toLowerCase().replace(/\s+/g, "-") ||
      restaurant.name?.toLowerCase().replace(/\s+/g, "-") ||
      "";
    const restaurantId = restaurant._id || restaurant.restaurantId || restaurant.id;
    const isFavorite = favorites.has(restaurantId);

    let distanceStr = "1.2 km";
    const restaurantLat = restaurant.location?.latitude || restaurant.location?.coordinates?.[1];
    const restaurantLng = restaurant.location?.longitude || restaurant.location?.coordinates?.[0];

    if (location?.latitude && location?.longitude && restaurantLat && restaurantLng) {
      const d = calculateDistance(location.latitude, location.longitude, restaurantLat, restaurantLng);
      distanceStr = `${d.toFixed(1)} km`;
    } else if (restaurant.distance) {
      distanceStr = restaurant.distance;
    }

    // Get restaurant cover image with priority: coverImages > menuImages > profileImage
    const coverImages =
      restaurant.coverImages && restaurant.coverImages.length > 0
        ? restaurant.coverImages.map((img) => img.url || img).filter(Boolean)
        : [];

    const menuImages =
      restaurant.menuImages && restaurant.menuImages.length > 0
        ? restaurant.menuImages.map((img) => img.url || img).filter(Boolean)
        : [];

    const rawRestaurantImage =
      coverImages.length > 0
        ? coverImages[0]
        : menuImages.length > 0
          ? menuImages[0]
          : restaurant.profileImage?.url || restaurant.profileImage || restaurant.image || "";

    const restaurantImage = resolveImageUrl(rawRestaurantImage);

    return (
      <Link to={`/user/restaurants/${restaurantSlug}`}>
        {({ pressed }) => (
          <View style={[s.card, pressed && { transform: [{ scale: 0.98 }] }]}>
            {/* Image Section */}
            <View style={s.imageWrap}>
              {restaurantImage ? (
                <OptimizedImage src={restaurantImage} alt={restaurant.restaurantName || restaurant.name} style={s.fill} />
              ) : (
                <View style={s.noImage}>
                  <Utensils size={32} color={colors.gray[200]} />
                </View>
              )}

              <LinearGradient
                colors={[alpha(colors.black, 0.6), "transparent", "transparent"]}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={[s.absFill, { opacity: 0.6 }]}
                pointerEvents="none"
              />

              {/* Bookmark Icon - Top Right */}
              <View style={s.bookmarkWrap}>
                <Pressable
                  onPress={() => toggleFavorite(restaurantId)}
                  style={({ pressed: p }) => [s.bookmarkBtn, p && { transform: [{ scale: 0.9 }] }]}
                >
                  <BlurView intensity={20} tint="light" style={s.absFill} />
                  <Bookmark
                    size={20}
                    color={isFavorite ? colors.white : alpha(colors.white, 0.8)}
                    fill={isFavorite ? colors.white : "none"}
                    strokeWidth={2}
                  />
                </Pressable>
              </View>

              {/* Rating Badge Overlay */}
              <View style={s.ratingBadge}>
                <Text style={s.ratingText}>{restaurant.rating?.toFixed(1) || "4.0"}</Text>
                <Star size={14} color="#DC2626" fill="#DC2626" />
              </View>
            </View>

            {/* Content Section */}
            <View style={s.cardContent}>
              {/* Restaurant Name */}
              <View style={s.nameRow}>
                <Text style={s.name} numberOfLines={1}>
                  {restaurant.restaurantName || restaurant.name}
                </Text>
              </View>

              {/* Delivery Time & Distance */}
              <View style={s.metaRow}>
                <View style={s.metaItem}>
                  <Clock size={16} color="#DC2626" strokeWidth={2.5} />
                  <Text style={s.metaText}>{(restaurant.estimatedDeliveryTime || "25-30 mins").toUpperCase()}</Text>
                </View>
                <Text style={[s.metaText, { color: colors.gray[200] }]}>•</Text>
                <View style={s.metaItem}>
                  <Text style={[s.metaText, s.distance]}>{`${distanceStr} away`.toUpperCase()}</Text>
                </View>
              </View>

              {/* Offer Badge */}
              {restaurant.offer ? (
                <View style={s.offer}>
                  <BadgePercent size={16} color="#DC2626" strokeWidth={3} />
                  <Text style={s.offerText}>{String(restaurant.offer).toUpperCase()}</Text>
                </View>
              ) : (
                <View style={s.elite}>
                  <Text style={s.eliteText}>ELITE SELECTION</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </Link>
    );
  };

  const header = (
    <>
      {/* Banner Section */}
      <View style={[s.banner, { height: height * 0.3 }]}>
        {/* Banner Image */}
        <View style={[s.absFill, { transform: [{ scale: 1.05 }] }]}>
          <Animated.View style={[s.absFill, { opacity: bannerAnim, transform: [{ scale: bannerAnim }] }]}>
            <AppImage src={gourmetBanner} style={s.fill} contentFit="cover" />
          </Animated.View>
          <LinearGradient
            colors={[alpha(colors.black, 0.8), alpha(colors.black, 0.4), "transparent"]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={s.absFill}
          />
        </View>

        {/* Back Button */}
        <Pressable onPress={goBack} style={({ pressed }) => [s.backBtn, pressed && { transform: [{ scale: 0.9 }], backgroundColor: alpha(colors.white, 0.4) }]}>
          <BlurView intensity={30} tint="light" style={s.absFill} />
          <ArrowLeft size={20} color={colors.white} />
        </Pressable>

        {/* Banner Text Overlay */}
        <View style={s.bannerText}>
          <View style={s.kickerRow}>
            <View style={s.kickerLine} />
            <Text style={s.kicker}>EXPERIENCE EXCELLENCE</Text>
          </View>
          <Text style={s.bannerTitle}>Gourmet Dining</Text>
          <Text style={s.bannerSub}>Indulge in carefully curated premium dining from the city's finest restaurants.</Text>
        </View>
      </View>

      <View style={s.contentTop}>
        {/* Restaurant Count */}
        <View style={s.countRow}>
          <Text style={s.countText}>
            {showGourmetSkeleton ? "..." : visibleGourmetRestaurants.length} PREMIER ESTABLISHMENTS
          </Text>
          <View style={s.liveRow}>
            <PulseDot style={s.liveDot} />
            <Text style={s.liveText}>LIVE DEALS AVAILABLE</Text>
          </View>
        </View>

        {/* Loading State */}
        {showGourmetSkeleton && <RestaurantGridSkeleton count={4} />}

        {/* Error State */}
        {error && !loading ? (
          <View style={s.errorWrap}>
            <Text style={s.errorText}>{error}</Text>
            <Pressable onPress={() => setReloadKey((k) => k + 1)} style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.9 }]}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );

  const showCards = !showGourmetSkeleton && !error;

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
      <FlatList
        data={showCards ? visibleGourmetRestaurants : []}
        keyExtractor={(item, index) => {
          const r = item.restaurant || item;
          return String(r._id || r.restaurantId || r.id || index);
        }}
        renderItem={renderRestaurant}
        ListHeaderComponent={header}
        ListEmptyComponent={
          showCards ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>No Gourmet restaurants available at the moment</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: sp(6) }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { width: "100%", height: "100%" },
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  banner: { position: "relative", width: "100%", overflow: "hidden", ...shadow["2xl"], backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  backBtn: {
    position: "absolute",
    top: sp(4),
    left: sp(4),
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: alpha(colors.white, 0.2),
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: { position: "absolute", bottom: sp(8), left: sp(6), right: sp(6), zIndex: 10, gap: sp(2) },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  kickerLine: { width: 32, height: 2, backgroundColor: "#DC2626" },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 3, color: alpha(colors.white, 0.8) },
  bannerTitle: {
    ...fontSize["3xl"],
    fontWeight: "900",
    color: colors.white,
    textShadowColor: alpha(colors.black, 0.25),
    textShadowOffset: { width: 0, height: 25 },
    textShadowRadius: 25,
  },
  bannerSub: { color: alpha(colors.white, 0.7), ...fontSize.sm, fontWeight: "500", maxWidth: 448 },
  contentTop: { paddingHorizontal: sp(4), paddingTop: sp(6), gap: sp(4), marginBottom: sp(4) },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: sp(2),
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.zinc[800] : colors.gray[100],
  },
  countText: { fontSize: 10, lineHeight: 14, fontWeight: "900", color: t.dark ? colors.gray[500] : colors.gray[400], letterSpacing: 2 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  liveDot: { height: 6, width: 6, borderRadius: radius.full, backgroundColor: colors.green[500] },
  liveText: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: colors.gray[500] },
  errorWrap: { alignItems: "center", justifyContent: "center", paddingVertical: sp(20) },
  errorText: { color: t.dark ? colors.red[400] : colors.red[500], textAlign: "center", ...fontSize.base },
  retryBtn: {
    marginTop: sp(4),
    height: 36,
    paddingHorizontal: sp(4),
    borderRadius: radius.md,
    backgroundColor: t.dark ? "#ebebeb" : brand.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.xs,
  },
  retryText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? "#171717" : brand.primaryForeground },
  card: {
    marginHorizontal: sp(4),
    overflow: "hidden",
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: 32,
    marginBottom: sp(4) + sp(4),
    ...(t.dark ? shadow.none : { ...shadow.xl, shadowColor: colors.gray[200], shadowOpacity: 0.2 }),
  },
  imageWrap: { position: "relative", height: 192, width: "100%", overflow: "hidden", borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  noImage: { width: "100%", height: "100%", backgroundColor: t.dark ? colors.zinc[800] : colors.gray[100], alignItems: "center", justifyContent: "center" },
  bookmarkWrap: { position: "absolute", top: sp(4), right: sp(4), zIndex: 10 },
  bookmarkBtn: {
    height: 40,
    width: 40,
    borderRadius: radius["2xl"],
    overflow: "hidden",
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    backgroundColor: alpha(colors.white, 0.1),
    alignItems: "center",
    justifyContent: "center",
  },
  ratingBadge: {
    position: "absolute",
    bottom: sp(4),
    right: sp(4),
    flexDirection: "row",
    alignItems: "center",
    gap: sp(1.5),
    backgroundColor: colors.white,
    paddingHorizontal: sp(3),
    paddingVertical: sp(1.5),
    borderRadius: radius["2xl"],
    ...shadow["2xl"],
  },
  ratingText: { ...fontSize.sm, fontWeight: "900", color: colors.gray[900] },
  cardContent: { padding: sp(5) },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(2), marginBottom: sp(3) },
  name: { ...fontSize.xl, fontWeight: "900", color: t.dark ? colors.gray[100] : colors.gray[900], flexShrink: 1 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: sp(4), marginBottom: sp(4) },
  metaItem: { flexDirection: "row", alignItems: "center", gap: sp(1.5) },
  metaText: { fontSize: 12, lineHeight: 16, fontWeight: "700", letterSpacing: -0.3, color: t.dark ? colors.gray[400] : colors.gray[500] },
  distance: { color: "#F87171", fontWeight: "900" },
  offer: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2.5),
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    backgroundColor: alpha("#DC2626", t.dark ? 0.1 : 0.05),
    borderRadius: radius["2xl"],
    alignSelf: "flex-start",
  },
  offerText: { fontSize: 10, lineHeight: 14, fontWeight: "900", color: "#DC2626", letterSpacing: 1 },
  elite: {
    backgroundColor: t.dark ? colors.zinc[900] : colors.gray[50],
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    borderRadius: radius["2xl"],
    alignSelf: "flex-start",
  },
  eliteText: { fontSize: 10, lineHeight: 14, fontWeight: "900", color: colors.gray[400], letterSpacing: 1.5 },
  emptyWrap: { alignItems: "center", paddingVertical: sp(12) },
  emptyText: { ...fontSize.base, color: t.dark ? colors.gray[400] : colors.gray[500], textAlign: "center" },
}));
