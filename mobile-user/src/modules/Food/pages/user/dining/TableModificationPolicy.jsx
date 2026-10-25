// Web: modules/Food/pages/user/dining/TableModificationPolicy.jsx — static modification rules for a table booking.
// Light only on the web (no dark: classes). Also exports the styles TableCancellationPolicy shares (same markup).
import React, { useEffect, useRef } from "react"
import { Animated, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { ArrowLeft, Edit2, Info, CheckCircle2, Clock } from "lucide-react-native"
import { useNavigate, useLocation } from "@/lib/router"
import { Screen, Text } from "@/native/ui"
import { alpha, colors } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"

/** Tailwind animate-pulse: opacity 1 -> 0.5 -> 1 every 2s. */
function Pulse({ children }) {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [v])
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>
}

const RULES = [
  { title: "Number of Guests", desc: "Decrease or increase guests (subject to table availability).", ok: true },
  { title: "Date & Time Slot", desc: "Reschedule to any available slot on the same or future dates.", ok: true },
  { title: "Special Requests", desc: "Update your food preferences or celebration notes anytime.", ok: true },
  { title: "One-time Free Change", desc: "Your first modification is always free before the deadline.", ok: false },
]

export default function TableModificationPolicy() {
  const navigate = useNavigate()
  const location = useLocation()
  const { restaurant, guests, date, timeSlot, discount, specialRequest, user } = location.state || {}
  const s = policyStyles

  const handleBack = () => {
    navigate("/food/user/dining/book-confirmation", {
      state: { restaurant, guests, date, timeSlot, discount, specialRequest, user },
      replace: true,
    })
  }

  return (
    <Screen bg="#f8f9fa" statusBarStyle="dark">
      <AnimatedPage style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable onPress={handleBack} style={({ pressed }) => [s.backBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
            <ArrowLeft size={24} color={colors.slate[900]} />
          </Pressable>
          <Text style={s.headerTitle}>Modification</Text>
        </View>

        <ScrollView contentContainerStyle={s.content}>
          <View style={s.hero}>
            <View style={{ marginBottom: 8 }}>
              <Pulse>
                <View style={[s.heroIcon, { backgroundColor: alpha("#DC2626", 0.1) }]}>
                  <Clock size={40} color="#DC2626" />
                </View>
              </Pulse>
            </View>
            <View>
              <Text style={s.heroTitle}>Can I make changes?</Text>
              <Text style={s.heroSub}>Flexible modifications for your comfort</Text>
            </View>
          </View>

          <View style={[s.banner, { backgroundColor: "#DC2626", shadowColor: alpha("#DC2626", 0.2) }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
              <View style={s.bannerIcon}>
                <Edit2 size={24} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.bannerKicker, { color: alpha(colors.white, 0.7) }]}>Modification Status</Text>
                <Text style={s.bannerTitle}>Free till {timeSlot}, today</Text>
                <Text style={[s.bannerNote, { color: alpha(colors.white, 0.8) }]}>You can change guests or time for free.</Text>
              </View>
            </View>
          </View>

          <View style={{ gap: 16, paddingTop: 16 }}>
            <Text style={s.listKicker}>What you can change</Text>
            <View style={s.list}>
              {RULES.map((item, i) => (
                <View key={i} style={[s.row, i > 0 && s.rowDivider]}>
                  <View style={{ marginTop: 4 }}>
                    {item.ok ? <CheckCircle2 size={16} color={colors.green[500]} /> : <Info size={16} color={colors.amber[500]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{item.title}</Text>
                    <Text style={s.rowDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={{ paddingTop: 24, gap: 16 }}>
            <Pressable
              onPress={() => {
                const targetSlug = restaurant?.slug || restaurant?._id || restaurant?.id || "restaurant"
                navigate(`/food/user/dining/book/${targetSlug}`, {
                  state: { restaurant, guests, date, timeSlot, discount, isModifying: true },
                })
              }}
              style={({ pressed }) => [s.primaryBtn, { backgroundColor: "#DC2626", shadowColor: alpha("#DC2626", 0.2) }, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Text style={s.primaryText}>Modify Details Now</Text>
            </Pressable>
            <Pressable onPress={handleBack} style={({ pressed }) => [s.secondaryBtn, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Text style={[s.primaryText, { color: colors.slate[600] }]}>Back to Confirmation</Text>
            </Pressable>
          </View>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  )
}

export const policyStyles = StyleSheet.create({
  header: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: alpha(colors.white, 0.8),
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: colors.slate[50] },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: "900", color: colors.slate[900], letterSpacing: -0.5, textTransform: "uppercase" },
  content: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32 + 80, gap: 24 },
  hero: {
    backgroundColor: colors.white,
    borderRadius: 40,
    padding: 32,
    borderWidth: 1,
    borderColor: colors.slate[100],
    alignItems: "center",
    gap: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  heroIcon: { width: 80, height: 80, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: "900", color: colors.slate[900], letterSpacing: -0.5, textAlign: "center" },
  heroSub: { fontSize: 14, lineHeight: 20, color: colors.slate[400], fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.4, marginTop: 8, paddingHorizontal: 16, textAlign: "center" },
  banner: { borderRadius: 24, padding: 24, elevation: 12, shadowOpacity: 1, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } },
  bannerIcon: { width: 48, height: 48, backgroundColor: alpha(colors.white, 0.2), borderRadius: 16, alignItems: "center", justifyContent: "center" },
  bannerKicker: { fontSize: 10, lineHeight: 14, fontWeight: "900", textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 },
  bannerTitle: { fontSize: 18, lineHeight: 28, fontWeight: "700", color: colors.white },
  bannerNote: { fontSize: 12, lineHeight: 16, marginTop: 4, fontWeight: "500", fontStyle: "italic" },
  listKicker: { fontSize: 10, lineHeight: 14, fontWeight: "900", color: colors.slate[400], textTransform: "uppercase", letterSpacing: 3, marginLeft: 8 },
  list: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.slate[100],
    overflow: "hidden",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  row: { padding: 20, flexDirection: "row", alignItems: "flex-start", gap: 16 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.slate[50] },
  rowTitle: { fontWeight: "700", color: colors.slate[900], fontSize: 14, lineHeight: 20 },
  rowDesc: { fontSize: 12, lineHeight: 19.5, color: colors.slate[500], fontWeight: "500", marginTop: 4 },
  primaryBtn: { width: "100%", height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", elevation: 12, shadowOpacity: 1, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } },
  secondaryBtn: { width: "100%", height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.slate[100] },
  primaryText: { color: colors.white, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.4, fontSize: 14, lineHeight: 20 },
  footnote: { textAlign: "center", fontSize: 10, lineHeight: 20, color: colors.slate[400], fontWeight: "700", marginTop: 24, textTransform: "uppercase", letterSpacing: 1 },
  footLink: { color: colors.slate[900], textDecorationLine: "underline" },
})
