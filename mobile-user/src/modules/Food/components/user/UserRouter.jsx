// Web: modules/Food/components/user/UserRouter.jsx — the Food user routes inside UserLayout.
// In the app the routes are Expo Router files under src/app/food/user/** (same URLs); this file keeps what the web
// router did around them:
//   - default export UserRouter: the layout element (UserLayout) wrapping the Food stack (`children`);
//   - USER_ROUTES: the web's route table (path, guard) the route files follow;
//   - publicRoute / protectedRoute / authLoginRedirect: the per-route wrappers the web put on each <Route> element
//     (ProtectedRoute requiredRole="user" loginPath="/login", AuthRedirect module="user" -> /login, Suspense fallbacks);
//   - MainTabRoutePlaceholder: main tabs render via MainTabKeepAlive in UserLayout — the route only matches.
// The web's chunk prefetch (usePrefetchCommonRoutes) has no counterpart: the app bundle holds every screen.
import { PaintProbe } from '@/native/ui/screenPaint';
import React, { Suspense } from 'react';
import { Navigate } from '@/lib/router';
import UserLayout from './UserLayout';
import Loader from '@food/components/Loader';
import ProtectedRoute from '@food/components/ProtectedRoute';
import AuthRedirect from '@food/components/AuthRedirect';
import PageLoader from '@/shared/components/PolicyPageLoader';
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons';
import { hasFirstScreenShown } from '@/shared/utils/firstScreen';

// Right after the app opened it is still on the skeleton it started with: keep it until this screen is ready.
// Once a screen has been shown, opening another one uses the light spinner.
function RouteLoader() {
  return hasFirstScreenShown() ? <PageLoader /> : <AppShellSkeleton />;
}

/** Main tabs render via MainTabKeepAlive in UserLayout — route match only. */
export const MainTabRoutePlaceholder = () => null;

const FALLBACKS = { page: () => <PageLoader />, loader: () => <Loader />, route: () => <RouteLoader /> };

/** A route open to guests (web: a plain <Route element>), with the web's Suspense fallback. */
export function publicRoute(Page, { fallback = 'route' } = {}) {
  const Fallback = FALLBACKS[fallback] || FALLBACKS.route;
  function PublicRoute(props) {
    return (
      <Suspense fallback={<Fallback />}>
        <Page {...props} />
        <PaintProbe />
      </Suspense>
    );
  }
  PublicRoute.displayName = `PublicRoute(${Page.displayName || Page.name || 'Page'})`;
  return PublicRoute;
}

/** A route inside the web's <ProtectedRoute requiredRole="user" loginPath="/login"> group. */
export function protectedRoute(Page, { fallback = 'route' } = {}) {
  const Fallback = FALLBACKS[fallback] || FALLBACKS.route;
  function UserProtectedRoute(props) {
    return (
      <ProtectedRoute requiredRole="user" loginPath="/login">
        <Suspense fallback={<Fallback />}>
          <Page {...props} />
          <PaintProbe />
        </Suspense>
      </ProtectedRoute>
    );
  }
  UserProtectedRoute.displayName = `ProtectedRoute(${Page.displayName || Page.name || 'Page'})`;
  return UserProtectedRoute;
}

/** auth/login, auth/sign-in, auth/otp: <AuthRedirect module="user"><Navigate to="/login" replace /></AuthRedirect> */
export function AuthLoginRedirect() {
  return (
    <AuthRedirect module="user">
      <Navigate to="/login" replace />
    </AuthRedirect>
  );
}

