import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LogOut, Power } from "lucide-react-native";
import { Dialog, Text } from "@/native/ui";
import { alpha, colors, makeStyles, shadow } from "@/theme";
import useBodyScrollLock from "@/shared/hooks/useBodyScrollLock.js";

/**
 * Log-out confirmation, shared by Food and Taxi. A solid card on a dark backdrop (the web's frosted-glass card let the
 * page behind show through on phones, which made it hard to read).
 * The web's class props are style props here:
 *  - iconBgStyle (web iconBgClassName)
 *  - iconColor (web iconClassName, default #FF3131)
 *  - confirmButtonStyle (web confirmButtonClassName, default the red #FF3131 button)
 */
export default function UserLogoutConfirmDialog({
  open,
  onClose,
  onConfirm,
  isLoggingOut = false,
  iconBgStyle,
  iconColor = "#FF3131",
  confirmButtonStyle,
}) {
  const s = useStyles();
  // Taxi passes its blue (confirmButtonStyle.backgroundColor); Food keeps the red.
  const accent = StyleSheet.flatten(confirmButtonStyle)?.backgroundColor;
  const buttonColors = accent ? [accent, accent] : ["#FF4D4D", "#E11D2E"];
  // The screen behind must not scroll while the popup is open (the native Modal already takes every touch).
  useBodyScrollLock(open);

  return (
    <Dialog open={open} onClose={isLoggingOut ? undefined : onClose} dismissible={!isLoggingOut} backdropOpacity={0.65} style={s.card}>
      <View accessibilityRole="alert" accessibilityLabel="Log out" style={s.body}>
        {/* soft red glow behind the icon */}
        <LinearGradient pointerEvents="none" colors={[alpha(iconColor, 0.12), alpha(iconColor, 0)]} style={s.topBand} />

        <View style={[s.iconRing, { borderColor: alpha(iconColor, 0.22) }]}>
          <LinearGradient colors={[alpha(iconColor, 0.16), alpha(iconColor, 0.06)]} style={[s.iconInner, iconBgStyle]}>
            <Power size={30} color={iconColor} strokeWidth={2.4} />
          </LinearGradient>
        </View>

        <Text style={s.title}>Log out?</Text>
        <Text style={s.text}>Are you sure you want to log out?</Text>

        <View style={s.row}>
          <Pressable
            onPress={onClose}
            disabled={isLoggingOut}
            style={({ pressed }) => [s.noBtn, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Text style={s.noText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={isLoggingOut}
            style={({ pressed }) => [s.yesWrap, accent && { shadowColor: accent }, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <LinearGradient colors={buttonColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.yesBtn}>
              {isLoggingOut ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <LogOut size={18} color={colors.white} strokeWidth={2.4} />
              )}
              <Text style={s.yesText}>{isLoggingOut ? "Logging out..." : "Log out"}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Dialog>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    maxWidth: 360,
    borderRadius: 28,
    backgroundColor: t.dark ? "#171717" : colors.white,
    borderWidth: t.dark ? 1 : 0,
    borderColor: alpha("#ffffff", 0.08),
    ...shadow["2xl"],
  },
  body: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 22, alignItems: "center", overflow: "hidden" },
  topBand: { position: "absolute", top: 0, left: 0, right: 0, height: 130 },
  iconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 6,
    marginBottom: 16,
    backgroundColor: t.dark ? alpha("#ffffff", 0.04) : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? alpha("#FF3131", 0.25) : colors.red[100],
  },
  iconInner: { flex: 1, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800", color: t.dark ? colors.white : colors.gray[900], textAlign: "center" },
  text: {
    fontSize: 14,
    lineHeight: 21,
    color: t.dark ? colors.gray[400] : colors.gray[500],
    marginTop: 6,
    marginBottom: 24,
    textAlign: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch" },
  noBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: t.dark ? colors.gray[700] : colors.gray[200],
    backgroundColor: t.dark ? "#202020" : colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
  },
  noText: { fontSize: 16, fontWeight: "700", color: t.dark ? colors.gray[200] : colors.gray[700] },
  yesWrap: { flex: 1, height: 50, borderRadius: 16, ...shadow.lg, shadowColor: colors.red[600], shadowOpacity: 0.35 },
  yesBtn: { flex: 1, borderRadius: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  yesText: { fontSize: 16, fontWeight: "800", color: colors.white },
  pressed: { transform: [{ scale: 0.96 }] },
}));
