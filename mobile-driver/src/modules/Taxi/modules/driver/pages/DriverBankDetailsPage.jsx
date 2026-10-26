// Web: modules/Taxi/modules/driver/pages/DriverBankDetailsPage.jsx — payout details used for withdrawal requests:
// account holder, UPI ID (+ UPI verify), UPI QR image, account number / IFSC / branch (+ bank verify), Save.
// Native: the QR image comes from the gallery (@/lib/media pickImage) and is sent as the same base64 data URL the web's
// FileReader produced (POST /common/upload/image, folder driver-bank-qr).
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';
import { ArrowLeft, CheckCircle2, Landmark, Loader2, QrCode, Save, ShieldCheck, Upload } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { pickImage } from '@/lib/media';
import { AppImage, Screen, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import { getCurrentDriver, updateDriverProfile, verifyDriverBankDetails, verifyDriverUpiDetails } from '../services/registrationService';
import { uploadService } from '../../../shared/services/uploadService';

const PAGE_BG = '#f8fafc';

const unwrapDriver = (response) => response?.data?.data || response?.data || response || null;

const normalizeBankDetails = (bankDetails = {}) => ({
  accountHolderName: String(bankDetails?.accountHolderName || '').trim(),
  upiId: String(bankDetails?.upiId || '').trim(),
  qrCodeImage: String(bankDetails?.qrCodeImage || '').trim(),
  accountNumber: String(bankDetails?.accountNumber || '').trim(),
  ifsc: String(bankDetails?.ifsc || '').trim().toUpperCase(),
  branchName: String(bankDetails?.branchName || '').trim(),
  verificationStatus: String(bankDetails?.verificationStatus || '').trim(),
  verificationMode: String(bankDetails?.verificationMode || '').trim(),
  verificationMessage: String(bankDetails?.verificationMessage || '').trim(),
  verificationReferenceId: String(bankDetails?.verificationReferenceId || '').trim(),
  verifiedBankName: String(bankDetails?.verifiedBankName || '').trim(),
  verifiedBranchName: String(bankDetails?.verifiedBranchName || '').trim(),
  verifiedAccountHolderName: String(bankDetails?.verifiedAccountHolderName || '').trim(),
  verifiedAt: bankDetails?.verifiedAt || null,
  upiVerificationStatus: String(bankDetails?.upiVerificationStatus || '').trim(),
  upiVerificationMode: String(bankDetails?.upiVerificationMode || '').trim(),
  upiVerificationMessage: String(bankDetails?.upiVerificationMessage || '').trim(),
  upiVerificationReferenceId: String(bankDetails?.upiVerificationReferenceId || '').trim(),
  upiVerifiedName: String(bankDetails?.upiVerifiedName || '').trim(),
  upiAccountIfsc: String(bankDetails?.upiAccountIfsc || '').trim(),
  upiAccountType: String(bankDetails?.upiAccountType || '').trim(),
  upiVerifiedAt: bankDetails?.upiVerifiedAt || null,
  updatedAt: bankDetails?.updatedAt || null,
});

// The web's FileReader.readAsDataURL for the picked image.
const readFileAsDataUrl = async (file) => {
  try {
    const base64 = await new File(file.uri).base64();
    return `data:${String(file.type || 'image/jpeg')};base64,${base64}`;
  } catch {
    throw new Error('Failed to read image');
  }
};

const extractUploadUrl = (payload) =>
  payload?.data?.url ||
  payload?.data?.secureUrl ||
  payload?.url ||
  payload?.secureUrl ||
  '';

const Field = ({
  label,
  value,
  onChangeText: onChange,
  placeholder,
  keyboardType,
  maxLength,
  uppercase = false,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.slate[400]}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={uppercase ? 'characters' : 'none'}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.fieldInput, focused && styles.fieldInputFocused]}
      />
    </View>
  );
};

const StatusCard = ({ verified, title, message, detail }) => (
  <View style={[styles.statusCard, verified ? styles.statusOk : styles.statusWarn]}>
    <View style={styles.statusRow}>
      {verified ? <CheckCircle2 size={18} color={colors.emerald[600]} /> : <ShieldCheck size={18} color={colors.amber[600]} />}
      <View style={styles.statusText}>
        <Text style={[styles.statusTitle, { color: verified ? colors.emerald[800] : colors.amber[800] }]}>{title}</Text>
        <Text style={styles.statusMessage}>{message}</Text>
        {detail ? <Text style={styles.statusDetail}>{detail}</Text> : null}
      </View>
    </View>
  </View>
);

