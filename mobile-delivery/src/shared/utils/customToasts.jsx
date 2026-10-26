import React from "react";
import { Dimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Trash2, CheckCircle2 } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { Text } from "@/native/ui";
import { colors, fonts, shadow } from "@/theme";
import { markBrandToastShown } from "./toastGuard";

const WORDMARK_SIZES = {
  sm: { box: 40, font: 11 },
  md: { box: 48, font: 13 },
  lg: { box: 56, font: 15 },
};

/** "Hello / Parth" wordmark (the login screen's Pacifico lettering, one word under the other) on the brand red, as the
 *  leading icon of branded toasts. */
export const BrandToastIcon = ({ size = "lg" }) => {
  const dim = WORDMARK_SIZES[size] || WORDMARK_SIZES.lg;
  const word = {
    fontFamily: fonts.pacifico,
    fontSize: dim.font,
    // line-height 0.95 (Pacifico's own ascent is tall; RN clips glyphs below ~1.3x, so keep the line a bit taller)
    lineHeight: Math.round(dim.font * 1.3),
    color: colors.white,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    includeFontPadding: false,
  };
  return (
    <LinearGradient
      colors={["#DC2626", "#991B1B"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      accessibilityLabel="Hello Parth"
      style={{ width: dim.box, height: dim.box, flexShrink: 0, borderRadius: 16, alignItems: "center", justifyContent: "center", ...shadow.lg }}
    >
      <Text style={[word, { marginBottom: -dim.font * 0.35 }]}>Hello</Text>
      <Text style={word}>Parth</Text>
    </LinearGradient>
  );
};

const NOTIF_TOAST_ID = "app-notification-toast";
const toastWidth = () => Dimensions.get("window").width - 32;

const cardStyle = {
  backgroundColor: colors.white,
  borderRadius: 24,
  flexDirection: "row",
  alignItems: "center",
  gap: 16,
  padding: 14,
  borderWidth: 1,
  borderColor: colors.gray[50],
  shadowColor: "#000",
  shadowOpacity: 0.12,
  shadowRadius: 30,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
};

export const showNotificationToast = ({ title, message } = {}) => {
  markBrandToastShown(6000);
  toast.dismiss(NOTIF_TOAST_ID);
  toast.custom(
    () => (
      <View style={[cardStyle, { width: toastWidth() }]}>
        <BrandToastIcon size="md" />
        <View style={{ flex: 1, paddingRight: 4, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 16, fontWeight: "700", color: colors.gray[900] }}>
            {title || "Notification"}
          </Text>
          {message ? (
            <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 17, fontWeight: "500", color: colors.gray[500], marginTop: 2 }}>
              {message}
            </Text>
          ) : null}
        </View>
      </View>
    ),
    { id: NOTIF_TOAST_ID, duration: 6000, position: "top-center" },
  );
};

export const showHelloParthBrandedToast = ({ title, message, id = "helloparth-branded-toast", duration = 4000 } = {}) => {
  markBrandToastShown(duration);
  toast.custom(
    () => (
      <View style={[cardStyle, { width: toastWidth() }]}>
        <BrandToastIcon />
        <View style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
          <Text style={{ fontSize: 14, lineHeight: 17, fontWeight: "700", color: colors.gray[800] }}>{title}</Text>
          {message ? <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "500", color: colors.gray[500], marginTop: 4 }}>{message}</Text> : null}
        </View>
      </View>
    ),
    { id, duration, position: "top-center" },
  );
};

export const showAddressRemovedToast = () => {
  showHelloParthBrandedToast({
    title: "Address Removed Successfully",
    id: "address-removed-toast",
  });
};

export const showAccountDeletedToast = () => {
  toast.custom(
    () => (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: "#f0fdf4",
          borderWidth: 1,
          borderColor: "#bbf7d0",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 12,
          minWidth: 300,
          ...shadow.lg,
        }}
      >
        <View>
          <Trash2 size={24} color="#ef4444" />
          <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: colors.white, borderRadius: 999 }}>
            <CheckCircle2 size={14} color={colors.white} fill="#22c55e" />
          </View>
        </View>
        <Text style={{ color: "#15803d", fontWeight: "700", fontSize: 14, lineHeight: 20 }}>Account Deleted successfully</Text>
      </View>
    ),
    { duration: 4000 },
  );
};
