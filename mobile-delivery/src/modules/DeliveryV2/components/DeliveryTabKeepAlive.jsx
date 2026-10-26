// Native only (no web file): the kept-alive bottom-bar screens of the delivery app — DeliveryHomeV2 (Feed, Pocket,
// History, Profile: one component that switches its own tab) and OrdersV2. On the web the route element was rebuilt on
// every Feed <-> Orders tap (the live map too); here both stay mounted after their first visit and are shown / hidden
// by route, so a tab switch is a style change (instant, keeps scroll, map and data). Their route files render nothing.
// - Hidden layers use opacity 0 + pointerEvents none (display: 'none' drops the native views on Fabric: 0.2-0.3 s rebuild).
// - The bottom bar announces the tapped tab (lib/tabSwitch) so it shows before the router has navigated.
// - Hidden layers keep the location they were drawn for (FreezeLocation) and are not rebuilt by route changes
//   (HoldWhileHidden). useDeliveryTabActive() tells a layer whether it is the one on screen.
// - When a page opens on top of a tab, the layer stays painted until that page has drawn (useLingeringTrue).
// - The tab with the Google map is never restyled while other tabs come and go: it is drawn first and the other tabs are
//   shown over it (opaque) or hidden with opacity 0. Changing the map view's zIndex / opacity made Android rebuild the
//   map surface: a white, then black, then tile-by-tile map for ~0.5 s when the tab came back (Prince, 26 Oct, recorded).
// - Every View between this layer and the map has collapsable={false}: Fabric flattens a plain View away and brings it
//   back when a prop such as pointerEvents changes, which moves the map to a new parent and rebuilds its surface too.
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FreezeLocation, useLocationNow } from '@/lib/router';
import { useAnnouncedTab } from '@/lib/tabSwitch';
import { HoldWhileHidden } from '@/native/ui/HoldWhileHidden';
import { TabShownProvider } from '@/native/ui/tabShown';
import { useLingeringTrue } from '@/native/ui/useLingeringTrue';
import { useDelayedFalse } from '@/native/ui/useDelayedFalse';
import { deliveryTheme } from '@/theme';
import DeliveryHomeV2 from '../pages/DeliveryHomeV2';
import OrdersV2 from '../pages/OrdersV2';
import { DeliveryTabActiveProvider, resolveDeliveryTab } from '../deliveryTabPages';

const LAYERS = ['home', 'orders'];
// memo: a tab tap re-renders this layer; the screens re-render only when their own props / state change
const HomeScreen = memo(DeliveryHomeV2);
const OrdersScreen = memo(OrdersV2);
const layerOf = (tab) => (tab === 'orders' ? 'orders' : tab ? 'home' : null);

export default function DeliveryTabKeepAlive({ signedIn }) {
  const { pathname } = useLocationNow(); // same render as the navigation (tab layer vs. page)
  const routeTab = useMemo(() => resolveDeliveryTab(pathname), [pathname]);
  const activeTab = useAnnouncedTab('delivery', routeTab);
  const activeLayer = layerOf(activeTab);
  const routeLayer = layerOf(routeTab);

  // DeliveryHomeV2 keeps showing the last home tab it had while another layer / page is on screen
  const lastHomeTabRef = useRef(activeLayer === 'home' ? activeTab : 'feed');
  if (activeLayer === 'home') lastHomeTabRef.current = activeTab;
  const lastLayerRef = useRef(activeLayer);
  if (activeLayer) lastLayerRef.current = activeLayer;
  const shownLayer = activeLayer || lastLayerRef.current;

  const [visited, setVisited] = useState(() => new Set(activeLayer ? [activeLayer] : []));
  useEffect(() => {
    if (!activeLayer) return;
    setVisited((prev) => {
      if (prev.has(activeLayer)) return prev;
      const next = new Set(prev);
      next.add(activeLayer);
      return next;
    });
  }, [activeLayer]);

  // Signed out (logout / session expired): drop the kept screens so the next account starts fresh — a moment after the
  // login screen is up (hidden meanwhile), so the hand-over does not stutter.
  const keepMounted = useDelayedFalse(signedIn);
  useEffect(() => {
    if (!keepMounted) setVisited(new Set());
  }, [keepMounted]);

  // the layer being opened is drawn in this same render (no blank frame on its first visit)
  const shownLayers = activeLayer && !visited.has(activeLayer) ? new Set([...visited, activeLayer]) : visited;
  const visible = Boolean(activeLayer) && signedIn;
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
      {LAYERS.filter((layer) => shownLayers.has(layer)).map((layer) => {
        const isActive = layer === activeLayer && layer === routeLayer;
        return (
          <View
            key={layer}
            collapsable={false}
            // the home layer holds the Feed's Google map: drawn first and never restyled; Orders is shown over it or hidden
            style={[
              StyleSheet.absoluteFill,
              styles.layer,
              layer !== shownLayer && layer !== 'home' && styles.hidden,
            ]}
            pointerEvents={layer === activeLayer ? 'auto' : 'none'}
          >
            <TabShownProvider value={layer === shownLayer}>
            <DeliveryTabActiveProvider value={isActive}>
              <FreezeLocation frozen={layer !== routeLayer}>
                <HoldWhileHidden hold={layer !== routeLayer && visited.has(layer)}>
                  {layer === 'home' ? <HomeScreen tab={lastHomeTabRef.current} /> : <OrdersScreen />}
                </HoldWhileHidden>
              </FreezeLocation>
            </DeliveryTabActiveProvider>
            </TabShownProvider>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { backgroundColor: deliveryTheme.surface },
  hidden: { opacity: 0 },
});
