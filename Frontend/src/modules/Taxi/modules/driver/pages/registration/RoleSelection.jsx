import React, { useEffect, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getStoredDriverRegistrationSession,
  saveDriverOnboardingRole,
  saveDriverRegistrationSession,
  startPoolingDriverOnboarding,
} from '../../services/registrationService';
import AuthShell from '../../components/auth/AuthShell';
import RolePicker from '../../components/auth/RolePicker';
import { DEFAULT_DRIVER_ROLE, getRoutePrefixForRole, isDriverRole } from '../../utils/driverRoles';

const unwrap = (response) => response?.data?.data || response?.data || response;

const ROLE_NOTES = {
  bus_driver: 'You will ask for a bus assignment during signup.',
  pooling_driver: 'One more OTP is sent to set up your pooling profile.',
};

// Only reached for a number whose role was not chosen on the login screen (older sessions / deep links).
const RoleSelection = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const session = getStoredDriverRegistrationSession();
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  const registrationId = String(session.registrationId || '').trim();
  const [selectedRole, setSelectedRole] = useState(() => {
    const normalized = String(session.role || '').toLowerCase();
    return isDriverRole(normalized) ? normalized : DEFAULT_DRIVER_ROLE;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!phone || !registrationId) {
      navigate('/taxi/driver/login', { replace: true });
    }
  }, [navigate, phone, registrationId]);

  if (!phone || !registrationId) {
    return null;
  }

  const handleContinue = async () => {
    setLoading(true);
    setError('');

    try {
      if (selectedRole === 'pooling_driver') {
        const response = await startPoolingDriverOnboarding({ phone });
        const payload = unwrap(response);
        const nextSession = saveDriverRegistrationSession({
          ...session,
          phone,
          role: 'pooling_driver',
          roleConfirmed: true,
          needsRoleSelection: false,
          loginMode: false,
          poolingOnboarding: true,
          registrationId: payload?.session?.registrationId || '',
          debugOtp: payload?.session?.debugOtp || '',
          status: payload?.session?.status || 'otp_sent',
          otpVerified: false,
          entryPath: '/taxi/driver/login',
        });

        navigate('/taxi/driver/otp-verify', { replace: true, state: nextSession });
        return;
      }

      const response = await saveDriverOnboardingRole({
        registrationId,
        phone,
        role: selectedRole,
      });
      const payload = unwrap(response);
      const nextSession = saveDriverRegistrationSession({
        ...session,
        role: selectedRole,
        roleConfirmed: payload?.session?.roleConfirmed ?? true,
        needsRoleSelection: false,
        status: payload?.session?.status || session.status || 'otp_verified',
      });

      navigate(`${getRoutePrefixForRole(selectedRole)}/step-personal`, {
        replace: true,
        state: nextSession,
      });
    } catch (requestError) {
      setError(requestError?.message || 'Unable to continue with this role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Step 1 of 4"
      title="Choose your role"
      subtitle={`This number is new. Pick the profile we should create for +91 ${phone}.`}
      onBack={() => navigate(`${routePrefix}/login`, { replace: true, state: { phone: session.phone } })}
      backLabel="Change number"
    >
      <div className="space-y-6">
        <RolePicker
          variant="list"
          value={selectedRole}
          onChange={(nextRole) => {
            setSelectedRole(nextRole);
            setError('');
          }}
          disabled={loading}
        />

        {ROLE_NOTES[selectedRole] && (
          <p className="rounded-xl bg-[#f1f5f9] px-4 py-3 text-sm leading-5 text-[#475569]">{ROLE_NOTES[selectedRole]}</p>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-medium leading-5 text-[#b91c1c]">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleContinue}
          disabled={loading}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#0b1220] text-base font-semibold text-[#ffffff] shadow-[0_14px_28px_-14px_rgba(11,18,32,0.7)] transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <Loader2 size={22} className="animate-spin" aria-label="Saving" />
          ) : (
            <>
              Continue
              <ArrowRight size={20} strokeWidth={2.4} />
            </>
          )}
        </button>
      </div>
    </AuthShell>
  );
};

export default RoleSelection;
