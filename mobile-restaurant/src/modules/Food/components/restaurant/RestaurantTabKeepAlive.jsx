// Native only (no web file): the kept-alive bottom-bar screens of the restaurant app — OrdersMain, Inventory, Feedback
// and ExploreMore. On the web each tap rebuilt the route element (and reloaded its data); here each screen stays
// mounted after its first visit and is shown / hidden by route, so a tab switch is a style change (instant, keeps
// scroll and data). Their route files render nothing.
// - Hidden layers use opacity 0 + pointerEvents none (display: 'none' drops the native views on Fabric: 0.2-0.3 s rebuild).
// - The bottom bar announces the tapped tab (lib/tabSwitch) so it shows before the router has navigated.
// - Hidden layers keep the location they were drawn for (FreezeLocation) and are not rebuilt by route changes
//   (HoldWhileHidden). useRestaurantTabActive() tells a layer whether it is the one on screen.
// - When a page opens on top of a tab, the layer stays painted until that page has drawn (useLingeringTrue).
// - Every wrapper View has collapsable={false}: Fabric flattens a plain View away and brings it back when a prop such
//   as pointerEvents changes, which re-parents (and rebuilds) the native views under it.
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FreezeLocation, useLocationNow } from '@/lib/router';
import { useAnnouncedTab } from '@/lib/tabSwitch';
import { HoldWhileHidden } from '@/native/ui/HoldWhileHidden';
import { TabShownProvider } from '@/native/ui/tabShown';
import { useLingeringTrue } from '@/native/ui/useLingeringTrue';
import { useDelayedFalse } from '@/native/ui/useDelayedFalse';
import { restaurantTheme } from '@/theme';
import OrdersMain from '@food/pages/restaurant/OrdersMain';
import Inventory from '@food/pages/restaurant/Inventory';
import Feedback from '@food/pages/restaurant/Feedback';
import ExploreMore from '@food/pages/restaurant/ExploreMore';
import { RESTAURANT_LAYERS, RestaurantTabActiveProvider, resolveRestaurantLayer } from './restaurantTabPages';

// memo: a tab tap re-renders this layer; the screens re-render only when their own props / state change
const SCREENS = {
  orders: memo(OrdersMain),
  inventory: memo(Inventory),
  feedback: memo(Feedback),
  explore: memo(ExploreMore),
};

export default function RestaurantTabKeepAlive({ allowed }) {
  const { pathname } = useLocationNow(); // same render as the navigation (tab layer vs. page)
  const routeLayer = useMemo(() => resolveRestaurantLayer(pathname), [pathname]);
  const activeLayer = useAnnouncedTab('restaurant', routeLayer);

  const lastLayerRef = useRef(activeLayer);
  if (activeLayer) lastLayerRef.current = activeLayer;
  const shownLayer = activeLayer || lastLayerRef.current;

  const [visited, setVisited] = useState(() => new Set(activeLayer && allowed ? [activeLayer] : []));
  useEffect(() => {
    if (!activeLayer || !allowed) return;
    setVisited((prev) => {
      if (prev.has(activeLayer)) return prev;
      const next = new Set(prev);
      next.add(activeLayer);
      return next;
    });
  }, [activeLayer, allowed]);

  // Signed out (logout / session expired / account not approved): drop the kept screens so the next account starts
  // fresh — a moment after the login screen is up (hidden meanwhile), so the hand-over does not stutter.
  const keepMounted = useDelayedFalse(allowed);
  useEffect(() => {
    if (!keepMounted) setVisited(new Set());
  }, [keepMounted]);

  // the layer being opened is drawn in this same render (no blank frame on its first visit)
  const shownLayers = activeLayer && allowed && !visited.has(activeLayer) ? new Set([...visited, activeLayer]) : visited;
  const visible = Boolean(activeLayer) && allowed;
  const painted = useLingeringTrue(visible);
  if (!shownLayers.size || !keepMounted) return null;

  return (
    <View
      collapsable={false}
      style={[StyleSheet.absoluteFill, styles.layer, !painted && styles.hidden]}
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {RESTAURANT_LAYERS.filter((layer) => shownLayers.has(layer)).map((layer) => {
        const isActive = layer === activeLayer && layer === routeLayer;
        const Screen = SCREENS[layer];
        return (
          <View
            key={layer}
            collapsable={false}
            style={[StyleSheet.absoluteFill, styles.layer, layer !== shownLayer && styles.hidden]}
            pointerEvents={layer === activeLayer ? 'auto' : 'none'}
          >
            <TabShownProvider value={layer === shownLayer}>
              <RestaurantTabActiveProvider value={isActive}>
                <FreezeLocation frozen={layer !== routeLayer}>
                  <HoldWhileHidden hold={layer !== routeLayer && visited.has(layer)}>
                    <Screen />
                  </HoldWhileHidden>
                </FreezeLocation>
              </RestaurantTabActiveProvider>
            </TabShownProvider>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { backgroundColor: restaurantTheme.surface },
  hidden: { opacity: 0 },
});