/** The web's route table (relative to /food/user and /food). guard: 'public' | 'user'. */
export const USER_ROUTES = [
  // Public legal policies & support
  { path: 'profile/terms', guard: 'public', note: 'top-level redirect to /user/terms' },
  { path: 'profile/privacy', guard: 'public', note: 'top-level redirect to /user/privacy' },
  { path: 'profile/refund', guard: 'public' },
  { path: 'profile/shipping', guard: 'public' },
  { path: 'profile/cancellation', guard: 'public' },
  { path: 'profile/support', guard: 'public' },
  { path: 'profile/support-info', guard: 'public', note: 'top-level redirect to /user/support' },
  // Help center
  { path: 'help', guard: 'public' },
  { path: 'help/orders/:orderId', guard: 'public' },
  // Auth redirects & callbacks
  { path: 'auth/login', guard: 'auth-redirect' },
  { path: 'auth/sign-in', guard: 'auth-redirect' },
  { path: 'auth/otp', guard: 'auth-redirect' },
  { path: 'auth/callback', guard: 'public' },
  // Discovery (guest mode allowed); main tabs are kept alive in UserLayout
  { path: '', guard: 'public', mainTab: true },
  { path: 'home', guard: 'public', mainTab: true },
  { path: 'takeaway', guard: 'public', mainTab: true },
  { path: 'dining', guard: 'public', mainTab: true },
  { path: 'dining/:category', guard: 'public' },
  { path: 'dining/explore/upto50', guard: 'public' },
  { path: 'dining/explore/near-rated', guard: 'public' },
  { path: 'dining/coffee', guard: 'public' },
  { path: 'dining/:diningType/:slug', guard: 'public' },
  { path: 'under-250', guard: 'public', mainTab: true },
  { path: 'categories', guard: 'public' },
  { path: 'category/:category', guard: 'public', mainTab: true },
  { path: 'restaurants', guard: 'public' },
  { path: 'restaurants/:slug', guard: 'public' },
  { path: 'search', guard: 'public' },
  { path: 'product/:id', guard: 'public' },
  { path: 'address-selector', guard: 'public' },
  { path: 'my-store', guard: 'public' },
  // Login required
  { path: 'dining/book/:slug', guard: 'user' },
  { path: 'dining/book-confirmation', guard: 'user' },
  { path: 'dining/book-success', guard: 'user' },
  { path: 'dining/modification-policy', guard: 'user' },
  { path: 'dining/cancellation-policy', guard: 'user' },
  { path: 'dining/edit-user', guard: 'user' },
  { path: 'bookings', guard: 'user' },
  { path: 'cart', guard: 'user' },
  { path: 'cart/checkout', guard: 'user' },
  { path: 'cart/select-address', guard: 'user' },
  { path: 'orders', guard: 'user' },
  { path: 'orders/:orderId', guard: 'user' },
  { path: 'orders/:orderId/invoice', guard: 'user' },
  { path: 'orders/:orderId/details', guard: 'user' },
  { path: 'offers', guard: 'user' },
  { path: 'gourmet', guard: 'user' },
  { path: 'collections', guard: 'user' },
  { path: 'collections/:id', guard: 'user' },
  { path: 'profile', guard: 'user', mainTab: true },
  { path: 'profile/edit', guard: 'user' },
  { path: 'profile/payments', guard: 'user' },
  { path: 'profile/payments/new', guard: 'user' },
  { path: 'profile/payments/:id/edit', guard: 'user' },
  { path: 'profile/favorites', guard: 'user' },
  { path: 'profile/coupons', guard: 'user' },
  { path: 'profile/about', guard: 'user' },
  { path: 'profile/delivery-safety', guard: 'user' },
  { path: 'profile/report-safety-emergency', guard: 'user' },
  { path: 'profile/accessibility', guard: 'user' },
  { path: 'profile/logout', guard: 'user' },
  { path: 'profile/refer-earn', guard: 'user' },
  { path: 'profile/dining-bookings', guard: 'user' },
  { path: 'profile/settings', guard: 'user' },
  { path: 'notifications', guard: 'user' },
  { path: 'wallet', guard: 'user' },
  { path: 'complaints/submit/:orderId', guard: 'user' },
];

export default function UserRouter({ children }) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <UserLayout>{children}</UserLayout>
    </Suspense>
  );
}
