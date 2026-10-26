// Web: DriverLayout.jsx — the driver / owner portal shell (<Route path="driver|owner" element={<DriverLayout />}>):
// the session / approval guard (GET /drivers/me), the "Can't reach the server" screen, the floating bottom bar on the
// main screens and the ride-request listener (popup + alert sound) for taxi drivers.
// Native: `children` is the Expo Router Stack of /taxi/driver or /taxi/owner. The Stack stays mounted at all times (a
// layout must keep its navigator); the checking spinner and the connection-error screen cover it instead of replacing it.
// The bottom-bar tabs are drawn by DriverTabKeepAlive above the Stack (their route files render nothing).
// The web's useScrollFocusedFieldIntoView (keep the focused field above the keyboard) is the window resize on Android
// (softwareKeyboardLayoutMode "resize") plus each form's keyboardShouldPersistTaps / KeyboardAvoidingView.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useLocationNow, useNavigate } from '@/lib/router';
import { Text } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { driverTheme, fonts } from '@/theme';
import {
    clearDriverAuthState,
    getAuthenticatedDriverRole,
    getCurrentDriver,
    getLocalDriverToken,
    getStoredDriverRole,
} from '../services/registrationService';
import DriverRideRequestListener from './DriverRideRequestListener';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import DriverTabKeepAlive from './DriverTabKeepAlive';
import { stopOnlineLocationUpdates } from '@/lib/driverLocation';

const unwrapDriver = (response) => response?.data?.data || response?.data || response;
const getPortalPrefix = (pathname = '', role = '') => {
    if (pathname.startsWith('/taxi/owner')) {
        return '/taxi/owner';
    }

    return String(role || '').toLowerCase() === 'owner' ? '/taxi/owner' : '/taxi/driver';
};

const isDriverApproved = (driver) => {
    if (!driver) {
        return false;
    }

    const approval = String(driver.approve ?? '').toLowerCase();
    const status = String(driver.status || '').toLowerCase();

    return (
        driver.approve === true ||
        driver.approve === 1 ||
        ['true', '1', 'yes', 'approved'].includes(approval) ||
        ['approved', 'active', 'verified'].includes(status)
    );
};

const onboardingRoutes = new Set([
    '/taxi/driver/lang-select',
    '/taxi/driver/welcome',
    '/taxi/driver/login',
    '/taxi/driver/terms',
    '/taxi/driver/privacy',
    '/taxi/driver/support',
    '/taxi/driver/reg-phone',
    '/taxi/driver/otp-verify',
    '/taxi/driver/select-role',
    '/taxi/driver/step-personal',
    '/taxi/driver/step-referral',
    '/taxi/driver/step-vehicle',
    '/taxi/driver/step-documents',
    '/taxi/driver/role-signup',
    '/taxi/driver/registration-status',
    '/taxi/driver/status',
    '/taxi/owner/lang-select',
    '/taxi/owner/login',
    '/taxi/owner/terms',
    '/taxi/owner/privacy',
    '/taxi/owner/support',
    '/taxi/owner/reg-phone',
    '/taxi/owner/otp-verify',
    '/taxi/owner/select-role',
    '/taxi/owner/step-personal',
    '/taxi/owner/step-referral',
    '/taxi/owner/step-vehicle',
    '/taxi/owner/step-documents',
    '/taxi/owner/role-signup',
    '/taxi/owner/registration-status',
    '/taxi/owner/status',
]);

// Terms / Privacy / Support linked from the login screen must open without a
// session (they bounced straight back to login before).
export const isOnboardingRoute = (pathname = '') =>
    onboardingRoutes.has(pathname) ||
    /^\/taxi\/(driver|owner)\/legal\/(terms|privacy|support)$/.test(pathname) ||
    pathname.startsWith('/taxi/driver/role-signup/bus-builder');

// Screens that carry the floating bottom bar. It lives here (not in each page) so it stays mounted while the
// pages change and the active pill can slide from tab to tab.
const BOTTOM_NAV_PATH = new RegExp(
    '^/taxi/driver/(home|dashboard|history|wallet|incentives|profile|vehicle-fleet(/.*)?)$'
    + '|^/taxi/owner/(home|dashboard|history|wallet|profile|manage-drivers|vehicle-fleet(/.*)?|bus-service(/.*)?|bus-bookings)$',
);

