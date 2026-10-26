// Web: pages/restaurant/RushHour.jsx — "Rush in kitchen" (/rush-hour): info banner, the three benefits, the four
// preparation-time radio options and the Confirm bar (which, like the web, only goes back — there is no API call).
// Native: the web's RadioGroup is drawn with Pressable radios; lenis -> native scroll; the Confirm bar sits below the
// scroll view with the bottom safe area.
import React, { useState } from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, Zap } from "lucide-react-native"
import { Screen, StatusBarSpacer, Text } from "@/native/ui"
import { colors, fontSize, radius, restaurantTheme, sp } from "@/theme"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
const debugLog = () => {}

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]

export default function RushHour() {
  const goBack = useRestaurantBackNavigation()
  const insets = useSafeAreaInsets()
  const [selectedTime, setSelectedTime] = useState("30")

  const handleConfirm = () => {
    // Handle rush hour confirmation logic here
    debugLog("Rush hour confirmed for:", selectedTime, "minutes")
    goBack() // Go back after confirmation
  }

  const timeOptions = [
    { value: "30", label: "30 minutes" },
    { value: "60", label: "1 hour" },
    { value: "90", label: "1 hour 30 minutes" },
    { value: "120", label: "2 hours" },
  ]

  return (
    <Screen bg={colors.white} edges={[]}>
      {/* Header */}
      <View style={s.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={s.headerRow}>
          <Pressable
            onPress={goBack}
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: colors.gray[100] }]}
          >
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <Text style={s.headerTitle}>Rush in kitchen</Text>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView style={s.flex} contentContainerStyle={s.content}>
        {/* Informational Banner */}
        <View style={s.banner}>
          <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.zapCircle}>
            <Zap size={28} color={colors.white} strokeWidth={2.5} fill={colors.white} />
          </LinearGradient>
          <Text style={s.bannerText}>
            Inform us when your kitchen is in rush and you need more time to manage orders
          </Text>
        </View>

        {/* How this helps you Section */}
        <View style={{ marginBottom: sp(8) }}>
          <Text style={s.sectionTitle}>How this helps you</Text>
          <View style={{ gap: sp(3) }}>
            {[
              "Get more time to prepare food",
              "Show correct delivery time to customers",
              "Avoid crowding of riders at your restaurant",
            ].map((benefit, index) => (
              <View key={index} style={s.benefitRow}>
                <View style={s.benefitNum}>
                  <Text style={s.benefitNumText}>{index + 1}</Text>
                </View>
                <Text style={s.benefitText}>{benefit}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Time Selection Section */}
        <View style={{ marginBottom: sp(6) }}>
          <Text style={s.sectionTitle}>Increase food preparation time for the next</Text>
          <View style={{ gap: sp(4) }} accessibilityRole="radiogroup">
            {timeOptions.map((option) => {
              const selected = selectedTime === option.value
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setSelectedTime(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={s.radioRow}
                >
                  <View style={[s.radio, selected && s.radioOn]}>
                    {selected ? <View style={s.radioDot} /> : null}
                  </View>
                  <Text style={s.radioLabel}>{option.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </ScrollView>

      {/* Confirm Button */}
      <View style={[s.footer, { paddingBottom: sp(6) + insets.bottom }]}>
        <Pressable onPress={handleConfirm} style={({ pressed }) => [s.confirmBtn, pressed && { opacity: 0.9 }]}>
          <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={s.confirmText}>Confirm</Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3) },
  backBtn: { padding: sp(1.5), borderRadius: radius.lg },
  headerTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900] },
  content: { paddingHorizontal: sp(4), paddingVertical: sp(6) },
  banner: {
    backgroundColor: colors.blue[50],
    borderRadius: radius.lg,
    padding: sp(4),
    marginBottom: sp(6),
    flexDirection: "row",
    alignItems: "flex-start",
    gap: sp(4),
  },
  zapCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  bannerText: { flex: 1, ...fontSize.sm, lineHeight: 22.75, color: colors.gray[900], paddingTop: sp(1) },
  sectionTitle: { ...fontSize.base, fontWeight: "700", color: colors.gray[900], marginBottom: sp(4) },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  benefitNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.gray[200], alignItems: "center", justifyContent: "center" },
  benefitNumText: { ...fontSize.xs, fontWeight: "600", color: colors.gray[700] },
  benefitText: { flex: 1, ...fontSize.sm, color: colors.gray[900] },
  radioRow: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.gray[300],
    alignItems: "center",
    justifyContent: "center",
  },
  // web radio-group: selected = border-blue-600 bg-blue-600 with a white dot (scale-50)
  radioOn: { borderColor: colors.blue[600], backgroundColor: colors.blue[600] },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  radioLabel: { flex: 1, ...fontSize.sm, color: colors.gray[900] },
  footer: { paddingHorizontal: sp(4), paddingTop: sp(4), backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray[200] },
  confirmBtn: { borderRadius: radius.lg, overflow: "hidden", paddingVertical: sp(3), paddingHorizontal: sp(4), alignItems: "center" },
  confirmText: { color: colors.white, fontWeight: "600", ...fontSize.base },
})
