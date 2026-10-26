// Web: pages/restaurant/DownloadReport.jsx — "Download report": report view (Detailed / Item sales), DAILY / WEEKLY /
// MONTHLY view, duration radios (the list changes with the view; an unknown duration falls back to the first) and
// "Send an email", which shows the "Report queued" card for 2 s. Same texts and states.
// Native: the web file builds no PDF / CSV (it only shows the queued card), so nothing is generated here either; the
// radios (accent-black) are Pressable circles; the fixed bottom card is an absolute card (pointer events off around
// it, like the web).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, CheckCircle, Mail } from 'lucide-react-native';
import { Screen, Text } from '@/native/ui';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';

const REPORT_VIEWS = [
  { id: 'detailed', label: 'Detailed report' },
  { id: 'item', label: 'Item sales report' },
];

const VIEW_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY'];

function Radio({ checked, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked }} style={styles.radioRow}>
      <View style={[styles.radioOuter, checked && styles.radioOuterOn]}>{checked ? <View style={styles.radioDot} /> : null}</View>
      <Text style={styles.radioLabel}>{label}</Text>
    </Pressable>
  );
}

export default function DownloadReport() {
  const goBack = useRestaurantBackNavigation();
  const insets = useSafeAreaInsets();
  const [reportView, setReportView] = useState('detailed');
  const [viewType, setViewType] = useState('DAILY');
  const durations = useMemo(() => {
    if (viewType === 'WEEKLY') {
      return [
        { id: '4w', label: 'Last 4 weeks' },
        { id: '8w', label: 'Last 8 weeks' },
        { id: '12w', label: 'Last 12 weeks' },
        { id: 'custom', label: 'Custom' },
      ];
    }
    if (viewType === 'MONTHLY') {
      return [
        { id: '3m', label: 'Last 3 months' },
        { id: '6m', label: 'Last 6 months' },
        { id: '12m', label: 'Last 12 months' },
        { id: 'custom', label: 'Custom' },
      ];
    }
    return [
      { id: '7', label: 'Last 7 days' },
      { id: '14', label: 'Last 14 days' },
      { id: '30', label: 'Last 30 days' },
      { id: 'custom', label: 'Custom' },
    ];
  }, [viewType]);

  const [duration, setDuration] = useState('7');
  const [showSuccess, setShowSuccess] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (durations.length > 0 && !durations.find((d) => d.id === duration)) {
      setDuration(durations[0].id);
    }
  }, [viewType, durations, duration]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleSend = () => {
    setShowSuccess(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowSuccess(false), 2000);
  };

  return (
    <Screen bg={colors.white} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} accessibilityLabel="Back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.headerTitle}>Download report</Text>
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          You are generating a report for <Text style={styles.noticeStrong}>All Outlets</Text>
        </Text>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select the report view:</Text>
          <View style={styles.section}>
            {REPORT_VIEWS.map((opt) => (
              <Radio key={opt.id} checked={reportView === opt.id} label={opt.label} onPress={() => setReportView(opt.id)} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select view for data:</Text>
          <View style={styles.segment}>
            {VIEW_TYPES.map((type, i) => {
              const active = viewType === type;
              return (
                <Pressable key={type} onPress={() => setViewType(type)} style={[styles.segmentBtn, i > 0 && styles.segmentDivider]}>
                  {active ? (
                    <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  ) : null}
                  <Text style={[styles.segmentText, active && { color: colors.white }]}>{type}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select duration for report:</Text>
          <View style={styles.section}>
            {durations.map((opt) => (
              <Radio key={opt.id} checked={duration === opt.id} label={opt.label} onPress={() => setDuration(opt.id)} />
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: sp(6) + insets.bottom }]}>
        <Pressable onPress={handleSend} style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.9 }]}>
          <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Mail size={20} color={colors.white} />
          <Text style={styles.sendText}>Send an email</Text>
        </Pressable>
      </View>

      {showSuccess ? (
        <View pointerEvents="box-none" style={[styles.successWrap, { paddingBottom: sp(8) + insets.bottom }]}>
          <View style={styles.successCard}>
            <View style={styles.successRow}>
              <CheckCircle size={24} color={colors.green[600]} />
              <View>
                <Text style={styles.successTitle}>Report queued</Text>
                <Text style={styles.successText}>We’ll email it to you shortly.</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    zIndex: 20,
  },
  backBtn: { padding: sp(2), marginLeft: -sp(2), borderRadius: 9999 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  notice: { backgroundColor: '#f8e7a0', paddingHorizontal: sp(4), paddingVertical: sp(2) },
  noticeText: { fontSize: 14, lineHeight: 20, color: colors.gray[900] },
  noticeStrong: { fontWeight: '600' },
  content: { paddingHorizontal: sp(4), paddingVertical: sp(5), gap: sp(6) },
  section: { gap: sp(3) },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.gray[500], alignItems: 'center', justifyContent: 'center' },
  radioOuterOn: { borderColor: colors.black, borderWidth: 2 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.black },
  radioLabel: { fontSize: 14, lineHeight: 20, color: colors.gray[900] },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: colors.gray[300], borderRadius: 14, overflow: 'hidden' },
  segmentBtn: { flex: 1, paddingVertical: sp(2), alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.white },
  segmentDivider: {},
  segmentText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[800], textAlign: 'center' },
  footer: { paddingHorizontal: sp(4) },
  sendBtn: {
    width: '100%',
    paddingVertical: sp(4),
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp(2),
  },
  sendText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.white },
  successWrap: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: sp(6), zIndex: 50, elevation: 50 },
  successCard: {
    width: '100%',
    maxWidth: 448,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    paddingHorizontal: sp(4),
    paddingVertical: sp(4),
    ...shadow.lg,
  },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  successTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  successText: { fontSize: 12, lineHeight: 16, color: colors.gray[600] },
});
