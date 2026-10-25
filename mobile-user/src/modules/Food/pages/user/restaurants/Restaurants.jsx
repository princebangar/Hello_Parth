import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Clock, MapPin, Heart, Star } from "lucide-react-native";
import { Link } from "@/lib/router";
import { Screen, Text, AppImage } from "@/native/ui";
import { alpha, brand, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme";
import AnimatedPage from "@food/components/user/AnimatedPage";
import Footer from "@food/components/user/Footer";
import ScrollReveal from "@food/components/user/ScrollReveal";
import TextReveal from "@food/components/user/TextReveal";
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons";
import { useProfile } from "@food/context/ProfileContext";
import { useZone } from "@food/hooks/useZone";
import { useLocation } from "@food/hooks/useLocation";
import { restaurantAPI } from "@food/api";
import { useDelayedLoading } from "@food/hooks/useDelayedLoading";
import { filterRestaurantsForVegMode } from "@food/utils/vegMode";
import { normalizeImageUrl } from "@food/utils/common";

const pickRestaurantImage = (restaurant) => {
  const candidates = [
    restaurant?.coverImage?.url,
    restaurant?.coverImage,
    ...(Array.isArray(restaurant?.coverImages) ? restaurant.coverImages.map((img) => img?.url || img) : []),
    ...(Array.isArray(restaurant?.menuImages) ? restaurant.menuImages.map((img) => img?.url || img) : []),
    restaurant?.profileImage?.url,
    restaurant?.profileImage,
  ];
  const firstValid = candidates.find((value) => typeof value === "string" && value.trim());
  return normalizeImageUrl(firstValid || "");
};

export default function Restaurants() {
  const t = useTheme();
  const s = useStyles();
  const { addFavorite, removeFavorite, isFavorite, orderType, vegMode, vegModeOption } = useProfile();
  const { location: userLocation } = useLocation();
  const { zoneId } = useZone(userLocation);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const showRestaurantsSkeleton = useDelayedLoading(loading);

  const visibleRestaurants = useMemo(
    () => filterRestaurantsForVegMode(restaurants, { vegMode, vegModeOption }),
    [restaurants, vegMode, vegModeOption],
  );

  useEffect(() => {
    let cancelled = false;

    const fetchRestaurants = async () => {
      try {
        setLoading(true);
        const params = { limit: 300, _ts: Date.now() };
        if (zoneId) {
          params.zoneId = zoneId;
        }
        const response = await restaurantAPI.getRestaurants(params, { noCache: true });
        const list =
          response?.data?.data?.restaurants ||
          response?.data?.restaurants ||
          [];
        if (cancelled) return;

        // Apply Takeaway filter if orderType is takeaway
        const filteredList = list.filter((restaurant) => {
          if (orderType === "takeaway") {
            return restaurant.takeawaySettings?.isEnabled || restaurant.takeawayAvailable;
          }
          return true;
        });

        const transformed = filteredList.map((restaurant) => {
          const slug =
            restaurant?.slug ||
            String(restaurant?.name || "")
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "-");
          const cuisine =
            Array.isArray(restaurant?.cuisines) && restaurant.cuisines.length > 0
              ? restaurant.cuisines[0]
              : "Multi-cuisine";
          return {
            id: restaurant?._id || restaurant?.restaurantId || slug,
            slug,
            name: restaurant?.name || "Unknown Restaurant",
            cuisine,
            rating: Number(restaurant?.rating || 0) || 4.5,
            deliveryTime:
              orderType === "takeaway"
                ? restaurant.preparationTime || "20-25 mins"
                : restaurant?.estimatedDeliveryTime ||
                  (restaurant?.estimatedDeliveryTimeMinutes ? `${restaurant.estimatedDeliveryTimeMinutes} mins` : "25-30 mins"),
            distance: restaurant?.distance
              ? typeof restaurant.distance === "number"
                ? `${restaurant.distance.toFixed(1)} km`
                : restaurant.distance
              : "1.2 km",
            priceRange: restaurant?.priceRange || "$$",
            image: pickRestaurantImage(restaurant),
          };
        });

        setRestaurants(transformed);
      } catch (error) {
        if (!cancelled) {
          setRestaurants([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchRestaurants();
    return () => {
      cancelled = true;
    };
  }, [zoneId, orderType]);

  const hasRestaurants = useMemo(() => visibleRestaurants.length > 0, [visibleRestaurants.length]);

  const renderRestaurant = ({ item: restaurant }) => {
    const favorite = isFavorite(restaurant.slug);

    const handleToggleFavorite = () => {
      if (favorite) {
        removeFavorite(restaurant.slug);
      } else {
        addFavorite({
          slug: restaurant.slug,
          name: restaurant.name,
          cuisine: restaurant.cuisine,
          rating: restaurant.rating,
          deliveryTime: restaurant.deliveryTime,
          distance: restaurant.distance,
          priceRange: restaurant.priceRange,
          image: restaurant.image,
        });
      }
    };

    return (
      <ScrollReveal>
        <Link to={`/restaurants/${restaurant.slug}`}>
          <View style={s.card}>
            <View style={s.cardRow}>
              <View style={s.cardContent}>
                <View style={{ flex: 1, justifyContent: "space-between", gap: sp(2) }}>
                  <View>
                    <View style={s.topRow}>
                      <View style={{ flex: 1, minWidth: 0, paddingRight: sp(2) }}>
                        <Text style={s.name} numberOfLines={2}>
                          {restaurant.name}
                        </Text>
                        <Text style={s.cuisine} numberOfLines={1}>
                          {restaurant.cuisine}
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp(2) }}>
                          <View style={s.ratingPill}>
                            <Star size={12} color={colors.yellow[400]} fill={colors.yellow[400]} />
                            <Text style={s.ratingText}>{restaurant.rating.toFixed(1)}</Text>
                          </View>
                        </View>
                      </View>
                      <Pressable
                        onPress={handleToggleFavorite}
                        style={({ pressed }) => [s.heartBtn, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}
                      >
                        <Heart
                          size={16}
                          color={favorite ? (t.dark ? colors.red[400] : colors.red[500]) : t.dark ? colors.gray[500] : colors.gray[400]}
                          fill={favorite ? (t.dark ? colors.red[400] : colors.red[500]) : "none"}
                        />
                      </Pressable>
                    </View>
                  </View>
                  <View style={s.bottomRow}>
                    <View style={s.metaRow}>
                      <View style={s.metaItem}>
                        <Clock size={12} color={t.dark ? colors.gray[400] : colors.gray[600]} />
                        <Text style={s.metaText}>{restaurant.deliveryTime}</Text>
                      </View>
                      <View style={s.metaItem}>
                        <MapPin size={12} color={t.dark ? colors.gray[400] : colors.gray[600]} />
                        <Text style={s.metaText}>{restaurant.distance}</Text>
                      </View>
                    </View>
                    <View style={s.orderBtn}>
                      <Text style={s.orderBtnText}>Order Now</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={s.imageWrap}>
                <AppImage src={restaurant.image || "https://via.placeholder.com/400x300?text=Restaurant"} style={s.fill} contentFit="cover" />
              </View>
            </View>
          </View>
        </Link>
      </ScrollReveal>
    );
  };

  const header = (
    <ScrollReveal>
      <View style={s.headerRow}>
        <Link to="/food/user">
          {({ pressed }) => (
            <View style={[s.backBtn, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}>
              <ArrowLeft size={16} color={t.dark ? colors.gray[100] : colors.gray[900]} />
            </View>
          )}
        </Link>
        <TextReveal style={{ flexDirection: "row", alignItems: "center", gap: sp(2) }}>
          <Text style={s.title}>All Restaurants</Text>
        </TextReveal>
      </View>
    </ScrollReveal>
  );

  const bgColors = t.dark ? ["#0a0a0a", "#0a0a0a", "#0a0a0a"] : [alpha(colors.yellow[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)];

  return (
    <Screen bg={t.bg}>
      <LinearGradient colors={bgColors} style={{ flex: 1 }}>
        <AnimatedPage style={{ flex: 1 }}>
          <FlatList
            data={!showRestaurantsSkeleton && hasRestaurants ? visibleRestaurants : []}
            keyExtractor={(item, index) => String(item.id || index)}
            renderItem={renderRestaurant}
            ItemSeparatorComponent={() => <View style={{ height: sp(3) }} />}
            ListHeaderComponent={header}
            ListEmptyComponent={
              showRestaurantsSkeleton ? (
                <RestaurantGridSkeleton count={4} />
              ) : !hasRestaurants ? (
                <Text style={s.empty}>No restaurants available right now.</Text>
              ) : null
            }
            ListFooterComponent={
              <View style={{ marginTop: sp(4), marginHorizontal: -sp(3) }}>
                <Footer />
              </View>
            }
            contentContainerStyle={s.listContent}
          />
        </AnimatedPage>
      </LinearGradient>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { width: "100%", height: "100%" },
  listContent: { paddingHorizontal: sp(3), paddingTop: sp(4) },
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(4) + sp(4) + sp(2) },
  backBtn: { height: 32, width: 32, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  title: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  card: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: radius.xl,
    paddingBottom: sp(1),
    ...shadow.sm,
  },
  cardRow: { flexDirection: "row", minHeight: 120, flex: 1 },
  cardContent: { flex: 1, justifyContent: "space-between", padding: sp(3), minWidth: 0, overflow: "hidden" },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(2), marginBottom: sp(2) },
  name: { ...fontSize.base, lineHeight: 18, fontWeight: "600", marginBottom: sp(1), color: t.dark ? colors.white : colors.gray[900] },
  cuisine: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[600], fontWeight: "500", marginBottom: sp(2) },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(1),
    backgroundColor: t.dark ? alpha(colors.yellow[900], 0.3) : colors.yellow[50],
    paddingHorizontal: sp(1.5),
    paddingVertical: sp(0.5),
    borderRadius: radius.full,
  },
  ratingText: { fontWeight: "700", ...fontSize.xs, color: t.dark ? colors.yellow[400] : colors.yellow[700] },
  heartBtn: { height: 28, width: 28, borderRadius: radius.full, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(2),
    marginTop: "auto",
    paddingTop: sp(2),
    borderTopWidth: 1,
    borderTopColor: t.dark ? colors.gray[800] : colors.gray[200],
    flexShrink: 0,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: sp(2), flexWrap: "wrap", flexShrink: 1 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: sp(1) },
  metaText: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[600] },
  orderBtn: { backgroundColor: "#DC2626", height: 28, paddingHorizontal: sp(3), borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexShrink: 0, ...shadow.xs },
  orderBtnText: { ...fontSize.xs, fontWeight: "500", color: colors.white },
  imageWrap: { width: 144, flexShrink: 0, position: "relative", overflow: "hidden" },
  empty: { paddingVertical: sp(16), textAlign: "center", ...fontSize.sm, color: colors.gray[500] },
}));
