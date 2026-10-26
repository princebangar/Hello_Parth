import React, { useState, useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Loader2 } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { AppImage, Screen, Text } from "@/native/ui";
import { StatusBar } from "@/native/ui/SectionStatusBar";
import { alpha, colors, fonts, shadow } from "@/theme";
import { deliveryAPI } from "@food/api";
import { useCompanyName } from "@food/hooks/useCompanyName";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";

const PRIMARY = "#15498B";
// web /assets/images/profile_avatar.webp, bundled so it shows offline
const DEFAULT_AVATAR = require("../../../../assets/public/images/profile_avatar.webp");

function Spinner({ color, size }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

export default function ShowIdCardV2() {
  const companyName = useCompanyName();
  const goBack = useDeliveryBackNavigation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);

  // Fetch delivery partner profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getProfile();

        if (response?.data?.success && response?.data?.data?.profile) {
          setProfileData(response.data.data.profile);
        } else {
          toast.error("Failed to load profile data");
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Failed to load ID card data");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Format date for validity
  const formatValidDate = () => {
    if (!profileData?.createdAt) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const createdDate = new Date(profileData.createdAt);
    const validTill = new Date(createdDate);
    validTill.setFullYear(validTill.getFullYear() + 1);
    return validTill.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Get status display
  const getStatusDisplay = () => {
    if (!profileData) return "Active";
    const status = profileData.status?.toLowerCase() || (profileData.isActive ? 'active' : 'inactive');
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  // Get status color (web: bg-green-500 is the delivery primary in the delivery theme)
  const getStatusColor = () => {
    if (!profileData) return PRIMARY;
    const status = profileData.status?.toLowerCase() || (profileData.isActive ? 'active' : 'inactive');
    if (status === 'active' || status === 'approved') return PRIMARY;
    if (status === 'pending') return colors.yellow[500];
    if (status === 'suspended' || status === 'blocked') return colors.red[500];
    return colors.gray[500];
  };

  const getProfileImageUrl = () => {
    if (profileData?.profileImage?.url) return profileData.profileImage.url;
    if (profileData?.documents?.photo) return profileData.documents.photo;
    return DEFAULT_AVATAR;
  };

  // Get vehicle display text
  const getVehicleDisplay = () => {
    if (!profileData?.vehicle) return null;
    const vehicle = profileData.vehicle;
    const parts = [];
    if (vehicle.type) parts.push(vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1));
    if (vehicle.number) parts.push(vehicle.number);
    return parts.length > 0 ? parts.join(" - ") : null;
  };

  if (loading) {
    return (
      <Screen bg={colors.gray[100]}>
        <View style={styles.center}>
          <View style={{ alignItems: "center", gap: 16 }}>
            <Spinner size={32} color={colors.gray[600]} />
            <Text style={{ color: colors.gray[600], fontSize: 16 }}>Loading ID card...</Text>
          </View>
        </View>
      </Screen>
    );
  }

  if (!profileData) {
    return (
      <Screen bg={colors.gray[100]}>
        <View style={styles.center}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: colors.gray[600], marginBottom: 16, fontSize: 16 }}>Failed to load ID card data</Text>
            <Pressable onPress={goBack} style={styles.goBackBtn}>
              <Text style={{ color: colors.white, fontSize: 16 }}>Go Back</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  const idCardData = {
    name: profileData.name || "Delivery Partner",
    id: profileData.deliveryId || profileData._id?.toString().slice(-8).toUpperCase() || "N/A",
    phone: profileData.phone || "N/A",
    status: getStatusDisplay(),
    statusColor: getStatusColor(),
    validTill: formatValidDate(),
    vehicle: getVehicleDisplay(),
    profileImage: getProfileImageUrl()
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <StatusBar style="dark" />
      <ScrollView style={styles.page} contentContainerStyle={{ minHeight: height, paddingBottom: insets.bottom }} bounces={false}>
        {/* Top Grey Background Section */}
        <View style={[styles.topBand, { height: 160 + insets.top }]}>
          <LinearGradient colors={[alpha("#000000", 0.05), "transparent"]} style={StyleSheet.absoluteFill} />
          {/* Profile Picture */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <AppImage src={idCardData.profileImage} fallback={DEFAULT_AVATAR} style={styles.avatar} contentFit="cover" accessibilityLabel={idCardData.name} />
            </View>
          </View>
        </View>

        {/* Main White Content Area */}
        <View style={[styles.main, { minHeight: height - 160 - insets.top }]}>
          <View style={{ alignItems: "center" }}>
            {/* Brand Name */}
            <Text style={styles.brand}>{String(companyName || "").toUpperCase()}</Text>

            {/* Delivery Partner Title */}
            <Text style={styles.h1}>PARTNER</Text>
            <Text style={styles.h2}>ID CARD</Text>

            {/* Active Status Badge */}
            <View style={{ marginBottom: 32 }}>
              <View style={[styles.statusBadge, { backgroundColor: idCardData.statusColor }]}>
                <Text style={styles.statusText}>{idCardData.status.toUpperCase()}</Text>
              </View>
            </View>

            {/* Details Grid */}
            <View style={{ width: "100%", gap: 32, marginTop: 16 }}>
              <View style={{ alignItems: "center" }}>
                <Text style={styles.name}>{idCardData.name.toUpperCase()}</Text>
                <Text style={styles.caption}>FULL NAME</Text>
              </View>

              <View style={{ flexDirection: "row", gap: 32, width: "100%" }}>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={styles.value}>{idCardData.id}</Text>
                  <Text style={styles.smallCaption}>PARTNER ID</Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={styles.value}>{idCardData.phone}</Text>
                  <Text style={styles.smallCaption}>MOBILE</Text>
                </View>
              </View>

              {idCardData.vehicle ? (
                <View style={styles.vehicleBox}>
                  <Text style={styles.value}>{idCardData.vehicle.toUpperCase()}</Text>
                  <Text style={styles.smallCaption}>REGISTERED VEHICLE</Text>
                </View>
              ) : null}

              <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.gray[100] }}>
                <Text style={styles.legal}>
                  {`THIS ID CARD IS ISSUED FOR ESSENTIAL DELIVERY SERVICES ONLY.\nVALID ON: ${String(idCardData.validTill).toUpperCase()}`}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Close Button - Top Right */}
      <Pressable onPress={goBack} style={({ pressed }) => [styles.close, { top: insets.top + 16 }, pressed && { backgroundColor: colors.gray[200] }]}>
        <X size={24} color={colors.black} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  goBackBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: PRIMARY, borderRadius: 10 },
  page: { flex: 1, width: "100%", maxWidth: 448, alignSelf: "center", backgroundColor: colors.gray[100] },
  close: { position: "absolute", right: 16, padding: 8, borderRadius: 9999, zIndex: 30, backgroundColor: alpha("#ffffff", 0.5) },
  topBand: { backgroundColor: colors.gray[300], zIndex: 10 },
  avatarWrap: { position: "absolute", bottom: -78, left: 0, right: 0, alignItems: "center", zIndex: 10 },
  avatarRing: { padding: 6, backgroundColor: colors.white, borderRadius: 9999, ...shadow["2xl"] },
  avatar: { width: 144, height: 144, borderRadius: 72, borderWidth: 4, borderColor: colors.gray[100] },
  main: { backgroundColor: colors.white, paddingTop: 80, paddingHorizontal: 17.6, paddingBottom: 48 },
  brand: { fontSize: 12, lineHeight: 16, fontFamily: fonts.sora, fontWeight: "900", letterSpacing: 3.6, color: PRIMARY, marginBottom: 8, textAlign: "center" },
  h1: { fontFamily: fonts.sora, fontSize: 36, lineHeight: 45, fontWeight: "900", color: colors.gray[900], marginBottom: 4 },
  h2: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: "700", color: colors.gray[400], letterSpacing: 2, marginBottom: 24 },
  statusBadge: { paddingHorizontal: 32, paddingVertical: 10, borderRadius: 9999, elevation: 8, shadowColor: PRIMARY, shadowOpacity: 0.2, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  statusText: { color: colors.white, fontSize: 12, lineHeight: 16, fontFamily: fonts.sora, fontWeight: "900", letterSpacing: 2.4 },
  name: { fontFamily: fonts.sora, fontSize: 24, lineHeight: 32, fontWeight: "900", color: colors.gray[950], letterSpacing: -0.6, textAlign: "center" },
  caption: { color: colors.gray[400], fontWeight: "700", fontSize: 10, lineHeight: 14, letterSpacing: 2, marginTop: 4 },
  value: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: "900", color: colors.gray[950], textAlign: "center" },
  smallCaption: { fontSize: 9, lineHeight: 12, fontWeight: "700", color: colors.gray[400], letterSpacing: 0.9 },
  vehicleBox: { alignItems: "center", backgroundColor: colors.gray[50], padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#D1DCEB", elevation: 3, shadowColor: "#112743", shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } },
  legal: { fontSize: 10, lineHeight: 20, fontWeight: "700", color: colors.gray[400], letterSpacing: 1, textAlign: "center" },
});
