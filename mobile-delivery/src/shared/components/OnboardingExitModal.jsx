// Web: shared/components/OnboardingExitModal.jsx — "Exit onboarding?" confirm popup (fixed overlay, dimmed backdrop,
// gradient header with a log-out icon, Stay / Exit buttons). Same props as the web.
// Native: a Dialog (native Modal, covers everything). Tapping the backdrop or the Android back button = Stay, like a
// tap on the web's backdrop. The blurred glow in the header is a soft radial gradient (react-native-svg).
// In the Captain app the "taxi" Stay button is the partner blue (.driver-theme turns bg-slate-900 buttons #2563EB).
import React from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"
import { LogOut } from "lucide-react-native"
import { Dialog, Text } from "@/native/ui"
import { alpha, driverTheme, shadow } from "@/theme"

const THEMES = {
  delivery: {
    header: ["#0E4B9C", "#021024"],
    stay: "#00B761",
  },
  taxi: {
    header: ["#0b1220", "#1e293b"],
    stay: driverTheme.button,
  },
  restaurant: {
    header: ["#B80B3D", "#66001D"],
    stay: "#15803d",
  },
}

// absolute top-[-20%] right-[-10%] w-28 h-28 bg-white/10 rounded-full blur-2xl
const HeaderGlow = () => (
  <View pointerEvents="none" style={styles.glow}>
    <Svg width={192} height={192}>
      <Defs>
        <RadialGradient id="onboardingExitGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.1} />
          <Stop offset="0.35" stopColor="#ffffff" stopOpacity={0.085} />
          <Stop offset="0.6" stopColor="#ffffff" stopOpacity={0.05} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="192" height="192" fill="url(#onboardingExitGlow)" />
    </Svg>
  </View>
)

export default function OnboardingExitModal({
  open = false,
  onStay,
  onExit,
  title = "Exit Onboarding?",
  message = "Are you sure you want to exit? Your progress may not be saved.",
  stayLabel = "Stay Here",
  exitLabel = "Exit Anyway",
  theme = "delivery",
}) {
  const palette = THEMES[theme] || THEMES.delivery

  return (
    <Dialog open={open} onClose={onStay} style={styles.card}>
      <LinearGradient colors={palette.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <HeaderGlow />
        <View style={styles.iconCircle}>
          <LogOut size={32} color="#ffffff" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </LinearGradient>

      <View style={styles.actions}>
        <Pressable
          onPress={onStay}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.stay, shadowColor: palette.stay },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={styles.buttonText}>{stayLabel}</Text>
        </Pressable>
        <Pressable
          onPress={onExit}
          style={({ pressed }) => [styles.button, styles.exitButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.buttonText}>{exitLabel}</Text>
        </Pressable>
      </View>
    </Dialog>
  )
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 320,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#f3f4f6",
    ...shadow["2xl"],
  },
  header: { position: "relative", overflow: "hidden", padding: 24, alignItems: "center" },
  glow: { position: "absolute", top: -80, right: -72 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: alpha("#ffffff", 0.2),
    borderWidth: 1,
    borderColor: alpha("#ffffff", 0.3),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { marginBottom: 8, fontSize: 20, lineHeight: 28, fontWeight: "700", color: "#ffffff", textAlign: "center" },
  message: { fontSize: 13, lineHeight: 21.1, color: alpha("#ffffff", 0.85), textAlign: "center" },
  actions: { padding: 24, paddingTop: 20, gap: 12, backgroundColor: "#ffffff" },
  button: {
    width: "100%",
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  exitButton: { backgroundColor: "#dc2626", shadowColor: "#dc2626" },
  pressed: { transform: [{ scale: 0.98 }] },
  buttonText: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: "#ffffff" },
})
