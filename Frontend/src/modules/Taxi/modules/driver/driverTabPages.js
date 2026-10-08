import lazyPreloaded from '@/shared/utils/lazyPreloaded';

// The bottom-bar screens of the driver apps (taxi, owner, bus, pooling). lazyPreloaded, not React.lazy: React.lazy
// always suspends the first time it renders - even when the code is already loaded - so a tab tap waited ~1 s before
// the screen changed. Preloaded while the app is idle, a tap then renders the screen at once.
export const DriverHome = lazyPreloaded(() => import('./pages/DriverHome'));
export const RideRequests = lazyPreloaded(() => import('./pages/RideRequests'));
export const DriverWallet = lazyPreloaded(() => import('./pages/DriverWallet'));
export const DriverIncentives = lazyPreloaded(() => import('./pages/DriverIncentives'));
export const DriverProfile = lazyPreloaded(() => import('./pages/DriverProfile'));
export const OwnerDashboard = lazyPreloaded(() => import('./pages/OwnerDashboard'));
export const OwnerWallet = lazyPreloaded(() => import('./pages/OwnerWallet'));
export const ManageDrivers = lazyPreloaded(() => import('./pages/settings/ManageDrivers'));
export const OwnerVehicleFleet = lazyPreloaded(() => import('./pages/settings/OwnerVehicleFleet'));
export const OwnerPoolingVehicles = lazyPreloaded(() => import('./pages/OwnerPoolingVehicles'));
export const OwnerBusServicePage = lazyPreloaded(() => import('./pages/OwnerBusServicePage'));
export const OwnerBusBookingsPage = lazyPreloaded(() => import('./pages/OwnerBusBookingsPage'));
export const BusDriverHome = lazyPreloaded(() => import('./pages/BusDriverHome'));
export const PoolingDriverDashboard = lazyPreloaded(() => import('./pages/PoolingDriverDashboard'));
export const PoolingDriverBookings = lazyPreloaded(() => import('./pages/pooling/PoolingDriverBookings'));

const TABS_BY_ROLE = {
  driver: [DriverHome, RideRequests, DriverWallet, DriverIncentives, DriverProfile],
  owner: [OwnerDashboard, ManageDrivers, OwnerVehicleFleet, OwnerPoolingVehicles, OwnerBusServicePage, DriverProfile],
  bus_driver: [BusDriverHome],
  pooling_driver: [PoolingDriverDashboard, PoolingDriverBookings],
};

/** Loads every bottom-bar screen of this role (call when the app is idle). */
export const preloadDriverTabs = (role = 'driver') => {
  (TABS_BY_ROLE[role] || TABS_BY_ROLE.driver).forEach((page) => page.preload());
};

const BY_PATH = {
  '/taxi/driver/home': DriverHome,
  '/taxi/driver/dashboard': DriverHome,
  '/taxi/driver/history': RideRequests,
  '/taxi/driver/wallet': DriverWallet,
  '/taxi/driver/incentives': DriverIncentives,
  '/taxi/driver/profile': DriverProfile,
  '/taxi/driver/pooling': PoolingDriverDashboard,
  '/taxi/driver/pooling/bookings': PoolingDriverBookings,
  '/taxi/owner/dashboard': OwnerDashboard,
  '/taxi/owner/home': OwnerDashboard,
  '/taxi/owner/wallet': OwnerWallet,
  '/taxi/owner/history': RideRequests,
  '/taxi/owner/profile': DriverProfile,
  '/taxi/owner/manage-drivers': ManageDrivers,
  '/taxi/owner/vehicle-fleet': OwnerVehicleFleet,
  '/taxi/owner/pooling-vehicles': OwnerPoolingVehicles,
  '/taxi/owner/bus-service': OwnerBusServicePage,
  '/taxi/owner/bus-bookings': OwnerBusBookingsPage,
};

/** Loads one screen's code now (a finger landed on its tab). */
export const preloadDriverPath = (path) => {
  BY_PATH[path]?.preload();
};
