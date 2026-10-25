import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { BlurView } from "expo-blur";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Star, ArrowLeft } from "lucide-react-native";
import { Link, useNavigate } from "@/lib/router";
import { Screen, Text, AppImage } from "@/native/ui";
import { alpha, colors, fontSize, makeStyles, radius, sp } from "@/theme";
import AnimatedPage from "@food/components/user/AnimatedPage";
import { useLocationSelector } from "@food/components/user/UserLayout";
import useAppBackNavigation from "@food/hooks/useAppBackNavigation";
import { useLocation as useLocationHook } from "@food/hooks/useLocation";

// Using placeholder for coffee banner (same static images as the web page)
const coffeeBanner = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=400&fit=crop";
// Using placeholder for starbucks logo
const starbucksLogo = "https://images.unsplash.com/photo-1511920170033-f8396924c348?w=200&h=200&fit=crop";

// Static store list of the web page (the web screen has no API call)
const starbucksStores = [
  {
    id: 1,
    name: "Starbucks",
    rating: 4.4,
    location: "YN Road, Indore",
    distance: "1.3 km",
    price: "₹900 for two",
    offer: "Flat 25% OFF",
    logo: starbucksLogo,
  },
  {
    id: 2,
    name: "Starbucks",
    rating: 2.8,
    location: "YN Road, Indore",
    distance: "1.3 km",
    price: "₹600 for two",
    offer: null,
    logo: starbucksLogo,
  },
  {
    id: 3,
    name: "Starbucks",
    rating: 4.5,
    location: "MG Road, Indore",
    distance: "2.1 km",
    price: "₹850 for two",
    offer: "Flat 20% OFF",
    logo: starbucksLogo,
  },
  {
    id: 4,
    name: "Starbucks",
    rating: 4.2,
    location: "Vijay Nagar, Indore",
    distance: "0.9 km",
    price: "₹950 for two",
    offer: "Flat 30% OFF",
    logo: starbucksLogo,
  },
];

/** Circular logo; hides the image when it fails (web: onError display none). */
function StoreLogo({ store, s }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={s.logo}>
      {store.logo ? (
        failed ? null : <AppImage src={store.logo} style={s.fill} contentFit="cover" onError={() => setFailed(true)} />
      ) : (
        <View style={s.logoPlaceholder}>
          <Text style={s.logoInitial}>{store.name.charAt(0)}</Text>
        </View>
      )}
    </View>
  );
}

