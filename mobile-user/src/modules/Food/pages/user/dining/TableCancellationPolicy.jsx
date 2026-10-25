// Web: modules/Food/pages/user/dining/TableCancellationPolicy.jsx — static cancellation terms for a table booking.
// Light only on the web (no dark: classes). Back / "I Understand" return to the confirmation with the same state.
import React, { useEffect, useRef } from "react"
import { Animated, Easing, Pressable, ScrollView, View } from "react-native"
import { ArrowLeft, ShieldCheck, Info, CheckCircle2 } from "lucide-react-native"
import { useNavigate, useLocation } from "@/lib/router"
import { Screen, Text } from "@/native/ui"
import { alpha, colors } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { policyStyles as s } from "./TableModificationPolicy"

/** Tailwind animate-bounce: -25% of the height and back, once per second. */
function Bounce({ children, height = 80 }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.bezier(0.8, 0, 1, 1), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 500, easing: Easing.bezier(0, 0, 0.2, 1), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [v])
  return <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.25] }) }] }}>{children}</Animated.View>
}

const TERMS = [
  { title: "Full Refund", desc: "100% refund if cancelled before the deadline.", ok: true },
  { title: "Processing Time", desc: "Refunds reach your original payment method in 5-7 days.", ok: true },
  { title: "No Show Policy", desc: "Refuds are not applicable if you don't arrive within 15 mins of your slot.", ok: false },
  { title: "Late Cancellation", desc: "50% charge applicable if cancelled after the deadline.", ok: false },
]

export default function TableCancellationPolicy() {
  const navigate = useNavigate()
  const location = useLocation()
  const { restaurant, guests, date, timeSlot, discount, specialRequest, user } = location.state || {}

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
          <Text style={s.headerTitle}>Cancellation</Text>
        </View>

        <ScrollView contentContainerStyle={s.content}>
          <View style={s.hero}>
            <View style={{ marginBottom: 8 }}>
              <Bounce>
                <View style={[s.heroIcon, { backgroundColor: colors.red[50] }]}>
                  <ShieldCheck size={40} color={colors.red[500]} />
                </View>
              </Bounce>
            </View>
            <View>
              <Text style={s.heroTitle}>Cancellation Policy</Text>
              <Text style={s.heroSub}>Standard dining terms apply to your booking</Text>
            </View>
          </View>

          <View style={[s.banner, { backgroundColor: colors.red[500], shadowColor: colors.red[200] }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
              <View style={s.bannerIcon}>
                <Info size={24} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.bannerKicker, { color: colors.red[100] }]}>Cancellation Deadline</Text>
                <Text style={s.bannerTitle}>Valid till {timeSlot}, today</Text>
                <Text style={[s.bannerNote, { color: alpha(colors.red[100], 0.8) }]}>You can cancel for free before this time.</Text>
              </View>
            </View>
          </View>

          <View style={{ gap: 16, paddingTop: 16 }}>
            <Text style={s.listKicker}>Detailed Terms</Text>
            <View style={s.list}>
              {TERMS.map((item, i) => (
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

          <View style={{ paddingTop: 24 }}>
            <Pressable onPress={handleBack} style={({ pressed }) => [s.primaryBtn, { backgroundColor: colors.slate[900], shadowColor: colors.slate[200] }, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Text style={s.primaryText}>I Understand</Text>
            </Pressable>
            <Text style={s.footnote}>
              By using Hello Parth Food dining, you agree to our {"\n"}
              <Text style={s.footLink}>Terms of Service</Text>
            </Text>
          </View>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  )
}
