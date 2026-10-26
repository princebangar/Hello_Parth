// Web: pages/restaurant/UpdateBankDetails.jsx (/food/restaurant/update-bank-details) — "Bank & UPI Details":
// account holder name, account number + confirm, IFSC, UPI ID and the UPI QR image (upload via ImageSourcePicker ->
// uploadAPI.uploadMedia(file, { folder: "food/restaurants/upi-qr" }), max 5 MB). Loads restaurantAPI.getCurrentRestaurant()
// on mount; Submit validates exactly like the web and saves with restaurantAPI.updateProfile(payload), reloads and
// says "Bank details updated successfully" (browser alert on the web).
// Native:
// - The form is a KeyboardAwareScrollView: the focused field (and its error line under it) stays above the keyboard;
//   Submit is the last item of the form (not a fixed bar), so it scrolls up with it.
// - alert() -> Alert.alert (same texts). Focus colours: restaurantTheme.focusBorder (red border when the field has an
//   error, like the web's focus:border-[#B80B3D]).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, ArrowLeft, Loader2, Upload } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { AppImage, KeyboardAwareScrollView, Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { colors, restaurantTheme, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { restaurantAPI, uploadAPI } from '@food/api';
import { ImageSourcePicker } from '@food/components/ImageSourcePicker';

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

const EMPTY_FORM = {
  accountHolderName: '',
  accountNumber: '',
  confirmAccountNumber: '',
  ifscCode: '',
  upiId: '',
  upiQrImage: '',
};

const alert = (message) => Alert.alert('', String(message ?? ''));

