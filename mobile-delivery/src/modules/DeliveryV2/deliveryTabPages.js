// Native only (no web file): which bottom-bar path shows which kept-alive screen.
// Web: /food/delivery, /feed, /pocket, /history and /profile all render <DeliveryHomeV2 tab=...> (one component that
// switches its own tab content), /orders renders <OrdersV2 />, and both draw DeliveryBottomNav. Here both screens are
// drawn once by DeliveryTabKeepAlive above the Stack and kept mounted; their route files render nothing.
import { createContext, useContext } from 'react';

// path -> [kept-alive layer, DeliveryHomeV2 tab]
const TAB_BY_PATH = {
  '/food/delivery': ['home', 'feed'],
  '/food/delivery/feed': ['home', 'feed'],
  '/food/delivery/pocket': ['home', 'pocket'],
  '/food/delivery/history': ['home', 'history'],
  '/food/delivery/profile': ['home', 'profile'],
  '/food/delivery/orders': ['orders', 'orders'],
};

const clean = (pathname = '') => String(pathname || '').replace(/\/+$/, '') || '/';

/** The kept-alive layer ('home' | 'orders') a path shows, or null for an ordinary (stack) page. */
export const resolveDeliveryLayer = (pathname) => TAB_BY_PATH[clean(pathname)]?.[0] || null;

/** The bottom-bar tab key ('feed' | 'orders' | 'pocket' | 'history' | 'profile') of a path, or null. */
export const resolveDeliveryTab = (pathname) => TAB_BY_PATH[clean(pathname)]?.[1] || null;

export const DELIVERY_TAB_PATHS = Object.keys(TAB_BY_PATH);

// true for an ordinary page, and for a kept-alive layer while it is the one on screen. On the web DeliveryHomeV2 was
// unmounted when /orders (or any other page) opened and mounted again when it came back; here it stays mounted, so
// effects that ran "while mounted" (GPS watch, heartbeat, polling, alert popups) depend on this flag instead, and data
// the web loaded on mount is loaded again when the layer becomes active.
const DeliveryTabActiveContext = createContext(true);
export const DeliveryTabActiveProvider = DeliveryTabActiveContext.Provider;
export const useDeliveryTabActive = () => useContext(DeliveryTabActiveContext);
