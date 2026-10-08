import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    clearDriverAuthState,
    getAuthenticatedDriverRole,
    getCurrentDriver,
    getLocalDriverToken,
    getStoredDriverRole,
} from '../services/registrationService';
import DriverRideRequestListener from './DriverRideRequestListener';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import { preloadDriverTabs } from '../driverTabPages';
import TaxiPageSkeleton from '@/shared/components/TaxiPageSkeleton';
import { useScrollFocusedFieldIntoView } from '../../../shared/hooks/useTypingFocus';

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
    '/taxi/driver/pooling/onboarding',
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
const isOnboardingRoute = (pathname = '') =>
    onboardingRoutes.has(pathname) ||
    /^\/taxi\/(driver|owner)\/legal\/(terms|privacy|support)$/.test(pathname) ||
    pathname.startsWith('/taxi/driver/role-signup/bus-builder');

// Only Taxi Home carries the "Hello Parth" header (drawn by the page, over the map). The other main screens keep
// their own top, with a small gap above it.
const TOP_BAR_PATHS = new Set([
    '/taxi/driver/history',
    '/taxi/driver/wallet',
    '/taxi/driver/incentives',
    '/taxi/driver/bus-home',
    '/taxi/driver/pooling',
    '/taxi/driver/pooling/bookings',
    '/taxi/owner/home',
    '/taxi/owner/dashboard',
    '/taxi/owner/manage-drivers',
    '/taxi/owner/vehicle-fleet',
    '/taxi/owner/pooling-vehicles',
    '/taxi/owner/bus-service',
    '/taxi/owner/bus-bookings',
    '/taxi/owner/wallet',
    '/taxi/owner/history',
]);

// Screens that carry the floating bottom bar. It lives here (not in each page) so it stays mounted while the
// pages change and the active pill can slide from tab to tab.
const BOTTOM_NAV_PATH = new RegExp(
    '^/taxi/driver/(home|dashboard|history|wallet|incentives|profile|vehicle-fleet(/.*)?|pooling|pooling/bookings)$'
    + '|^/taxi/owner/(home|dashboard|history|wallet|profile|manage-drivers|vehicle-fleet(/.*)?|pooling-vehicles(/.*)?|bus-service(/.*)?|bus-bookings)$',
);

// A token that already passed /drivers/me (approved): a refresh opens the screen straight away and the check runs
// in the background. Before, the page was drawn, then swapped for a spinner while checking, then mounted again -
// header and bottom bar flashed, every Home request ran twice and the map could come back blank.
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
        // storage unavailable: the next refresh just checks again
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
        : activeRole === 'pooling_driver'
            ? '/taxi/driver/pooling'
            : '/taxi/driver/home';
};

const getPendingDriverRoute = (pathname = '') => `${getPortalPrefix(pathname)}/registration-status`;
const getPendingRouteForRole = (pathname = '', role = '') =>
    String(role || '').toLowerCase() === 'pooling_driver'
        ? '/taxi/driver/pooling/status'
        : getPendingDriverRoute(pathname);
const isBusConsoleRoute = (pathname = '') => pathname.startsWith('/taxi/driver/bus-home');
const isPoolingConsoleRoute = (pathname = '') => pathname.startsWith('/taxi/driver/pooling');
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
        '/taxi/driver/pooling/status',
    ].includes(pathname);

// Sits next to the screen inside the Suspense boundary, so its effect runs only once the screen itself is on the page.
const ScreenShown = ({ onShown }) => {
    useEffect(() => {
        onShown();
    }, [onShown]);
    return null;
};

