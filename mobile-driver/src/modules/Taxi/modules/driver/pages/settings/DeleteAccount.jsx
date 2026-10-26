// Web: modules/Taxi/modules/driver/pages/settings/DeleteAccount.jsx — "Danger Zone": consequences, a reason to pick,
// then a confirm popup that sends a login OTP to the driver's phone and, after the OTP is verified, soft-deletes the
// account and logs out.
import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { ArrowLeft, AlertTriangle, ShieldCheck, X } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Dialog, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors } from '@/theme';
import {
  clearDriverAuthState,
  deleteCurrentDriverAccount,
  getCurrentDriver,
  sendDriverLoginOtp,
  verifyDriverLoginOtp,
} from '../../services/registrationService';

const REASONS = [
  'Low earnings',
  'Too many technical issues',
  'Switching to another platform',
  'Privacy concerns',
  'Taking a break',
  'Other',
];

const CONSEQUENCES = [
  'Your driver account will be marked inactive with a soft delete',
  'You will be logged out on this device',
  'You cannot accept rides with this account after deletion',
  'Completed ride history may still keep trip records for receipts and reports',
];

// The web's blurred colour blob (blur-3xl): a radial fade of the same colour.
const GlowBlob = ({ size, color, opacity, style }) => (
  <View pointerEvents="none" style={[{ position: 'absolute', width: size * 1.6, height: size * 1.6 }, style]}>
    <Svg width="100%" height="100%">
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.6} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50%" cy="50%" r="50%" fill="url(#glow)" />
    </Svg>
  </View>
);

const ButtonSpinner = () => (
  <Spin>
    <View style={styles.spinRing} />
  </Spin>
);

