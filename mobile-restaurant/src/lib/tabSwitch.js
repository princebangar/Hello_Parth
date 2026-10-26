// Instant bottom-bar tab switches. A route change re-renders a lot (router state, every screen that reads the
// location) and took 0.3-0.5 s on a mid-range phone before the new tab showed. The bottom bars announce the tab here
// first: the kept-alive tab layer shows it in a tiny render, and the router navigation runs right after, while the new
// tab is already on screen.
import { useEffect, useState } from 'react';

const listeners = new Set();

/** scope: 'food' | 'taxi'; tab: the keep-alive tab id that is about to open. */
export function announceTabSwitch(scope, tab) {
  listeners.forEach((fn) => fn(scope, tab));
}

/** Navigate after the announced tab has been drawn (the announcement renders synchronously in the press handler). */
export function navigateAfterTabSwitch(go) {
  requestAnimationFrame(() => setTimeout(go, 0));
}

/**
 * The tab to show: the announced one until the route changes (to it, or anywhere else), otherwise the route's tab.
 */
export function useAnnouncedTab(scope, routeTab) {
  const [announced, setAnnounced] = useState(null);
  useEffect(() => {
    const fn = (s, tab) => {
      if (s === scope) setAnnounced(tab);
    };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, [scope]);
  useEffect(() => {
    setAnnounced(null);
  }, [routeTab]);
  return announced || routeTab;
}
