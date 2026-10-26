// Native only (no web file): which bottom-bar path shows which kept-alive screen.
// Web (RestaurantRouter, phone layout): "" and orders -> OrdersMain, inventory and menu -> Inventory, feedback and
// reviews -> Feedback, explore and settings -> ExploreMore; each of them drew BottomNavOrders. Here the four screens are
// drawn once by RestaurantTabKeepAlive above the Stack and kept mounted; their route files render nothing.
import { createContext, useContext } from 'react';

// path -> kept-alive layer (= the BottomNavOrders tab id it belongs to)
const LAYER_BY_PATH = {
  '/food/restaurant': 'orders',
  '/food/restaurant/orders': 'orders',
  '/food/restaurant/inventory': 'inventory',
  '/food/restaurant/menu': 'inventory',
  '/food/restaurant/feedback': 'feedback',
  '/food/restaurant/reviews': 'feedback',
  '/food/restaurant/explore': 'explore',
  '/food/restaurant/settings': 'explore',
};

const clean = (pathname = '') => String(pathname || '').replace(/\/+$/, '') || '/';

/** The kept-alive layer ('orders' | 'inventory' | 'feedback' | 'explore') a path shows, or null for a stack page. */
export const resolveRestaurantLayer = (pathname) => LAYER_BY_PATH[clean(pathname)] || null;

export const RESTAURANT_TAB_PATHS = Object.keys(LAYER_BY_PATH);
export const RESTAURANT_LAYERS = ['orders', 'inventory', 'feedback', 'explore'];

// true for an ordinary page, and for a kept-alive layer while it is the one on screen. On the web a tab screen was
// unmounted when another route opened and mounted again when it came back; here it stays mounted, so effects that ran
// "while mounted" (polling, socket-driven popups, alert rings, back-button handling) depend on this flag instead, and
// data the web loaded on mount is loaded again when the layer becomes active.
const RestaurantTabActiveContext = createContext(true);
export const RestaurantTabActiveProvider = RestaurantTabActiveContext.Provider;
export const useRestaurantTabActive = () => useContext(RestaurantTabActiveContext);

// The web's RestaurantGlobalNotificationListener ran on every restaurant route except these (OrdersMain has its own
// accept / reject popup there).
export const isRestaurantOrderManagedPath = (pathname = '') =>
  pathname === '/food/restaurant' || pathname === '/food/restaurant/orders' || pathname.startsWith('/food/restaurant/orders/');

// modules/Food/routes.jsx: auth pages of the restaurant panel (no global listener, no session safety net)
export const isRestaurantAuthPath = (pathname = '') =>
  pathname === '/food/restaurant/login' ||
  pathname === '/food/restaurant/auth/sign-in' ||
  pathname === '/food/restaurant/signup' ||
  pathname === '/food/restaurant/signup-email' ||
  pathname === '/food/restaurant/forgot-password' ||
  pathname === '/food/restaurant/otp' ||
  pathname === '/food/restaurant/auth/google-callback' ||
  pathname.includes('/onboarding') ||
  pathname.includes('/pending-verification');

/** The signed-in restaurant may see the panel (web ProtectedRoute: a pending / rejected / banned account is sent away). */
export function restaurantPanelAllowed() {
  try {
    const userStr = localStorage.getItem('restaurant_user');
    if (!userStr) return true;
    const status = String(JSON.parse(userStr)?.status || '').toLowerCase();
    return !['pending', 'rejected', 'banned', 'deleted'].includes(status);
  } catch {
    return true;
  }
}

/** web routes.jsx RestaurantGlobalNotificationListener: only an approved restaurant gets the global new-order card */
export function restaurantApproved() {
  try {
    const user = JSON.parse(localStorage.getItem('restaurant_user') || 'null');
    return String(user?.status || '').toLowerCase() === 'approved';
  } catch {
    return false;
  }
}
