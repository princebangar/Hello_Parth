import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bookmark, ChevronLeft, Star, Store, Zap, MapPinOff } from "lucide-react-native";
import { Link, Navigate } from "@/lib/router";
import { toast } from "@/lib/toast";
import { Screen, Text } from "@/native/ui";
import { alpha, colors, fonts, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme";
import { restaurantAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import useAppBackNavigation from "@food/hooks/useAppBackNavigation";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";
import { useProfile } from "@food/context/ProfileContext";
import { useDelayedLoading } from "@food/hooks/useDelayedLoading";
import { filterRestaurantsForVegMode } from "@food/utils/vegMode";
import { toFoodUserPath, getRestaurantRouteId } from "@food/utils/mainTabRoutes";
import RestaurantImageCarousel from "@food/components/user/RestaurantImageCarousel";
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons";
import useMyStoreEnabled from "@/shared/hooks/useMyStoreEnabled.js";

const BACKEND_ORIGIN = (API_BASE_URL || "").replace(/\/api\/v1\/?$/, "");

/** Glossy 3D red back button (radial-gradient circle at 30% 25%). */
function GlossyBackButton({ onPress, s }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Back"
      style={({ pressed }) => [s.backBtn, pressed && { transform: [{ scale: 0.9 }] }]}
    >
      <Svg width={40} height={40} style={s.absFill}>
        <Defs>
          <RadialGradient id="backGloss" cx="30%" cy="25%" r="80%" fx="30%" fy="25%">
            <Stop offset="0%" stopColor="#ff6276" />
            <Stop offset="48%" stopColor="#e8172f" />
            <Stop offset="100%" stopColor="#a50b1d" />
          </RadialGradient>
        </Defs>
        <Circle cx={20} cy={20} r={20} fill="url(#backGloss)" />
      </Svg>
      <LinearGradient colors={[alpha(colors.white, 0.55), alpha(colors.white, 0)]} style={s.gloss} pointerEvents="none" />
      <ChevronLeft size={24} color="#f2f2f2" strokeWidth={3.6} style={{ transform: [{ translateX: -1 }] }} />
    </Pressable>
  );
}

/**
 * "My Store" — Hello Parth's own brand stores in the user's zone. The only place
 * these stores are listed (they are kept out of delivery / takeaway / dining).
 * Cards look like the home restaurant cards; tapping one opens the normal
 * restaurant page, so menu, cart and checkout work as usual.
 */
export default function MyStore() {
  const myStoreEnabled = useMyStoreEnabled();
  const goBack = useAppBackNavigation();
  const t = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { location } = useLocation();
  const { zoneId, isOutOfService } = useZone(location);
  const { vegMode, vegModeOption, addFavorite, removeFavorite, isFavorite } = useProfile();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const showSkeleton = useDelayedLoading(loading);

  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!zoneId) {
      // Still detecting the zone: keep the skeleton. Out of service: nothing to load.
      setStores([]);
      setLoading(!isOutOfService);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    setError("");
    restaurantAPI
      .getMyStores({ zoneId, ...(hasCoords ? { lat, lng } : {}) })
      .then((res) => {
        if (!alive) return;
        const data = res?.data?.data || res?.data || {};
        setStores(Array.isArray(data.restaurants) ? data.restaurants : []);
      })
      .catch((err) => {
        if (!alive) return;
        setStores([]);
        setError(err?.response?.data?.message || "Could not load stores. Please try again.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [zoneId, isOutOfService, hasCoords, lat, lng]);

  const visibleStores = useMemo(
    () => filterRestaurantsForVegMode(stores, { vegMode, vegModeOption }),
    [stores, vegMode, vegModeOption],
  );

  // Switched off by the Global admin: nothing to show here, send the customer to the Food home.
  if (!myStoreEnabled) return <Navigate to={toFoodUserPath("/user")} replace />;

  const renderStore = ({ item: store, index }) => {
    const routeId = getRestaurantRouteId(store);
    const rating = Number(store.rating);
    const storeName = String(store.name || store.restaurantName || "").trim();
    const rawSlug =
      typeof store.slug === "string" && store.slug.trim()
        ? store.slug.trim()
        : storeName || String(store.id || store._id || `store-${index}`);
    const storeSlug = rawSlug.toLowerCase().replace(/[\s/]+/g, "-");
    const saved = isFavorite(storeSlug);
    // Same save button as the restaurant cards on the Food home.
    const handleToggleSaved = () => {
      if (saved) {
        removeFavorite(storeSlug);
        toast.success("Removed from bookmarks");
        return;
      }
      addFavorite({
        slug: storeSlug,
        name: storeName,
        cuisine: Array.isArray(store.cuisines) ? store.cuisines.join(", ") : store.cuisine,
        rating: store.rating,
        deliveryTime: store.estimatedDeliveryTime,
        distance: store.distance,
        priceRange: store.priceRange,
        image: store.profileImage?.url || store.profileImage || store.coverImages?.[0]?.url || store.coverImages?.[0] || "",
      });
      toast.success("Saved to bookmarks");
    };
    return (
      <Link to={toFoodUserPath(`/user/restaurants/${routeId}`)} state={{ restaurantData: store }}>
        {({ pressed }) => (
          <View style={[s.card, pressed && { transform: [{ scale: 0.99 }] }]}>
            <View style={{ position: "relative" }}>
              <RestaurantImageCarousel
                restaurant={store}
                priority={index < 2}
                backendOrigin={BACKEND_ORIGIN}
                focusId={store.id || routeId}
              />
              <Pressable
                onPress={handleToggleSaved}
                accessibilityLabel={saved ? "Remove from bookmarks" : "Save to bookmarks"}
                style={({ pressed: p }) => [s.saveBtn, saved ? s.saveBtnOn : s.saveBtnOff, p && { transform: [{ scale: 0.9 }] }]}
              >
                <Bookmark size={20} color={saved ? colors.white : colors.gray[800]} fill={saved ? colors.white : "none"} />
              </Pressable>
            </View>
            <View style={s.cardContent}>
              <View style={s.cardRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.storeName} numberOfLines={2}>
                    {store.name || store.restaurantName}
                  </Text>
                  {store.estimatedDeliveryTime || store.distance ? (
                    <View style={s.metaRow}>
                      <Zap size={16} color="#257d3c" fill="#257d3c" strokeWidth={2.5} />
                      {store.estimatedDeliveryTime ? <Text style={s.metaText}>{store.estimatedDeliveryTime}</Text> : null}
                      {store.estimatedDeliveryTime && store.distance ? <Text style={[s.metaText, s.metaSep]}>|</Text> : null}
                      {store.distance ? <Text style={s.metaText}>{store.distance}</Text> : null}
                    </View>
                  ) : null}
                </View>
                <View style={s.ratingBadge}>
                  <Star size={14} color={colors.white} fill={colors.white} strokeWidth={0} />
                  <Text style={s.ratingText}>{rating > 0 ? rating.toFixed(1) : "NEW"}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </Link>
    );
  };

  const listEmpty = (
    <>
      {showSkeleton && <RestaurantGridSkeleton count={3} compact style={{ gap: sp(3) }} />}

      {!loading && error ? <Text style={s.errorText}>{error}</Text> : null}

      {!loading && !error && isOutOfService && !zoneId ? (
        <View style={s.empty}>
          <MapPinOff size={40} color={colors.gray[300]} style={{ marginBottom: sp(3) }} />
          <Text style={s.emptyTitle}>We don't serve your area yet</Text>
          <Text style={s.emptyText}>Change your location to see the stores available near you.</Text>
        </View>
      ) : null}

      {!loading && !error && zoneId && visibleStores.length === 0 ? (
        <View style={s.empty}>
          <Store size={40} color={colors.gray[300]} style={{ marginBottom: sp(3) }} />
          <Text style={s.emptyTitle}>No stores in your area yet</Text>
          <Text style={s.emptyText}>Our brand stores will show up here as soon as they open near you.</Text>
        </View>
      ) : null}
    </>
  );

  const showList = !loading && !error && visibleStores.length > 0;

  return (
    <Screen edges={["bottom"]} bg={t.dark ? "#0a0a0a" : colors.white} statusBarStyle="light">
      {/* Same red banner as the Food takeaway / home top bar, with room above the title */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <GlossyBackButton onPress={goBack} s={s} />
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text style={s.title}>My Store</Text>
          <Text style={s.subtitle} numberOfLines={1}>
            Hello Parth brand stores near you
          </Text>
        </View>
      </View>

      <FlatList
        data={showList ? visibleStores : []}
        keyExtractor={(store, index) => String(store.id || store._id || getRestaurantRouteId(store) || index)}
        renderItem={renderStore}
        ListEmptyComponent={listEmpty}
        ItemSeparatorComponent={() => <View style={{ height: sp(4) }} />}
        contentContainerStyle={s.listContent}
      />
    </Screen>
  );
}

const textShadow = { textShadowColor: alpha(colors.black, 0.15), textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 3 };

const useStyles = makeStyles((t) => ({
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  header: {
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(3.5),
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: "#D91F3A",
    paddingHorizontal: sp(3),
    paddingBottom: sp(4),
    ...shadow.lg,
  },
  backBtn: {
    position: "relative",
    height: 40,
    width: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: alpha(colors.white, 0.85),
    elevation: 6,
    shadowColor: "rgb(80,0,10)",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  gloss: { position: "absolute", left: 6, right: 6, top: 2, height: 14, borderRadius: radius.full },
  title: { ...fontSize.xl, lineHeight: 25, fontWeight: "700", color: colors.white, ...textShadow },
  subtitle: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: "500", letterSpacing: 0.13, color: alpha(colors.white, 0.9), fontFamily: fonts.outfit, ...textShadow },
  listContent: { paddingHorizontal: sp(4), paddingVertical: sp(5) },
  card: {
    position: "relative",
    width: "100%",
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.gray[800], 0.8) : alpha(colors.gray[200], 0.7),
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    ...shadow.md,
  },
  saveBtn: {
    position: "absolute",
    right: sp(4),
    top: sp(4),
    zIndex: 10,
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    ...shadow.xl,
  },
  saveBtnOn: { backgroundColor: colors.red[500] },
  saveBtnOff: { backgroundColor: alpha(colors.white, 0.9) },
  cardContent: { padding: sp(3), paddingTop: sp(3) },
  cardRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(2) },
  storeName: { ...fontSize["2xl"], lineHeight: 30, fontWeight: "700", letterSpacing: -0.6, color: t.dark ? colors.white : "#1c1c1c" },
  metaRow: { marginTop: sp(2), flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp(1.5) },
  metaText: { ...fontSize.sm, fontWeight: "600", color: "#257d3c" },
  metaSep: { marginHorizontal: sp(1), fontWeight: "700" },
  ratingBadge: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(1),
    borderRadius: radius.lg,
    backgroundColor: "#257d3c",
    paddingHorizontal: sp(2),
    paddingVertical: sp(1),
  },
  ratingText: { ...fontSize.sm, fontWeight: "700", letterSpacing: -0.3, color: colors.white },
  errorText: { paddingVertical: sp(16), textAlign: "center", ...fontSize.sm, color: t.dark ? colors.red[400] : colors.red[500] },
  empty: { alignItems: "center", paddingVertical: sp(16) },
  emptyTitle: { ...fontSize.base, fontWeight: "700", color: t.dark ? colors.gray[200] : colors.gray[800], textAlign: "center" },
  emptyText: { marginTop: sp(1), maxWidth: 320, ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500], textAlign: "center" },
}));
