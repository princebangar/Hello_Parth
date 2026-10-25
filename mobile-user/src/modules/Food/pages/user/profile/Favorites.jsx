// Web: modules/Food/pages/user/profile/Favorites.jsx — saved restaurants / dishes from ProfileContext.
// window.confirm -> Alert.alert (Cancel / OK). The 2-column grid is a 2-column FlatList. The web's card <Link> holds
// "View ..." buttons that do nothing themselves; here they are drawn without their own tap so the card link gets it.
import { useMemo, useState } from "react"
import { Alert, FlatList, Pressable, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Heart, Star, Clock, MapPin, ArrowRight, ArrowLeft, Bookmark } from "lucide-react-native"
import { Link, useLocation, useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { AppImage, Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, sp, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import ScrollReveal from "@food/components/user/ScrollReveal"
import { Card, CardTitle, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { tokensFor } from "@food/components/ui/tokens"
import { useProfile } from "@food/context/ProfileContext"
import {
  filterDishesForVegMode,
  filterRestaurantsForVegMode,
} from "@food/utils/vegMode"

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80"

function PageBackground({ children }) {
  const t = useTheme()
  const s = useStyles()
  return (
    <AnimatedPage style={s.page}>
      <LinearGradient
        colors={t.dark ? ["#0a0a0a", "#0a0a0a", "#0a0a0a"] : [alpha(colors.yellow[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)]}
        style={s.bg}
        pointerEvents="none"
      />
      {children}
    </AnimatedPage>
  )
}

function RedButton({ children, onPress, style, small = false }) {
  const s = useStyles()
  return (
    <Button
      onPress={onPress}
      pointerEvents={onPress ? "auto" : "none"}
      style={({ pressed }) => [s.redButton, small && s.redButtonSmall, pressed && { opacity: 0.9 }, style]}
      textStyle={[s.redButtonText, small && { ...fontSize.xs }]}
    >
      {children}
    </Button>
  )
}

export default function Favorites() {
  const location = useLocation()
  const navigate = useNavigate()
  const s = useStyles()
  const t = useTheme()
  const k = tokensFor(t)
  const insets = useSafeAreaInsets()
  const from = location.state?.from || "/food/user/profile"
  const {
    favorites,
    dishFavorites: allDishFavorites,
    removeFavorite,
    removeDishFavorite,
    vegMode,
    vegModeOption,
  } = useProfile()
  const restaurantFavorites = useMemo(
    () =>
      filterRestaurantsForVegMode(favorites || [], {
        vegMode,
        vegModeOption,
      }),
    [favorites, vegMode, vegModeOption],
  )
  const dishFavorites = useMemo(
    () => filterDishesForVegMode(allDishFavorites || [], vegMode),
    [allDishFavorites, vegMode],
  )
  const [activeTab, setActiveTab] = useState("restaurants")

  const handleRemoveFavorite = (slug) => {
    Alert.alert("", "Remove this restaurant from favorites?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "OK",
        onPress: () => {
          removeFavorite(slug)
          toast.success("Restaurant removed from favorites")
        },
      },
    ])
  }

  const handleRemoveDishFavorite = (dishId, restaurantId) => {
    Alert.alert("", "Remove this dish from favorites?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "OK",
        onPress: () => {
          removeDishFavorite(dishId, restaurantId)
          toast.success("Dish removed from favorites")
        },
      },
    ])
  }

  const totalFavorites = restaurantFavorites.length + dishFavorites.length

  const backButton = (
    <Button variant="ghost" size="icon" onPress={() => navigate(from)} style={s.backButton} accessibilityLabel="Go back">
      <ArrowLeft size={16} color={k.foreground} />
    </Button>
  )

  if (totalFavorites === 0) {
    return (
      <PageBackground>
        <View style={[s.content, { paddingTop: insets.top + sp(4) }]}>
          <ScrollReveal>
            <View style={s.headerLeft}>
              {backButton}
              <Text style={s.title}>My Favorites</Text>
            </View>
          </ScrollReveal>
          <Card>
            <CardContent style={s.emptyCard}>
              <Heart size={64} color={k.mutedForeground} style={{ marginBottom: sp(4) }} />
              <Text style={s.emptyText}>You haven't added any favorites yet</Text>
              <RedButton onPress={() => navigate("/user")}>Explore Restaurants</RedButton>
            </CardContent>
          </Card>
        </View>
      </PageBackground>
    )
  }

  const data = activeTab === "restaurants" ? restaurantFavorites : dishFavorites

  const renderRestaurant = ({ item: restaurant, index }) => (
    <ScrollReveal key={restaurant.slug} delay={index * 0.1} style={s.cell}>
      <Link to={`/user/restaurants/${restaurant.slug}`} style={{ flex: 1 }}>
        <Card style={s.itemCard}>
          <View style={s.imageBox}>
            <AppImage src={restaurant.image} fallback={FALLBACK_IMAGE} style={s.image} accessibilityLabel={restaurant.name} />
            <LinearGradient colors={[colors.transparent, colors.transparent, alpha(colors.black, 0.6)]} style={s.bg} pointerEvents="none" />
            <View style={s.topRight}>
              <Pressable onPress={() => handleRemoveFavorite(restaurant.slug)} style={s.heartButton} accessibilityLabel="Remove from favorites">
                <Heart size={16} color={colors.red[500]} fill={colors.red[500]} />
              </Pressable>
            </View>
            <View style={s.bottomLeft}>
              <View style={s.ratingPill}>
                <Star size={12} color={colors.yellow[400]} fill={colors.yellow[400]} />
                <Text style={s.ratingText}>{restaurant.rating}</Text>
              </View>
            </View>
          </View>
          <CardContent style={s.itemContent}>
            <View>
              <CardTitle style={s.itemTitle} numberOfLines={1}>
                {restaurant.name}
              </CardTitle>
              <Text style={s.itemSub} numberOfLines={1}>
                {restaurant.cuisine}
              </Text>
            </View>
            <View style={s.itemMeta}>
              <View style={s.metaPart}>
                <Clock size={12} color={k.mutedForeground} />
                <Text style={s.metaText}>{restaurant.deliveryTime}</Text>
              </View>
              <View style={s.metaPart}>
                <MapPin size={12} color={k.mutedForeground} />
                <Text style={s.metaText}>{restaurant.distance}</Text>
              </View>
            </View>
            <RedButton small style={{ width: "100%" }}>
              View Restaurant
              <ArrowRight size={12} color={colors.white} style={{ marginLeft: sp(1) }} />
            </RedButton>
          </CardContent>
        </Card>
      </Link>
    </ScrollReveal>
  )

  const renderDish = ({ item: dish, index }) => {
    const restaurantSlug = dish.restaurantSlug || ""
    return (
      <ScrollReveal key={`${dish.id}-${dish.restaurantId}`} delay={index * 0.1} style={s.cell}>
        <Link to={`/food/user/restaurants/${restaurantSlug}?dish=${dish.id}`} style={{ flex: 1 }}>
          <Card style={s.itemCard}>
            <View style={s.imageBox}>
              <AppImage src={dish.image || FALLBACK_IMAGE} fallback={FALLBACK_IMAGE} style={s.image} accessibilityLabel={dish.name} />
              <LinearGradient colors={[colors.transparent, colors.transparent, alpha(colors.black, 0.6)]} style={s.bg} pointerEvents="none" />
              <View style={s.topRight}>
                <Pressable
                  onPress={() => handleRemoveDishFavorite(dish.id, dish.restaurantId)}
                  style={s.heartButton}
                  accessibilityLabel="Remove from favorites"
                >
                  <Bookmark size={16} color={colors.red[500]} fill={colors.red[500]} />
                </Pressable>
              </View>
            </View>
            <CardContent style={s.itemContent}>
              <View>
                <CardTitle style={s.itemTitle} numberOfLines={1}>
                  {dish.name}
                </CardTitle>
                <Text style={[s.itemSub, { fontWeight: "400" }]} numberOfLines={1}>
                  {dish.restaurantName || "Restaurant"}
                </Text>
              </View>
              <View style={s.itemMeta}>
                <View style={s.metaPart}>
                  {dish.foodType === "Veg" ? (
                    <View style={[s.vegBox, { borderColor: colors.green[600] }]}>
                      <View style={[s.vegDot, { backgroundColor: colors.green[600] }]} />
                    </View>
                  ) : (
                    // web: "border-#991B1B" / "bg-#991B1B" are not valid classes, so the box falls back to the
                    // default border colour and the dot has no fill
                    <View style={[s.vegBox, { borderColor: k.border }]}>
                      <View style={s.vegDot} />
                    </View>
                  )}
                  <Text style={s.metaText}>{dish.foodType || "N/A"}</Text>
                </View>
                <Text style={s.price}>
                  {"₹"}
                  {Math.round(dish.price || 0)}
                </Text>
              </View>
              <RedButton small style={{ width: "100%" }}>
                View Dish
                <ArrowRight size={12} color={colors.white} style={{ marginLeft: sp(1) }} />
              </RedButton>
            </CardContent>
          </Card>
        </Link>
      </ScrollReveal>
    )
  }

  const header = (
    <View>
      <ScrollReveal>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            {backButton}
            <View>
              <Text style={s.title}>My Favorites</Text>
              <Text style={s.counts}>
                {dishFavorites.length || 0} {dishFavorites.length === 1 ? "dish" : "dishes"} • {restaurantFavorites.length || 0}{" "}
                {restaurantFavorites.length === 1 ? "restaurant" : "restaurants"}
              </Text>
            </View>
          </View>
        </View>
      </ScrollReveal>

      {/* Tabs */}
      <View style={s.tabs}>
        <Pressable onPress={() => setActiveTab("restaurants")} style={[s.tab, activeTab === "restaurants" && s.tabActive]}>
          <Text style={[s.tabText, activeTab === "restaurants" && s.tabTextActive]}>Restaurants ({restaurantFavorites.length})</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab("dishes")} style={[s.tab, activeTab === "dishes" && s.tabActive]}>
          <Text style={[s.tabText, activeTab === "dishes" && s.tabTextActive]}>Dishes ({dishFavorites.length})</Text>
        </Pressable>
      </View>
    </View>
  )

  const empty =
    activeTab === "restaurants" ? (
      <View style={s.tabEmpty}>
        <Heart size={64} color={k.mutedForeground} style={{ marginBottom: sp(4) }} />
        <Text style={s.emptyText}>No restaurants saved yet</Text>
        <RedButton onPress={() => navigate("/user")}>Explore Restaurants</RedButton>
      </View>
    ) : (
      <View style={s.tabEmpty}>
        <Bookmark size={64} color={k.mutedForeground} style={{ marginBottom: sp(4) }} />
        <Text style={s.emptyText}>No dishes saved yet</Text>
        <RedButton onPress={() => navigate("/user")}>Explore Dishes</RedButton>
      </View>
    )

  return (
    <PageBackground>
      <FlatList
        key={activeTab}
        data={data}
        numColumns={2}
        keyExtractor={(item) => (activeTab === "restaurants" ? String(item.slug) : `${item.id}-${item.restaurantId}`)}
        renderItem={activeTab === "restaurants" ? renderRestaurant : renderDish}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        columnWrapperStyle={s.row}
        contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(4) }]}
        showsVerticalScrollIndicator={false}
      />
    </PageBackground>
  )
}

