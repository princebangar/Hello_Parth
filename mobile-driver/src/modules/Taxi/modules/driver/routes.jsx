// Route helpers for the files in src/app/taxi/** (web: the <Route path="driver|owner" element={<DriverLayout />}> blocks
// of modules/Taxi/TaxiApp.jsx). The guard (session, approval, role) is DriverLayout's, which wraps the whole /taxi stack.
import React, { Suspense } from 'react';
import { Navigate } from '@/lib/router';
import { PaintProbe } from '@/native/ui/screenPaint';
import AppRouteFallback from '@/shared/components/AppRouteFallback';
import { getAuthenticatedDriverRole, getLocalDriverToken } from './services/registrationService';

/** An ordinary page: Suspense fallback like the web's route boundary, plus the paint signal for the tab layer. */
export function driverRoute(Page) {
  function DriverRoute(props) {
    return (
      <Suspense fallback={<AppRouteFallback />}>
        <Page {...props} />
        <PaintProbe />
      </Suspense>
    );
  }
  DriverRoute.displayName = `DriverRoute(${Page.displayName || Page.name || 'Page'})`;
  return DriverRoute;
}

/** Bottom-bar tab paths: the screen is drawn by DriverTabKeepAlive above the stack, the route only matches. */
export function DriverTabRoute() {
  return <PaintProbe />;
}

/** Web: <Navigate to="..." replace /> routes (payout-methods -> profile/bank-details). */
export function redirectRoute(to) {
  function RedirectRoute() {
    return <Navigate to={to} replace />;
  }
  return RedirectRoute;
}

/** Web: DriverEntryRedirect — /taxi/driver and /taxi/owner open the signed-in role's home, or the login. */
export function DriverEntryRedirect() {
  const token = getLocalDriverToken();
  const role = String(getAuthenticatedDriverRole() || 'driver').toLowerCase();

  if (!token) {
    return <Navigate to="/taxi/driver/login" replace />;
  }

  return (
    <Navigate
      to={role === 'owner' ? '/taxi/owner/dashboard' : role === 'bus_driver' ? '/taxi/driver/bus-home' : '/taxi/driver/home'}
      replace
    />
  );
}
