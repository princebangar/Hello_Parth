import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavbar from './BottomNavbar';

const UserHome = lazy(() => import('../pages/Home'));
const Activity = lazy(() => import('../pages/Activity'));
const Profile = lazy(() => import('../pages/Profile'));
const Support = lazy(() => import('../pages/ride/Support'));
const BusHome = lazy(() => import('../pages/bus/BusHome'));

const SoftFallback = () => (
  <div className="min-h-[40vh] bg-transparent" aria-hidden="true" />
);

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
