// Web: modules/Taxi/modules/user/pages/PromoCodes.jsx — the admin's live promo codes; "Copy Code" copies it and keeps
// it for the next booking (sessionStorage helloparth:pendingPromo).
import React, { useState, useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Tag, CheckCircle2, X, ChevronRight, Ticket } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Screen, Skeleton, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors } from '@/theme';
import { USER_SHADOW, useUserPalette } from '../../../shared/context/UserThemeContext';
import { userService } from '../services/userService';

const SERVICE_LABELS = { all: 'All services', taxi: 'Rides', delivery: 'Parcel' };

// Promos come from the admin (Promotions Management); a code is applied on the booking screen, not here.
const toPromoCard = (promo = {}) => ({
  id: String(promo._id || promo.code),
  code: String(promo.code || ''),
  discount: Number(promo.discount_percentage || 0),
  maxDiscount: Number(promo.maximum_discount_amount || 0),
  minFare: Number(promo.minimum_trip_amount || 0),
  service: SERVICE_LABELS[String(promo.transport_type || 'all').toLowerCase()] || 'All services',
  expiry: promo.to_date
    ? new Date(promo.to_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—',
});

const CARD_SHADOW = { elevation: 2, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } };
const APPLIED_SHADOW = { elevation: 2, shadowColor: '#10b981', shadowOpacity: 0.1, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } };
const HEADER_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } };
const HEADER_SHADOW_DARK = { elevation: 3, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } };

const SkeletonCard = ({ P }) => (
  <View style={[styles.skeletonCard, { backgroundColor: P.cardBg, borderColor: P.border }]}>
    <View style={styles.rowBetween}>
      <Skeleton width={96} height={16} rounded={9999} style={{ backgroundColor: P.cardSoft }} />
      <Skeleton width={64} height={16} rounded={9999} style={{ backgroundColor: P.cardSoft }} />
    </View>
    <Skeleton width="75%" height={12} rounded={9999} style={{ backgroundColor: P.cardSoft }} />
    <Skeleton width="100%" height={32} rounded={10} style={{ backgroundColor: P.cardSoft }} />
  </View>
);