function Spinner({ size = 16, color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View style={{ transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
}

function Field({ hasError, style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.gray[400]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        styles.input,
        hasError ? { borderColor: colors.red[500] } : null,
        focused ? { borderColor: hasError ? restaurantTheme.brand : restaurantTheme.focusBorder } : null,
        style,
      ]}
    />
  );
}

function FieldError({ text }) {
  if (!text) return null;
  return (
    <View style={styles.errorRow}>
      <AlertCircle size={12} color={restaurantTheme.brand} />
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

export default function UpdateBankDetails() {
  const goBack = useRestaurantBackNavigation();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [isQrPickerOpen, setIsQrPickerOpen] = useState(false);

  const formattedUpdatedAt = useMemo(() => {
    if (!lastUpdated) return '';
    const date = new Date(lastUpdated);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }, [lastUpdated]);

  const validate = () => {
    const nextErrors = {};
    const accountHolderName = String(form.accountHolderName || '').trim();
    const accountNumber = String(form.accountNumber || '').replace(/\s|-/g, '');
    const confirmAccountNumber = String(form.confirmAccountNumber || '').replace(/\s|-/g, '');
    const ifscCode = String(form.ifscCode || '').trim().toUpperCase();
    const upiId = String(form.upiId || '').trim();

    const anyBankField = Boolean(accountHolderName || accountNumber || ifscCode);

    if (anyBankField) {
      if (!accountHolderName) nextErrors.accountHolderName = 'Account holder name is required';
      if (!accountNumber) {
        nextErrors.accountNumber = 'Account number is required';
      } else if (!/^\d{9,18}$/.test(accountNumber)) {
        nextErrors.accountNumber = 'Account number must be 9 to 18 digits';
      }
      if (!confirmAccountNumber) {
        nextErrors.confirmAccountNumber = 'Please confirm account number';
      } else if (confirmAccountNumber !== accountNumber) {
        nextErrors.confirmAccountNumber = 'Account numbers do not match';
      }
      if (!ifscCode) {
        nextErrors.ifscCode = 'IFSC code is required';
      } else if (!IFSC_REGEX.test(ifscCode)) {
        nextErrors.ifscCode = 'Invalid IFSC format (e.g. SBIN0018764)';
      }
    }

    if (upiId && !UPI_REGEX.test(upiId)) {
      nextErrors.upiId = 'Invalid UPI ID format (e.g. name@bank)';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await restaurantAPI.getCurrentRestaurant();
      const doc = response?.data?.data?.restaurant || response?.data?.restaurant || null;
      if (!doc) return;

      const accountNumber = String(doc.accountNumber || '').replace(/\s|-/g, '');
      const upiQrImage = typeof doc.upiQrImage === 'string' ? doc.upiQrImage : String(doc.upiQrImage?.url || '');

      setForm({
        accountHolderName: String(doc.accountHolderName || ''),
        accountNumber,
        confirmAccountNumber: accountNumber,
        ifscCode: String(doc.ifscCode || '').toUpperCase(),
        upiId: String(doc.upiId || ''),
        upiQrImage,
      });
      setLastUpdated(doc.updatedAt || '');
    } catch (error) {
      alert(error?.response?.data?.message || 'Failed to load bank details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleQrUpload = async (file) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size too large. Max 5MB allowed.');
        return;
      }
      setUploadingQr(true);
      const response = await uploadAPI.uploadMedia(file, { folder: 'food/restaurants/upi-qr' });
      const url = response?.data?.data?.url || response?.data?.url || '';
      if (!url) throw new Error('Upload failed');
      setForm((prev) => ({ ...prev, upiQrImage: url }));
      toast.success('QR updated successfully');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to upload QR image');
    } finally {
      setUploadingQr(false);
    }
  };

  // web: isFlutterBridgeAvailable() -> the in-app picker (camera / gallery)
  const handleQrClick = () => {
    if (uploadingQr) return;
    setIsQrPickerOpen(true);
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const payload = {
      accountHolderName: String(form.accountHolderName || '').trim(),
      accountNumber: String(form.accountNumber || '').replace(/\s|-/g, ''),
      ifscCode: String(form.ifscCode || '').trim().toUpperCase(),
      upiId: String(form.upiId || '').trim(),
      upiQrImage: String(form.upiQrImage || '').trim(),
    };

    try {
      setSaving(true);
      await restaurantAPI.updateProfile(payload);
      await loadProfile();
      setErrors({});
      alert('Bank details updated successfully');
    } catch (error) {
      alert(error?.response?.data?.message || 'Failed to update bank details');
    } finally {
      setSaving(false);
    }
  };

  const submitDisabled = saving || uploadingQr;

  return (
    <Screen bg={colors.white} edges={[]} statusBarStyle="dark">
      <StatusBarSpacer color={colors.white} />
      <View style={styles.header}>
        <Pressable onPress={goBack} accessibilityLabel="Back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.title}>Bank & UPI Details</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <Spinner size={16} color={colors.gray[600]} />
          <Text style={styles.loadingText}>Loading details...</Text>
        </View>
      ) : (
        <KeyboardAwareScrollView style={styles.flex} contentContainerStyle={[styles.form, { paddingBottom: sp(6) + insets.bottom }]} extraOffset={40}>
          <View style={{ marginBottom: sp(2) }}>
            <Text style={styles.sectionTitle}>Account details</Text>
            {formattedUpdatedAt ? <Text style={styles.updated}>Last updated: {formattedUpdatedAt}</Text> : null}
          </View>

          <View>
            <Text style={styles.label}>Account holder name</Text>
            <Field
              value={form.accountHolderName}
              onChangeText={(v) => setForm((p) => ({ ...p, accountHolderName: v }))}
              hasError={Boolean(errors.accountHolderName)}
              placeholder="Enter account holder name"
            />
            <FieldError text={errors.accountHolderName} />
          </View>

          <View>
            <Text style={styles.label}>Account number</Text>
            <Field
              keyboardType="number-pad"
              value={form.accountNumber}
              onChangeText={(v) => setForm((p) => ({ ...p, accountNumber: v.replace(/[^\d\s-]/g, '') }))}
              hasError={Boolean(errors.accountNumber)}
              placeholder="Enter account number"
            />
            <FieldError text={errors.accountNumber} />
          </View>

          <View>
            <Text style={styles.label}>Confirm account number</Text>
            <Field
              keyboardType="number-pad"
              value={form.confirmAccountNumber}
              onChangeText={(v) => setForm((p) => ({ ...p, confirmAccountNumber: v.replace(/[^\d\s-]/g, '') }))}
              hasError={Boolean(errors.confirmAccountNumber)}
              placeholder="Re-enter account number"
            />
            <FieldError text={errors.confirmAccountNumber} />
          </View>

          <View>
            <Text style={styles.label}>IFSC code</Text>
            <Field
              maxLength={11}
              autoCapitalize="characters"
              autoCorrect={false}
              value={form.ifscCode}
              onChangeText={(v) => setForm((p) => ({ ...p, ifscCode: v.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
              hasError={Boolean(errors.ifscCode)}
              placeholder="e.g. SBIN0018764"
            />
            <FieldError text={errors.ifscCode} />
          </View>

          <View style={styles.upiSection}>
            <Text style={[styles.sectionTitle, { marginBottom: sp(3) }]}>UPI details</Text>

            <Text style={styles.label}>UPI ID</Text>
            <Field
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={form.upiId}
              onChangeText={(v) => setForm((p) => ({ ...p, upiId: v.trim() }))}
              hasError={Boolean(errors.upiId)}
              placeholder="e.g. merchant@okaxis"
            />
            <FieldError text={errors.upiId} />

            <View style={{ marginTop: sp(4) }}>
              <Text style={styles.label}>UPI QR image</Text>
              {form.upiQrImage ? (
                <AppImage src={form.upiQrImage} contentFit="contain" style={styles.qrImage} accessibilityLabel="UPI QR" />
              ) : (
                <View style={styles.qrEmpty}>
                  <Text style={styles.qrEmptyText}>No QR uploaded</Text>
                </View>
              )}

              <Pressable onPress={handleQrClick} style={({ pressed }) => [styles.uploadBtn, pressed && { backgroundColor: colors.gray[50] }]}>
                {uploadingQr ? <Spinner size={16} color={colors.gray[900]} /> : <Upload size={16} color={colors.gray[900]} />}
                <Text style={styles.uploadText}>{uploadingQr ? 'Uploading...' : 'Upload QR Image'}</Text>
              </Pressable>
            </View>
          </View>

          <Pressable onPress={handleSubmit} disabled={submitDisabled} style={styles.submitBtn}>
            <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.submitText}>{saving ? 'Saving...' : 'Submit'}</Text>
          </Pressable>
        </KeyboardAwareScrollView>
      )}

      <ImageSourcePicker
        isOpen={isQrPickerOpen}
        onClose={() => setIsQrPickerOpen(false)}
        onFileSelect={handleQrUpload}
        title="Upload UPI QR"
        description="Choose how to upload your bank UPI QR image"
        fileNamePrefix="upi-qr"
      />
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
  title: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  loadingRow: { paddingVertical: sp(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(2) },
  loadingText: { fontSize: 16, lineHeight: 24, color: colors.gray[600] },
  form: { paddingHorizontal: sp(4), paddingTop: sp(4), gap: sp(5) },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  updated: { fontSize: 14, lineHeight: 20, color: colors.gray[500], marginTop: sp(1) },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[700], marginBottom: sp(2) },
  input: {
    width: '100%',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    fontSize: 16,
    lineHeight: 22,
    color: colors.gray[900],
    backgroundColor: colors.white,
  },
  errorRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: sp(1) },
  errorText: { fontSize: 12, lineHeight: 16, color: restaurantTheme.brand },
  upiSection: { paddingTop: sp(2), borderTopWidth: 1, borderTopColor: colors.gray[200] },
  qrImage: { width: 160, height: 160, borderWidth: 1, borderColor: colors.gray[200], borderRadius: 8, backgroundColor: colors.white },
  qrEmpty: { width: 160, height: 160, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gray[300], borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qrEmptyText: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  uploadBtn: {
    alignSelf: 'flex-start',
    marginTop: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray[300],
  },
  uploadText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  submitBtn: { width: '100%', paddingVertical: sp(4), borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  submitText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: '700' },
});
