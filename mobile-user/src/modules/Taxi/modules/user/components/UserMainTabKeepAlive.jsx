// Web: modules/Taxi/modules/user/components/UserMainTabKeepAlive.jsx — the Taxi bottom-bar tabs (Home, Rides, Bus,
// Support, Profile) + BottomNavbar. The web mounted only the open tab (each tab was the route element).
// Native (shell brief): the Taxi layout keeps this layer mounted above the Taxi stack; every tab stays mounted after its
// first visit and is shown / hidden (display: none) by route, so switching tabs is instant and keeps scroll + data.
// The layer is hidden on every non-tab route (the stack's screen shows) and when nobody is signed in (the tab routes
// redirect to /login like the web's UserProtectedRoute).
import { useLingeringTrue } from '@/native/ui/useLingeringTrue';
import { HoldWhileHidden } from '@/native/ui/HoldWhileHidden';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { FreezeLocation, useLocationNow } from '@/lib/router';
import { useAnnouncedTab } from '@/lib/tabSwitch';
import { whenAppSettled } from '@/shared/utils/whenSettled';
import { getLocalUserToken } from '../services/authService';
import { useUserPalette } from '../../../shared/context/UserThemeContext';
import BottomNavbar from './BottomNavbar';
import { Activity, Profile, Support, BusHome, preloadTaxiMainTabs } from './tabPages';
import UserHome from '../pages/Home';
import useTaxiZoneGate from '../utils/useTaxiZoneGate';

const resolveMainTab = (pathname = '') => {
  const path = String(pathname || '').replace(/\/$/, '') || '/';
  if (path === '/taxi/user') return 'ride';
  if (path === '/taxi/user/activity') return 'activity';
  if (path === '/taxi/user/bus') return 'bus';
  if (path === '/taxi/user/support') return 'support';
  if (path === '/taxi/user/profile') return 'profile';
  return null;
};

const TAB_ORDER = ['ride', 'activity', 'bus', 'support', 'profile'];

const renderTab = (tab) => {
  switch (tab) {
    case 'ride':
      return <UserHome hideBottomNav />;
    case 'activity':
      return <Activity embedded />;
    case 'bus':
      return <BusHome embedded />;
    case 'support':
      return <Support embedded />;
    case 'profile':
      return <Profile embedded />;
    default:
      return null;
  }
};

export default function UserMainTabKeepAlive() {
  const { pathname } = useLocationNow(); // same render as the navigation (tab layer vs. page)
  const p = useUserPalette();
  const routeTab = useMemo(() => resolveMainTab(pathname), [pathname]);
  // the bottom bar announces a tap before navigating: show that tab at once
  const activeTab = useAnnouncedTab('taxi', routeTab);
  // While a page opens on top of a tab, the layer stays painted for a moment: it keeps showing the last tab (not an
  // empty layer) and that tab does not react to the new page's URL.
  const lastTabRef = useRef(activeTab);
  if (activeTab) lastTabRef.current = activeTab;
  const shownTab = activeTab || lastTabRef.current;
  const signedIn = Boolean(getLocalUserToken());
  // The out-of-zone screen is full screen: no bottom bar on it.
  const outOfZone = useTaxiZoneGate();
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

  // Signed out (logout / account deleted): drop the kept tabs so the next user starts fresh.
  useEffect(() => {
    if (!signedIn) setVisited(new Set());
  }, [signedIn]);

  // Warm the other tabs' first data once the open screen has settled (web: chunk + data preload on idle).
  useEffect(() => {
    return whenAppSettled(() => {
      preloadTaxiMainTabs();
    });
  }, []);

  // The tab being opened is drawn in this same render: added only by the effect above, the old tab hid one render
  // before the new one mounted (a blank frame on the first visit of each tab).
  const shownTabs = activeTab && !visited.has(activeTab) ? new Set([...visited, activeTab]) : visited;

  const visible = Boolean(activeTab) && signedIn;
  // A page opening on top of a tab: keep the tab painted until that page has rendered (no half-built frame between).
  const painted = useLingeringTrue(visible);
  if (!shownTabs.size) {
    return null;
  }

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: p.bg }, !painted && styles.hidden]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {TAB_ORDER.filter((tab) => shownTabs.has(tab)).map((tab) => (
        <View key={tab} style={[StyleSheet.absoluteFill, tab !== shownTab && styles.hidden]} pointerEvents={tab === activeTab ? 'auto' : 'none'}>
          {/* hidden tabs keep their state but do not re-render on every route change */}
          {/* an announced tab (tap, route not there yet) only becomes visible: its content is refreshed once the route
              follows, so the switch itself is a style change */}
          <FreezeLocation frozen={tab !== routeTab}>
            <HoldWhileHidden hold={tab !== routeTab && visited.has(tab)}>{renderTab(tab)}</HoldWhileHidden>
          </FreezeLocation>
        </View>
      ))}

      {painted && signedIn && shownTab && !(shownTab === 'ride' && outOfZone) && (
        <FreezeLocation frozen={!activeTab}>
          <BottomNavbar />
        </FreezeLocation>
      )}

      {/* Hidden tabs keep their own status bars mounted; re-mounting this one on every tab switch makes it the newest,
          so the open tab's style wins (Home's dark app bar: light icons). */}
      {visible ? <StatusBar key={activeTab} style={activeTab === 'ride' || p.dark ? 'light' : 'dark'} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Hidden with opacity, not display: 'none': a display-none subtree loses its native views and showing it again
  // rebuilt all of them (0.2-0.3 s per tab switch / Back).
  hidden: { opacity: 0 },
});

export { resolveMainTab };
