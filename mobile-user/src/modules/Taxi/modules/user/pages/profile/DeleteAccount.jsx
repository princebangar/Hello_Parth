// Web: modules/Taxi/modules/user/pages/profile/DeleteAccount.jsx — reason picker + final confirm, then the account is
// deleted (Food + Taxi) and the session cleared.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, AlertTriangle, X } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors } from '@/theme';
import { clearLocalUserSession, userAuthService } from '../../services/authService';
import { preloadAuthApp } from '@/shared/utils/preloadLogin.js';
import { hideLogoutCoverWhenLoginShown, showLogoutCover } from '@/shared/utils/logoutTransition.js';
import { clearCurrentRide } from '../../services/currentRideService';
import { socketService } from '../../../../shared/api/socket';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const REASONS = [
  'I use another app',
  'Too expensive',
  'Privacy concerns',
  'Technical issues',
  'Taking a break',
  'Other',
];

const CONSEQUENCES = [
  'Your account is deleted immediately — for both Food and Taxi',
  'You will be logged out on this and all other devices',
  'Your profile, addresses, and preferences will be removed',
  'Order and ride history is kept for admin records only',
  'You can recover your account later by logging in with the same number',
];

const HEADER_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } };
const LIST_SHADOW = { elevation: 2, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } };
const DANGER_SHADOW = { elevation: 5, shadowColor: '#ef4444', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } };

// AnimatePresence + motion.div: fade / slide in, fade out
const Presence = ({ visible, from = { y: 0, scale: 1 }, duration = 200, style, children }) => {
  const v = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(v, { toValue: visible ? 1 : 0, duration, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, v, duration]);
  if (!mounted) return null;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from.y, 0] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [from.scale, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const PressScale = ({ disabled, onPress, style, children }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value) => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable disabled={disabled} onPress={onPress} onPressIn={() => to(0.97)} onPressOut={() => to(1)} style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
};

