import React, { useState, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ArrowLeft, Eye, Loader2, Camera, X, FileText, Image as ImageIcon } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { pickImage } from '@/lib/media';
import { AppImage, Dialog, Screen, Text } from '@/native/ui';
import { alpha, colors, fonts, shadow } from '@/theme';
import useCloseOnBack from '@/modules/DeliveryV2/hooks/useCloseOnBack';
import { deliveryAPI } from '@food/api';
import { prepareUploadFile } from "@/shared/utils/imageCompressor";
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const PRIMARY = '#15498B';
const RX = { elevation: 3, shadowColor: '#112743', shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } };

function Spinner({ color, size }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

/**
 * ProfileDocsV2 - Restored Old UI for Registration Documents & Vehicle Info.
 */
export const ProfileDocsV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const { height } = useWindowDimensions();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, setIsUpdating] = useState(false);
  const [showViewer, setShowViewer] = useState(null); // { title: string, url: string }
  const [, setUploadField] = useState(null)
  useCloseOnBack(Boolean(showViewer), () => setShowViewer(null))

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await deliveryAPI.getProfile();
        if (response?.data?.success) setProfile(response.data.data.profile);
      } catch {
        toast.error("Failed to load documents");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleUpdate = async (field, file) => {
    if (!file) return;
    setIsUpdating(true);
    const formData = new FormData();
    const prepared = await prepareUploadFile(file, field === "profilePhoto" ? { preset: "profile" } : {});
    formData.append(field, { uri: prepared.uri, name: prepared.name, type: prepared.type });
    try {
      const res = await deliveryAPI.updateProfileMultipart(formData);
      if (res?.data?.success) {
        toast.success("Document updated successfully");
        const updated = await deliveryAPI.getProfile();
        setProfile(updated.data.data.profile);
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setIsUpdating(false);
    }
  };

  // Web: openCamera / openGallery (Flutter bridge picker, <input type="file"> fallback)
  const pickFor = async (field, source) => {
    try {
      const file = await pickImage({ source });
      if (file) await handleUpdate(field, file);
    } catch {
      toast.error(source === "camera" ? "Could not open camera. Please try again." : "Could not open gallery. Please try again.");
    }
  };

  const handleTakeCameraPhoto = (field) => pickFor(field, "camera");

  const handlePickFromGallery = (field) => {
    setUploadField(field)
    pickFor(field, "library");
  }

  const getDocStatus = (doc) => {
    if (!doc?.document) return "Not Uploaded";
    return doc.verified ? "Verified" : "Pending Verification";
  };

  if (loading) {
    return (
      <Screen bg={colors.gray[50]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={32} color={PRIMARY} />
        </View>
      </Screen>
    );
  }

  const docs = [
    { label: "Aadhar Card", field: "aadharPhoto", data: profile?.documents?.aadhar },
    { label: "PAN Card", field: "panPhoto", data: profile?.documents?.pan },
    { label: "Driving License", field: "drivingLicensePhoto", data: profile?.documents?.drivingLicense }
  ];

  return (
    <Screen bg={colors.gray[50]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backBtn}>
          <ArrowLeft size={22} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.title}>Registration Docs</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* 1. Vehicle Card */}
        <View style={styles.vehicleCard}>
          <View style={styles.vehicleGlow} />
          <Text style={styles.vehicleMicro}>VEHICLE REGISTERED</Text>
          <Text style={styles.vehicleNumber}>{profile?.vehicle?.number || "NO # REGISTERED"}</Text>
          <Text style={styles.vehicleType}>{String(profile?.vehicle?.type || "Standard Bike").toUpperCase()}</Text>
        </View>

        {/* 2. Documents List */}
        <View style={{ gap: 16 }}>
          {docs.map((doc) => (
            <View key={doc.field} style={styles.docCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.docLabel}>{doc.label.toUpperCase()}</Text>
                  <Text style={styles.docStatus}>{getDocStatus(doc.data)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {doc.data?.document ? (
                    <Pressable
                      onPress={() => setShowViewer({ title: doc.label, url: doc.data.document })}
                      style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.gray[50] }, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.gray[100] }]}
                    >
                      <Eye size={20} color={colors.gray[600]} />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => handleTakeCameraPhoto(doc.field)}
                    style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.gray[900] }, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.black }]}
                  >
                    <Camera size={20} color={colors.white} />
                  </Pressable>
                  <Pressable
                    onPress={() => handlePickFromGallery(doc.field)}
                    style={({ pressed }) => [styles.iconBtn, { backgroundColor: '#E7EFFA' }, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.orange[100] }]}
                  >
                    <ImageIcon size={20} color={PRIMARY} />
                  </Pressable>
                </View>
              </View>
              {doc.data?.document ? (
                <View style={styles.thumb}>
                  <AppImage src={doc.data.document} style={[styles.fill, { opacity: 0.5 }]} contentFit="cover" accessibilityLabel="Preview" />
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <FileText size={64} color={colors.gray[900]} style={{ marginBottom: 16 }} />
          <Text style={styles.footerText}>OFFICIAL FLEET IDENTITY</Text>
        </View>
      </ScrollView>

      {/* Simple Modal Image Viewer */}
      <Dialog open={Boolean(showViewer)} onClose={() => setShowViewer(null)} backdropOpacity={0.9} style={styles.viewer}>
        <View style={styles.viewerHead}>
          <Text style={styles.viewerTitle}>{String(showViewer?.title || "").toUpperCase()}</Text>
          <Pressable onPress={() => setShowViewer(null)} style={styles.viewerClose}>
            <X size={24} color={colors.gray[400]} />
          </Pressable>
        </View>
        <View style={{ padding: 8 }}>
          {showViewer?.url ? (
            <AppImage src={showViewer.url} style={{ width: '100%', height: height * 0.6, borderRadius: 16 }} contentFit="contain" accessibilityLabel="Identity Doc" />
          ) : null}
        </View>
      </Dialog>
    </Screen>
  );
};