// A token that already passed /drivers/me (approved): a cold start opens the screen straight away and the check runs
// in the background.
const VERIFIED_SESSION_KEY = 'driver_verified_session';
const tokenTag = (token) => String(token || '').slice(-32);
const isVerifiedSession = (token) => {
    try {
        return Boolean(token) && localStorage.getItem(VERIFIED_SESSION_KEY) === tokenTag(token);
    } catch {
        return false;
    }
};
const rememberVerifiedSession = (token) => {
    try {
        localStorage.setItem(VERIFIED_SESSION_KEY, tokenTag(token));
    } catch {
        // storage unavailable: the next start just checks again
    }
};
const forgetVerifiedSession = () => {
    try {
        localStorage.removeItem(VERIFIED_SESSION_KEY);
    } catch {
        // ignore
    }
};

const softEntryRoutes = new Set([
    '/taxi/driver/welcome',
    '/taxi/driver/login',
    '/taxi/driver/reg-phone',
    '/taxi/owner/login',
    '/taxi/owner/reg-phone',
]);

const redirectToDriverLogin = (navigate) => {
    navigate('/taxi/driver/login', { replace: true });
};

const getStoredRole = () => String(getStoredDriverRole() || 'driver').toLowerCase();
const getAuthenticatedRole = () => String(getAuthenticatedDriverRole() || 'driver').toLowerCase();

const getAuthenticatedDriverHome = (pathname = '', role = '') => {
    const activeRole = String(role || getAuthenticatedRole() || 'driver').toLowerCase();
    return activeRole === 'owner'
        ? `${getPortalPrefix(pathname, 'owner')}/dashboard`
        : activeRole === 'bus_driver'
            ? '/taxi/driver/bus-home'
            : '/taxi/driver/home';
};

const getPendingDriverRoute = (pathname = '') => `${getPortalPrefix(pathname)}/registration-status`;
const isBusConsoleRoute = (pathname = '') => pathname.startsWith('/taxi/driver/bus-home');
// Pooling is switched off until the new pooling flow is built: an old pooling-driver session is signed out.
const isRetiredPoolingRole = (role = '') => String(role || '').toLowerCase() === 'pooling_driver';
const isPendingAllowedRoute = (pathname = '') =>
    [
        '/taxi/driver/documents',
        '/taxi/owner/documents',
        '/taxi/driver/support',
        '/taxi/owner/support',
        '/taxi/driver/help-support',
        '/taxi/owner/help-support',
        '/taxi/driver/support/chat',
        '/taxi/owner/support/chat',
        '/taxi/driver/support/tickets',
        '/taxi/owner/support/tickets',
    ].includes(pathname);

