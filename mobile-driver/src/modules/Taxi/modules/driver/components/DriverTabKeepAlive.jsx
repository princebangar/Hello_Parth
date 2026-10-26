// Native only (no web file): the kept-alive bottom-bar tabs of the Taxi driver (Home, History, Wallet, Milestone,
// Profile) and the Owner (Dashboard, Drivers, Vehicle, Bus, Account). On the web each tab was the route's element and was
// rebuilt on every tab tap; here every tab stays mounted after its first visit and is shown / hidden by route, so a tab
// switch is a style change (instant, keeps scroll, map and data). The route files of these paths render nothing.
// - Hidden tabs use opacity 0 + pointerEvents none (display: 'none' drops the native views on Fabric: 0.2-0.3 s rebuild).
// - The bottom bar announces the tapped tab (lib/tabSwitch) so it shows before the router has navigated.
// - Hidden tabs keep the location they were drawn for (FreezeLocation) and are not rebuilt by route changes
//   (HoldWhileHidden). useDriverTabActive() tells a tab whether it is the one on screen (see driverTabPages.js).
// - When a page opens on top of a tab, the layer stays painted until that page has drawn (useLingeringTrue).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FreezeLocation, useLocationNow } from '@/lib/router';
import { useAnnouncedTab } from '@/lib/tabSwitch';
import { HoldWhileHidden } from '@/native/ui/HoldWhileHidden';
import { useLingeringTrue } from '@/native/ui/useLingeringTrue';
import { driverTheme } from '@/theme';
import { DRIVER_TAB_ORDER, DRIVER_TAB_SCREENS, DriverTabActiveProvider, resolveDriverTab } from '../driverTabPages';

export default function DriverTabKeepAlive({ signedIn }) {
  const { pathname } = useLocationNow(); // same render as the navigation (tab layer vs. page)
  const routeTab = useMemo(() => resolveDriverTab(pathname), [pathname]);
  const activeTab = useAnnouncedTab('driver', routeTab);
  const lastTabRef = useRef(activeTab);
  if (activeTab) lastTabRef.current = activeTab;
  const shownTab = activeTab || lastTabRef.current;
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

  // Signed out (logout / account deleted / other number): drop the kept tabs so the next account starts fresh.
  useEffect(() => {
    if (!signedIn) setVisited(new Set());
  }, [signedIn]);

  // the tab being opened is drawn in this same render (no blank frame on its first visit)
  const shownTabs = activeTab && !visited.has(activeTab) ? new Set([...visited, activeTab]) : visited;
  const visible = Boolean(activeTab) && signedIn;
  const painted = useLingeringTrue(visible);
  if (!shownTabs.size || !signedIn) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.layer, !painted && styles.hidden]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {DRIVER_TAB_ORDER.filter((tab) => shownTabs.has(tab)).map((tab) => {
        const Screen = DRIVER_TAB_SCREENS[tab];
        const isActive = tab === activeTab && tab === routeTab;
        return (
          <View
            key={tab}
            style={[StyleSheet.absoluteFill, styles.layer, tab !== shownTab && styles.hidden]}
            pointerEvents={tab === activeTab ? 'auto' : 'none'}
          >
            <DriverTabActiveProvider value={isActive}>
              <FreezeLocation frozen={tab !== routeTab}>
                <HoldWhileHidden hold={tab !== routeTab && visited.has(tab)}>
                  <Screen />
                </HoldWhileHidden>
              </FreezeLocation>
            </DriverTabActiveProvider>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { backgroundColor: driverTheme.bg },
  hidden: { opacity: 0 },
});