const useStyles = makeStyles((t) => {
  const k = tokensFor(t)
  return {
    page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
    bg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    content: { paddingHorizontal: sp(4), gap: sp(6) },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: sp(4) },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: sp(3) },
    backButton: { borderRadius: 9999, height: 32, width: 32 },
    title: { ...fontSize.lg, fontWeight: "700", color: k.foreground },
    counts: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.gray[300] : colors.gray[700], marginTop: sp(1) },
    tabs: { flexDirection: "row", gap: sp(2), marginBottom: sp(6), borderBottomWidth: 1, borderBottomColor: t.dark ? colors.gray[800] : colors.gray[200] },
    tab: { paddingHorizontal: sp(4), paddingVertical: sp(2), borderBottomWidth: 2, borderBottomColor: colors.transparent, marginBottom: -1 },
    tabActive: { borderBottomColor: "#DC2626" },
    tabText: { ...fontSize.base, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[500] },
    tabTextActive: { color: "#DC2626" },
    row: { gap: sp(4) },
    cell: { flex: 1, marginBottom: sp(4) },
    itemCard: { overflow: "hidden", flex: 1 },
    imageBox: { height: 128, width: "100%", position: "relative", overflow: "hidden" },
    image: { width: "100%", height: "100%" },
    topRight: { position: "absolute", top: sp(2), right: sp(2) },
    heartButton: { height: 28, width: 28, borderRadius: 9999, backgroundColor: alpha(colors.white, 0.9), alignItems: "center", justifyContent: "center" },
    bottomLeft: { position: "absolute", bottom: sp(2), left: sp(2) },
    ratingPill: { flexDirection: "row", alignItems: "center", gap: sp(1), backgroundColor: alpha(colors.white, 0.9), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9999 },
    ratingText: { ...fontSize.xs, fontWeight: "700", color: k.cardForeground },
    itemContent: { padding: sp(3), gap: sp(2) },
    itemTitle: { ...fontSize.sm, fontWeight: "700", marginBottom: 2 },
    itemSub: { ...fontSize.xs, fontWeight: "500", color: k.mutedForeground },
    itemMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: sp(2), borderTopWidth: 1, borderTopColor: k.border },
    metaPart: { flexDirection: "row", alignItems: "center", gap: sp(1) },
    metaText: { ...fontSize.xs, fontWeight: "500", color: k.mutedForeground },
    vegBox: { width: 12, height: 12, borderWidth: 2, alignItems: "center", justifyContent: "center", borderRadius: 6 },
    vegDot: { width: 6, height: 6, borderRadius: 9999 },
    price: { ...fontSize.sm, fontWeight: "700", color: "#DC2626" },
    redButton: { backgroundColor: "#DC2626" },
    redButtonSmall: { height: 32, paddingVertical: 6 },
    redButtonText: { color: colors.white },
    emptyCard: { paddingVertical: sp(12), alignItems: "center" },
    tabEmpty: { paddingVertical: sp(12), alignItems: "center" },
    emptyText: { ...fontSize.lg, color: k.mutedForeground, marginBottom: sp(4), textAlign: "center" },
  }
})