const DriverLayout = ({ children }) => {
    // the layout itself must follow every navigation in the same render (guards, tab layer, bottom bar)
    const location = useLocationNow();
    const navigate = useNavigate();
    const pathname = location.pathname.replace(/\/+$/, '') || location.pathname;
    // A check that has to finish before the screen may show starts in the checking state (no page drawn first).
    const [isChecking, setIsChecking] = useState(() => {
        const token = getLocalDriverToken();
        return Boolean(token) && !isOnboardingRoute(pathname) && !isVerifiedSession(token);
    });
    const [isAllowed, setIsAllowed] = useState(true);
    // Server unreachable / 5xx while verifying the driver — must NOT be shown as "pending approval".
    const [connectionError, setConnectionError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const verifiedTokenRef = useRef('');
    const verifiedApprovalRef = useRef(false);

    useEffect(() => {
        const currentPath = pathname;
        const onboardingState = location.state || {};
        const token = getLocalDriverToken();
        const authenticatedHome = getAuthenticatedDriverHome(currentPath);
        const authenticatedRole = getAuthenticatedRole();
        const shouldVerifyOnboardingRoute =
            Boolean(token)
            && (
                softEntryRoutes.has(currentPath)
                || (
                    (currentPath === '/taxi/driver/lang-select' || currentPath === '/taxi/owner/lang-select')
                    && !onboardingState.registrationFlow
                    && !onboardingState.allowAuthenticated
                )
            );

        if (isOnboardingRoute(currentPath) && !shouldVerifyOnboardingRoute) {
            setIsAllowed(true);
            setIsChecking(false);
            return;
        }

        if (!token) {
            setIsAllowed(false);
            verifiedTokenRef.current = '';
            verifiedApprovalRef.current = false;
            redirectToDriverLogin(navigate);
            return;
        }

        if (isBusConsoleRoute(currentPath) && authenticatedRole !== 'bus_driver') {
            setIsAllowed(false);
            navigate(authenticatedHome, { replace: true });
            return;
        }

        if (isRetiredPoolingRole(authenticatedRole)) {
            setIsAllowed(false);
            clearDriverAuthState();
            redirectToDriverLogin(navigate);
            return;
        }

        if (verifiedTokenRef.current === token && verifiedApprovalRef.current && isAllowed) {
            setIsChecking(false);
            return;
        }

        // Approved before with this very token: show the screen now and re-check quietly.
        const background = isVerifiedSession(token);
        if (background) {
            verifiedTokenRef.current = token;
            verifiedApprovalRef.current = true;
            setIsAllowed(true);
            setIsChecking(false);
        }

        let active = true;

        const verifyDriver = async () => {
            if (!background) {
                setIsChecking(true);
            }
            setConnectionError(false);

            try {
                const response = await getCurrentDriver();
                const driver = unwrapDriver(response);
                const isApproved = isDriverApproved(driver);
                const effectiveRole = String(driver?.role || driver?.onboarding?.role || authenticatedRole || '').toLowerCase();

                if (!active) {
                    return;
                }

                if (isRetiredPoolingRole(effectiveRole)) {
                    forgetVerifiedSession();
                    setIsAllowed(false);
                    clearDriverAuthState();
                    redirectToDriverLogin(navigate);
                    return;
                }

                if (!isApproved) {
                    forgetVerifiedSession();
                    // Login / welcome must stay reachable for an unapproved account, otherwise the
                    // person is trapped on the pending screen and can never sign in with another number.
                    if (isPendingAllowedRoute(currentPath) || softEntryRoutes.has(currentPath)) {
                        setIsAllowed(true);
                        verifiedTokenRef.current = '';
                        verifiedApprovalRef.current = false;
                        setIsChecking(false);
                        return;
                    }

                    setIsAllowed(false);
                    verifiedTokenRef.current = '';
                    verifiedApprovalRef.current = false;
                    navigate(getPendingDriverRoute(currentPath), { replace: true });
                    return;
                }

                setIsAllowed(true);
                verifiedTokenRef.current = token;
                verifiedApprovalRef.current = true;
                rememberVerifiedSession(token);

                if (isBusConsoleRoute(currentPath) && effectiveRole !== 'bus_driver') {
                    navigate(getAuthenticatedDriverHome(currentPath, effectiveRole), { replace: true });
                    return;
                }

                const isDriverConsoleRoute =
                    currentPath.startsWith('/taxi/driver') &&
                    !isBusConsoleRoute(currentPath) &&
                    !isOnboardingRoute(currentPath);

                if (isDriverConsoleRoute && effectiveRole !== 'driver') {
                    navigate(getAuthenticatedDriverHome(currentPath, effectiveRole), { replace: true });
                    return;
                }

                if (currentPath.startsWith('/taxi/owner') && effectiveRole !== 'owner' && !isOnboardingRoute(currentPath)) {
                    navigate(getAuthenticatedDriverHome(currentPath, effectiveRole), { replace: true });
                    return;
                }

                if (softEntryRoutes.has(currentPath)) {
                    navigate(authenticatedHome, { replace: true });
                    return;
                }

                if (
                    (currentPath === '/taxi/driver/lang-select' || currentPath === '/taxi/owner/lang-select')
                    && !onboardingState.registrationFlow
                    && !onboardingState.allowAuthenticated
                ) {
                    navigate(authenticatedHome, { replace: true });
                }
            } catch (error) {
                if (!active) {
                    return;
                }

                const status = error?.status;
                if (background && status !== 401 && status !== 403 && status !== 404) {
                    // offline / server hiccup during the quiet re-check: keep the screen the driver already has
                    return;
                }
                forgetVerifiedSession();

                setIsAllowed(false);
                verifiedTokenRef.current = '';
                verifiedApprovalRef.current = false;

                if (error?.status === 401 || error?.status === 404) {
                    // Token is stale or the account is gone — forget it so the login page can open.
                    clearDriverAuthState();
                    redirectToDriverLogin(navigate);
                    return;
                }

                if (error?.status === 403) {
                    // 403 on /drivers/me is either a real pending/inactive account or a token that
                    // belongs to another portal (e.g. a customer). Only the former is "pending".
                    if (/pending|inactive/i.test(String(error?.message || ''))) {
                        navigate(getPendingDriverRoute(currentPath), { replace: true });
                    } else {
                        redirectToDriverLogin(navigate);
                    }
                    return;
                }

                // No status = network error / server down; 5xx = backend problem. The account state
                // is unknown, so show a retry screen instead of claiming "pending approval".
                setConnectionError(true);
            } finally {
                if (active) {
                    setIsChecking(false);
                }
            }
        };

        verifyDriver();

        return () => {
            active = false;
        };
    }, [isAllowed, pathname, location.state, navigate, retryKey]);

    const signedIn = Boolean(getLocalDriverToken());

    // Signed out (no token any more): the "You are online" location service must not keep running.
    useEffect(() => {
        if (!signedIn) stopOnlineLocationUpdates();
    }, [signedIn]);

    const handleSignOut = () => {
        clearDriverAuthState();
        setConnectionError(false);
        navigate('/taxi/driver/login', { replace: true });
    };

    const onboarding = isOnboardingRoute(pathname);
    const showConnectionError = connectionError && !onboarding;
    const showChecking = !showConnectionError && isChecking && !onboarding;
    const ready = !showConnectionError && !showChecking;

    return (
        <View style={styles.root}>
            {children}
            {ready && isAllowed ? <DriverTabKeepAlive signedIn={signedIn} /> : null}
            {ready && isAllowed && BOTTOM_NAV_PATH.test(pathname) ? <DriverBottomNav /> : null}
            {ready && isAllowed && getStoredRole() === 'driver' ? <DriverRideRequestListener /> : null}

            {showChecking ? (
                <View style={[StyleSheet.absoluteFill, styles.center, styles.white]}>
                    <StatusBar style="dark" />
                    <ActivityIndicator size="large" color="#0F172A" />
                </View>
            ) : null}

            {showConnectionError ? (
                <View style={[StyleSheet.absoluteFill, styles.center, styles.white, styles.errorPad]}>
                    <StatusBar style="dark" />
                    <Text style={styles.errorTitle}>Can't reach the server</Text>
                    <Text style={styles.errorBody}>
                        We couldn't check your account right now. Check your internet connection and try again.
                    </Text>
                    <Pressable
                        onPress={() => setRetryKey((value) => value + 1)}
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                    >
                        <Text style={styles.primaryBtnText}>TRY AGAIN</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleSignOut}
                        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                    >
                        <Text style={styles.secondaryBtnText}>Use a different number</Text>
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: driverTheme.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    white: { backgroundColor: '#FFFFFF', zIndex: 10000, elevation: 40 },
    errorPad: { paddingHorizontal: 32, gap: 20 },
    errorTitle: { fontFamily: fonts.outfit, fontSize: 24, fontWeight: '900', letterSpacing: -0.6, color: '#0F172A', textAlign: 'center' },
    errorBody: {
        maxWidth: 320,
        fontFamily: fonts.outfit,
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 24,
        color: '#64748B',
        textAlign: 'center',
    },
    // web: bg-slate-900 button -> the partner button blue (Taxi index.css .driver-theme button override)
    primaryBtn: {
        height: 48,
        width: '100%',
        maxWidth: 320,
        borderRadius: 16,
        backgroundColor: driverTheme.button,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBtnText: { fontFamily: fonts.outfit, fontSize: 13, fontWeight: '900', letterSpacing: 1.3, color: '#FFFFFF' },
    secondaryBtn: {
        height: 48,
        width: '100%',
        maxWidth: 320,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryBtnText: { fontFamily: fonts.outfit, fontSize: 13, fontWeight: '700', color: '#475569' },
    pressed: { transform: [{ scale: 0.95 }] },
});

export default DriverLayout;
