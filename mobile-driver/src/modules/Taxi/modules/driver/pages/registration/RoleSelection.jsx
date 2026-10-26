// Web: pages/registration/RoleSelection.jsx — /taxi/driver/select-role, /taxi/owner/select-role. Only reached for a
// number whose role was not chosen on the login screen (older sessions / deep links): PATCH /drivers/onboarding/role
// { registrationId, phone, role } -> <role prefix>/step-personal. No registration session -> /taxi/driver/login.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { ArrowRight, Loader2 } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import {
  getStoredDriverRegistrationSession,
  saveDriverOnboardingRole,
  saveDriverRegistrationSession,
} from '../../services/registrationService';
import AuthShell from '../../components/auth/AuthShell';
import RolePicker from '../../components/auth/RolePicker';
import { DEFAULT_DRIVER_ROLE, getRoutePrefixForRole, isDriverRole } from '../../utils/driverRoles';

const unwrap = (response) => response?.data?.data || response?.data || response;

const ROLE_NOTES = {
  bus_driver: 'You will ask for a bus assignment during signup.',
};

// Only reached for a number whose role was not chosen on the login screen (older sessions / deep links).
const RoleSelectionPage = () => {
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

  // RolePicker keeps the web's prop names (value / onChange)
  const rolePickerProps = {
    variant: 'list',
    value: selectedRole,
    onChange: (nextRole) => {
      setSelectedRole(nextRole);
      setError('');
    },
    disabled: loading,
  };

  return (
    <AuthShell
      eyebrow="Step 1 of 4"
      title="Choose your role"
      subtitle={`This number is new. Pick the profile we should create for +91 ${phone}.`}
      onBack={() => navigate(`${routePrefix}/login`, { replace: true, state: { phone: session.phone } })}
      backLabel="Change number"
    >
      <View style={styles.stack}>
        <RolePicker {...rolePickerProps} />

        {ROLE_NOTES[selectedRole] ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{ROLE_NOTES[selectedRole]}</Text>
          </View>
        ) : null}

        {error ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleContinue}
          disabled={loading}
          accessibilityRole="button"
          style={({ pressed }) => [styles.continueBtn, loading ? styles.continueDisabled : null, pressed ? styles.continuePressed : null]}
        >
          {loading ? (
            <Spin>
              <Loader2 size={22} color="#ffffff" accessibilityLabel="Saving" />
            </Spin>
          ) : (
            <>
              <Text style={styles.continueText}>Continue</Text>
              <ArrowRight size={20} strokeWidth={2.4} color="#ffffff" />
            </>
          )}
        </Pressable>
      </View>
    </AuthShell>
  );
};

// Web: the page unmounted when another page opened on top and mounted again on Back. A stack screen stays mounted
// under the next one (and every screen sees the current URL), so this page is drawn only while it is in front.
const RoleSelection = () => {
  const focused = useIsFocused();
  return focused ? <RoleSelectionPage /> : null;
};

const styles = StyleSheet.create({
  stack: { gap: 24 },
  noteBox: { borderRadius: 14, backgroundColor: '#f1f5f9', paddingHorizontal: 16, paddingVertical: 12 },
  noteText: { fontSize: 14, lineHeight: 20, color: '#475569' },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#b91c1c' },
  continueBtn: {
    height: 56,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: '#0b1220',
    elevation: 8,
    shadowColor: '#0b1220',
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 14 },
  },
  continueDisabled: { opacity: 0.7 },
  continuePressed: { transform: [{ scale: 0.99 }] },
  continueText: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: '#ffffff' },
});

export default RoleSelection;