export default ProfileDocsV2;

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  header: { backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 16, zIndex: 50, ...shadow.sm },
  backBtn: { padding: 4, borderRadius: 9999, backgroundColor: alpha(colors.gray[50], 0.7), ...shadow.sm },
  title: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: '900', color: '#0F1724', letterSpacing: 0.2 },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 80, gap: 32 },
  vehicleCard: { backgroundColor: PRIMARY, borderRadius: 16, padding: 17.6, gap: 8, overflow: 'hidden', elevation: 10, shadowColor: PRIMARY, shadowOpacity: 0.2, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } },
  vehicleGlow: { position: 'absolute', top: -80, right: -80, width: 160, height: 160, borderRadius: 80, backgroundColor: alpha('#ffffff', 0.1) },
  vehicleMicro: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: '900', letterSpacing: 2, color: alpha('#ffffff', 0.8) },
  vehicleNumber: { fontSize: 24, lineHeight: 32, fontFamily: fonts.sora, fontWeight: '900', color: colors.white },
  vehicleType: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1, color: alpha('#ffffff', 0.7) },
  docCard: { backgroundColor: colors.white, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#D1DCEB', gap: 16, ...RX },
  docLabel: { fontSize: 9, lineHeight: 12, fontFamily: fonts.sora, fontWeight: '900', color: colors.gray[400], letterSpacing: 0.9, marginBottom: 4 },
  docStatus: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[800] },
  iconBtn: { padding: 12, borderRadius: 14 },
  thumb: { marginTop: 8, width: 96, height: 64, borderRadius: 14, borderWidth: 1, borderColor: '#D1DCEB', overflow: 'hidden', backgroundColor: colors.gray[50] },
  footer: { padding: 40, alignItems: 'center', opacity: 0.3, marginTop: 40 },
  footerText: { fontSize: 10, fontFamily: fonts.sora, fontWeight: '900', letterSpacing: 4, color: colors.gray[900] },
  viewer: { maxWidth: 512, backgroundColor: colors.white, borderRadius: 24, borderWidth: 1, borderColor: '#D1DCEB', ...shadow['2xl'] },
  viewerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 17.6, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  viewerTitle: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.gray[950], letterSpacing: 1.8, flexShrink: 1 },
  viewerClose: { padding: 12, backgroundColor: colors.gray[50], borderRadius: 9999 },
});
