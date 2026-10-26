// Web: pages/restaurant/FssaiDetails.jsx (/food/restaurant/fssai) — "FSSAI Details": the static "not available"
// notice and card (the web page loads no license data), the download button (no action on the web either) and
// "Update FSSAI license" / "Apply Now" -> /food/restaurant/fssai/update. No API calls.
// Native: same layout; the bottom bar sits under the scrolling content and keeps clear of the navigation bar.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Download } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { alpha, colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';

export default function FssaiDetails() {
  const navigate = useNavigate();
  const goBack = useRestaurantBackNavigation();
  const insets = useSafeAreaInsets();

  return (
    <Screen bg={colors.white} edges={[]} statusBarStyle="dark">
      <StatusBarSpacer color={colors.white} />
      <View style={styles.header}>
        <Pressable onPress={goBack} accessibilityLabel="Back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>FSSAI Details</Text>
          </View>
          <Text style={styles.sub}>No live restaurant license data available.</Text>
        </View>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <View style={styles.infoDot}>
            <LinearGradient
              colors={[restaurantTheme.brand, alpha(restaurantTheme.brandDark, 0.8)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.infoDotText}>i</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.noticeTitle}>FSSAI details are not available</Text>
            <Text style={styles.noticeText}>Upload or sync your license information to manage compliance here.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View>
            <Text style={styles.label}>FSSAI registration number</Text>
            <Text style={styles.value}>Not available</Text>
          </View>

          <View style={styles.dashed} />

          <View style={styles.docRow}>
            <View>
              <Text style={styles.label}>Document</Text>
              <Text style={styles.value}>No document uploaded</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.downloadBtn, pressed && { backgroundColor: colors.gray[50] }]}>
              <Download size={16} color={colors.gray[800]} />
            </Pressable>
          </View>

          <View style={styles.dashed} />

          <View>
            <Text style={styles.label}>Valid up to</Text>
            <Text style={styles.value}>Not available</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: sp(6) + insets.bottom }]}>
        <Pressable onPress={() => navigate('/food/restaurant/fssai/update')} style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}>
          <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.primaryText}>Update FSSAI license</Text>
        </Pressable>
        <Text style={styles.applyLine}>
          {"Haven't renewed your FSSAI? "}
          <Text style={styles.applyLink} onPress={() => navigate('/food/restaurant/fssai/update')}>
            Apply Now
          </Text>
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: sp(4),
    paddingTop: sp(4),
    paddingBottom: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backBtn: { padding: sp(2), borderRadius: 9999 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900] },
  sub: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  content: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(8), gap: sp(4) },
  notice: { borderRadius: 16, backgroundColor: '#ffe9b3', paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) },
  infoDot: { marginTop: sp(1), height: 24, width: 24, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  infoDotText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  noticeTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  noticeText: { fontSize: 12, lineHeight: 16, color: colors.gray[700], marginTop: sp(1) },
  card: { borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[100], padding: sp(4), gap: sp(3), ...shadow.sm },
  label: { fontSize: 12, lineHeight: 16, color: colors.gray[500], marginBottom: sp(1) },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[200] },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  downloadBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.gray[300], alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: sp(4), paddingTop: sp(3), borderTopWidth: 1, borderTopColor: colors.gray[200], backgroundColor: colors.white },
  primaryBtn: { width: '100%', paddingVertical: sp(3), borderRadius: 9999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: sp(2) },
  primaryText: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  applyLine: { fontSize: 12, lineHeight: 16, textAlign: 'center', color: colors.gray[600] },
  applyLink: { color: restaurantTheme.brand, textDecorationLine: 'underline' },
});
