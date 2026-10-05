import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, ChevronRight, Loader2, MessageSquare } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    buildDriverOnboardingSessionSnapshot,
    getDriverOnboardingResumeStep,
    getDriverOnboardingSession,
    getStoredDriverRegistrationSession,
    clearDriverRegistrationSession,
    getPoolingDriverOnboardingSession,
    persistDriverAuthSession,
    saveDriverRegistrationSession,
    sendDriverLoginOtp,
    sendDriverOtp,
    startPoolingDriverOnboarding,
    toPlainData,
    verifyDriverLoginOtp,
    verifyDriverOtp,
    verifyPoolingDriverOnboardingOtp,
} from '../../services/registrationService';
import AuthShell from '../../components/auth/AuthShell';
import { getDriverRole, normalizeDriverRole } from '../../utils/driverRoles';

const OTP_LENGTH = 4;
const RESEND_SECONDS = 60;

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
    if (normalizedRole === 'pooling_driver') return '/taxi/driver/pooling';
    if (normalizedRole === 'owner' || normalizedRole === 'driver') {
        return isDriverApproved(driver)
            ? normalizedRole === 'owner' ? '/taxi/owner/home' : '/taxi/driver/home'
            : `${routePrefix}/registration-status`;
    }
    return '/taxi/driver/home';
};

const syncPushTokens = async () => {
    await Promise.allSettled([
        window.__flushNativeFcmToken?.(),
        window.__registerBrowserFcmToken?.({ interactive: true }),
    ]);
};

