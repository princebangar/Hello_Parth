import React, { useState, useEffect, useMemo } from "react";
import { FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { BlurView } from "expo-blur";
import Svg, { Rect, Circle, Text as SvgText } from "react-native-svg";
import { ArrowLeft, Star, Clock } from "lucide-react-native";
import { Link, useNavigate } from "@/lib/router";
import { toast } from "@/lib/toast";
import { Screen, Text, AppImage } from "@/native/ui";
import { alpha, brand, colors, fontSize, makeStyles, radius, shadow, sp, useTheme } from "@/theme";
import { restaurantAPI } from "@food/api";
import useAppBackNavigation from "@food/hooks/useAppBackNavigation";
import { RestaurantGridSkeleton } from "@food/components/ui/loading-skeletons";
import { useDelayedLoading } from "@food/hooks/useDelayedLoading";
import { useProfile } from "@food/context/ProfileContext";
import { filterDishesForVegMode, matchesVegRestaurantFilter } from "@food/utils/vegMode";

const debugLog = (...args) => {};
const debugWarn = (...args) => {};
const debugError = (...args) => {};

const DISH_FALLBACK = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop";

/** The web's banner image (assets/offerpagebanner.svg), drawn with react-native-svg, object-cover. */
function OfferBanner() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice">
      <Rect width={1200} height={400} rx={32} fill="#FF4C4C" />
      <SvgText x={600} y={180} alignmentBaseline="middle" textAnchor="middle" fontSize={72} fontFamily="sans-serif" fontWeight="bold" fill="#fff">
        Great Offers
      </SvgText>
      <SvgText x={600} y={240} alignmentBaseline="middle" textAnchor="middle" fontSize={32} fontFamily="sans-serif" fill="#fff">
        Save big on your next meal!
      </SvgText>
      <Circle cx={1100} cy={80} r={60} fill="#fff" fillOpacity={0.15} />
      <Circle cx={100} cy={320} r={40} fill="#fff" fillOpacity={0.1} />
      <Rect x={900} y={250} width={180} height={80} rx={24} fill="#fff" fillOpacity={0.18} />
    </Svg>
  );
}