export default function Coffee() {
  const navigate = useNavigate();
  const goBack = useAppBackNavigation();
  const s = useStyles();
  const { openLocationSelector } = useLocationSelector();
  const { location } = useLocationHook();
  const cityName = location?.city || "Select";

  const handleLocationClick = useCallback(() => {
    openLocationSelector();
  }, [openLocationSelector]);

  const renderStoreList = (stores, sectionTitle) => {
    return (
      <View style={{ marginBottom: sp(8) }}>
        {/* Section Header */}
        <View style={{ marginBottom: sp(4) }}>
          <Text style={s.sectionTitle}>{sectionTitle}</Text>
        </View>

        {/* Store List */}
        <View>
          {stores.map((store, index) => {
            const storeSlug = store.name.toLowerCase().replace(/\s+/g, "-");
            const isHighRating = store.rating >= 4.0;

            return (
              <Link key={store.id} to={`/user/restaurants/${storeSlug}`}>
                <View style={[s.storeRow, index !== stores.length - 1 && s.storeRowBorder]}>
                  {/* Logo - Circular */}
                  <View style={{ flexShrink: 0 }}>
                    <StoreLogo store={store} s={s} />
                  </View>

                  {/* Store Info */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {/* Location Name */}
                    <Text style={s.storeLocation}>{store.location}</Text>

                    {/* Rating Badge */}
                    <View style={{ marginBottom: sp(2), flexDirection: "row" }}>
                      <View style={[s.ratingBadge, { backgroundColor: isHighRating ? colors.green[600] : "#DC2626" }]}>
                        <Text style={s.ratingText}>{store.rating}</Text>
                        <Star size={12} color={colors.white} fill={colors.white} />
                      </View>
                    </View>

                    {/* Distance */}
                    <Text style={s.distance}>{store.distance}</Text>

                    {/* Price and Offer */}
                    <View style={s.priceRow}>
                      <Text style={s.price}>{store.price}</Text>
                      {store.offer ? <Text style={s.offer}>{store.offer}</Text> : null}
                    </View>
                  </View>
                </View>
              </Link>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Screen bg={colors.white} statusBarStyle="dark">
      <AnimatedPage style={{ flex: 1, backgroundColor: colors.white }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          {/* Banner Section with Back Button and Location */}
          <View style={s.bannerWrap}>
            {/* Background with coffee banner (w-full h-auto) */}
            <AppImage src={coffeeBanner} style={s.banner} contentFit="contain" />

            {/* Navbar with Back Button - Overlay on top of image */}
            <View style={s.nav}>
              <BlurView intensity={8} tint="default" style={s.absFill} />
              <View style={s.navRow}>
                {/* Back Button */}
                <Pressable onPress={goBack} style={s.backBtn}>
                  <BlurView intensity={8} tint="light" style={s.absFill} />
                  <ArrowLeft size={20} color={colors.gray[800]} strokeWidth={2.5} />
                </Pressable>

                {/* Location with Dotted Underline */}
                <Pressable onPress={handleLocationClick} style={({ pressed }) => [s.locationBtn, pressed && { backgroundColor: colors.white }]}>
                  <BlurView intensity={8} tint="default" style={s.absFill} />
                  <View style={s.locationRow}>
                    <FontAwesome6 name="location-dot" size={16} color={colors.white} />
                    <Text style={s.cityName} numberOfLines={1}>
                      {cityName}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Content */}
          <View style={s.content}>
            {/* Header Section */}
            <View style={{ marginBottom: sp(6) }}>
              <Text style={s.title}>Starbucks Coffee</Text>
              <Text style={s.subtitle}>Cafe, Coffee, Beverages</Text>
              <View style={s.divider} />
            </View>

            {/* Multiple Store Lists */}
            {renderStoreList(starbucksStores, "DINING OUTLETS NEAR YOU")}
          </View>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  fill: { width: "100%", height: "100%" },
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  bannerWrap: { position: "relative", width: "100%", overflow: "hidden" },
  banner: { width: "100%", aspectRatio: 3 },
  nav: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, paddingHorizontal: sp(3), paddingVertical: sp(3), overflow: "hidden" },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: sp(3) },
  backBtn: {
    height: 36,
    width: 36,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: alpha(colors.white, 0.9),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  locationBtn: { borderRadius: radius.full, overflow: "hidden", paddingHorizontal: sp(3), paddingVertical: sp(2), height: 36, justifyContent: "center" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: sp(2), minWidth: 0 },
  cityName: {
    ...fontSize.sm,
    fontWeight: "600",
    color: colors.white,
    borderBottomWidth: 2,
    borderStyle: "dotted",
    borderBottomColor: colors.white,
  },
  content: { paddingHorizontal: sp(4), paddingTop: sp(6) },
  title: { ...fontSize["2xl"], fontWeight: "700", color: colors.gray[900], marginBottom: sp(2) },
  subtitle: { ...fontSize.sm, color: colors.gray[500] },
  divider: { height: 1, backgroundColor: colors.gray[200], marginTop: sp(4) },
  sectionTitle: { ...fontSize.sm, fontWeight: "600", color: colors.gray[500], letterSpacing: 0.35, textAlign: "center", textTransform: "uppercase" },
  storeRow: { flexDirection: "row", alignItems: "flex-start", gap: sp(4), paddingVertical: sp(4) },
  storeRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  logo: { width: 64, height: 64, borderRadius: radius.full, overflow: "hidden", backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center" },
  logoPlaceholder: { width: "100%", height: "100%", backgroundColor: colors.gray[200], alignItems: "center", justifyContent: "center" },
  logoInitial: { color: colors.gray[400], ...fontSize.xs, fontWeight: "600" },
  storeLocation: { ...fontSize.base, fontWeight: "700", color: colors.gray[900], marginBottom: sp(2) },
  ratingBadge: { flexDirection: "row", alignItems: "center", gap: sp(1), paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: radius.sm },
  ratingText: { ...fontSize.sm, fontWeight: "600", color: colors.white },
  distance: { ...fontSize.sm, color: colors.gray[500], marginBottom: sp(1) },
  priceRow: { flexDirection: "row", alignItems: "center", gap: sp(3), flexWrap: "wrap" },
  price: { ...fontSize.sm, color: colors.gray[700] },
  offer: { ...fontSize.sm, fontWeight: "500", color: "#DC2626" },
}));
