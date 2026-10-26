// Web: modules/Food/components/restaurant/PartnerRolePicker.jsx — the two-way role switch on the restaurant login.
import React from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Store, UtensilsCrossed } from "lucide-react-native"
import { Text } from "@/native/ui"
import { colors, restaurantTheme } from "@/theme"

const PARTNER_ROLES = [
  { id: "restaurant", label: "Restaurant Partner", Icon: UtensilsCrossed },
  { id: "store", label: "My Store", Icon: Store },
]

/**
 * Two-way role switch on the restaurant login screen: Restaurant Partner or
 * My Store. A phone number belongs to one of them only, so this is chosen before
 * the OTP is sent (same idea as the driver app's role picker).
 */
// onValueChange (native naming; the web prop onChange is still accepted)
export default function PartnerRolePicker({ value, onValueChange, onChange, disabled = false }) {
  const change = onValueChange || onChange
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Login as" style={styles.group}>
      {PARTNER_ROLES.map(({ id, label, Icon }) => {
        const active = id === value
        const color = active ? colors.white : colors.gray[600]
        const content = (
          <>
            <Icon size={16} color={color} strokeWidth={2.2} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {label}
            </Text>
          </>
        )
        return (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled }}
            disabled={disabled}
            onPress={() => change?.(id)}
            style={({ pressed }) => [styles.cell, active && styles.activeShadow, disabled && { opacity: 0.6 }, pressed && !disabled && { opacity: 0.9 }]}
          >
            {active ? (
              <LinearGradient
                colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.inner}
              >
                {content}
              </LinearGradient>
            ) : (
              <View style={styles.inner}>{content}</View>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  group: { flexDirection: "row", gap: 4, borderRadius: 9999, backgroundColor: colors.gray[100], padding: 4 },
  cell: { flex: 1, borderRadius: 9999 },
  activeShadow: { elevation: 4, shadowColor: restaurantTheme.brand, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
  inner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 10 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", flexShrink: 1 },
})
