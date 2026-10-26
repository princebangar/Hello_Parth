// Route helpers for the files in src/app/food/restaurant/** (web: the <Route> table of RestaurantRouter.jsx, phone
// layout — the desktop dashboard is not part of the app).
// - authRoute: login / otp / signup / forgot-password wrapped in AuthRedirect module="restaurant" (a signed-in
//   restaurant goes to /food/restaurant, a pending one to the pending screen);
// - publicRoute: pending-verification, onboarding, privacy, terms, help-centre/support, help-content (no guard);
// - protectedRoute: ProtectedRoute requiredRole="restaurant" loginPath="/food/restaurant/login" (no session -> login
//   with state.from; pending / rejected / banned -> pending-verification);
// - RestaurantTabRoute: the bottom-bar paths, drawn by RestaurantTabKeepAlive above the Stack (the route only guards);
// - redirectRoute: the web's <Navigate replace /> routes (account -> /food/restaurant, the catch-all).
import React, { Suspense } from 'react';
import { Navigate } from '@/lib/router';
import { PaintProbe } from '@/native/ui/screenPaint';
import AuthRedirect from '@food/components/AuthRedirect';
import ProtectedRoute from '@food/components/ProtectedRoute';

const LOGIN = '/food/restaurant/login';

function withPaint(Page, name, wrap) {
  function RestaurantRoute(props) {
    const page = (
      <Suspense fallback={null}>
        <Page {...props} />
        <PaintProbe />
      </Suspense>
    );
    return wrap ? wrap(page) : page;
  }
  RestaurantRoute.displayName = `${name}(${Page.displayName || Page.name || 'Page'})`;
  return RestaurantRoute;
}

export const authRoute = (Page) =>
  withPaint(Page, 'AuthRoute', (page) => <AuthRedirect module="restaurant">{page}</AuthRedirect>);

export const publicRoute = (Page) => withPaint(Page, 'PublicRoute');

export const protectedRoute = (Page, props) => {
  const Wrapped = withPaint(Page, 'ProtectedRoute', (page) => (
    <ProtectedRoute requiredRole="restaurant" loginPath={LOGIN}>
      {page}
    </ProtectedRoute>
  ));
  if (!props) return Wrapped;
  function WithProps() {
    return <Wrapped {...props} />;
  }
  WithProps.displayName = Wrapped.displayName;
  return WithProps;
};

/** Bottom-bar paths: the screen is drawn by RestaurantTabKeepAlive; the route keeps the web's ProtectedRoute guard. */
export function RestaurantTabRoute() {
  return (
    <ProtectedRoute requiredRole="restaurant" loginPath={LOGIN}>
      <PaintProbe />
    </ProtectedRoute>
  );
}

/** Web: <Navigate to="..." replace /> routes. guard 'protected' keeps the ProtectedRoute around it. */
export function redirectRoute(to, guard) {
  function RedirectRoute() {
    const go = <Navigate to={to} replace />;
    if (guard === 'protected') {
      return (
        <ProtectedRoute requiredRole="restaurant" loginPath={LOGIN}>
          {go}
        </ProtectedRoute>
      );
    }
    return go;
  }
  return RedirectRoute;
}