// motion.div / motion.button entering with a fade + small slide
const Enter = ({ delay = 0, from = 10, style, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>{children}</Animated.View>;
};

const PressScale = ({ scale: to = 0.97, disabled, onPress, style, children }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const go = (value) => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable disabled={disabled} onPress={onPress} onPressIn={() => go(to)} onPressOut={() => go(1)} style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
};

const PromoCodes = () => {
  const navigate = useNavigate();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appliedCode, setAppliedCode] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [toast, setToast] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null);
  const [applying, setApplying] = useState(null);
  const [inputFocused, setInputFocused] = useState(false);
  const toastTimer = useRef(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const bannerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    userService.getAvailablePromos({ limit: 50 })
      .then((response) => {
        const payload = response?.data ?? response;
        const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
        if (active) setPromos(list.map(toPromoCard).filter((promo) => promo.code));
      })
      .catch((error) => {
        if (active) setErrorBanner(error?.message || 'Could not load promo codes');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    Animated.timing(toastAnim, { toValue: toast ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [toast, toastAnim]);

  useEffect(() => {
    if (errorBanner) {
      bannerAnim.setValue(0);
      Animated.timing(bannerAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [errorBanner, bannerAnim]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  // Copies a live code; the booking screen validates it against the fare and applies it.
  const applyCode = async (code) => {
    const promo = promos.find((item) => item.code.toUpperCase() === String(code).toUpperCase());
    if (!promo) {
      setErrorBanner(`"${code}" is not available for you right now`);
      return;
    }
    setApplying(promo.code);
    try {
      await navigator.clipboard?.writeText(promo.code);
    } catch {
      /* clipboard can be blocked; the code is still shown on the card */
    }
    setAppliedCode(promo.code);
    setErrorBanner(null);
    // The booking screen picks this up and applies it as soon as a vehicle is selected.
    try {
      window.sessionStorage.setItem('helloparth:pendingPromo', promo.code);
    } catch {
      /* the copied code can still be pasted on the booking screen */
    }
    showToast(`"${promo.code}" saved — it is applied on your next booking`, 'success');
    setApplying(null);
  };

  const handleManualApply = () => {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    applyCode(code);
    setManualCode('');
  };

  const isDark = P.dark; // the web read useUserTheme(); same setting (userTheme)
  const card = { backgroundColor: P.cardBg, borderColor: P.border };

  return (
    <Screen bg={P.bg} edges={[]} keyboard>
      <StatusBarSpacer color={P.cardBg} />
      {/* Header */}
      <View style={[styles.header, isDark ? HEADER_SHADOW_DARK : HEADER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={[styles.row, { gap: 12 }]}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [styles.back, USER_SHADOW, card, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={18} color={P.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: P.textSecondary }]}>OFFERS & COUPONS</Text>
            <Text style={[styles.h1, { color: P.textPrimary }]}>Promo Codes</Text>
          </View>
          <Tag size={20} color={P.accent} strokeWidth={2} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 112 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner */}
        {errorBanner ? (
          <Animated.View
            style={[
              styles.banner,
              { backgroundColor: P.cardSoft, opacity: bannerAnim, transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] },
            ]}
          >
            <X size={14} color={colors.red[500]} strokeWidth={2.5} />
            <Text style={styles.bannerText}>{errorBanner}</Text>
            <Pressable onPress={() => setErrorBanner(null)} hitSlop={8}>
              <X size={13} color={colors.red[400]} />
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Manual entry */}
        <View style={[styles.manual, USER_SHADOW, card]}>
          <Text style={[styles.manualLabel, { color: P.textSecondary }]}>CHECK A CODE</Text>
          <View style={[styles.row, { gap: 8 }]}>
            <TextInput
              value={manualCode}
              onChangeText={(text) => setManualCode(text.toUpperCase())}
              onSubmitEditing={handleManualApply}
              returnKeyType="done"
              autoCapitalize="characters"
              autoCorrect={false}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Enter promo code"
              placeholderTextColor={colors.slate[300]}
              style={[
                styles.codeInput,
                { backgroundColor: P.cardBg, borderColor: inputFocused ? P.accent : P.border, color: P.textPrimary },
                inputFocused && { borderWidth: 2, paddingHorizontal: 15 },
              ]}
            />
            <PressScale scale={0.96} onPress={handleManualApply} style={[styles.checkBtn, USER_SHADOW, { backgroundColor: P.accent }]}>
              <Text style={[styles.checkText, { color: P.accentInk }]}>CHECK</Text>
              <ChevronRight size={13} strokeWidth={3} color={P.accentInk} />
            </PressScale>
          </View>
        </View>

        {/* Section label */}
        <View>
          <Text style={[styles.sectionLabel, { color: P.textSecondary }]}>AVAILABLE OFFERS</Text>
          <Text style={[styles.sectionTitle, { color: P.textPrimary }]}>Pick a promo</Text>
        </View>

        {/* Promo cards */}
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} P={P} />)}

        {!loading && promos.length === 0 && (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, card]}>
              <Ticket size={28} color={P.textSecondary} strokeWidth={1.5} />
            </View>
            <Text style={[styles.emptyText, { color: P.textMuted }]}>No promo codes available right now</Text>
          </View>
        )}

        {!loading && promos.map((promo, i) => {
          const isApplied = appliedCode === promo.code;
          const isApplying = applying === promo.code;
          const box = isApplied
            ? isDark
              ? [{ backgroundColor: alpha(colors.emerald[950], 0.2), borderColor: colors.emerald[900] }, USER_SHADOW]
              : [{ backgroundColor: alpha(colors.emerald[50], 0.8), borderColor: colors.emerald[200] }, APPLIED_SHADOW]
            : isDark
              ? [card, USER_SHADOW]
              : [card, CARD_SHADOW];
          const btn = isApplied
            ? isDark
              ? { backgroundColor: alpha(colors.emerald[950], 0.2), borderWidth: 1, borderColor: alpha(colors.emerald[900], 0.3), color: colors.emerald[400] }
              : { backgroundColor: P.cardSoft, color: colors.emerald[700] }
            : { backgroundColor: P.accent, color: P.accentInk };
          return (
            <Enter key={promo.id} delay={i * 60} style={[styles.promo, box]}>
              <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 12, marginBottom: 8 }]}>
                <View style={{ flex: 1 }}>
                  <View style={[styles.row, { gap: 8 }]}>
                    <Text style={[styles.code, { color: P.textPrimary }]}>{promo.code}</Text>
                    {isApplied && <CheckCircle2 size={16} color={colors.emerald[500]} strokeWidth={2.5} />}
                  </View>
                  <Text style={[styles.promoMeta, { color: P.textSecondary }]}>
                    {promo.service}{promo.minFare > 0 ? ` · Min fare ₹${promo.minFare}` : ''}{promo.maxDiscount > 0 ? ` · Up to ₹${promo.maxDiscount}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.discount, { color: P.textPrimary }]}>
                    {`${promo.discount}%`}
                    <Text style={[styles.off, { color: P.textSecondary }]}> off</Text>
                  </Text>
                  <Text style={[styles.expiry, { color: P.textSecondary }]}>Expires {promo.expiry}</Text>
                </View>
              </View>
              <PressScale
                onPress={() => applyCode(promo.code)}
                disabled={isApplied || isApplying}
                style={[styles.copyBtn, !isApplied && USER_SHADOW, { backgroundColor: btn.backgroundColor, borderWidth: btn.borderWidth || 0, borderColor: btn.borderColor }]}
              >
                {isApplying ? (
                  <Spin>
                    <View style={[styles.ring, { borderColor: alpha('#ffffff', 0.3), borderTopColor: '#ffffff' }]} />
                  </Spin>
                ) : isApplied ? (
                  <>
                    <CheckCircle2 size={13} strokeWidth={2.5} color={btn.color} />
                    <Text style={[styles.copyText, { color: btn.color }]}>COPIED</Text>
                  </>
                ) : (
                  <Text style={[styles.copyText, { color: btn.color }]}>COPY CODE</Text>
                )}
              </PressScale>
            </Enter>
          );
        })}
      </ScrollView>

      {/* Toast */}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            USER_SHADOW,
            {
              bottom: 96 + insets.bottom,
              backgroundColor: toast.type === 'success' ? colors.emerald[600] : colors.red[600],
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            },
          ]}
        >
          <Text style={[styles.toastText, { color: P.textPrimary }]}>
            {toast.type === 'success' ? '✓ ' : '✗ '}{toast.msg}
          </Text>
        </Animated.View>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  back: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 2.7 },
  h1: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.47 },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.red[100], borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.red[600] },
  manual: { borderRadius: 20, borderWidth: 1, padding: 16 },
  manualLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.2, marginBottom: 8 },
  codeInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  checkBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' },
  checkText: { fontSize: 12, lineHeight: 20, fontWeight: '700', letterSpacing: 1.2 },
  sectionLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.6 },
  sectionTitle: { marginTop: 2, fontSize: 16, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4 },
  skeletonCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 16 },
  emptyIcon: { width: 64, height: 64, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  promo: { borderRadius: 20, borderWidth: 1, padding: 16 },
  code: { fontSize: 16, lineHeight: 24, fontWeight: '700', letterSpacing: 0.8 },
  promoMeta: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 2 },
  discount: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  off: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  expiry: { fontSize: 10.5, lineHeight: 14, fontWeight: '600' },
  copyBtn: { width: '100%', paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40 },
  copyText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.2 },
  ring: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, zIndex: 50, maxWidth: '92%' },
  toastText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});

export default PromoCodes;