const DeleteAccount = () => {
  const navigate = useNavigate();
  const P = useUserPalette();
  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [modalMounted, setModalMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const modalAnim = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [enter]);

  useEffect(() => {
    if (showConfirm) setModalMounted(true);
    Animated.timing(modalAnim, { toValue: showConfirm ? 1 : 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !showConfirm) setModalMounted(false);
    });
  }, [showConfirm, modalAnim]);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await userAuthService.requestAccountDeletion(reason);
      showLogoutCover();
      await preloadAuthApp();
      clearCurrentRide();
      socketService.disconnect();
      clearLocalUserSession();
      setSuccess('Your account has been deleted. Logging you out...');
      setLoading(false);
      setShowConfirm(false);
      navigate('/login', { replace: true });
      hideLogoutCoverWhenLoginShown();
    } catch (requestError) {
      setError(requestError?.message || 'Something went wrong. Please try again.');
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <Screen bg={P.bg} edges={['bottom']}>
      <StatusBarSpacer color={P.cardBg} />
      {/* Header */}
      <View style={[styles.header, HEADER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={styles.row}>
          <Pressable
            onPress={() => navigate('/taxi/user/profile')}
            style={({ pressed }) => [styles.back, USER_SHADOW, { borderColor: P.border, backgroundColor: P.cardBg }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={18} color={P.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>DANGER ZONE</Text>
            <Text style={styles.h1}>Delete Account</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Presence visible={Boolean(success)} from={{ y: -8, scale: 1 }}>
          <View style={[styles.banner, { backgroundColor: P.cardSoft, borderColor: colors.emerald[100] }]}>
            <Text style={[styles.bannerText, { color: colors.emerald[600] }]}>{success}</Text>
            <Pressable onPress={() => setSuccess(null)} hitSlop={8}>
              <X size={13} color={colors.emerald[400]} />
            </Pressable>
          </View>
        </Presence>
        <Presence visible={Boolean(error)} from={{ y: -8, scale: 1 }}>
          <View style={[styles.banner, { backgroundColor: P.cardSoft, borderColor: colors.red[100] }]}>
            <AlertTriangle size={14} color={colors.red[500]} strokeWidth={2.5} />
            <Text style={[styles.bannerText, { color: colors.red[600] }]}>{error}</Text>
            <Pressable onPress={() => setError(null)} hitSlop={8}>
              <X size={13} color={colors.red[400]} />
            </Pressable>
          </View>
        </Presence>

        {/* Warning card */}
        <Animated.View
          style={[
            styles.warning,
            { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
          ]}
        >
          <View style={[styles.row, { marginBottom: 12 }]}>
            <View style={styles.warnIcon}>
              <AlertTriangle size={18} color={colors.red[500]} strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.warnTitle}>Delete account</Text>
              <Text style={styles.warnSub}>This happens immediately</Text>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            {CONSEQUENCES.map((c, i) => (
              <View key={i} style={styles.bullet}>
                <View style={styles.dot} />
                <Text style={styles.bulletText}>{c}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Reason selector */}
        <View>
          <Text style={[styles.sectionLabel, { color: P.textSecondary }]}>WHY ARE YOU LEAVING?</Text>
          <View style={[styles.list, LIST_SHADOW, { borderColor: P.border, backgroundColor: P.cardBg }]}>
            {REASONS.map((r, i) => {
              const on = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
                  style={({ pressed }) => [
                    styles.reason,
                    i < REASONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: P.border },
                    on ? { backgroundColor: alpha(colors.red[50], 0.6) } : pressed && { backgroundColor: P.cardBg },
                  ]}
                >
                  <View style={[styles.radio, on ? { borderColor: colors.red[500], backgroundColor: colors.red[500] } : { borderColor: P.border }]}>
                    {on && <View style={[styles.radioDot, { backgroundColor: P.cardBg }]} />}
                  </View>
                  <Text style={[styles.reasonText, { color: on ? colors.red[600] : P.textSecondary }]}>{r}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Actions */}
        <View style={{ gap: 10, paddingTop: 8 }}>
          <PressScale
            onPress={() => setShowConfirm(true)}
            disabled={!reason}
            style={[styles.dangerBtn, reason ? [{ backgroundColor: colors.red[500] }, DANGER_SHADOW] : { backgroundColor: P.cardSoft }]}
          >
            <AlertTriangle size={15} strokeWidth={2.5} color={reason ? P.textPrimary : P.textSecondary} />
            <Text style={[styles.dangerText, { color: reason ? P.textPrimary : P.textSecondary }]}>DELETE MY ACCOUNT</Text>
          </PressScale>
          <Pressable onPress={() => navigate('/taxi/user/profile')} style={[styles.cancel, { borderColor: P.border, backgroundColor: P.cardBg }]}>
            <Text style={[styles.cancelText, { color: P.textMuted }]}>CANCEL</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Final confirm modal (its backdrop is bg-black/60, which the Taxi theme turns into the card colour) */}
      {modalMounted ? (
        <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={() => setShowConfirm(false)}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: P.cardBg, opacity: modalAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowConfirm(false)} />
          </Animated.View>
          <View style={styles.modalCenter} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.modalCard,
                USER_SHADOW,
                {
                  backgroundColor: P.cardBg,
                  opacity: modalAnim,
                  transform: [
                    { translateY: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
                    { scale: modalAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                  ],
                },
              ]}
            >
              <View style={[styles.modalIcon, { backgroundColor: P.cardSoft }]}>
                <AlertTriangle size={30} color={colors.red[500]} strokeWidth={2} />
              </View>
              <Text style={[styles.modalTitle, { color: P.textPrimary }]}>Delete your account?</Text>
              <Text style={[styles.modalText, { color: P.textMuted }]}>This deletes your Food and Taxi account right away and logs you out everywhere.</Text>
              <Text style={styles.modalWarn}>This cannot be undone from here — you'd need to log in again to recover it.</Text>
              <View style={{ gap: 10 }}>
                <PressScale onPress={handleDelete} disabled={loading} style={[styles.modalDelete, { backgroundColor: colors.red[500] }]}>
                  {loading ? (
                    <Spin>
                      <View style={styles.ring} />
                    </Spin>
                  ) : (
                    <Text style={[styles.modalDeleteText, { color: P.textPrimary }]}>YES, DELETE MY ACCOUNT</Text>
                  )}
                </PressScale>
                <Pressable onPress={() => setShowConfirm(false)} style={styles.modalKeep}>
                  <Text style={[styles.modalKeepText, { color: P.textSecondary }]}>NO, KEEP MY ACCOUNT</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 2.7, color: colors.red[400] },
  h1: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.47, color: colors.red[600] },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  warning: { borderRadius: 20, borderWidth: 2, borderColor: colors.red[100], backgroundColor: alpha(colors.red[50], 0.6), padding: 20 },
  warnIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.red[100], alignItems: 'center', justifyContent: 'center' },
  warnTitle: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: colors.red[700] },
  warnSub: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.red[400] },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red[400], marginTop: 6 },
  bulletText: { flex: 1, fontSize: 12, lineHeight: 19.5, fontWeight: '600', color: colors.red[600] },
  sectionLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.6, marginBottom: 8 },
  list: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  reasonText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  dangerBtn: { width: '100%', paddingVertical: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dangerText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4 },
  cancel: { width: '100%', paddingVertical: 16, borderRadius: 18, borderWidth: 1, alignItems: 'center' },
  cancelText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4 },
  modalCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: '82%', maxWidth: 384, borderRadius: 28, padding: 28, alignItems: 'stretch' },
  modalIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  modalText: { fontSize: 13, lineHeight: 21, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  modalWarn: { fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center', color: colors.red[400], marginBottom: 24 },
  modalDelete: { width: '100%', paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, minHeight: 48 },
  modalDeleteText: { fontSize: 13, lineHeight: 20, fontWeight: '700', letterSpacing: 1.3, textAlign: 'center' },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: alpha('#ffffff', 0.3), borderTopColor: '#ffffff' },
  modalKeep: { width: '100%', paddingVertical: 14, alignItems: 'center' },
  modalKeepText: { fontSize: 13, lineHeight: 20, fontWeight: '700', letterSpacing: 1.3 },
});

export default DeleteAccount;
