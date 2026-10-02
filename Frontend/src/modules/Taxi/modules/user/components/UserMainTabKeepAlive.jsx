import { Suspense, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavbar from './BottomNavbar';
import RouteSkeleton from '../../shared/components/RouteSkeleton';
import TaxiPageSkeleton from '@/shared/components/TaxiPageSkeleton';
import { whenAppSettled } from '@/shared/utils/whenSettled';
import { Activity, Profile, Support, BusHome, preloadTaxiMainTabs } from './tabPages';
// Eager (not lazy): this is the default landing tab — bundling it with
// TaxiApp's own chunk skips a second chunk-fetch + Suspense flash on first
// visit, instead of waiting on its own separate lazy import.
import UserHome from '../pages/Home';

// The tab screens and how they are loaded ahead of time live in ./tabPages. While a tab's code is still on its way it
// shows a Taxi-shaped placeholder for THAT tab (this used to be Food's restaurant-list skeleton for every tab).
const tabFallback = (variant) => <TaxiPageSkeleton variant={variant} />;

const resolveMainTab = (pathname = '') => {
  const path = String(pathname || '').replace(/\/$/, '') || '/';
  if (path === '/taxi/user') return 'ride';
  if (path === '/taxi/user/activity') return 'activity';
  if (path === '/taxi/user/bus') return 'bus';
  if (path === '/taxi/user/support') return 'support';
  if (path === '/taxi/user/profile') return 'profile';
  return null;
};

/**
 * Renders only the active bottom-nav tab — the other four are fully
 * unmounted, not just hidden. They used to all stay mounted (display:none)
 * so switching felt instant, but every one of them independently subscribes
 * to the theme context; React re-renders EVERY subscriber on a theme
 * change regardless of visibility, and Home.jsx especially is large enough
 * that re-rendering it in the background (while it's not even on screen)
 * measurably delayed the visible tab's own theme update — the "half
 * changed, then catches up a second later" bug. Only ever mounting the one
 * tab you're looking at removes that contention entirely.
 */
export default function UserMainTabKeepAlive() {
  const { pathname } = useLocation();
  const activeTab = useMemo(() => resolveMainTab(pathname), [pathname]);

  // Warm the *other* three tabs' chunks on idle, once, so tapping any
  // bottom-nav tab for the first time is instant instead of waiting on a
  // fresh chunk fetch — this is what made switching tabs feel like it took
  // "a second" to go in.
  useEffect(() => {
    // after the open screen settled (shared/utils/whenSettled.js)
    return whenAppSettled(() => {
      preloadTaxiMainTabs();
    });
  }, []);

  if (!activeTab) {
    return null;
  }

  return (
    <div className="taxi-user-main-tabs relative min-h-screen">
      {activeTab === 'ride' && (
        <div className="taxi-main-tab-pane" data-tab="ride">
          <Suspense fallback={<RouteSkeleton />}>
            <UserHome hideBottomNav />
          </Suspense>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="taxi-main-tab-pane" data-tab="activity">
          <Suspense fallback={tabFallback('activity')}>
            <Activity embedded />
          </Suspense>
        </div>
      )}

      {activeTab === 'bus' && (
        <div className="taxi-main-tab-pane" data-tab="bus">
          <Suspense fallback={tabFallback('bus')}>
            <BusHome embedded />
          </Suspense>
        </div>
      )}

      {activeTab === 'support' && (
        <div className="taxi-main-tab-pane" data-tab="support">
          <Suspense fallback={tabFallback('support')}>
            <Support embedded />
          </Suspense>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="taxi-main-tab-pane" data-tab="profile">
          <Suspense fallback={tabFallback('profile')}>
            <Profile embedded />
          </Suspense>
        </div>
      )}

      <BottomNavbar />
    </div>
  );
}

export { resolveMainTab };
