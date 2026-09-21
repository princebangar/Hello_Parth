import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavbar from './BottomNavbar';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
// Eager (not lazy): this is the default landing tab — bundling it with
// TaxiApp's own chunk skips a second chunk-fetch + Suspense flash on first
// visit, instead of waiting on its own separate lazy import.
import UserHome from '../pages/Home';

const Activity = lazy(() => import('../pages/Activity'));
const Profile = lazy(() => import('../pages/Profile'));
const Support = lazy(() => import('../pages/ride/Support'));
const BusHome = lazy(() => import('../pages/bus/BusHome'));

/** Generic skeleton shown while a tab's own chunk is still downloading —
 *  a plain transparent box let the (often mismatched) colour behind it
 *  show through as a blank flash. This at least reads as "loading". */
const SoftFallback = () => {
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  // Light mode needs a visibly darker grey here — the page background is
  // already near-white, so a pale skeleton block was blending straight
  // into it (looked like "nothing loaded", not "loading").
  const soft = isDark ? 'bg-zinc-800/70' : 'bg-slate-300/80';
  const softer = isDark ? 'bg-zinc-800/40' : 'bg-slate-300/50';
  return (
    <div className={`min-h-[70vh] px-4 pt-6 pb-24 space-y-4 ${isDark ? 'bg-[#0B172A]' : 'bg-[#EFF5FD]'}`} aria-hidden="true">
      <div className={`h-6 w-32 rounded-full animate-pulse ${soft}`} />
      <div className={`h-24 w-full rounded-[20px] animate-pulse ${softer}`} />
      <div className="grid grid-cols-2 gap-3">
        <div className={`h-20 rounded-[16px] animate-pulse ${soft}`} />
        <div className={`h-20 rounded-[16px] animate-pulse ${soft}`} />
      </div>
      <div className={`h-14 w-full rounded-[16px] animate-pulse ${softer}`} />
      <div className={`h-14 w-full rounded-[16px] animate-pulse ${softer}`} />
      <div className={`h-14 w-full rounded-[16px] animate-pulse ${softer}`} />
    </div>
  );
};

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
 * Keeps taxi bottom-nav tabs mounted after first visit so switches are instant
 * (no remount flash, no duplicate Suspense spinner).
 */
export default function UserMainTabKeepAlive() {
  const { pathname } = useLocation();
  const activeTab = useMemo(() => resolveMainTab(pathname), [pathname]);
  const [visited, setVisited] = useState(() => new Set(activeTab ? [activeTab] : []));

  useEffect(() => {
    if (!activeTab) return;
    setVisited((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  if (!activeTab) {
    return null;
  }

  const paneStyle = (tab) => ({
    display: activeTab === tab ? 'block' : 'none',
  });

  return (
    <div className="taxi-user-main-tabs relative min-h-screen">
      {visited.has('ride') ? (
        <div style={paneStyle('ride')} className="taxi-main-tab-pane" data-tab="ride">
          <Suspense fallback={<SoftFallback />}>
            <UserHome hideBottomNav />
          </Suspense>
        </div>
      ) : null}

      {visited.has('activity') ? (
        <div style={paneStyle('activity')} className="taxi-main-tab-pane" data-tab="activity">
          <Suspense fallback={<SoftFallback />}>
            <Activity embedded />
          </Suspense>
        </div>
      ) : null}

      {visited.has('bus') ? (
        <div style={paneStyle('bus')} className="taxi-main-tab-pane" data-tab="bus">
          <Suspense fallback={<SoftFallback />}>
            <BusHome embedded />
          </Suspense>
        </div>
      ) : null}

      {visited.has('support') ? (
        <div style={paneStyle('support')} className="taxi-main-tab-pane" data-tab="support">
          <Suspense fallback={<SoftFallback />}>
            <Support embedded />
          </Suspense>
        </div>
      ) : null}

      {visited.has('profile') ? (
        <div style={paneStyle('profile')} className="taxi-main-tab-pane" data-tab="profile">
          <Suspense fallback={<SoftFallback />}>
            <Profile embedded />
          </Suspense>
        </div>
      ) : null}

      <BottomNavbar />
    </div>
  );
}

export { resolveMainTab };
