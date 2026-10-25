import React, { useState, useEffect, useMemo } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { ArrowLeft, Trash2, Heart, Star, Clock, MapPin } from "lucide-react-native";
import { Link, useParams, useNavigate } from "@/lib/router";
import { Screen, Text, AppImage } from "@/native/ui";
import { alpha, brand, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme";
import AnimatedPage from "@food/components/user/AnimatedPage";
import ScrollReveal from "@food/components/user/ScrollReveal";
import { useProfile } from "@food/context/ProfileContext";
import useAppBackNavigation from "@food/hooks/useAppBackNavigation";
import { filterRestaurantsForVegMode } from "@food/utils/vegMode";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80";

export default function CollectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useAppBackNavigation();
  const t = useTheme();
  const s = useStyles();
  const { favorites, removeFavorite, vegMode, vegModeOption } = useProfile();

  // Mock collection data - in real app, fetch from API based on id
  const [collection, setCollection] = useState({
    id: id,
    name: "My Collection",
    dishes: 0,
    restaurants: 0,
    items: [],
  });

  const visibleFavorites = useMemo(
    () => filterRestaurantsForVegMode(favorites || [], { vegMode, vegModeOption }),
    [favorites, vegMode, vegModeOption],
  );

  useEffect(() => {
    // Collection items come from the user's favorites (same as the web)
    setCollection((prev) => ({
      ...prev,
      name: `Collection ${id}`,
      items: visibleFavorites,
      restaurants: visibleFavorites.length,
      dishes: 0,
    }));
  }, [id, visibleFavorites]);

  const handleRemoveItem = (slug) => {
    Alert.alert("", "Remove this restaurant from collection?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "OK",
        onPress: () => {
          removeFavorite(slug);
          // Update collection state
          setCollection((prev) => ({
            ...prev,
            items: prev.items.filter((item) => item.slug !== slug),
            restaurants: prev.restaurants - 1,
          }));
        },
      },
    ]);
  };

  const bgColors = t.dark ? ["#0b0b0b", "#0b0b0b", "#0b0b0b"] : [alpha(colors.yellow[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)];

  const backButton = (
    <Pressable onPress={goBack} style={({ pressed }) => [s.ghostIconBtn, pressed && s.ghostIconBtnPressed]}>
      <ArrowLeft size={16} color={s.fg.color} />
    </Pressable>
  );

  if (collection.items.length === 0) {
    return (
      <Screen bg={t.bg}>
        <LinearGradient colors={bgColors} style={s.fill}>
          <AnimatedPage style={s.page}>
            <ScrollReveal>
              <View style={s.headerRow}>
                {backButton}
                <Text style={[s.h1, s.fg]}>{collection.name}</Text>
              </View>
            </ScrollReveal>
            <View style={s.card}>
              <View style={s.emptyContent}>
                <Heart size={64} color={s.muted.color} style={{ marginBottom: sp(4) }} />
                <Text style={[s.muted, s.emptyText]}>This collection is empty</Text>
                <Link to="/user">
                  {({ pressed }) => (
                    <View style={[s.redBtn, pressed && { opacity: 0.9 }]}>
                      <Text style={s.redBtnText}>Explore Restaurants</Text>
                    </View>
                  )}
                </Link>
              </View>
            </View>
          </AnimatedPage>
        </LinearGradient>
      </Screen>
    );
  }

  const renderItem = ({ item: restaurant }) => (
    <ScrollReveal>
      <Link to={`/user/restaurants/${restaurant.slug}`}>
        <View style={[s.card, s.restCard]}>
          <View style={s.imageWrap}>
            <AppImage src={restaurant.image} fallback={FALLBACK_IMAGE} style={s.fill} contentFit="cover" />
            <LinearGradient
              colors={[alpha(colors.black, 0.6), "transparent", "transparent"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={s.absFill}
              pointerEvents="none"
            />
            <View style={s.trashWrap}>
              <Pressable onPress={() => handleRemoveItem(restaurant.slug)} style={s.trashBtn}>
                <BlurView intensity={10} tint="light" style={s.absFill} />
                <Trash2 size={20} color={colors.red[500]} />
              </Pressable>
            </View>
          </View>
          <View style={s.cardContent}>
            <View style={s.titleRow}>
              <Text style={[s.restName, s.fg]} numberOfLines={1}>{restaurant.name}</Text>
              <View style={s.ratingBadge}>
                <Star size={12} color={colors.white} fill={colors.white} />
                <Text style={s.ratingText}>{restaurant.rating || "4.5"}</Text>
              </View>
            </View>
            <View style={s.metaRow}>
              <Clock size={16} color={s.muted.color} />
              <Text style={[s.metaText, s.muted]}>{restaurant.deliveryTime || "25-30 mins"}</Text>
              <Text style={[s.metaText, s.muted]}>•</Text>
              <MapPin size={16} color={s.muted.color} />
              <Text style={[s.metaText, s.muted]}>{restaurant.distance || "2.5 km"}</Text>
            </View>
            {restaurant.cuisine ? (
              <Text style={[s.metaText, s.muted]} numberOfLines={1}>{restaurant.cuisine}</Text>
            ) : null}
          </View>
        </View>
      </Link>
    </ScrollReveal>
  );

  return (
    <Screen bg={t.bg}>
      <LinearGradient colors={bgColors} style={s.fill}>
        <AnimatedPage style={s.fill}>
          <FlatList
            data={collection.items}
            keyExtractor={(item, index) => String(item.slug || index)}
            renderItem={renderItem}
            contentContainerStyle={s.listPage}
            ItemSeparatorComponent={() => <View style={{ height: sp(6) }} />}
            ListHeaderComponent={
              <ScrollReveal>
                <View style={[s.headerRow, { justifyContent: "space-between", marginBottom: sp(4) + sp(6) + sp(4) }]}>
                  <View style={s.headerRow}>
                    {backButton}
                    <View>
                      <Text style={[s.h1, s.fg]}>{collection.name}</Text>
                      <Text style={[s.muted, { marginTop: sp(1), ...fontSize.base }]}>
                        {collection.restaurants} {collection.restaurants === 1 ? "restaurant" : "restaurants"}
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollReveal>
            }
          />
        </AnimatedPage>
      </LinearGradient>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { flex: 1, width: "100%", height: "100%" },
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  page: { padding: sp(4), gap: sp(6) },
  listPage: { padding: sp(4) },
  fg: { color: t.dark ? "#fafafa" : brand.foreground },
  muted: { color: t.dark ? "#a1a1a1" : brand.mutedForeground },
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  ghostIconBtn: { height: 32, width: 32, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  ghostIconBtnPressed: { backgroundColor: t.dark ? alpha(brand.accent, 0.5) : brand.accent },
  h1: { ...fontSize.lg, fontWeight: "700" },
  card: {
    backgroundColor: t.dark ? "#171717" : colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: t.dark ? alpha("#ffffff", 0.1) : brand.border,
    ...shadow.sm,
  },
  emptyContent: { paddingVertical: sp(12), paddingHorizontal: sp(6), alignItems: "center" },
  emptyText: { ...fontSize.lg, marginBottom: sp(4), textAlign: "center" },
  redBtn: { height: 36, paddingHorizontal: sp(4), borderRadius: radius.md, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },
  redBtnText: { ...fontSize.sm, fontWeight: "500", color: colors.white },
  restCard: { overflow: "hidden" },
  imageWrap: { height: 192, width: "100%", overflow: "hidden" },
  trashWrap: { position: "absolute", top: sp(4), right: sp(4), flexDirection: "row", alignItems: "center", gap: sp(2) },
  trashBtn: {
    height: 36,
    width: 36,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: alpha(colors.white, 0.9),
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: { padding: sp(4) },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: sp(2) },
  restName: { ...fontSize.lg, fontWeight: "700", flex: 1 },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(1),
    backgroundColor: colors.green[600],
    paddingHorizontal: sp(2),
    paddingVertical: sp(1),
    borderRadius: radius.lg,
    marginLeft: sp(2),
  },
  ratingText: { ...fontSize.sm, fontWeight: "700", color: colors.white },
  metaRow: { flexDirection: "row", alignItems: "center", gap: sp(2), marginBottom: sp(2) },
  metaText: { ...fontSize.sm },
}));
