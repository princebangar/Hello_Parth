// Web: modules/Food/pages/user/profile/Coupons.jsx — public offers (GET restaurant offers), copy code to clipboard.
// The empty-state "treasure map" (CSS gradients + inline SVG) is drawn with expo-linear-gradient + react-native-svg.
import { useEffect, useMemo, useState } from "react"
import { FlatList, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Path } from "react-native-svg"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, Copy, MapPin, TicketPercent } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { tokensFor } from "@food/components/ui/tokens"
import { restaurantAPI } from "@food/api"

function Coin({ style }) {
  const s = useStyles()
  return (
    <View style={[s.coin, style]}>
      <LinearGradient colors={[colors.yellow[400], colors.yellow[500]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fill} />
    </View>
  )
}

function TreasureMap() {
  const s = useStyles()
  return (
    <View style={s.mapWrap}>
      {/* Circular Background */}
      <View style={s.mapCircle}>
        {/* Map Pattern Background - More detailed */}
        <Svg style={[s.fill, { opacity: 0.7 }]} viewBox="0 0 200 200" fill="none">
          <Path d="M 20 100 Q 50 80, 80 100 T 140 100" stroke="#a1a1aa" strokeWidth="4" fill="none" strokeLinecap="round" />
          <Path d="M 100 20 Q 100 50, 100 80 T 100 140" stroke="#a1a1aa" strokeWidth="4" fill="none" strokeLinecap="round" />
          <Path d="M 40 40 Q 60 60, 80 80 T 120 120" stroke="#b4b4b8" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M 160 40 Q 140 60, 120 80 T 80 120" stroke="#b4b4b8" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M 30 170 Q 50 150, 70 130 T 110 90" stroke="#b4b4b8" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M 170 170 Q 150 150, 130 130 T 90 90" stroke="#b4b4b8" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M 50 50 L 70 70" stroke="#c4c4c7" strokeWidth="2" strokeLinecap="round" />
          <Path d="M 150 50 L 130 70" stroke="#c4c4c7" strokeWidth="2" strokeLinecap="round" />
          <Path d="M 50 150 L 70 130" stroke="#c4c4c7" strokeWidth="2" strokeLinecap="round" />
          <Path d="M 150 150 L 130 130" stroke="#c4c4c7" strokeWidth="2" strokeLinecap="round" />
        </Svg>

        {/* Map Pins */}
        <View style={[s.pin, { left: sp(12), top: sp(16) }]}>
          <MapPin size={28} color={colors.red[500]} fill={colors.red[500]} />
        </View>
        <View style={[s.pin, { right: sp(12), top: sp(20) }]}>
          <MapPin size={28} color={colors.red[500]} fill={colors.red[500]} />
        </View>

        {/* Treasure Chest and Coins */}
        <View style={s.chestGroup}>
          {/* Gold Coins Stack (Left) */}
          <View style={s.coins}>
            <Coin />
            <Coin style={{ marginLeft: -4 }} />
            <Coin style={{ marginLeft: -8 }} />
          </View>

          {/* Treasure Chest */}
          <View style={{ marginTop: sp(4) }}>
            {/* Chest Body */}
            <View style={s.chest}>
              <LinearGradient colors={[colors.amber[800], colors.amber[900]]} style={[s.fill, { borderRadius: 10 }]} />
              {/* Chest Top/Lid */}
              <LinearGradient colors={[colors.amber[900], colors.amber[950]]} style={s.lid} />

              {/* Chest Lock */}
              <View style={s.lockWrap}>
                <View style={s.lock}>
                  <LinearGradient colors={[colors.yellow[400], colors.yellow[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.fill, { borderRadius: 9999 }]} />
                  <View style={s.lockHole} />
                </View>
              </View>

              {/* Chest Straps */}
              <View style={[s.strap, { top: sp(3) }]} />
              <View style={[s.strap, { bottom: sp(3) }]} />

              {/* Chest Details */}
              <View style={s.detail} />
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

export default function Coupons() {
  const navigate = useNavigate()
  const s = useStyles()
  const t = useTheme()
  const k = tokensFor(t)
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const res = await restaurantAPI.getPublicOffers()
        const list = res?.data?.data?.allOffers || res?.data?.allOffers || []
        if (!cancelled) {
          // Only show offers meant to be visible to users (default true)
          const visible = Array.isArray(list) ? list.filter((o) => o?.showInCart !== false) : []
          setOffers(visible)
        }
      } catch (e) {
        if (!cancelled) setOffers([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const sortedOffers = useMemo(() => {
    if (!Array.isArray(offers)) return []
    return [...offers].sort((a, b) => String(a?.couponCode || "").localeCompare(String(b?.couponCode || "")))
  }, [offers])

  const handleCopy = async (code) => {
    const value = String(code || "").trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Coupon copied")
    } catch {
      toast.error("Failed to copy")
    }
  }

  const renderOffer = ({ item: offer }) => {
    const code = offer?.couponCode || ""
    const title = offer?.title || ""
    const restaurantName = offer?.restaurantName || "All Restaurants"
    const endDate = offer?.endDate ? new Date(offer.endDate) : null
    const expiryText =
      endDate && !Number.isNaN(endDate.getTime())
        ? `Valid till ${endDate.toLocaleDateString()}`
        : "No expiry"

    return (
      <View style={s.offerCard}>
        <View style={s.offerRow}>
          <View style={s.offerLeft}>
            <View style={s.offerIcon}>
              <TicketPercent size={20} color={colors.orange[700]} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.codeRow}>
                <Text style={s.code}>{code}</Text>
                {title ? (
                  <View style={s.titlePill}>
                    <Text style={s.titlePillText}>{title}</Text>
                  </View>
                ) : null}
                {offer.couponType === "delivery" && (
                  <View style={[s.typePill, { backgroundColor: t.dark ? alpha(colors.emerald[950], 0.3) : colors.emerald[100] }]}>
                    <Text style={[s.typePillText, { color: t.dark ? colors.emerald[400] : colors.emerald[700] }]}>Delivery Only</Text>
                  </View>
                )}
                {offer.couponType === "takeaway" && (
                  <View style={[s.typePill, { backgroundColor: t.dark ? alpha(colors.orange[950], 0.3) : colors.orange[100] }]}>
                    <Text style={[s.typePillText, { color: t.dark ? colors.orange[400] : colors.orange[700] }]}>Takeaway Only</Text>
                  </View>
                )}
              </View>
              <Text style={s.restaurantName} numberOfLines={1}>
                {restaurantName}
              </Text>
              <Text style={s.expiry}>{expiryText}</Text>
            </View>
          </View>

          <Button variant="outline" style={s.copyButton} onPress={() => handleCopy(code)}>
            <Copy size={16} color={k.foreground} style={{ marginRight: sp(2) }} />
            Copy
          </Button>
        </View>
      </View>
    )
  }

  const header = (
    <View style={s.header}>
      <Button variant="ghost" size="icon" onPress={() => navigate("/food/user/profile")} style={s.backButton} accessibilityLabel="Go back">
        <ArrowLeft size={20} color={t.dark ? colors.white : colors.black} />
      </Button>
      <Text style={s.title}>Your coupons</Text>
    </View>
  )

  const minBody = { minHeight: height * 0.6 }

  return (
    <AnimatedPage style={s.page}>
      {loading ? (
        <View style={[s.content, { paddingTop: insets.top + sp(4) }]}>
          {header}
          <View style={[s.center, minBody]}>
            <Text style={s.loadingText}>Loading coupons...</Text>
          </View>
        </View>
      ) : sortedOffers.length > 0 ? (
        <FlatList
          data={sortedOffers}
          keyExtractor={(offer, index) => String(offer?.id || offer?.offerId || offer?.couponCode || index)}
          renderItem={renderOffer}
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View style={{ height: sp(3) }} />}
          contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(6) }]}
        />
      ) : (
        <View style={[s.content, { paddingTop: insets.top + sp(4) }]}>
          {header}
          {/* Empty State */}
          <View style={[s.center, minBody, { paddingHorizontal: sp(4) }]}>
            {/* Circular Map Illustration */}
            <TreasureMap />

            {/* Text Content */}
            <View style={s.emptyTextBlock}>
              <Text style={s.emptyTitle}>No coupons found</Text>
              <Text style={s.emptyText}>Discover hidden coupons on your map screen after placing an order</Text>
            </View>
          </View>
        </View>
      )}
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
  content: { paddingHorizontal: sp(4) },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(8) },
  backButton: { height: 32, width: 32, padding: 0 },
  title: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.black },
  center: { alignItems: "center", justifyContent: "center" },
  loadingText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600] },
  offerCard: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[200],
    padding: sp(4),
  },
  offerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) },
  offerLeft: { flexDirection: "row", alignItems: "flex-start", gap: sp(3), minWidth: 0, flex: 1 },
  offerIcon: { height: 40, width: 40, borderRadius: 14, backgroundColor: colors.orange[100], alignItems: "center", justifyContent: "center", flexShrink: 0 },
  codeRow: { flexDirection: "row", alignItems: "center", gap: sp(2), flexWrap: "wrap" },
  code: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  titlePill: { paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 9999, backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] },
  titlePillText: { ...fontSize.xs, color: t.dark ? colors.gray[200] : colors.gray[700] },
  typePill: { paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 9999 },
  typePillText: { fontSize: 10, lineHeight: 14, fontWeight: "500" },
  restaurantName: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[600], marginTop: sp(1) },
  expiry: { fontSize: 11, lineHeight: 16, color: colors.gray[500], marginTop: sp(1) },
  copyButton: { height: 36, paddingHorizontal: sp(3), borderRadius: 14 },
  // Empty state illustration
  mapWrap: { position: "relative", marginBottom: sp(8) },
  mapCircle: {
    width: 256,
    height: 256,
    backgroundColor: colors.gray[200],
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pin: { position: "absolute", zIndex: 20, ...shadow.lg },
  chestGroup: { position: "relative", zIndex: 10, alignItems: "center" },
  coins: { position: "absolute", left: -40, top: sp(2), gap: 2 },
  coin: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors.yellow[600],
    overflow: "hidden",
    ...shadow.lg,
  },
  chest: { width: 96, height: 80, borderRadius: 10, position: "relative", ...shadow.xl },
  lid: { position: "absolute", top: -12, left: 0, right: 0, height: 20, borderTopLeftRadius: 10, borderTopRightRadius: 10, ...shadow.md },
  lockWrap: { position: "absolute", top: 20, left: 28, zIndex: 10 },
  lock: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors.yellow[700],
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...shadow.lg,
  },
  lockHole: { width: 16, height: 16, backgroundColor: colors.yellow[700], borderRadius: 9999 },
  strap: { position: "absolute", left: sp(3), width: 64, height: 6, backgroundColor: colors.amber[950], borderRadius: 9999 },
  detail: { position: "absolute", top: sp(1), left: 16, width: 64, height: 2, backgroundColor: colors.amber[700] },
  emptyTextBlock: { alignItems: "center", gap: sp(3), maxWidth: 384 },
  emptyTitle: { ...fontSize.xl, fontWeight: "700", color: colors.black, textAlign: "center" },
  emptyText: { ...fontSize.sm, lineHeight: 22, color: colors.gray[600], textAlign: "center" },
}))
