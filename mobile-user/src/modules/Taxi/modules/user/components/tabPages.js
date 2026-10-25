// Web: the screens behind the Taxi bottom bar (Rides, Bus, Support) and the profile, loaded as lazy chunks with
// .preload() on idle / finger-down. The app bundle already holds every screen, so they are plain imports; the preload
// functions keep the web's API and only start the data warm-up (Rides prefetches the ride history).
import ActivityPage, { prefetchActivityAll } from '../pages/Activity';
import ProfilePage from '../pages/Profile';
import SupportPage from '../pages/ride/Support';
import BusHomePage from '../pages/bus/BusHome';

export const Activity = ActivityPage;
export const Profile = ProfilePage;
export const Support = SupportPage;
export const BusHome = BusHomePage;

const TAB_PRELOADERS = {
  // Rides starts fetching the person's ride history, so the list is there when the screen opens.
  '/taxi/user/activity': () => Promise.resolve(prefetchActivityAll?.()),
  '/taxi/user/profile': () => Promise.resolve(),
  '/taxi/user/support': () => Promise.resolve(),
  '/taxi/user/bus': () => Promise.resolve(),
};

/** Warm one tab (first data). Safe to call any number of times. */
export const preloadTaxiTab = (path) => TAB_PRELOADERS[path]?.()?.catch?.(() => {}) ?? Promise.resolve();

/** Warm every tab. */
export const preloadTaxiMainTabs = () => Promise.all(Object.keys(TAB_PRELOADERS).map(preloadTaxiTab));
