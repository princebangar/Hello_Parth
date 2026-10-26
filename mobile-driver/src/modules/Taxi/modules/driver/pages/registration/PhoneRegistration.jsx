// Web: pages/registration/PhoneRegistration.jsx — /taxi/driver/login, /taxi/driver/reg-phone, /taxi/owner/login,
// /taxi/owner/reg-phone. Role picker + mobile number; POST /drivers/onboarding/send-otp { phone, role } signs an
// existing account of that role in or opens a registration session, then -> <role prefix>/otp-verify. reg-phone
// resumes an unfinished registration (GET /drivers/onboarding/session/:registrationId?phone=).
// Links to /legal/terms, /legal/privacy, /legal/support of the portal (open without a session, see DriverLayout).
// Native: the <form> is a View; the keyboard's done key submits like Enter did. The number box keeps the web's
// placeholder look (smaller, regular weight) by switching the input style while it is empty.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Text, TextInput } from '@/native/ui';
import { fonts } from '@/theme';
import { Spin } from '@/shared/components/Loader';
import {
  buildDriverOnboardingSessionSnapshot,
  clearDriverRegistrationSession,
  getDriverOnboardingResumeStep,
  getDriverOnboardingSession,
  getStoredDriverRegistrationSession,
  saveDriverRegistrationSession,
  sendDriverOtp,
  toPlainData,
} from '../../services/registrationService';
import AuthShell from '../../components/auth/AuthShell';
import { prefetchPolicyContentWhenIdle } from '@/shared/utils/policyPages';
import RolePicker from '../../components/auth/RolePicker';
import { usePhoneFocusRequest } from '@/shared/utils/loginFocus';
import {
  DEFAULT_DRIVER_ROLE,
  getDriverRole,
  getRoutePrefixForRole,
  isDriverRole,
  readLastLoginRole,
  rememberLoginRole,
} from '../../utils/driverRoles';

const unwrap = (response) => response?.data?.data || response?.data || response;

const getErrorMessage = (err) => String(
  err?.message ||
  err?.error ||
  err?.response?.data?.message ||
  '',
).trim();

const PhoneRegistrationPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const phoneInputRef = useRef(null);
  const [phoneFocused, setPhoneFocused] = useState(false);

  // Terms / Privacy / Support load in the background so tapping one opens it straight away.
  useEffect(() => prefetchPolicyContentWhenIdle('driver'), []);
  // back from the code screen with "Change number": cursor into the number box (never on a plain visit / after logout)
  usePhoneFocusRequest(() => phoneInputRef.current, true);

  const storedSession = getStoredDriverRegistrationSession();
  const isOwnerPortal = location.pathname.startsWith('/taxi/owner');
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const sharedReferralCode = String(
    searchParams.get('ref') ||
    searchParams.get('referral') ||
    searchParams.get('code') ||
    storedSession.referralCode ||
    '',
  ).trim().toUpperCase();
  const sharedEmployeeCode = String(
    searchParams.get('emp') ||
    searchParams.get('employee') ||
    storedSession.employeeCode ||
    '',
  ).trim().toUpperCase();
  const storedOnboardingPhone = String(storedSession.phone || '').replace(/\D/g, '').slice(-10);
  const storedRegistrationId = String(storedSession.registrationId || '').trim();
  const storedSessionResumeKey = JSON.stringify({
    phone: storedOnboardingPhone,
    registrationId: storedRegistrationId,
    otpVerified: Boolean(storedSession.otpVerified),
    status: storedSession.status || '',
    role: storedSession.role || '',
    roleConfirmed: storedSession.roleConfirmed !== false,
    fullName: storedSession.fullName || '',
    email: storedSession.email || '',
    gender: storedSession.gender || '',
    locationId: storedSession.locationId || '',
    vehicleTypeId: storedSession.vehicleTypeId || '',
  });

  const [phone, setPhone] = useState(() => String(location.state?.phone || '').replace(/\D/g, '').slice(-10));
  const [role, setRole] = useState(() => {
    if (isOwnerPortal) {
      return 'owner';
    }

    const candidates = [
      searchParams.get('role'),
      location.state?.role,
      storedSession.role,
      readLastLoginRole(),
    ].map((value) => String(value || '').trim().toLowerCase());

    return candidates.find(isDriverRole) || DEFAULT_DRIVER_ROLE;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const routePrefix = isOwnerPortal ? '/taxi/owner' : '/taxi/driver';
  const isLoginPage = location.pathname === `${routePrefix}/login` || location.pathname === `${routePrefix}/login/`;
  const entryPath = `${routePrefix}/login`;
  const selectedRole = getDriverRole(role);
  const canSubmit = phone.length === 10;

  useEffect(() => {
    let active = true;

    const resumeOnboardingIfPossible = async () => {
      if (isLoginPage) {
        return;
      }

      if (!storedOnboardingPhone || !storedRegistrationId) {
        return;
      }

      if (storedSession.otpVerified) {
        const nextStep = getDriverOnboardingResumeStep(storedSession);
        navigate(`${routePrefix}/${nextStep}`, {
          replace: true,
          state: storedSession,
        });
        return;
      }

      try {
        const response = await getDriverOnboardingSession({
          registrationId: storedRegistrationId,
          phone: storedOnboardingPhone,
        });

        if (!active) {
          return;
        }

        const payload = unwrap(response);
        const nextSession = saveDriverRegistrationSession(
          buildDriverOnboardingSessionSnapshot(payload, storedSession),
        );

        if (nextSession.otpVerified) {
          const nextStep = getDriverOnboardingResumeStep(nextSession);
          navigate(`${routePrefix}/${nextStep}`, {
            replace: true,
            state: nextSession,
          });
          return;
        }

        navigate(`${routePrefix}/otp-verify`, {
          replace: true,
          state: nextSession,
        });
      } catch {
        if (!active) {
          return;
        }

        navigate(`${routePrefix}/otp-verify`, {
          replace: true,
          state: storedSession,
        });
      }
    };

    resumeOnboardingIfPossible();

    return () => {
      active = false;
    };
  }, [isLoginPage, navigate, routePrefix, storedOnboardingPhone, storedRegistrationId, storedSession, storedSessionResumeKey]);

  const handleRoleChange = (nextRole) => {
    setRole(nextRole);
    rememberLoginRole(nextRole);
    if (error) setError('');
  };

  // Driver / owner / bus: the onboarding endpoint signs an existing account of this role in and
  // otherwise opens a registration session for the role that was picked here.
  const startStandardFlow = async (baseSession) => {
    const response = await sendDriverOtp({ phone, role });
    const payload = unwrap(response);
    const sessionData = payload?.session || {};

    return saveDriverRegistrationSession({
      ...baseSession,
      registrationId: sessionData.registrationId || '',
      debugOtp: sessionData.debugOtp || '',
      loginMode: Boolean(payload?.loginMode || sessionData.loginMode),
      existingAccount: Boolean(payload?.existingAccount || sessionData.existingAccount),
      detectedRole: String(payload?.detectedRole || sessionData.role || role).trim().toLowerCase(),
      status: sessionData.status || '',
      availableRoles: toPlainData(payload?.availableRoles || sessionData.availableRoles) || [],
    });
  };

  const handleSendOTP = async () => {
    if (loading) {
      return;
    }

    if (phone.length !== 10) {
      setError('Enter your 10-digit mobile number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      clearDriverRegistrationSession();
      rememberLoginRole(role);

      const baseSession = {
        phone,
        role,
        roleConfirmed: true,
        needsRoleSelection: false,
        entryPath,
        referralCode: sharedReferralCode,
        employeeCode: sharedEmployeeCode,
      };
      const nextState = await startStandardFlow(baseSession);

      navigate(`${getRoutePrefixForRole(role)}/otp-verify`, { state: nextState });
    } catch (requestError) {
      setError(getErrorMessage(requestError) || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // RolePicker keeps the web's prop names (value / onChange)
  const rolePickerProps = { value: role, onChange: handleRoleChange, disabled: loading, label: 'I am a' };
  const phoneEmpty = phone.length === 0;

  return (
    <AuthShell
      eyebrow="Partner app"
      title={isLoginPage ? 'Welcome back' : 'Join as a partner'}
      subtitle="Choose your role, then verify your mobile number."
    >
      <View style={styles.form}>
        <View>
          <Text style={styles.fieldLabel}>I am a</Text>
          <RolePicker {...rolePickerProps} />
        </View>

        <View>
          <Text nativeID="partner-phone-label" style={styles.fieldLabel}>Mobile number</Text>
          <Pressable
            onPress={() => phoneInputRef.current?.focus()}
            style={[
              styles.phoneBox,
              { borderColor: phoneFocused ? '#0b1220' : error ? '#fca5a5' : '#e2e8f0' },
            ]}
          >
            <View style={styles.dialCode}>
              <Text style={styles.dialCodeText}>+91</Text>
            </View>
            <TextInput
              ref={phoneInputRef}
              accessibilityLabelledBy="partner-phone-label"
              accessibilityLabel="Mobile number"
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="off"
              importantForAutofill="no"
              maxLength={10}
              value={phone}
              onChangeText={(text) => {
                setPhone(String(text || '').replace(/\D/g, '').slice(0, 10));
                if (error) setError('');
              }}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
              onSubmitEditing={handleSendOTP}
              returnKeyType="done"
              placeholder="10-digit mobile number"
              placeholderTextColor="#64748b"
              style={[styles.phoneInput, phoneEmpty ? styles.phoneInputEmpty : null]}
            />
            {phone.length === 10 ? <CheckCircle2 size={20} color="#059669" /> : null}
          </Pressable>
          <Text style={styles.hint}>
            {`We will text a 4-digit code. Already a ${selectedRole.label.toLowerCase()}? You are signed in. New? Registration starts right after.`}
          </Text>
        </View>

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSendOTP}
          disabled={loading || !canSubmit}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submitBtn,
            canSubmit ? styles.submitEnabled : styles.submitDisabled,
            canSubmit && pressed ? styles.submitPressed : null,
          ]}
        >
          {loading ? (
            <Spin>
              <Loader2 size={22} color={canSubmit ? '#ffffff' : '#475569'} accessibilityLabel="Sending code" />
            </Spin>
          ) : (
            <>
              <Text style={[styles.submitText, { color: canSubmit ? '#ffffff' : '#475569' }]}>Continue</Text>
              <ArrowRight size={20} strokeWidth={2.4} color={canSubmit ? '#ffffff' : '#475569'} />
            </>
          )}
        </Pressable>

        {/* Taxi forces Outfit on everything (!important), so the web marks these Poppins with the important modifier. */}
        <View style={styles.legal}>
          <Text style={styles.legalText}>By continuing, you agree to our</Text>
          <View style={styles.legalRow}>
            <Pressable onPress={() => navigate(`${routePrefix}/legal/terms`)} hitSlop={6}>
              <Text style={styles.legalLink}>TERMS</Text>
            </Pressable>
            <Text style={styles.legalDot}>•</Text>
            <Pressable onPress={() => navigate(`${routePrefix}/legal/privacy`)} hitSlop={6}>
              <Text style={styles.legalLink}>PRIVACY</Text>
            </Pressable>
            <Text style={styles.legalDot}>•</Text>
            <Pressable onPress={() => navigate(`${routePrefix}/legal/support`)} hitSlop={6}>
              <Text style={styles.legalLink}>SUPPORT</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </AuthShell>
  );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one (and every screen sees the current URL, so a hidden login page would react to the OTP page's
// path), so this page is drawn only while it is in front.
const PhoneRegistration = () => {
  const focused = useIsFocused();
  return focused ? <PhoneRegistrationPage /> : null;
};

// text-gray-400/80
const GRAY_400_80 = 'rgba(156,163,175,0.8)';

const styles = StyleSheet.create({
  form: { gap: 24 },
  fieldLabel: { marginBottom: 10, fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#0b1220' },
  phoneBox: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  dialCode: { borderRightWidth: 1, borderRightColor: '#e2e8f0', paddingRight: 12 },
  dialCodeText: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: '#334155' },
  phoneInput: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.45,
    color: '#0b1220',
  },
  // placeholder:text-base placeholder:font-normal placeholder:tracking-normal
  phoneInputEmpty: { fontSize: 16, fontWeight: '400', letterSpacing: 0 },
  hint: { marginTop: 8, fontSize: 12, lineHeight: 20, color: '#64748b' },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#b91c1c' },
  submitBtn: {
    height: 56,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
  },
  submitEnabled: {
    backgroundColor: '#0b1220',
    elevation: 8,
    shadowColor: '#0b1220',
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 14 },
  },
  submitDisabled: { backgroundColor: '#cbd5e1' },
  submitPressed: { transform: [{ scale: 0.99 }] },
  submitText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  legal: { alignSelf: 'center', maxWidth: 320, alignItems: 'center' },
  legalText: {
    fontFamily: fonts.poppins,
    fontSize: 11,
    lineHeight: 17.9,
    fontWeight: '500',
    color: GRAY_400_80,
    textAlign: 'center',
  },
  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  legalLink: {
    fontFamily: fonts.poppins,
    fontSize: 11,
    lineHeight: 17.9,
    fontWeight: '600',
    letterSpacing: 0.55,
    color: '#9ca3af',
  },
  legalDot: {
    marginHorizontal: 8,
    fontFamily: fonts.poppins,
    fontSize: 11,
    lineHeight: 17.9,
    fontWeight: '700',
    color: GRAY_400_80,
  },
});

export default PhoneRegistration;
