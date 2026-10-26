// Route helpers for the files in src/app/food/delivery/** (web: the <Route> table of DeliveryV2Router.jsx).
// - authRoute: login / otp / signup pages wrapped in AuthRedirect (a signed-in rider goes to /food/delivery);
// - publicRoute: pending-verification, terms, privacy, help content (no guard);
// - protectedRoute: ProtectedRoute (no session -> /food/delivery/login with state.from); the realtime shell those
//   routes had on the web runs in the delivery layout while the rider is signed in (DeliveryApp);
// - DeliveryTabRoute: the bottom-bar paths, drawn by DeliveryTabKeepAlive above the Stack (the route only guards).
import React, { Suspense } from 'react';
import { Navigate } from '@/lib/router';
import { PaintProbe } from '@/native/ui/screenPaint';
import AuthRedirect from '@food/components/AuthRedirect';
import ProtectedRoute from './components/ProtectedRoute';

function withPaint(Page, name, wrap) {
  function DeliveryRoute(props) {
    const page = (
      <Suspense fallback={null}>
        <Page {...props} />
        <PaintProbe />
      </Suspense>
    );
    return wrap ? wrap(page) : page;
  }
  DeliveryRoute.displayName = `${name}(${Page.displayName || Page.name || 'Page'})`;
  return DeliveryRoute;
}

export const authRoute = (Page) =>
  withPaint(Page, 'AuthRoute', (page) => <AuthRedirect module="delivery">{page}</AuthRedirect>);

export const publicRoute = (Page) => withPaint(Page, 'PublicRoute');

export const protectedRoute = (Page) =>
  withPaint(Page, 'ProtectedRoute', (page) => <ProtectedRoute>{page}</ProtectedRoute>);

/** Bottom-bar paths: the screen is drawn by DeliveryTabKeepAlive; the route keeps the web's ProtectedRoute guard. */
export function DeliveryTabRoute() {
  return (
    <ProtectedRoute>
      <PaintProbe />
    </ProtectedRoute>
  );
}

/** Web: <Navigate to="..." replace /> routes (earnings -> pocket/details, the catch-all -> /food/delivery). */
export function redirectRoute(to, guard) {
  function RedirectRoute() {
    const go = <Navigate to={to} replace />;
    if (guard === 'auth') return <AuthRedirect module="delivery">{go}</AuthRedirect>;
    if (guard === 'protected') return <ProtectedRoute>{go}</ProtectedRoute>;
    return go;
  }
  return RedirectRoute;
}