export default function Offers() {
  const navigate = useNavigate();
  const goBack = useAppBackNavigation();
  const t = useTheme();
  const s = useStyles();
  const { width, height } = useWindowDimensions();
  const [offers, setOffers] = useState([]);
  const [groupedOffers, setGroupedOffers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const showOffersSkeleton = useDelayedLoading(loading);
  const { vegMode, vegModeOption } = useProfile();

  const dishWidth = (width - sp(4) * 2 - sp(4)) / 2;

  const visibleGroupedOffers = useMemo(() => {
    const entries = Object.entries(groupedOffers || {});
    if (!vegMode) return entries;

    return entries
      .map(([offerText, dishes]) => {
        const filtered = filterDishesForVegMode(dishes || [], vegMode).filter((dish) =>
          matchesVegRestaurantFilter(
            {
              pureVegRestaurant: dish?.pureVegRestaurant,
              hasNonVegMenu: dish?.hasNonVegMenu,
              isPureVeg: dish?.isPureVeg,
            },
            { vegMode, vegModeOption },
          ),
        );
        return [offerText, filtered];
      })
      .filter(([, dishes]) => dishes.length > 0);
  }, [groupedOffers, vegMode, vegModeOption]);

  // Fetch offers from API
  useEffect(() => {
    const fetchOffers = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await restaurantAPI.getPublicOffers();
        const data = response?.data?.data;

        if (data) {
          setOffers(data.allOffers || []);
          setGroupedOffers(data.groupedByOffer || {});
        }
      } catch (err) {
        debugError("Error fetching offers:", err);
        debugError("Error details:", err?.response?.data || err?.message);
        const errorMessage = err?.response?.data?.message || err?.message || "Failed to load offers";
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, [reloadKey]);

  const renderDish = (dish) => (
    <Link key={dish.id} to={`/user/restaurants/${dish.restaurantSlug}`} style={{ width: dishWidth }}>
      <View>
        {/* Image Container */}
        <View style={s.dishImageWrap}>
          <AppImage src={dish.dishImage || dish.restaurantImage || DISH_FALLBACK} style={s.fill} contentFit="cover" />
          {/* Offer Badge */}
          <View style={s.dishOffer}>
            <Text style={s.dishOfferText}>{dish.offer}</Text>
          </View>
        </View>

        {/* Rating Badge */}
        <View style={s.ratingRow}>
          <View style={s.ratingBadge}>
            <Text style={s.ratingText}>{dish.restaurantRating?.toFixed(1) || "0.0"}</Text>
            <Star size={10} color={colors.white} fill={colors.white} />
          </View>
        </View>

        {/* Restaurant Info */}
        <Text style={s.restName} numberOfLines={1}>
          {dish.restaurantName}
        </Text>
        <Text style={s.dishLine} numberOfLines={1}>
          {dish.dishName} - ₹{dish.discountedPrice}
        </Text>
        <View style={s.timeRow}>
          <Clock size={12} color={t.dark ? colors.gray[400] : colors.gray[500]} />
          <Text style={s.timeText}>{dish.deliveryTime}</Text>
        </View>
      </View>
    </Link>
  );

  const showSections = !showOffersSkeleton && !error;
  const showCoupons = showSections && visibleGroupedOffers.length === 0 && offers.length > 0;

  const header = (
    <>
      {/* Banner Section */}
      <View style={[s.banner, { minHeight: height * 0.25, height: height * 0.25 }]}>
        <View style={s.absFill}>
          <OfferBanner />
        </View>
        {/* Back Button */}
        <Pressable onPress={goBack} style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: alpha(colors.gray[800], 0.8) }]}>
          <BlurView intensity={10} tint="dark" style={s.absFill} />
          <ArrowLeft size={20} color={colors.white} />
        </Pressable>
      </View>

      <View style={s.contentTop}>
        {/* Loading State */}
        {showOffersSkeleton && <RestaurantGridSkeleton count={4} compact />}

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

  const footer = showSections ? (
    <View style={s.footer}>
      {/* Coupon-style offers (admin created) */}
      {showCoupons ? (
        <View style={{ gap: sp(4) }}>
          <Text style={s.couponsTitle}>Available Coupons</Text>
          <View style={{ gap: sp(4) }}>
            {offers.map((o, idx) => (
              <View key={o.id || o.offerId || idx} style={s.couponCard}>
                <View style={s.couponTop}>
                  <View>
                    <Text style={s.couponLabel}>Coupon</Text>
                    <Text style={s.couponCode}>{o.couponCode || "-"}</Text>
                  </View>
                  <View style={s.couponTags}>
                    <View style={s.couponTitleTag}>
                      <Text style={s.couponTitleText}>{o.title || "Offer"}</Text>
                    </View>
                    {o.couponType === "delivery" && (
                      <View style={[s.pill, { backgroundColor: colors.emerald[100] }]}>
                        <Text style={[s.pillText, { color: colors.emerald[700] }]}>Delivery Only</Text>
                      </View>
                    )}
                    {o.couponType === "takeaway" && (
                      <View style={[s.pill, { backgroundColor: colors.orange[100] }]}>
                        <Text style={[s.pillText, { color: colors.orange[700] }]}>Takeaway Only</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={s.couponRest}>
                  <Text style={[s.couponRest, { fontWeight: "600" }]}>Restaurant:</Text> {o.restaurantName || "All Restaurants"}
                </Text>
                {o.endDate ? <Text style={s.couponValid}>Valid till: {new Date(o.endDate).toLocaleDateString()}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {offers.length === 0 && !loading ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>No offers available at the moment</Text>
        </View>
      ) : null}
    </View>
  ) : null;

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
      <FlatList
        data={showSections ? visibleGroupedOffers : []}
        keyExtractor={([offerText]) => offerText}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingBottom: sp(6) }}
        renderItem={({ item: [offerText, dishes] }) => (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{offerText}</Text>
            {/* Restaurant Cards - Grid Layout */}
            <View style={s.grid}>{dishes.slice(0, 8).map(renderDish)}</View>
          </View>
        )}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { width: "100%", height: "100%" },
  absFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  banner: { position: "relative", width: "100%", overflow: "hidden" },
  backBtn: {
    position: "absolute",
    top: sp(4),
    left: sp(4),
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: alpha(colors.gray[800], 0.6),
    alignItems: "center",
    justifyContent: "center",
  },
  contentTop: { paddingHorizontal: sp(4), paddingTop: sp(6) },
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
  section: { paddingHorizontal: sp(4), marginBottom: sp(6) },
  sectionTitle: {
    ...fontSize["2xl"],
    fontWeight: "900",
    color: t.dark ? colors.red[400] : colors.red[500],
    textAlign: "center",
    marginBottom: sp(4),
    letterSpacing: 0.6,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: sp(4) },
  dishImageWrap: { position: "relative", height: 128, borderRadius: radius.xl, overflow: "hidden", marginBottom: sp(2) },
  dishOffer: { position: "absolute", top: sp(2), left: sp(2), backgroundColor: colors.blue[600], paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: radius.sm },
  dishOfferText: { color: colors.white, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: sp(1), marginBottom: sp(1) },
  ratingBadge: {
    backgroundColor: colors.green[600],
    paddingHorizontal: sp(1.5),
    paddingVertical: sp(0.5),
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(0.5),
  },
  ratingText: { color: colors.white, ...fontSize.xs, fontWeight: "700" },
  restName: { fontWeight: "600", color: t.dark ? colors.gray[100] : colors.gray[900], ...fontSize.sm },
  dishLine: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[600], marginBottom: sp(1) },
  timeRow: { flexDirection: "row", alignItems: "center", gap: sp(1) },
  timeText: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[500] },
  footer: { paddingHorizontal: sp(4) },
  couponsTitle: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.gray[100] : colors.gray[900] },
  couponCard: {
    backgroundColor: t.dark ? "#171717" : colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.slate[200],
    ...shadow.sm,
    padding: sp(4),
    gap: sp(2),
  },
  couponTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) },
  couponLabel: { ...fontSize.xs, color: t.dark ? colors.slate[400] : colors.slate[500] },
  couponCode: { ...fontSize.lg, fontWeight: "800", color: t.dark ? colors.slate[100] : colors.slate[900], letterSpacing: 0.45 },
  couponTags: { alignItems: "flex-end", gap: sp(1) },
  couponTitleTag: { paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: radius.md, backgroundColor: colors.blue[600] },
  couponTitleText: { ...fontSize.xs, fontWeight: "600", color: colors.white },
  pill: { paddingHorizontal: sp(2), paddingVertical: sp(0.5), borderRadius: radius.full },
  pillText: { fontSize: 10, lineHeight: 14, fontWeight: "500" },
  couponRest: { ...fontSize.sm, color: t.dark ? colors.slate[300] : colors.slate[700] },
  couponValid: { ...fontSize.xs, color: t.dark ? colors.slate[400] : colors.slate[500] },
  emptyWrap: { alignItems: "center", paddingVertical: sp(12) },
  emptyText: { ...fontSize.base, color: t.dark ? colors.gray[400] : colors.gray[500], textAlign: "center" },
}));
