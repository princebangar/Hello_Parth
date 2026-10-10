import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  buildDriverOnboardingSessionSnapshot,
  clearDriverRegistrationSession,
  getDriverOnboardingResumeStep,
  getDriverOnboardingSession,
  getStoredDriverRegistrationSession,
  saveDriverRegistrationSession,
  sendDriverLoginOtp,
  sendDriverOtp,
  startPoolingDriverOnboarding,
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

const getErrorStatus = (err) => Number(err?.status || err?.response?.status || 0);

const PhoneRegistration = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Terms / Privacy / Support load in the background so tapping one opens it straight away.
  useEffect(() => prefetchPolicyContentWhenIdle('driver'), []);
  // back from the code screen with "Change number": cursor into the number box (never on a plain visit / after logout)
  usePhoneFocusRequest(() => document.getElementById('partner-phone'), true);

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

  // Pooling partners have their own onboarding API: sign an existing pooling account in, and only when
  // this number has none yet start the pooling onboarding (which sends its own OTP).
  const startPoolingFlow = async (baseSession) => {
    try {
      const response = await sendDriverLoginOtp({ phone, role: 'pooling_driver' });
      const payload = unwrap(response);
      const sessionData = payload?.session || {};

      return saveDriverRegistrationSession({
        ...baseSession,
        loginMode: true,
        existingAccount: true,
        detectedRole: 'pooling_driver',
        poolingOnboarding: false,
        debugOtp: sessionData.debugOtp || '',
        status: sessionData.status || 'otp_sent',
        availableRoles: toPlainData(payload?.availableRoles || sessionData.availableRoles) || [],
      });
    } catch (loginError) {
      if (getErrorStatus(loginError) !== 404) {
        throw loginError;
      }
    }

    const response = await startPoolingDriverOnboarding({ phone });
    const payload = unwrap(response);

    return saveDriverRegistrationSession({
      ...baseSession,
      loginMode: false,
      existingAccount: false,
      detectedRole: 'pooling_driver',
      poolingOnboarding: true,
      registrationId: payload?.session?.registrationId || '',
      debugOtp: payload?.session?.debugOtp || '',
      status: payload?.session?.status || 'otp_sent',
      otpVerified: false,
    });
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
      poolingOnboarding: false,
      status: sessionData.status || '',
      availableRoles: toPlainData(payload?.availableRoles || sessionData.availableRoles) || [],
    });
  };

  const handleSendOTP = async (event) => {
    event?.preventDefault?.();

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
      const nextState = role === 'pooling_driver'
        ? await startPoolingFlow(baseSession)
        : await startStandardFlow(baseSession);

      navigate(`${getRoutePrefixForRole(role)}/otp-verify`, { state: nextState });
    } catch (requestError) {
      setError(getErrorMessage(requestError) || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Partner app"
      title={isLoginPage ? 'Welcome back' : 'Join as a partner'}
      subtitle="Choose your role, then verify your mobile number."
    >
      <form onSubmit={handleSendOTP} noValidate className="space-y-6">
        <div>
          <p className="mb-2.5 text-sm font-semibold text-[#0b1220]">I am a</p>
          <RolePicker
            value={role}
            onChange={handleRoleChange}
            disabled={loading}
            label="I am a"
          />
        </div>

        <div>
          <label htmlFor="partner-phone" className="mb-2.5 block text-sm font-semibold text-[#0b1220]">
            Mobile number
          </label>
          <div
            className={`flex h-14 items-center gap-3 rounded-2xl border-2 bg-[#ffffff] px-4 transition-colors focus-within:border-[#0b1220] ${
              error ? 'border-[#fca5a5]' : 'border-[#e2e8f0]'
            }`}
          >
            <span className="border-r border-[#e2e8f0] pr-3 text-[15px] font-semibold text-[#334155]">+91</span>
            <input
              id="partner-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value.replace(/\D/g, '').slice(0, 10));
                if (error) setError('');
              }}
              placeholder="10-digit mobile number"
              aria-invalid={Boolean(error)}
              className="dauth-bare h-full min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-wide text-[#0b1220] placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-[#64748b]"
            />
            {phone.length === 10 && <CheckCircle2 size={20} className="shrink-0 text-[#059669]" aria-hidden="true" />}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#64748b]">
            We will text a 4-digit code. Already a {selectedRole.label.toLowerCase()}? You are signed in. New? Registration starts right after.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-medium leading-5 text-[#b91c1c]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-all ${
            canSubmit
              ? 'bg-[#0b1220] text-[#ffffff] shadow-[0_14px_28px_-14px_rgba(11,18,32,0.7)] active:scale-[0.99]'
              : 'cursor-not-allowed bg-[#cbd5e1] text-[#475569]'
          }`}
        >
          {loading ? (
            <Loader2 size={22} className="animate-spin" aria-label="Sending code" />
          ) : (
            <>
              Continue
              <ArrowRight size={20} strokeWidth={2.4} />
            </>
          )}
        </button>

        {/* Taxi forces Outfit on everything (!important), so Poppins needs the important modifier here. */}
        <p className="mx-auto max-w-[320px] text-center text-[11px] font-medium leading-relaxed text-gray-400/80 !font-['Poppins']">
          By continuing, you agree to our <br />
          <button
            type="button"
            onClick={() => navigate(`${routePrefix}/legal/terms`)}
            className="font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-[#0b1220] !font-['Poppins']"
          >
            TERMS
          </button>
          <span className="mx-2 font-bold text-gray-400/80">•</span>
          <button
            type="button"
            onClick={() => navigate(`${routePrefix}/legal/privacy`)}
            className="font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-[#0b1220] !font-['Poppins']"
          >
            PRIVACY
          </button>
          <span className="mx-2 font-bold text-gray-400/80">•</span>
          <button
            type="button"
            onClick={() => navigate(`${routePrefix}/legal/support`)}
            className="font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:text-[#0b1220] !font-['Poppins']"
          >
            SUPPORT
          </button>
        </p>
      </form>
    </AuthShell>
  );
};

export default PhoneRegistration;