const DriverLayout = () => {
    // Forms (registration, KYC, add driver/vehicle, bus desk) keep the field being typed in above the keyboard.
    useScrollFocusedFieldIntoView();
    const location = useLocation();
    const navigate = useNavigate();
    // A check that has to finish before the screen may show starts in the checking state (no page drawn first).
    const [isChecking, setIsChecking] = useState(() => {
        const token = getLocalDriverToken();
        return Boolean(token) && !isOnboardingRoute(location.pathname) && !isVerifiedSession(token);
    });
    const [isAllowed, setIsAllowed] = useState(true);
    // Server unreachable / 5xx while verifying the driver — must NOT be shown as "pending approval".
    const [connectionError, setConnectionError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const verifiedTokenRef = useRef('');
    const verifiedApprovalRef = useRef(false);

    useEffect(() => {
        const currentPath = location.pathname;
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
            redirectToDriverLogin(navigate, currentPath, authenticatedRole);
            return;
        }

        if (isBusConsoleRoute(currentPath) && authenticatedRole !== 'bus_driver') {
            setIsAllowed(false);
            navigate(authenticatedHome, { replace: true });
            return;
        }

        if (isPoolingConsoleRoute(currentPath) && authenticatedRole !== 'pooling_driver') {
            setIsAllowed(false);
            navigate(authenticatedHome, { replace: true });
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
                    navigate(getPendingRouteForRole(currentPath, effectiveRole || authenticatedRole), { replace: true });
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

                if (isPoolingConsoleRoute(currentPath) && effectiveRole !== 'pooling_driver') {
                    navigate(getAuthenticatedDriverHome(currentPath, effectiveRole), { replace: true });
                    return;
                }

                const isDriverConsoleRoute =
                    currentPath.startsWith('/taxi/driver') &&
                    !isBusConsoleRoute(currentPath) &&
                    !isPoolingConsoleRoute(currentPath) &&
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
                    redirectToDriverLogin(navigate, currentPath, authenticatedRole);
                    return;
                }

                if (error?.status === 403) {
                    // 403 on /drivers/me is either a real pending/inactive account or a token that
                    // belongs to another portal (e.g. a customer). Only the former is "pending".
                    if (/pending|inactive/i.test(String(error?.message || ''))) {
                        navigate(getPendingDriverRoute(currentPath), { replace: true });
                    } else {
                        redirectToDriverLogin(navigate, currentPath, authenticatedRole);
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
    }, [isAllowed, location.pathname, location.state, navigate, retryKey]);

    // index.html keeps a copy of the start-up skeleton over driver screens until real content is drawn. It goes when
    // the first screen is really on the page - not when the layout is, or a refresh showed a second (page) skeleton
    // under the bottom bar before Home. Until then the bar waits too, so a refresh is: one skeleton, then the screen.
    const [screenShown, setScreenShown] = useState(false);
    const handleScreenShown = useCallback(() => {
        setScreenShown(true);
        window.__bootKeepDone?.();
    }, []);

    // Shortly after the first screen is drawn: load the other bottom-bar screens of this role, so a tab tap shows its
    // screen at once. Scheduled once - switching tabs must not cancel it (it did with the settle helper, so quick
    // tab hopping never got the preload) - and not skipped on Save-Data: these are the app's own main screens.
    const tabsPreloadRef = useRef({ scheduled: false, timer: null });
    useEffect(() => {
        if (tabsPreloadRef.current.scheduled || isChecking || !isAllowed || !getLocalDriverToken()) {
            return;
        }
        if (isOnboardingRoute(location.pathname)) {
            return;
        }
        tabsPreloadRef.current.scheduled = true;
        const role = location.pathname.startsWith('/taxi/owner') ? 'owner' : getAuthenticatedRole();
        tabsPreloadRef.current.timer = window.setTimeout(() => {
            const run = () => {
                preloadDriverTabs(role);
            };
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(run, { timeout: 1500 });
            } else {
                run();
            }
        }, 600);
    }, [isAllowed, isChecking, location.pathname]);
    useEffect(() => () => window.clearTimeout(tabsPreloadRef.current.timer), []);

    const handleSignOut = () => {
        clearDriverAuthState();
        setConnectionError(false);
        navigate('/taxi/driver/login', { replace: true });
    };

    if (connectionError && !isOnboardingRoute(location.pathname)) {
        return (
            <div className="driver-theme min-h-screen flex flex-col items-center justify-center gap-5 bg-white px-8 text-center">
                <h1 className="text-2xl font-black tracking-tight text-slate-900">Can't reach the server</h1>
                <p className="max-w-xs text-sm font-semibold leading-6 text-slate-500">
                    We couldn't check your account right now. Check your internet connection and try again.
                </p>
                <button
                    type="button"
                    onClick={() => setRetryKey((value) => value + 1)}
                    className="h-12 w-full max-w-xs rounded-2xl bg-slate-900 text-[13px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                    Try again
                </button>
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="h-12 w-full max-w-xs rounded-2xl border border-slate-200 text-[13px] font-bold text-slate-600 active:scale-95"
                >
                    Use a different number
                </button>
            </div>
        );
    }

    return (
        <div className={`driver-theme min-h-screen${isAllowed && TOP_BAR_PATHS.has(location.pathname.replace(/\/+$/, '')) ? ' driver-page-gap' : ''}`}>
            {isChecking && !isOnboardingRoute(location.pathname) ? (
                <div className="min-h-screen flex items-center justify-center bg-white">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* A screen whose code is not here yet shows a skeleton in its own place; the bottom bar stays. */}
                    <Suspense fallback={screenShown ? <div className="min-h-screen"><TaxiPageSkeleton variant="page" /></div> : null}>
                        <ScreenShown onShown={handleScreenShown} />
                        <Outlet context={{ isAllowed }} />
                    </Suspense>
                    {screenShown && isAllowed && BOTTOM_NAV_PATH.test(location.pathname.replace(/\/+$/, '')) && <DriverBottomNav />}
                    {isAllowed && getStoredRole() === 'driver' && <DriverRideRequestListener />}
                </>
            )}
        </div>
    );
};

export default DriverLayout;
