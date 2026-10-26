// Web: modules/Food/components/restaurant/NewRoleConfirmDialog.jsx — "create an account for the other role?" popup on
// the restaurant login. fixed inset-0 overlay -> native Dialog (tap outside / Android back closes unless busy).
import React, { useEffect, useRef } from "react"
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Loader2, Store, UtensilsCrossed } from "lucide-react-native"
import { Dialog, Text } from "@/native/ui"
import { alpha, colors, restaurantTheme, shadow } from "@/theme"

const ROLE_LABEL = { restaurant: "Restaurant Partner", store: "My Store" }
const ROLE_ICON = { restaurant: UtensilsCrossed, store: Store }
const BRAND = restaurantTheme.brand

function Spinner({ color = "#ffffff", size = 20 }) {
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [spin])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  )
}

/**
 * Small confirm popup on the restaurant login screen: the number already has an account for the OTHER role
 * (Restaurant Partner <-> My Store). One number can have both, so this only checks that a second account is
 * really wanted (e.g. not a mis-tap on the wrong role).
 *
 * requestedPartnerType: the role chosen on the login screen (the account that would be created).
 * existingPartnerType:  the role this number is already registered as.
 */
export default function NewRoleConfirmDialog({
  open,
  requestedPartnerType,
  existingPartnerType,
  busy = false,
  onConfirm,
  onClose,
}) {
  const requested = ROLE_LABEL[requestedPartnerType] || "My Store"
  const existing = ROLE_LABEL[existingPartnerType] || "Restaurant Partner"
  const Icon = ROLE_ICON[requestedPartnerType] || Store

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      dismissible={!busy}
      style={styles.card}
    >
      <View accessibilityRole="alert" style={styles.inner}>
        <View style={styles.iconWrap}>
          <Icon size={28} color={BRAND} strokeWidth={1.9} />
        </View>

        <Text style={styles.title}>{`Create ${requested} account?`}</Text>
        <Text style={styles.body}>
          {`This number is already registered as ${existing}. Do you want to create a separate ${requested} account with the same number?`}
        </Text>

        <View style={styles.row}>
          <Pressable
            onPress={onClose}
            disabled={busy}
            style={({ pressed }) => [styles.btn, styles.cancel, busy && { opacity: 0.6 }, pressed && !busy && { transform: [{ scale: 0.98 }] }]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            style={({ pressed }) => [styles.btn, styles.confirmShadow, busy && { opacity: 0.6 }, pressed && !busy && { transform: [{ scale: 0.98 }] }]}
          >
            <LinearGradient
              colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.confirmInner}
            >
              {busy ? <Spinner /> : <Text style={styles.confirmText}>Continue</Text>}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Dialog>
  )
}

const styles = StyleSheet.create({
  card: { maxWidth: 320, borderRadius: 24, backgroundColor: colors.white, ...shadow["2xl"] },
  inner: { alignItems: "center", padding: 24 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: alpha(BRAND, 0.1), alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { marginBottom: 6, textAlign: "center", fontSize: 17, lineHeight: 21, fontWeight: "900", color: "#1F2937" },
  body: { textAlign: "center", fontSize: 13.5, lineHeight: 22, fontWeight: "500", color: colors.gray[500] },
  row: { marginTop: 20, flexDirection: "row", width: "100%", gap: 12 },
  btn: { flex: 1, borderRadius: 14, minHeight: 48 },
  cancel: { borderWidth: 1.5, borderColor: colors.gray[300], backgroundColor: colors.white, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  cancelText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.gray[600] },
  confirmShadow: { elevation: 5, shadowColor: BRAND, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  confirmInner: { flex: 1, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingVertical: 12 },
  confirmText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.white },
})
