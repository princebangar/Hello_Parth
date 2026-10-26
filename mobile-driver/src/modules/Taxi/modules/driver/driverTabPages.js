// Web: driverTabPages.js — the bottom-bar screens of the driver apps (taxi, owner, bus), preloaded so a tab tap renders
// at once. The app bundle already holds every screen, so the preload helpers are no-ops; what stays here is which
// screen belongs to which bottom-bar path, used by DriverTabKeepAlive (the kept-alive tab layer of the driver layout).
import { createContext, useContext } from 'react';
import DriverHome from './pages/DriverHome';
import RideRequests from './pages/RideRequests';
import DriverWallet from './pages/DriverWallet';
import DriverIncentives from './pages/DriverIncentives';
import DriverProfile from './pages/DriverProfile';
import OwnerDashboard from './pages/OwnerDashboard';
import ManageDrivers from './pages/settings/ManageDrivers';
import OwnerVehicleFleet from './pages/settings/OwnerVehicleFleet';
import OwnerBusServicePage from './pages/OwnerBusServicePage';

/** Loads every bottom-bar screen of this role (web: chunk preload; the app bundle already has them). */
export const preloadDriverTabs = () => {};

/** Loads one screen's code now (web: a finger landed on its tab). */
export const preloadDriverPath = () => {};

// Kept-alive tabs: path -> tab id. Several paths can show the same tab (/home and /dashboard are both Taxi Home).
const DRIVER_TAB_BY_PATH = {
  '/taxi/driver/home': 'driver-home',
  '/taxi/driver/dashboard': 'driver-home',
  '/taxi/driver/history': 'driver-history',
  '/taxi/driver/wallet': 'driver-wallet',
  '/taxi/driver/incentives': 'driver-incentives',
  '/taxi/driver/profile': 'driver-profile',
  '/taxi/owner/home': 'owner-dashboard',
  '/taxi/owner/dashboard': 'owner-dashboard',
  '/taxi/owner/manage-drivers': 'owner-drivers',
  '/taxi/owner/vehicle-fleet': 'owner-vehicles',
  '/taxi/owner/bus-service': 'owner-bus',
  '/taxi/owner/profile': 'owner-profile',
};

export const DRIVER_TAB_SCREENS = {
  'driver-home': DriverHome,
  'driver-history': RideRequests,
  'driver-wallet': DriverWallet,
  'driver-incentives': DriverIncentives,
  'driver-profile': DriverProfile,
  'owner-dashboard': OwnerDashboard,
  'owner-drivers': ManageDrivers,
  'owner-vehicles': OwnerVehicleFleet,
  'owner-bus': OwnerBusServicePage,
  'owner-profile': DriverProfile,
};

export const DRIVER_TAB_ORDER = Object.keys(DRIVER_TAB_SCREENS);

/** The kept-alive tab a path shows, or null for an ordinary (stack) page. */
export const resolveDriverTab = (pathname = '') => DRIVER_TAB_BY_PATH[String(pathname || '').replace(/\/+$/, '')] || null;

// true for an ordinary page, and for a kept-alive tab while it is the one on screen. On the web a tab screen was
// unmounted when another tab opened and mounted again when it came back; here it stays mounted, so effects that ran
// "while mounted" (socket listeners, timers, alert sounds, request popups) depend on this flag instead, and data the
// web loaded on mount is loaded again when the tab becomes active.
const DriverTabActiveContext = createContext(true);
export const DriverTabActiveProvider = DriverTabActiveContext.Provider;
export const useDriverTabActive = () => useContext(DriverTabActiveContext);
