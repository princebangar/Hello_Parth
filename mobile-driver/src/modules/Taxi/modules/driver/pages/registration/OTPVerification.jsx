// Web: pages/registration/OTPVerification.jsx — /taxi/driver/otp-verify, /taxi/owner/otp-verify. The 4-digit code.
// Sign-in (session.loginMode): POST /drivers/auth/verify-otp { phone, otp, role } -> token -> persistDriverAuthSession
// (dispatches app:auth-ready for the FCM bridge) -> home / registration-status by role. A number with several
// profiles gets the profile chooser and verifies again with the chosen role.
// Registration: POST /drivers/onboarding/verify-otp { registrationId, phone, otp } -> step-personal (or select-role).
// Resend: POST /drivers/auth/send-otp or /drivers/onboarding/send-otp. Resume: GET /drivers/onboarding/session/:id.
// Native (CONVERSION_GUIDE 7.5): each box's digit lives in a ref (state alone lost digits typed quickly), the keyboard
// closes after the last digit, a wrong code clears the boxes and focuses the first one again. The code that was typed
// is sent as it is (never a built-in code). A pasted / SMS-autofilled code in any box fills all boxes from the first
// one, like the web's onPaste on the row.
import React, { useState, useEffect, useRef } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { ArrowRight, ChevronRight, Loader2, MessageSquare } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import {
    buildDriverOnboardingSessionSnapshot,
    getDriverOnboardingResumeStep,
    getDriverOnboardingSession,
    getStoredDriverRegistrationSession,
    clearDriverRegistrationSession,
    persistDriverAuthSession,
    saveDriverRegistrationSession,
    sendDriverLoginOtp,
    sendDriverOtp,
    toPlainData,
    verifyDriverLoginOtp,
    verifyDriverOtp,
} from '../../services/registrationService';
import AuthShell from '../../components/auth/AuthShell';
import { getDriverRole, normalizeDriverRole } from '../../utils/driverRoles';
import { requestPhoneFocus } from '@/shared/utils/loginFocus';

const OTP_LENGTH = 4;
const RESEND_SECONDS = 60;
const IS_DEV_BUILD = Boolean(globalThis.__ENV__?.DEV);

const unwrap = (response) => response?.data?.data || response?.data || response;

const isDriverApproved = (driver) => {
    if (!driver) return false;
    const approval = String(driver?.approve ?? '').toLowerCase();
    const status = String(driver?.status || '').toLowerCase();
    return (
        driver?.approve === true ||
        driver?.approve === 1 ||
        ['true', '1', 'yes', 'approved'].includes(approval) ||
        ['approved', 'active', 'verified'].includes(status)
    );
};

const getPostLoginRoute = (role, driver, routePrefix) => {
    const normalizedRole = normalizeDriverRole(role);
    if (normalizedRole === 'bus_driver') return '/taxi/driver/bus-home';
    if (normalizedRole === 'owner' || normalizedRole === 'driver') {
        return isDriverApproved(driver)
            ? normalizedRole === 'owner' ? '/taxi/owner/home' : '/taxi/driver/home'
            : `${routePrefix}/registration-status`;
    }
    return '/taxi/driver/home';
};

// Web: flushed the token the Flutter shell handed over (and registered a browser token). The app's FCM bridge
// (shared/push/nativeFcmBridge) installs the same flush function; there is no browser token in the app.
const syncPushTokens = async () => {
    await Promise.allSettled([
        window.__flushNativeFcmToken?.(),
    ]);
};

const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// dauth-shake: 0.36s ease-in-out, 0 -> -6 -> 6 -> -4 -> 4 -> 0 px
const runShake = (value) => {
    value.setValue(0);
    const step = (toValue) => Animated.timing(value, { toValue, duration: 72, useNativeDriver: true });
    Animated.sequence([step(-6), step(6), step(-4), step(4), step(0)]).start();
};

const OTPVerificationPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    // the digits: the ref is the source of truth (read by every handler), the state only redraws the boxes
    const otpRef = useRef(Array(OTP_LENGTH).fill(''));
    const [otp, setOtpState] = useState(() => [...otpRef.current]);
    const setOtp = (next) => {
        otpRef.current = next;
        setOtpState(next);
    };
    const inputs = useRef([]);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const shake = useRef(new Animated.Value(0)).current;
    const [timer, setTimer] = useState(RESEND_SECONDS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [resolvingSession, setResolvingSession] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);
    const [showRoleSelector, setShowRoleSelector] = useState(false);

    const session = {
        ...getStoredDriverRegistrationSession(),
        ...(location.state || {}),
    };
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
    const role = session.role || 'driver';
    const roleConfirmed = session.roleConfirmed !== false;
    const registrationId = session.registrationId || '';
    const isLoginFlow = Boolean(session.loginMode);
    const existingAccount = Boolean(session.existingAccount);
    const accountRole = getDriverRole(session.detectedRole || role);
    const flowRole = getDriverRole(role);
    const entryPath = String(session.entryPath || (isLoginFlow ? `${routePrefix}/login` : `${routePrefix}/reg-phone`));
    const otpCode = otp.join('');
    const isComplete = otpCode.length === OTP_LENGTH;
    const devOtp = IS_DEV_BUILD ? String(session.debugOtp || '').trim() : '';
    const sessionResumeKey = JSON.stringify({
        registrationId,
        phone,
        otpVerified: Boolean(session.otpVerified),
        status: session.status || '',
        fullName: session.fullName || '',
        email: session.email || '',
        gender: session.gender || '',
        locationId: session.locationId || '',
        vehicleTypeId: session.vehicleTypeId || '',
        role: session.role || '',
        roleConfirmed: session.roleConfirmed !== false,
    });

    useEffect(() => {
        let active = true;

        const resumeIfVerified = async () => {
            if (isLoginFlow || !phone || !registrationId) {
                return;
            }

            const locallyVerified = Boolean(session.otpVerified);
            if (locallyVerified) {
                const nextStep = getDriverOnboardingResumeStep(session);
                navigate(`${routePrefix}/${nextStep}`, {
                    replace: true,
                    state: saveDriverRegistrationSession(session),
                });
                return;
            }

            setResolvingSession(true);
            try {
                const response = await getDriverOnboardingSession({ registrationId, phone });
                const payload = unwrap(response);
                const nextSession = saveDriverRegistrationSession(
                    buildDriverOnboardingSessionSnapshot(payload, session),
                );

                if (!active || !nextSession.otpVerified) {
                    return;
                }

                if (nextSession.roleConfirmed === false) {
                    navigate('/taxi/driver/select-role', {
                        replace: true,
                    });
                    return;
                }

                const nextStep = getDriverOnboardingResumeStep(nextSession);
                navigate(`${routePrefix}/${nextStep}`, {
                    replace: true,
                    state: nextSession,
                });
            } catch (err) {
                const status = Number(err?.status || err?.response?.status || 0);
                if (status === 404 || status === 410) {
                    clearDriverRegistrationSession();
                }
            } finally {
                if (active) {
                    setResolvingSession(false);
                }
            }
        };

        resumeIfVerified();

        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- same triggers as the web (sessionResumeKey stands for session)
    }, [isLoginFlow, navigate, phone, registrationId, routePrefix, sessionResumeKey]);

    useEffect(() => {
        if (!phone) {
            navigate(entryPath, { replace: true });
            return undefined;
        }
        const interval = setInterval(() => {
            setTimer(prev => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, [entryPath, navigate, phone]);

    useEffect(() => {
        const focusTimer = setTimeout(() => {
            inputs.current[0]?.focus();
        }, 300);
        return () => clearTimeout(focusTimer);
    }, []);

    // The boxes are disabled while a request is in flight, so the first one can only be focused again
    // once `loading` has dropped back to false.
    const refocusRef = useRef(false);
    useEffect(() => {
        if (!loading && refocusRef.current) {
            refocusRef.current = false;
            inputs.current[0]?.focus();
        }
    }, [loading]);

    // .dauth-shake is added when an error appears
    const hasError = Boolean(error);
    useEffect(() => {
        if (hasError) runShake(shake);
    }, [hasError, shake]);

    const resetOtp = () => {
        setOtp(Array(OTP_LENGTH).fill(''));
        refocusRef.current = true;
    };

    const applyDigits = (startIndex, rawValue) => {
        const digits = String(rawValue || '').replace(/\D/g, '');
        if (!digits) return;

        const next = [...otpRef.current];
        let cursor = startIndex;
        for (const digit of digits) {
            if (cursor >= OTP_LENGTH) break;
            next[cursor] = digit;
            cursor += 1;
        }
        setOtp(next);
        setError('');
        setNotice('');

        if (next.every(Boolean)) {
            inputs.current[OTP_LENGTH - 1]?.blur();
            Keyboard.dismiss();
            handleVerify(next.join(''));
        } else {
            inputs.current[Math.min(cursor, OTP_LENGTH - 1)]?.focus();
        }
    };

    const handleChange = (index, value) => {
        const current = otpRef.current;
        if (value === '') {
            const next = [...current];
            next[index] = '';
            setOtp(next);
            setError('');
            return;
        }
        // Typing over a filled box arrives as "<old><new>"; a pasted / auto-filled code arrives whole.
        const typedOverExisting = value.length === 2 && current[index] && value.startsWith(current[index]);
        if (typedOverExisting) {
            applyDigits(index, value.slice(-1));
            return;
        }
        if (index === 0 || value.length === 1) {
            applyDigits(index, value.slice(0, OTP_LENGTH));
            return;
        }
        // a whole code pasted into a later box: the web's onPaste filled the boxes from the first one
        applyDigits(0, value);
    };

    const handleKeyPress = (index, event) => {
        const key = event?.nativeEvent?.key;
        if (key === 'Backspace' && !otpRef.current[index] && index > 0) {
            inputs.current[index - 1]?.focus();
        } else if (key === 'ArrowLeft' && index > 0) {
            inputs.current[index - 1]?.focus();
        } else if (key === 'ArrowRight' && index < OTP_LENGTH - 1) {
            inputs.current[index + 1]?.focus();
        }
    };

    const handleVerify = async (otpOverride) => {
        const code = typeof otpOverride === 'string' ? otpOverride : otpRef.current.join('');
        if (code.length !== OTP_LENGTH) {
            setError(`Enter the ${OTP_LENGTH}-digit code`);
            return;
        }

        setLoading(true);
        setError('');
        setNotice('');

        try {
            if (isLoginFlow) {
                const targetRole = selectedRole || role;
                // A role picked on the login screen is always sent, so a number that holds several
                // profiles opens the right one instead of asking again.
                const queryRole = selectedRole || (roleConfirmed && session.role ? normalizeDriverRole(role) : undefined);
                const response = await verifyDriverLoginOtp({ phone, otp: code, role: queryRole });
                const payload = unwrap(response);

                if (payload?.needsRoleSelection) {
                    saveDriverRegistrationSession({
                        ...session,
                        availableRoles: toPlainData(payload.availableRoles) || [],
                    });
                    setShowRoleSelector(true);
                    return;
                }

                const loggedInRole = payload?.role || targetRole;
                const token = payload?.token;
                if (token) {
                    persistDriverAuthSession({ token, role: normalizeDriverRole(loggedInRole) });
                    await syncPushTokens();
                }
                clearDriverRegistrationSession();
                navigate(getPostLoginRoute(loggedInRole, payload?.driver, routePrefix), { replace: true });
                return;
            }

            const response = await verifyDriverOtp({ registrationId, phone, otp: code });
            const payload = unwrap(response);
            const shouldForceRoleSelection =
                routePrefix === '/taxi/driver'
                && (session.needsRoleSelection === true || session.roleConfirmed === false);
            const nextSession = saveDriverRegistrationSession({
                ...session,
                otpVerified: true,
                role: payload?.session?.role || session.role || 'driver',
                roleConfirmed: shouldForceRoleSelection
                    ? false
                    : (payload?.session?.roleConfirmed ?? session.roleConfirmed ?? true),
                needsRoleSelection: shouldForceRoleSelection,
                status: payload?.session?.status || 'otp_verified',
                otpSession: toPlainData(payload?.session),
            });
            if (shouldForceRoleSelection || nextSession.roleConfirmed === false) {
                navigate('/taxi/driver/select-role');
                return;
            }
            navigate(`${routePrefix}/step-personal`);
        } catch (err) {
            setError(err?.message || 'That code is not correct. Please try again.');
            resetOtp();
        } finally {
            setLoading(false);
        }
    };

    const handleRoleSelect = async (chosenRole) => {
        setSelectedRole(chosenRole);
        setShowRoleSelector(false);
        setLoading(true);
        setError('');

        try {
            const response = await verifyDriverLoginOtp({ phone, otp: otpRef.current.join(''), role: chosenRole });
            const payload = unwrap(response);
            const normalizedRole = normalizeDriverRole(chosenRole);
            if (payload?.token) {
                persistDriverAuthSession({ token: payload.token, role: normalizedRole });
                await syncPushTokens();
            }
            clearDriverRegistrationSession();
            navigate(getPostLoginRoute(normalizedRole, payload?.driver, routePrefix), { replace: true });
        } catch (err) {
            setError(err?.message || 'That code is not correct. Please try again.');
            setSelectedRole(null);
            resetOtp();
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (timer > 0 || loading) return;
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const response = isLoginFlow
                ? await sendDriverLoginOtp({ phone, role })
                : await sendDriverOtp(roleConfirmed ? { phone, role } : { phone });
            const payload = unwrap(response);
            const nextSession = isLoginFlow
                ? saveDriverRegistrationSession({
                    ...session,
                    phone,
                    role,
                    loginMode: true,
                    entryPath,
                    debugOtp: payload?.session?.debugOtp || '',
                    availableRoles: toPlainData(payload?.availableRoles || payload?.session?.availableRoles || session.availableRoles) || [],
                })
                : saveDriverRegistrationSession(
                    buildDriverOnboardingSessionSnapshot(payload, {
                        ...session,
                        phone,
                        role,
                        entryPath,
                    }),
                );

            resetOtp();
            setTimer(RESEND_SECONDS);
            setNotice(IS_DEV_BUILD && nextSession?.debugOtp ? `A new code was sent. Dev OTP: ${nextSession.debugOtp}` : 'A new code was sent.');
        } catch (err) {
            setError(err?.message || 'Could not resend the code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const availableRoles = Array.isArray(session.availableRoles) ? session.availableRoles : [];
    const ContextIcon = flowRole.Icon;
    const verifyEnabled = isComplete && !loading;

    return (
        <AuthShell
            eyebrow={isLoginFlow ? 'Sign in' : 'Create account'}
            title={showRoleSelector ? 'Choose a profile' : 'Enter the code'}
            subtitle={showRoleSelector
                ? 'This number has more than one partner profile. Pick the one you want to open.'
                : `We sent a ${OTP_LENGTH}-digit code to +91 ${phone}.`}
            onBack={showRoleSelector ? () => setShowRoleSelector(false) : () => { requestPhoneFocus(); navigate(entryPath, { state: { phone } }); }}
            backLabel={showRoleSelector ? 'Back to code' : 'Change number'}
        >
            {!showRoleSelector ? (
                <View style={styles.stack}>
                    <View style={[styles.roleChip, { borderColor: flowRole.tint, backgroundColor: flowRole.tint }]}>
                        <ContextIcon size={16} strokeWidth={2.4} color={flowRole.accent} />
                        <Text style={[styles.roleChipText, { color: flowRole.accent }]}>
                            {`${isLoginFlow ? 'Signing in as' : 'Registering as'} ${flowRole.label}`}
                        </Text>
                    </View>

                    {isLoginFlow && existingAccount ? (
                        <View style={styles.infoBox}>
                            <Text style={styles.infoText}>
                                {`We found your ${accountRole.label.toLowerCase()} account, so we are signing you in instead of starting a new registration.`}
                            </Text>
                        </View>
                    ) : null}

                    <Animated.View style={[styles.otpRow, { transform: [{ translateX: shake }] }]}>
                        {otp.map((digit, index) => {
                            const focused = focusedIndex === index;
                            return (
                                <TextInput
                                    key={index}
                                    ref={(element) => { inputs.current[index] = element; }}
                                    keyboardType="number-pad"
                                    inputMode="numeric"
                                    autoComplete={index === 0 ? 'sms-otp' : 'off'}
                                    textContentType={index === 0 ? 'oneTimeCode' : 'none'}
                                    importantForAutofill={index === 0 ? 'yes' : 'no'}
                                    // every box takes a whole pasted code (the web's maxLength 1 boxes got it through onPaste)
                                    maxLength={OTP_LENGTH}
                                    value={digit}
                                    editable={!loading}
                                    selectTextOnFocus
                                    accessibilityLabel={`Digit ${index + 1} of ${OTP_LENGTH}`}
                                    onChangeText={(text) => handleChange(index, text)}
                                    onKeyPress={(event) => handleKeyPress(index, event)}
                                    onFocus={() => setFocusedIndex(index)}
                                    onBlur={() => setFocusedIndex((current) => (current === index ? -1 : current))}
                                    style={[
                                        styles.otpBox,
                                        {
                                            borderColor: error ? '#ef4444' : (digit || focused) ? '#0b1220' : '#e2e8f0',
                                        },
                                        error ? styles.otpRingInvalid : focused ? styles.otpRingFocus : null,
                                    ]}
                                />
                            );
                        })}
                    </Animated.View>

                    {error ? (
                        <View accessibilityRole="alert" style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    {notice && !error ? (
                        <View style={styles.noticeBox}>
                            <Text style={styles.noticeText}>{notice}</Text>
                        </View>
                    ) : null}

                    {devOtp && !notice ? (
                        <Pressable onPress={() => applyDigits(0, devOtp)} style={styles.devBtn}>
                            <Text style={styles.devText}>
                                {'Dev build: code is '}
                                <Text style={styles.devCode}>{devOtp}</Text>
                                {' — tap to fill'}
                            </Text>
                        </Pressable>
                    ) : null}

                    <Pressable
                        onPress={() => handleVerify()}
                        disabled={loading || resolvingSession || !isComplete}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                            styles.verifyBtn,
                            verifyEnabled ? styles.verifyEnabled : styles.verifyDisabled,
                            verifyEnabled && pressed ? styles.verifyPressed : null,
                        ]}
                    >
                        {loading ? (
                            <Spin>
                                <Loader2 size={22} color="#475569" accessibilityLabel="Verifying" />
                            </Spin>
                        ) : (
                            <>
                                <Text style={[styles.verifyText, { color: verifyEnabled ? '#ffffff' : '#475569' }]}>
                                    Verify and continue
                                </Text>
                                <ArrowRight size={20} strokeWidth={2.4} color={verifyEnabled ? '#ffffff' : '#475569'} />
                            </>
                        )}
                    </Pressable>

                    <View style={styles.resendRow}>
                        <Text style={styles.resendLabel}>Did not get the code?</Text>
                        <Pressable
                            onPress={handleResend}
                            disabled={timer > 0 || loading}
                            style={styles.resendBtn}
                            hitSlop={6}
                        >
                            <MessageSquare size={14} color={timer > 0 ? '#64748b' : '#0b1220'} />
                            <Text style={[styles.resendText, timer > 0 ? styles.resendWaiting : styles.resendReady]}>
                                {timer > 0 ? `Resend in ${formatCountdown(timer)}` : 'Resend code'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            ) : (
                <View style={styles.roleList}>
                    {availableRoles.map((roleKey) => {
                        const roleConfig = getDriverRole(roleKey);
                        const RoleIcon = roleConfig.Icon;

                        return (
                            <Pressable
                                key={roleKey}
                                onPress={() => handleRoleSelect(roleKey)}
                                disabled={loading}
                                style={({ pressed }) => [
                                    styles.roleOption,
                                    pressed ? styles.roleOptionPressed : null,
                                    loading ? styles.roleOptionDisabled : null,
                                ]}
                            >
                                <View style={[styles.roleOptionIcon, { backgroundColor: roleConfig.tint }]}>
                                    <RoleIcon size={22} strokeWidth={2.2} color={roleConfig.accent} />
                                </View>
                                <View style={styles.roleOptionText}>
                                    <Text style={styles.roleOptionLabel}>{roleConfig.label}</Text>
                                    <Text style={styles.roleOptionDescription}>{roleConfig.description}</Text>
                                </View>
                                <ChevronRight size={18} color="#64748b" />
                            </Pressable>
                        );
                    })}
                    {error ? (
                        <View accessibilityRole="alert" style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}
                </View>
            )}
        </AuthShell>
    );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one (and every screen sees the current URL and the saved session), so a hidden code screen would
// run its resume logic again after the next step saved the session. It is drawn only while it is in front.
const OTPVerification = () => {
    const focused = useIsFocused();
    return focused ? <OTPVerificationPage /> : null;
};

const styles = StyleSheet.create({
    stack: { gap: 24 },
    roleChip: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 9999,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    roleChipText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
    infoBox: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#fde68a',
        backgroundColor: '#fffbeb',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    infoText: { fontSize: 14, lineHeight: 20, color: '#92400e' },
    otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    // input.dauth-otp
    otpBox: {
        flex: 1,
        minWidth: 0,
        height: 64,
        borderRadius: 16,
        borderWidth: 2,
        backgroundColor: '#ffffff',
        color: '#0b1220',
        fontSize: 30,
        fontWeight: '600',
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    otpRingFocus: { boxShadow: '0px 0px 0px 4px rgba(255, 196, 0, 0.35)' },
    otpRingInvalid: { boxShadow: '0px 0px 0px 4px rgba(239, 68, 68, 0.15)' },
    errorBox: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#fecaca',
        backgroundColor: '#fef2f2',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    errorText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#b91c1c' },
    noticeBox: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#bbf7d0',
        backgroundColor: '#f0fdf4',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    noticeText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#166534' },
    devBtn: {
        width: '100%',
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#cbd5e1',
        paddingHorizontal: 16,
        paddingVertical: 10,
        alignItems: 'center',
    },
    devText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: '#64748b', textAlign: 'center' },
    devCode: { fontWeight: '600', color: '#0b1220' },
    verifyBtn: {
        height: 56,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 16,
    },
    verifyEnabled: {
        backgroundColor: '#0b1220',
        elevation: 8,
        shadowColor: '#0b1220',
        shadowOpacity: 0.7,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 14 },
    },
    verifyDisabled: { backgroundColor: '#cbd5e1' },
    verifyPressed: { transform: [{ scale: 0.99 }] },
    verifyText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
    resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
    resendLabel: { fontSize: 14, lineHeight: 20, color: '#64748b' },
    resendBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    resendText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
    resendWaiting: { color: '#64748b' },
    resendReady: { color: '#0b1220', textDecorationLine: 'underline' },
    roleList: { gap: 12 },
    roleOption: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#e2e8f0',
        backgroundColor: '#ffffff',
        padding: 16,
    },
    roleOptionPressed: { transform: [{ scale: 0.99 }] },
    roleOptionDisabled: { opacity: 0.6 },
    roleOptionIcon: { height: 44, width: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    roleOptionText: { flex: 1, minWidth: 0 },
    roleOptionLabel: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: '#0b1220' },
    roleOptionDescription: { marginTop: 2, fontSize: 12, lineHeight: 16, color: '#64748b' },
});

export default OTPVerification;
