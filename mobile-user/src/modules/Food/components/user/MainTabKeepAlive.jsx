// Web: modules/Food/components/user/MainTabKeepAlive.jsx — keeps the main Food tabs (Delivery Home, Takeaway Home,
// Dining, Under 250, Profile) mounted after their first visit, so switching tabs is instant (no remount, no repeated
// API calls) and every tab keeps its scroll position. Hidden tabs stay mounted with display: none.
// Scroll: the web saved / restored window.scrollY per tab; here each tab page scrolls its own list, registered in
// browseScrollMemory, and the same save (main_tab_scroll_<tab>) / restore (incl. the Home browse restore from
// food_browse_scroll_v1) runs against that list.
import { HoldWhileHidden } from '@/native/ui/HoldWhileHidden';
import React, { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Home from '@food/pages/user/Home';
import Dining from '@food/pages/user/Dining';
import Under250 from '@food/pages/user/Under250';
import Profile from '@food/pages/user/profile/Profile';
import ProtectedRoute from '@food/components/ProtectedRoute';
import { AppShellSkeleton } from '@food/components/ui/loading-skeletons';
import { registerFoodPageCacheLifecycle } from '@food/utils/foodPageCache';
import { getBrowseScrollY, normalizeBrowsePath, restoreBrowseScroll, setActiveBrowseScroller } from '@food/utils/browseScrollMemory';
import { requestBottomNavShow } from '@food/utils/bottomNavEvents';
import { mainTabToPath } from '@food/utils/mainTabRoutes';

function isHomeBrowsePath(path) {
  const p = normalizeBrowsePath(path);
  return (
    p === '/user' ||
    p === '/user/takeaway' ||
    p === '/takeaway' ||
    p === '/user/dining' ||
    p === '/dining' ||
    p === '/user/under-250' ||
    p === '/under-250'
  );
}

function TabSuspense({ children }) {
  return <Suspense fallback={<AppShellSkeleton />}>{children}</Suspense>;
}

const tabScrollY = (tab) => getBrowseScrollY(mainTabToPath(tab));
const scrollTab = (tab, y) => restoreBrowseScroll({ path: mainTabToPath(tab), scrollY: y }, { retries: 6 });

/**
 * Keeps main nav tabs mounted after first visit so tab switches are instant
 * (no remount, no duplicate API calls, scroll preserved per tab).
 */
// holdTab: the tab the route is on. A tab that was only announced (tapped, route not there yet) becomes visible but
// keeps its last render until the route follows, so the switch itself is a style change.
export default function MainTabKeepAlive({ activeTab, holdTab = activeTab, isVisible = true }) {
  const [visited, setVisited] = useState(() => new Set(activeTab ? [activeTab] : []));
  const scrollPositionsRef = useRef({});
  const prevTabRef = useRef(activeTab);
  const wasVisibleRef = useRef(isVisible);

  useEffect(() => {
    registerFoodPageCacheLifecycle();
  }, []);

  useEffect(() => {
    if (!activeTab) return;
    setVisited((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // The open tab's list is the one browse scroll memory works with.
  useEffect(() => {
    if (isVisible && activeTab) setActiveBrowseScroller(mainTabToPath(activeTab));
  }, [isVisible, activeTab]);

  // Restore only when the tab changes or the shell becomes visible again — never while idle.
  useLayoutEffect(() => {
    const becameVisible = isVisible && !wasVisibleRef.current;
    wasVisibleRef.current = isVisible;

    if (!isVisible) {
      // Always snapshot — including 0 — so category-from-top returns to top.
      if (activeTab) {
        const y = Math.max(0, tabScrollY(activeTab));
        scrollPositionsRef.current[activeTab] = y;
        try {
          sessionStorage.setItem(`main_tab_scroll_${activeTab}`, String(y));
        } catch {}
      }
      prevTabRef.current = activeTab;
      return;
    }

    const prevTab = prevTabRef.current;
    const tabChanged = Boolean(prevTab && prevTab !== activeTab);
    if (tabChanged) {
      const y = Math.max(0, tabScrollY(prevTab));
      scrollPositionsRef.current[prevTab] = y;
      try {
        sessionStorage.setItem(`main_tab_scroll_${prevTab}`, String(y));
      } catch {}
    }

    if (!activeTab) {
      prevTabRef.current = activeTab;
      return;
    }

    // Idle on same visible tab — do not move the list.
    if (!tabChanged && !becameVisible) {
      prevTabRef.current = activeTab;
      return;
    }

    // Only restore browse scroll when it was saved for Home (restaurant -> home).
    try {
      const rawBrowse = sessionStorage.getItem('food_browse_scroll_v1');
      if (rawBrowse) {
        const data = JSON.parse(rawBrowse);
        const y = Number(data?.scrollY);
        if (isHomeBrowsePath(data?.path) && Number.isFinite(y) && y >= 0) {
          scrollTab(activeTab, y);
          try {
            sessionStorage.removeItem('food_browse_scroll_v1');
          } catch {}
          requestBottomNavShow(900);
          prevTabRef.current = activeTab;
          return;
        }
      }
    } catch {}

    let savedY = scrollPositionsRef.current[activeTab];
    if (typeof savedY !== 'number') {
      try {
        const raw = sessionStorage.getItem(`main_tab_scroll_${activeTab}`);
        if (raw != null) savedY = Number(raw);
      } catch {}
    }

    const target = typeof savedY === 'number' && Number.isFinite(savedY) ? savedY : 0;
    // The kept-alive list is usually still where it was; only move it when it is not.
    if (Math.abs(tabScrollY(activeTab) - target) > 12) scrollTab(activeTab, target);

    // Scroll restore can hide bottom nav mid-tap — keep it visible briefly.
    requestBottomNavShow(900);

    prevTabRef.current = activeTab;
  }, [activeTab, isVisible]);

  useEffect(() => {
    return () => {
      const tab = prevTabRef.current;
      if (!tab) return;
      try {
        const rawBrowse = sessionStorage.getItem('food_browse_scroll_v1');
        if (rawBrowse) {
          const data = JSON.parse(rawBrowse);
          if (isHomeBrowsePath(data?.path) && Number.isFinite(Number(data?.scrollY))) {
            sessionStorage.setItem(`main_tab_scroll_${tab}`, String(Math.max(0, Number(data.scrollY))));
            return;
          }
        }
        sessionStorage.setItem(`main_tab_scroll_${tab}`, String(Math.max(0, tabScrollY(tab))));
      } catch {}
    };
  }, []);

  // The tab being opened mounts in this same render (the effect adds it to visited one render later: a blank frame).
  const shownTabs = activeTab && !visited.has(activeTab) ? new Set([...visited, activeTab]) : visited;

  const paneStyle = (tabId) => [styles.pane, activeTab !== tabId && styles.hidden];
  const paneProps = (tabId) => ({
    style: paneStyle(tabId),
    accessibilityElementsHidden: activeTab !== tabId,
    importantForAccessibility: activeTab !== tabId ? 'no-hide-descendants' : 'auto',
    pointerEvents: activeTab === tabId ? 'auto' : 'none',
  });

  return (
    <>
      {shownTabs.has('delivery') && (
        <View {...paneProps('delivery')}>
          <HoldWhileHidden hold={holdTab !== 'delivery' && visited.has('delivery')}>
            <Home homeMode="delivery" isTabActive={isVisible && activeTab === 'delivery'} />
          </HoldWhileHidden>
        </View>
      )}

      {shownTabs.has('takeaway') && (
        <View {...paneProps('takeaway')}>
          <HoldWhileHidden hold={holdTab !== 'takeaway' && visited.has('takeaway')}>
            <Home homeMode="takeaway" isTabActive={isVisible && activeTab === 'takeaway'} />
          </HoldWhileHidden>
        </View>
      )}

      {shownTabs.has('dining') && (
        <View {...paneProps('dining')}>
          <HoldWhileHidden hold={holdTab !== 'dining' && visited.has('dining')}>
            <TabSuspense>
              <Dining isTabActive={isVisible && activeTab === 'dining'} />
            </TabSuspense>
          </HoldWhileHidden>
        </View>
      )}

      {shownTabs.has('under250') && (
        <View {...paneProps('under250')}>
          <HoldWhileHidden hold={holdTab !== 'under250' && visited.has('under250')}>
            <TabSuspense>
              <Under250 isTabActive={isVisible && activeTab === 'under250'} />
            </TabSuspense>
          </HoldWhileHidden>
        </View>
      )}

      {shownTabs.has('profile') && (
        <View {...paneProps('profile')}>
          <HoldWhileHidden hold={holdTab !== 'profile' && visited.has('profile')}>
            <ProtectedRoute requiredRole="user" loginPath="/login">
              <TabSuspense>
                <Profile isTabActive={isVisible && activeTab === 'profile'} />
              </TabSuspense>
            </ProtectedRoute>
          </HoldWhileHidden>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pane: { ...StyleSheet.absoluteFill },
  // Hidden with opacity, not display: 'none': a display-none subtree loses its native views and showing it again
  // rebuilt all of them (0.2-0.3 s per tab switch / Back).
  hidden: { opacity: 0 },
});