const SpinIcon = ({ color }) => (
  <Spin>
    <Loader2 size={15} color={color} />
  </Spin>
);

const DriverBankDetailsPage = () => {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const role = localStorage.getItem('role') || 'driver';
  const routePrefix = role === 'owner' ? '/taxi/owner' : '/taxi/driver';

  const [driver, setDriver] = useState(null);
  const [bankForm, setBankForm] = useState(() => normalizeBankDetails());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyingUpi, setVerifyingUpi] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    const loadDriver = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getCurrentDriver();
        if (!active) return;
        const nextDriver = unwrapDriver(response);
        setDriver(nextDriver);
        setBankForm(normalizeBankDetails(nextDriver?.bankDetails));
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load bank details');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadDriver();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    if (bankForm.upiId) return bankForm.upiId;
    if (bankForm.accountNumber) return `A/C ${bankForm.accountNumber.slice(-4).padStart(bankForm.accountNumber.length, '*')}`;
    return 'Add your payout details for withdrawals';
  }, [bankForm.accountNumber, bankForm.upiId]);

  const handleFieldChange = (field, value) => {
    setSuccess('');
    setBankForm((current) => ({
      ...current,
      [field]: field === 'ifsc' ? String(value || '').toUpperCase() : value,
    }));
  };

  const handleQrUpload = async () => {
    if (uploading) return;
    let file = null;
    try {
      file = await pickImage({ source: 'library' });
    } catch (err) {
      setError(err?.message || 'QR upload failed');
      return;
    }
    if (!file) return;

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl.startsWith('data:image/')) {
        throw new Error('Please choose an image file');
      }

      const uploadPayload = await uploadService.uploadImage(dataUrl, 'driver-bank-qr');
      const qrCodeImage = extractUploadUrl(uploadPayload);

      if (!qrCodeImage) {
        throw new Error('QR upload failed');
      }

      setBankForm((current) => ({ ...current, qrCodeImage }));
    } catch (err) {
      setError(err?.message || 'QR upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (saving || uploading) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateDriverProfile({
        bankDetails: {
          accountHolderName: bankForm.accountHolderName,
          upiId: bankForm.upiId,
          qrCodeImage: bankForm.qrCodeImage,
          accountNumber: bankForm.accountNumber,
          ifsc: bankForm.ifsc,
          branchName: bankForm.branchName,
        },
      });
      const updated = unwrapDriver(response);
      const nextBankDetails = normalizeBankDetails(updated?.bankDetails || bankForm);
      setDriver((current) => ({ ...(current || {}), bankDetails: nextBankDetails }));
      setBankForm(nextBankDetails);
      setSuccess('Bank details saved successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to save bank details');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (saving || uploading || verifying) return;

    setVerifying(true);
    setError('');
    setSuccess('');

    try {
      await updateDriverProfile({
        bankDetails: {
          accountHolderName: bankForm.accountHolderName,
          upiId: bankForm.upiId,
          qrCodeImage: bankForm.qrCodeImage,
          accountNumber: bankForm.accountNumber,
          ifsc: bankForm.ifsc,
          branchName: bankForm.branchName,
        },
      });

      const response = await verifyDriverBankDetails('penny_less');
      const payload = unwrapDriver(response);
      const nextBankDetails = normalizeBankDetails(payload?.bankDetails || {});

      setDriver((current) => ({ ...(current || {}), bankDetails: nextBankDetails }));
      setBankForm(nextBankDetails);
      setSuccess(payload?.verification?.msg || 'Bank account verified successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to verify bank details');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyUpi = async () => {
    if (saving || uploading || verifyingUpi) return;

    setVerifyingUpi(true);
    setError('');
    setSuccess('');

    try {
      await updateDriverProfile({
        bankDetails: {
          accountHolderName: bankForm.accountHolderName,
          upiId: bankForm.upiId,
          qrCodeImage: bankForm.qrCodeImage,
          accountNumber: bankForm.accountNumber,
          ifsc: bankForm.ifsc,
          branchName: bankForm.branchName,
        },
      });

      const response = await verifyDriverUpiDetails('advance');
      const payload = unwrapDriver(response);
      const nextBankDetails = normalizeBankDetails(payload?.bankDetails || {});

      setDriver((current) => ({ ...(current || {}), bankDetails: nextBankDetails }));
      setBankForm(nextBankDetails);
      setSuccess(payload?.verification?.msg || 'UPI verified successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to verify UPI details');
    } finally {
      setVerifyingUpi(false);
    }
  };

  const bank = driver?.bankDetails || {};
  const saveDisabled = saving || uploading || verifying || verifyingUpi;

  return (
    <Screen bg={PAGE_BG} edges={['top']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.page, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Pressable onPress={() => navigate(`${routePrefix}/profile`)} accessibilityLabel="Back" style={styles.back}>
            <ArrowLeft size={18} color={colors.slate[700]} />
          </Pressable>
          <View>
            <Text style={styles.kicker}>Driver Profile</Text>
            <Text style={styles.title}>Bank Details</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <Landmark size={24} color={colors.white} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroKicker}>Payout Setup</Text>
              <Text style={styles.heroSummary}>{summary}</Text>
              <Text style={styles.heroNote}>These details will be used when you send a withdrawal request.</Text>
            </View>
          </View>
        </View>

        <View style={styles.formCard}>
          {loading ? (
            <View style={styles.loadingBox}>
              <Text style={styles.loadingText}>Loading bank details...</Text>
            </View>
          ) : (
            <View style={styles.form}>
              <Field
                label="Account Holder Name"
                value={bankForm.accountHolderName}
                placeholder="Enter account holder name"
                onChangeText={(value) => handleFieldChange('accountHolderName', value)}
              />
              <Field
                label="UPI ID"
                value={bankForm.upiId}
                placeholder="name@upi"
                keyboardType="email-address"
                onChangeText={(value) => handleFieldChange('upiId', value)}
              />

              {bank.upiVerificationStatus ? (
                <StatusCard
                  verified={bank.upiVerificationStatus === 'verified'}
                  title={bank.upiVerificationStatus === 'verified' ? 'UPI verified' : 'UPI verification attempted'}
                  message={bank.upiVerificationMessage || 'UPI verification response received from provider.'}
                  detail={(bank.upiVerifiedName || bank.upiAccountIfsc)
                    ? `${bank.upiVerifiedName || bankForm.upiId}${bank.upiAccountIfsc ? ` • ${bank.upiAccountIfsc}` : ''}`
                    : ''}
                />
              ) : null}

              <View style={styles.qrCard}>
                <View style={styles.qrPreview}>
                  {bankForm.qrCodeImage ? (
                    <AppImage src={bankForm.qrCodeImage} style={styles.qrImage} contentFit="cover" accessibilityLabel="UPI QR code" />
                  ) : (
                    <QrCode size={42} color={colors.slate[300]} />
                  )}
                </View>
                <View style={styles.qrInfo}>
                  <View>
                    <Text style={styles.qrTitle}>UPI QR Code</Text>
                    <Text style={styles.qrSub}>Upload your payout QR image from gallery or camera.</Text>
                  </View>
                  <Pressable
                    onPress={handleQrUpload}
                    disabled={uploading}
                    accessibilityLabel="Upload UPI QR code"
                    style={({ pressed }) => [
                      styles.uploadBtn,
                      uploading ? styles.uploadBtnBusy : styles.uploadBtnIdle,
                      pressed && !uploading && styles.pressed99,
                    ]}
                  >
                    <Upload size={15} color={uploading ? colors.slate[400] : colors.white} />
                    <Text style={[styles.uploadText, { color: uploading ? colors.slate[400] : colors.white }]}>
                      {uploading ? 'Uploading...' : 'Upload QR'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Field
                label="Account Number"
                value={bankForm.accountNumber}
                placeholder="Enter account number"
                keyboardType="number-pad"
                onChangeText={(value) => handleFieldChange('accountNumber', value.replace(/\D/g, ''))}
              />
              <Field
                label="IFSC"
                value={bankForm.ifsc}
                placeholder="ABCD0123456"
                maxLength={11}
                uppercase
                onChangeText={(value) => handleFieldChange('ifsc', value)}
              />

              <Field
                label="Branch Name"
                value={bankForm.branchName}
                placeholder="Enter branch name"
                onChangeText={(value) => handleFieldChange('branchName', value)}
              />

              {bank.verificationStatus ? (
                <StatusCard
                  verified={bank.verificationStatus === 'verified'}
                  title={bank.verificationStatus === 'verified' ? 'Bank account verified' : 'Verification attempted'}
                  message={bank.verificationMessage || 'Verification response received from provider.'}
                  detail={(bank.verifiedAccountHolderName || bank.verifiedBankName)
                    ? `${bank.verifiedAccountHolderName || 'Account holder'}${bank.verifiedBankName ? ` • ${bank.verifiedBankName}` : ''}`
                    : ''}
                />
              ) : null}

              {bank.updatedAt ? (
                <Text style={styles.updatedAt}>Last updated: {new Date(bank.updatedAt).toLocaleString('en-IN')}</Text>
              ) : null}

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              {success ? (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>{success}</Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable onPress={() => navigate(`${routePrefix}/profile`)} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>Back</Text>
                </Pressable>
                <Pressable
                  onPress={handleVerify}
                  disabled={saving || uploading || verifying}
                  style={[styles.actionBtn, styles.verifyBtn, (saving || uploading || verifying) && styles.disabled60]}
                >
                  {verifying ? <SpinIcon color={colors.emerald[700]} /> : <ShieldCheck size={15} color={colors.emerald[700]} />}
                  <Text style={[styles.actionText, { color: colors.emerald[700] }]}>Verify</Text>
                </Pressable>
                <Pressable
                  onPress={handleVerifyUpi}
                  disabled={saving || uploading || verifyingUpi}
                  style={[styles.actionBtn, styles.verifyUpiBtn, (saving || uploading || verifyingUpi) && styles.disabled60]}
                >
                  {verifyingUpi ? <SpinIcon color={colors.sky[700]} /> : <ShieldCheck size={15} color={colors.sky[700]} />}
                  <Text style={[styles.actionText, { color: colors.sky[700] }]}>Verify UPI</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saveDisabled}
                  style={[styles.actionBtn, styles.saveBtn, saveDisabled && styles.disabled60]}
                >
                  {saving ? (
                    <Spin>
                      <View style={styles.saveSpin} />
                    </Spin>
                  ) : (
                    <Save size={15} color={colors.white} />
                  )}
                  <Text style={[styles.actionText, { color: colors.white }]}>Save</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
};

export default DriverBankDetailsPage;

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 768, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, gap: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  kicker: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.64, color: colors.slate[400] },
  title: { marginTop: 4, fontSize: 24, lineHeight: 32, fontWeight: '900', letterSpacing: -0.6, color: colors.slate[950] },
  hero: { borderRadius: 32, backgroundColor: colors.slate[950], padding: 24, ...shadow.xl },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  heroIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: alpha(colors.white, 0.1), alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1 },
  heroKicker: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2.2, color: colors.slate[400] },
  heroSummary: { marginTop: 8, fontSize: 18, lineHeight: 28, fontWeight: '900', letterSpacing: -0.45, color: colors.white },
  heroNote: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.slate[300] },
  formCard: { borderRadius: 32, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: 24, ...shadow.sm },
  loadingBox: { paddingVertical: 64, alignItems: 'center' },
  loadingText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[500], textAlign: 'center' },
  form: { gap: 20 },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.slate[500] },
  fieldInput: {
    height: 48,
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '700',
    color: colors.slate[900],
  },
  fieldInputFocused: { borderColor: colors.slate[900], backgroundColor: colors.white },
  statusCard: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  statusOk: { borderColor: colors.emerald[200], backgroundColor: colors.emerald[50] },
  statusWarn: { borderColor: colors.amber[200], backgroundColor: colors.amber[50] },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusText: { flex: 1 },
  statusTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900' },
  statusMessage: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.slate[600] },
  statusDetail: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
  qrCard: { borderRadius: 28, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 16, gap: 16 },
  qrPreview: {
    height: 144,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.slate[300],
    backgroundColor: colors.white,
  },
  qrImage: { width: '100%', height: '100%' },
  qrInfo: { gap: 12 },
  qrTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.slate[900] },
  qrSub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.slate[500] },
  uploadBtn: { height: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  uploadBtnIdle: { backgroundColor: colors.slate[950] },
  uploadBtnBusy: { backgroundColor: colors.slate[200] },
  pressed99: { transform: [{ scale: 0.99 }] },
  uploadText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  updatedAt: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.slate[400] },
  errorBox: { borderRadius: 16, backgroundColor: colors.rose[50], paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.rose[600] },
  successBox: { borderRadius: 16, backgroundColor: colors.emerald[50], paddingHorizontal: 16, paddingVertical: 12 },
  successText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.emerald[700] },
  actions: { gap: 12, paddingTop: 8 },
  backBtn: { height: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.slate[700] },
  actionBtn: { height: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  verifyBtn: { borderWidth: 1, borderColor: colors.emerald[200], backgroundColor: colors.emerald[50] },
  verifyUpiBtn: { borderWidth: 1, borderColor: colors.sky[200], backgroundColor: colors.sky[50] },
  // bg-slate-950 button: the partner button colour (Taxi blue, white text)
  saveBtn: { backgroundColor: driverTheme.button },
  disabled60: { opacity: 0.6 },
  actionText: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  saveSpin: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: alpha(colors.white, 0.3), borderTopColor: colors.white },
});
