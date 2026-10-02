import lazyPreloaded from '@/shared/utils/lazyPreloaded';

// The screens behind the Taxi bottom bar (Rides, Bus, Support) and the profile.
//
// lazyPreloaded, not React.lazy: React.lazy always suspends the first time it renders - even when the code is already
// in the browser - and React then keeps the fallback up for ~300 ms. With .preload() done while the app is idle (or the
// moment a finger lands on the tab) the screen renders directly, with no skeleton in between.
export const importActivity = () => import('../pages/Activity');
export const importProfile = () => import('../pages/Profile');
export const importSupport = () => import('../pages/ride/Support');
export const importBusHome = () => import('../pages/bus/BusHome');

export const Activity = lazyPreloaded(importActivity);
export const Profile = lazyPreloaded(importProfile);
export const Support = lazyPreloaded(importSupport);
export const BusHome = lazyPreloaded(importBusHome);

const TAB_PRELOADERS = {
  '/taxi/user/activity': () =>
    // Rides also starts fetching the person's ride history, so the list is there when the screen opens.
    Activity.preload().then((mod) => mod?.prefetchActivityAll?.()),
  '/taxi/user/profile': () => Profile.preload(),
  '/taxi/user/support': () => Support.preload(),
  '/taxi/user/bus': () => BusHome.preload(),
};

/** Warm one tab (code + first data). Safe to call any number of times. */
export const preloadTaxiTab = (path) => TAB_PRELOADERS[path]?.() ?? Promise.resolve();

/** Warm every tab. */
export const preloadTaxiMainTabs = () => Promise.all(Object.keys(TAB_PRELOADERS).map(preloadTaxiTab));