const DriverDeleteAccount = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const [reason, setReason] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [driverPhone, setDriverPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [debugOtp, setDebugOtp] = useState('');

  useEffect(() => {
    let active = true;

    const loadDriver = async () => {
      setIsFetching(true);
      setError(null);

      try {
        const response = await getCurrentDriver();
        const driver = response?.data || {};

        if (!active) {
          return;
        }

        setDriverPhone(String(driver.phone || '').replace(/\D/g, '').slice(-10));
        setPendingRequest(driver.deletionRequest || null);
      } catch (requestError) {
        if (active) {
          setError(requestError?.message || 'Unable to load driver account');
        }
      } finally {
        if (active) {
          setIsFetching(false);
        }
      }
    };

    loadDriver();

    return () => {
      active = false;
    };
  }, []);

  const hasPendingRequest = pendingRequest?.status === 'pending';

  const handleSendOtp = async () => {
    if (!driverPhone) {
      setError('Driver phone number is not available. Please login again.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await sendDriverLoginOtp({ phone: driverPhone });
      const session = response?.data?.session || response?.session || {};
      setDebugOtp(session.debugOtp || '');
      setOtp(String(session.debugOtp || '').slice(0, 4));
      setOtpSent(true);
      setSuccess(`OTP sent to +91 ${driverPhone}`);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!/^\d{4}$/.test(otp)) {
      setError('Please enter the 4-digit OTP sent to your phone.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await verifyDriverLoginOtp({ phone: driverPhone, otp });
      await deleteCurrentDriverAccount(reason);
      clearDriverAuthState();
      setSuccess('Your driver account was soft deleted and you have been logged out.');
      setShowConfirm(false);
      setTimeout(() => {
        navigate(`${routePrefix}/login`, { replace: true });
      }, 900);
    } catch (requestError) {
      setError(requestError?.message || 'OTP verification or deletion failed. Please try again.');
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const deleteEnabled = Boolean(reason) && !hasPendingRequest && !isFetching;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#F8FAFC', '#F3F4F6', '#EEF2F7']} locations={[0, 0.38, 1]} style={StyleSheet.absoluteFill} />
      <GlowBlob size={176} color={colors.red[100]} opacity={0.4} style={{ top: -64 - 53, right: -40 - 53 }} />

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigate(`${routePrefix}/profile`)}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.back, pressed && styles.pressed95]}
          >
            <ArrowLeft size={18} color={colors.slate[900]} strokeWidth={2.5} />
          </Pressable>
          <View style={styles.flex1}>
            <Text style={styles.kicker}>Danger Zone</Text>
            <Text style={styles.headerTitle}>Delete Driver Account</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.body, { paddingBottom: 48 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {success ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{success}</Text>
            <Pressable onPress={() => setSuccess(null)} hitSlop={8}>
              <X size={13} color={colors.emerald[400]} />
            </Pressable>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBox}>
            <AlertTriangle size={14} color={colors.red[500]} strokeWidth={2.5} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)} hitSlop={8}>
              <X size={13} color={colors.red[400]} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.warnCard}>
          <View style={styles.warnHead}>
            <View style={styles.warnIcon}>
              <AlertTriangle size={18} color={colors.red[500]} strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.warnTitle}>Delete driver account</Text>
              <Text style={styles.warnSub}>This will soft delete and log you out</Text>
            </View>
          </View>
          <View style={styles.consequences}>
            {CONSEQUENCES.map((item) => (
              <View key={item} style={styles.consequenceRow}>
                <View style={styles.bullet} />
                <Text style={styles.consequenceText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.reasonLabel}>Why are you leaving?</Text>
          <View style={styles.reasonCard}>
            {REASONS.map((item, index) => {
              const selected = reason === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => !hasPendingRequest && setReason(item)}
                  disabled={hasPendingRequest}
                  style={({ pressed }) => [
                    styles.reasonRow,
                    index < REASONS.length - 1 && styles.reasonDivider,
                    selected ? styles.reasonSelected : pressed && styles.reasonPressed,
                    hasPendingRequest && styles.reasonDisabled,
                  ]}
                >
                  <View style={[styles.radio, selected ? styles.radioOn : styles.radioOff]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={[styles.reasonText, { color: selected ? colors.red[600] : colors.slate[700] }]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => setShowConfirm(true)}
            disabled={!reason || hasPendingRequest || isFetching}
            style={({ pressed }) => [
              styles.deleteBtn,
              deleteEnabled ? styles.deleteBtnOn : styles.deleteBtnOff,
              pressed && deleteEnabled && styles.pressed97,
            ]}
          >
            <AlertTriangle size={15} strokeWidth={2.5} color={deleteEnabled ? colors.white : colors.slate[400]} />
            <Text style={[styles.deleteBtnText, { color: deleteEnabled ? colors.white : colors.slate[400] }]}>
              {hasPendingRequest ? 'Request Already Sent' : 'Delete My Account'}
            </Text>
          </Pressable>
          <Pressable onPress={() => navigate(`${routePrefix}/profile`)} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Dialog open={showConfirm} onClose={() => setShowConfirm(false)} backdropOpacity={0.6} style={styles.confirmCard}>
        <View style={styles.confirmBody}>
          <View style={styles.confirmIcon}>
            <AlertTriangle size={30} color={colors.red[500]} strokeWidth={2} />
          </View>
          <Text style={styles.confirmTitle}>Delete this account?</Text>
          <Text style={styles.confirmText}>Your driver account will be marked inactive instead of being permanently removed.</Text>
          <Text style={styles.confirmHint}>Verify OTP first. We will then log you out on this device.</Text>
          {otpSent ? (
            <View style={styles.otpWrap}>
              <Text style={styles.otpLabel}>OTP sent to +91 {driverPhone}</Text>
              <View style={styles.otpBox}>
                <ShieldCheck size={16} color={colors.slate[400]} strokeWidth={2.5} />
                <TextInput
                  keyboardType="number-pad"
                  maxLength={4}
                  value={otp}
                  onChangeText={(text) => {
                    const next = String(text || '').replace(/\D/g, '').slice(0, 4);
                    setOtp(next);
                    if (next.length === 4) Keyboard.dismiss();
                  }}
                  placeholder="0000"
                  placeholderTextColor={colors.slate[400]}
                  style={styles.otpInput}
                />
              </View>
              {debugOtp ? <Text style={styles.debugOtp}>Dev OTP: {debugOtp}</Text> : null}
            </View>
          ) : null}
          <View style={styles.confirmActions}>
            <Pressable
              onPress={otpSent ? handleDelete : handleSendOtp}
              disabled={loading}
              style={({ pressed }) => [styles.confirmBtn, pressed && styles.pressed97]}
            >
              {loading ? <ButtonSpinner /> : <Text style={styles.confirmBtnText}>{otpSent ? 'Verify OTP & Delete' : 'Send OTP'}</Text>}
            </Pressable>
            <Pressable onPress={() => setShowConfirm(false)} style={styles.keepBtn}>
              <Text style={styles.keepBtnText}>No, Keep My Account</Text>
            </Pressable>
          </View>
        </View>
      </Dialog>
    </View>
  );
};

export default DriverDeleteAccount;

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  flex1: { flex: 1 },
  header: {
    zIndex: 20,
    backgroundColor: alpha(colors.white, 0.9),
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: alpha(colors.white, 0.8),
    elevation: 3,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    backgroundColor: alpha(colors.white, 0.9),
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  pressed95: { transform: [{ scale: 0.95 }] },
  pressed97: { transform: [{ scale: 0.97 }] },
  kicker: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.34, color: colors.red[400] },
  headerTitle: { fontSize: 19, lineHeight: 24, fontWeight: '900', letterSpacing: -0.48, color: colors.red[600] },
  body: { width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.emerald[50],
    borderWidth: 1,
    borderColor: colors.emerald[100],
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  successText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.emerald[600] },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.red[50],
    borderWidth: 1,
    borderColor: colors.red[100],
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.red[600] },
  warnCard: { borderRadius: 20, borderWidth: 2, borderColor: colors.red[100], backgroundColor: alpha(colors.red[50], 0.6), padding: 20 },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  warnIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.red[100], alignItems: 'center', justifyContent: 'center' },
  warnTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900', color: colors.red[700] },
  warnSub: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.red[400] },
  consequences: { gap: 8 },
  consequenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red[400], marginTop: 6 },
  consequenceText: { flex: 1, fontSize: 12, lineHeight: 19.5, fontWeight: '700', color: colors.red[600] },
  reasonLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.6, color: colors.slate[400], marginBottom: 8 },
  reasonCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.8),
    backgroundColor: alpha(colors.white, 0.9),
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  reasonRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  reasonDivider: { borderBottomWidth: 1, borderBottomColor: colors.slate[50] },
  reasonSelected: { backgroundColor: alpha(colors.red[50], 0.6) },
  reasonPressed: { backgroundColor: colors.slate[50] },
  reasonDisabled: { opacity: 0.6 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.red[500], backgroundColor: colors.red[500] },
  radioOff: { borderColor: colors.slate[200] },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  reasonText: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  actions: { gap: 10, paddingTop: 8 },
  deleteBtn: { width: '100%', paddingVertical: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  deleteBtnOn: {
    backgroundColor: colors.red[500],
    elevation: 6,
    shadowColor: '#ef4444',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
  },
  deleteBtnOff: { backgroundColor: colors.slate[100] },
  deleteBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
  cancelBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: alpha(colors.white, 0.8),
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4, color: colors.slate[500] },
  confirmCard: { width: '82%', maxWidth: 384, borderRadius: 28 },
  confirmBody: { padding: 28, alignItems: 'stretch' },
  confirmIcon: { width: 64, height: 64, backgroundColor: colors.red[50], borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  confirmTitle: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[900], marginBottom: 8, textAlign: 'center' },
  confirmText: { fontSize: 13, lineHeight: 21, fontWeight: '700', color: colors.slate[500], marginBottom: 4, textAlign: 'center' },
  confirmHint: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.red[400], marginBottom: 20, textAlign: 'center' },
  otpWrap: { marginBottom: 20 },
  otpLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.2, color: colors.slate[400], marginLeft: 4 },
  otpBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.slate[100],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  otpInput: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '900', letterSpacing: 7, color: colors.slate[900], paddingVertical: 0 },
  debugOtp: { marginTop: 4, textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '900', color: colors.slate[400] },
  confirmActions: { gap: 10 },
  confirmBtn: { width: '100%', backgroundColor: colors.red[500], paddingVertical: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 },
  confirmBtnText: { fontSize: 13, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.3, color: colors.white },
  keepBtn: { width: '100%', paddingVertical: 14, alignItems: 'center' },
  keepBtnText: { fontSize: 13, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.3, color: colors.slate[400] },
  spinRing: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: alpha(colors.white, 0.3), borderTopColor: colors.white },
});