const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const OTPVerification = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [otp, setOtp] = useState(() => Array(OTP_LENGTH).fill(''));
    const inputs = useRef([]);
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
    const isPoolingOnboardingFlow = Boolean(session.poolingOnboarding);
    const existingAccount = Boolean(session.existingAccount);
    const accountRole = getDriverRole(session.detectedRole || role);
    const flowRole = getDriverRole(role);
    const entryPath = String(session.entryPath || (isLoginFlow ? `${routePrefix}/login` : `${routePrefix}/reg-phone`));
    const otpCode = otp.join('');
    const isComplete = otpCode.length === OTP_LENGTH;
    const devOtp = import.meta.env.DEV ? String(session.debugOtp || '').trim() : '';
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
                if (isPoolingOnboardingFlow) {
                    navigate('/taxi/driver/pooling/onboarding', {
                        replace: true,
                    });
                    return;
                }
                const nextStep = getDriverOnboardingResumeStep(session);
                navigate(`${routePrefix}/${nextStep}`, {
                    replace: true,
                    state: saveDriverRegistrationSession(session),
                });
                return;
            }

            setResolvingSession(true);
            try {
                const response = isPoolingOnboardingFlow
                    ? await getPoolingDriverOnboardingSession({ registrationId, phone })
                    : await getDriverOnboardingSession({ registrationId, phone });
                const payload = unwrap(response);
                const nextSession = isPoolingOnboardingFlow
                    ? saveDriverRegistrationSession({
                        ...session,
                        registrationId: payload?.session?.registrationId || session.registrationId,
                        phone: payload?.session?.phone || session.phone,
                        role: payload?.session?.role || session.role,
                        status: payload?.session?.status || session.status,
                        otpVerified: Boolean(payload?.session?.otpVerified),
                        fullName: payload?.personal?.fullName || session.fullName || '',
                    })
                    : saveDriverRegistrationSession(
                        buildDriverOnboardingSessionSnapshot(payload, session),
                    );

                if (!active || !nextSession.otpVerified) {
                    return;
                }

                if (isPoolingOnboardingFlow) {
                    navigate('/taxi/driver/pooling/onboarding', {
                        replace: true,
                    });
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
    }, [isLoginFlow, isPoolingOnboardingFlow, navigate, phone, registrationId, routePrefix, sessionResumeKey]);

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
        const focusTimer = window.setTimeout(() => {
            inputs.current[0]?.focus();
        }, 300);
        return () => window.clearTimeout(focusTimer);
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

    const resetOtp = () => {
        setOtp(Array(OTP_LENGTH).fill(''));
        refocusRef.current = true;
    };

    const applyDigits = (startIndex, rawValue) => {
        const digits = String(rawValue || '').replace(/\D/g, '');
        if (!digits) return;

        const next = [...otp];
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
            handleVerify(next.join(''));
        } else {
            inputs.current[Math.min(cursor, OTP_LENGTH - 1)]?.focus();
        }
    };

    const handleChange = (index, value) => {
        if (value === '') {
            const next = [...otp];
            next[index] = '';
            setOtp(next);
            setError('');
            return;
        }
        // Typing over a filled first box arrives as "<old><new>"; a pasted / auto-filled code arrives whole.
        const typedOverExisting = value.length === 2 && otp[index] && value.startsWith(otp[index]);
        applyDigits(index, typedOverExisting ? value.slice(-1) : value.slice(0, OTP_LENGTH));
    };

    const handleKeyDown = (index, event) => {
        if (event.key === 'Backspace' && !otp[index] && index > 0) {
            inputs.current[index - 1]?.focus();
        } else if (event.key === 'ArrowLeft' && index > 0) {
            inputs.current[index - 1]?.focus();
        } else if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
            inputs.current[index + 1]?.focus();
        }
    };

    const handlePaste = (event) => {
        const pasted = event.clipboardData?.getData('text') || '';
        if (!/\d/.test(pasted)) return;
        event.preventDefault();
        applyDigits(0, pasted);
    };

    const handleVerify = async (otpOverride) => {
        const code = typeof otpOverride === 'string' ? otpOverride : otpCode;
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

            if (isPoolingOnboardingFlow) {
                await verifyPoolingDriverOnboardingOtp({ registrationId, phone, otp: code });
                saveDriverRegistrationSession({
                    ...session,
                    otpVerified: true,
                    status: 'otp_verified',
                });
                navigate('/taxi/driver/pooling/onboarding');
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
            const response = await verifyDriverLoginOtp({ phone, otp: otpCode, role: chosenRole });
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
                : isPoolingOnboardingFlow
                    ? await startPoolingDriverOnboarding({ phone })
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
                : isPoolingOnboardingFlow
                    ? saveDriverRegistrationSession({
                        ...session,
                        phone,
                        role,
                        loginMode: false,
                        poolingOnboarding: true,
                        registrationId: payload?.session?.registrationId || session.registrationId || '',
                        debugOtp: payload?.session?.debugOtp || '',
                        status: payload?.session?.status || 'otp_sent',
                        entryPath,
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
            setNotice(import.meta.env.DEV && nextSession?.debugOtp ? `A new code was sent. Dev OTP: ${nextSession.debugOtp}` : 'A new code was sent.');
        } catch (err) {
            setError(err?.message || 'Could not resend the code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const availableRoles = Array.isArray(session.availableRoles) ? session.availableRoles : [];
    const ContextIcon = flowRole.Icon;

    return (
        <AuthShell
            eyebrow={isLoginFlow ? 'Sign in' : 'Create account'}
            title={showRoleSelector ? 'Choose a profile' : 'Enter the code'}
            subtitle={showRoleSelector
                ? 'This number has more than one partner profile. Pick the one you want to open.'
                : `We sent a ${OTP_LENGTH}-digit code to +91 ${phone}.`}
            onBack={showRoleSelector ? () => setShowRoleSelector(false) : () => navigate(entryPath, { state: { phone } })}
            backLabel={showRoleSelector ? 'Back to code' : 'Change number'}
        >
            {!showRoleSelector ? (
                <div className="space-y-6">
                    <div
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold"
                        style={{ borderColor: flowRole.tint, backgroundColor: flowRole.tint, color: flowRole.accent }}
                    >
                        <ContextIcon size={16} strokeWidth={2.4} />
                        {isLoginFlow ? 'Signing in as' : 'Registering as'} {flowRole.label}
                    </div>

                    {isLoginFlow && existingAccount && (
                        <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm leading-5 text-[#92400e]">
                            We found your {accountRole.label.toLowerCase()} account, so we are signing you in instead of starting a new registration.
                        </div>
                    )}

                    <div
                        className={`flex justify-between gap-3 ${error ? 'dauth-shake' : ''}`}
                        onPaste={handlePaste}
                    >
                        {otp.map((digit, index) => (
                            <input
                                key={index}
                                ref={(element) => { inputs.current[index] = element; }}
                                type="tel"
                                inputMode="numeric"
                                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                                maxLength={index === 0 ? OTP_LENGTH : 1}
                                value={digit}
                                disabled={loading}
                                aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                                data-filled={digit ? 'true' : 'false'}
                                data-invalid={error ? 'true' : 'false'}
                                onChange={(event) => handleChange(index, event.target.value)}
                                onKeyDown={(event) => handleKeyDown(index, event)}
                                onFocus={(event) => event.target.select()}
                                className="dauth-otp h-16 min-w-0 flex-1 text-center text-3xl font-semibold"
                            />
                        ))}
                    </div>

                    {error && (
                        <div role="alert" className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-medium leading-5 text-[#b91c1c]">
                            {error}
                        </div>
                    )}

                    {notice && !error && (
                        <div role="status" className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm font-medium leading-5 text-[#166534]">
                            {notice}
                        </div>
                    )}

                    {devOtp && !notice && (
                        <button
                            type="button"
                            onClick={() => applyDigits(0, devOtp)}
                            className="w-full rounded-xl border border-dashed border-[#cbd5e1] px-4 py-2.5 text-xs font-medium text-[#64748b]"
                        >
                            Dev build: code is <span className="font-semibold text-[#0b1220]">{devOtp}</span> — tap to fill
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => handleVerify()}
                        disabled={loading || resolvingSession || !isComplete}
                        className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-all ${
                            isComplete && !loading
                                ? 'bg-[#0b1220] text-[#ffffff] shadow-[0_14px_28px_-14px_rgba(11,18,32,0.7)] active:scale-[0.99]'
                                : 'cursor-not-allowed bg-[#cbd5e1] text-[#475569]'
                        }`}
                    >
                        {loading ? (
                            <Loader2 size={22} className="animate-spin" aria-label="Verifying" />
                        ) : (
                            <>
                                Verify and continue
                                <ArrowRight size={20} strokeWidth={2.4} />
                            </>
                        )}
                    </button>

                    <div className="flex items-center justify-center gap-2 text-sm text-[#64748b]">
                        <span>Did not get the code?</span>
                        <button
                            type="button"
                            onClick={handleResend}
                            disabled={timer > 0 || loading}
                            className={`inline-flex items-center gap-1.5 font-semibold ${
                                timer > 0 ? 'cursor-not-allowed text-[#64748b]' : 'text-[#0b1220] underline underline-offset-2'
                            }`}
                        >
                            <MessageSquare size={14} />
                            {timer > 0 ? `Resend in ${formatCountdown(timer)}` : 'Resend code'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {availableRoles.map((roleKey) => {
                        const roleConfig = getDriverRole(roleKey);
                        const RoleIcon = roleConfig.Icon;

                        return (
                            <button
                                key={roleKey}
                                type="button"
                                onClick={() => handleRoleSelect(roleKey)}
                                disabled={loading}
                                className="flex w-full items-center gap-4 rounded-2xl border-2 border-[#e2e8f0] bg-[#ffffff] p-4 text-left transition-all hover:border-[#cbd5e1] active:scale-[0.99] disabled:opacity-60"
                            >
                                <span
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                                    style={{ backgroundColor: roleConfig.tint, color: roleConfig.accent }}
                                >
                                    <RoleIcon size={22} strokeWidth={2.2} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-semibold text-[#0b1220]">{roleConfig.label}</span>
                                    <span className="mt-0.5 block text-xs text-[#64748b]">{roleConfig.description}</span>
                                </span>
                                <ChevronRight size={18} className="shrink-0 text-[#64748b]" />
                            </button>
                        );
                    })}
                    {error && (
                        <div role="alert" className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-medium leading-5 text-[#b91c1c]">
                            {error}
                        </div>
                    )}
                </div>
            )}
        </AuthShell>
    );
};

export default OTPVerification;
