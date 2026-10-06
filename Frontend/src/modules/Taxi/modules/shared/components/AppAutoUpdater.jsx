import { useEffect } from 'react';

const CHECK_INTERVAL_MS = 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 1500;

// Screens where an unannounced full-page reload would wipe in-progress, un-persisted
// booking state (pickup/drop, selected vehicle, live tracking). A stray reload here is
// what produced the "white flash then back to the previous screen" report in production —
// mid-flow the router state (pickup/drop/coords) doesn't survive a hard reload, so the next
// page bounces the user back. Defer the update instead of interrupting these flows; the
// periodic/focus/pageshow checks below simply retry once the user reaches a safe screen.
const CRITICAL_FLOW_SEGMENTS = [
  '/ride/select-location',
  '/ride/select-vehicle',
  '/ride/searching',
  '/ride/tracking',
  '/ride/complete',
  '/ride/chat',
  '/parcel/searching',
  '/parcel/tracking',
  '/parcel/details',
  '/parcel/contacts',
  '/intercity/details',
  '/intercity/confirm',
  '/food/user/checkout',
  '/food/user/cart',
];

const isOnCriticalFlow = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  // The phone app (WebView) keeps the real screen in the #hash and its path stays the fixed start page, so the
  // hash has to be checked too - otherwise a booking flow there was never seen as "critical" and got reloaded.
  const path = `${window.location?.pathname || ''}${window.location?.hash || ''}`;
  return CRITICAL_FLOW_SEGMENTS.some((segment) => path.includes(segment));
};

const getCurrentEntryScript = () => {
  if (typeof document === 'undefined') {
    return '';
  }

  const scripts = Array.from(document.querySelectorAll('script[type="module"][src]'));
  return scripts[scripts.length - 1]?.getAttribute('src') || '';
};

const getEntryScriptFromHtml = (html = '') => {
  const match = String(html).match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);
  return match?.[1] || '';
};

const AppAutoUpdater = () => {
  useEffect(() => {
    if (!import.meta.env.PROD || typeof window === 'undefined') {
      return undefined;
    }

    const currentEntryScript = getCurrentEntryScript();

    if (!currentEntryScript) {
      return undefined;
    }

    const checkForUpdate = async () => {
      try {
        const response = await fetch(`/?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        const html = await response.text();
        const nextEntryScript = getEntryScriptFromHtml(html);

        if (nextEntryScript && nextEntryScript !== currentEntryScript && !isOnCriticalFlow()) {
          window.location.reload();
        }
      } catch {
        // Stay on the current bundle if update probing fails.
      }
    };

    const initialCheckTimer = window.setTimeout(checkForUpdate, INITIAL_CHECK_DELAY_MS);
    const interval = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('pageshow', checkForUpdate);

    return () => {
      window.clearTimeout(initialCheckTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', checkForUpdate);
      window.removeEventListener('pageshow', checkForUpdate);
    };
  }, []);

  return null;
};

export default AppAutoUpdater;
