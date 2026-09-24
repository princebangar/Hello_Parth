import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavbar from './BottomNavbar';
import RouteSkeleton from '../../shared/components/RouteSkeleton';
// Eager (not lazy): this is the default landing tab — bundling it with
// TaxiApp's own chunk skips a second chunk-fetch + Suspense flash on first
// visit, instead of waiting on its own separate lazy import.
import UserHome from '../pages/Home';

// Named import functions (not inlined into lazy() below) so the loading
// tracker can call the exact same import() and share the browser's module
// cache — it resolves instantly once lazy() has already fetched the chunk,
// and doesn't trigger a second network request the first time either.
const importActivity = () => import('../pages/Activity');
const importProfile = () => import('../pages/Profile');
const importSupport = () => import('../pages/ride/Support');
const importBusHome = () => import('../pages/bus/BusHome');

const Activity = lazy(importActivity);
const Profile = lazy(importProfile);
const Support = lazy(importSupport);
const BusHome = lazy(importBusHome);

const TAB_IMPORTERS = {
  activity: importActivity,
  profile: importProfile,
  support: importSupport,
  bus: importBusHome,
};

// Shared full-viewport skeleton (RouteSkeleton) — same one used for the
// top-level route Suspense in TaxiApp.jsx, so every tab shows the same
// "global" loading skeleton instead of each having its own half-filled one.
const SoftFallback = RouteSkeleton;

/** Tracks whether the active tab's own chunk has finished loading — 'ride'
 *  (Home) is bundled in eagerly so it's ready from the start. Lets the nav
 *  bar stay hidden while a tab's skeleton is showing (matching Food, which
 *  hides its bottom nav during its own initial-load skeleton) instead of
 *  floating over a screen that isn't ready yet. Once a tab has loaded once
 *  it stays marked ready, so revisiting it never re-hides the nav. */
function useTabReady(activeTab) {
  const [readyTabs, setReadyTabs] = useState(() => new Set(['ride']));

  useEffect(() => {
    const importer = TAB_IMPORTERS[activeTab];
    if (!importer || readyTabs.has(activeTab)) return undefined;

    let cancelled = false;
    importer().then(() => {
      if (!cancelled) {
        setReadyTabs((prev) => (prev.has(activeTab) ? prev : new Set(prev).add(activeTab)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, readyTabs]);

  return activeTab ? readyTabs.has(activeTab) : false;
}

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
  const isTabReady = useTabReady(activeTab);

  // Warm the *other* three tabs' chunks on idle, once, so tapping any
  // bottom-nav tab for the first time is instant instead of waiting on a
  // fresh chunk fetch — this is what made switching tabs feel like it took
  // "a second" to go in.
  useEffect(() => {
    const warm = () => {
      importActivity().catch(() => {});
      importProfile().catch(() => {});
      importSupport().catch(() => {});
      importBusHome().catch(() => {});
    };
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(warm, { timeout: 2000 })
      : window.setTimeout(warm, 500);
    return () => {
      if (window.cancelIdleCallback && typeof idle === 'number') {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle);
      }
    };
  }, []);

  if (!activeTab) {
    return null;
  }

  return (
    <div className="taxi-user-main-tabs relative min-h-screen">
      {activeTab === 'ride' && (
        <div className="taxi-main-tab-pane" data-tab="ride">
          <Suspense fallback={<SoftFallback />}>
            <UserHome hideBottomNav />
          </Suspense>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="taxi-main-tab-pane" data-tab="activity">
          <Suspense fallback={<SoftFallback />}>
            <Activity embedded />
          </Suspense>
        </div>
      )}

      {activeTab === 'bus' && (
        <div className="taxi-main-tab-pane" data-tab="bus">
          <Suspense fallback={<SoftFallback />}>
            <BusHome embedded />
          </Suspense>
        </div>
      )}

      {activeTab === 'support' && (
        <div className="taxi-main-tab-pane" data-tab="support">
          <Suspense fallback={<SoftFallback />}>
            <Support embedded />
          </Suspense>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="taxi-main-tab-pane" data-tab="profile">
          <Suspense fallback={<SoftFallback />}>
            <Profile embedded />
          </Suspense>
        </div>
      )}

      {isTabReady && <BottomNavbar />}
    </div>
  );
}

export { resolveMainTab };
