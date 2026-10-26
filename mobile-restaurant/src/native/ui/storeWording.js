// Web: components/restaurant/StorePanelWording.jsx. The partner panel is shared by Restaurant and My Store partners;
// for a My Store partner every visible "restaurant" / "outlet" reads "store" (screens, toasts, dialogs, placeholders).
// The web rewrote the DOM text with a MutationObserver. Here the shared <Text> / <TextInput> (native/ui/Text.jsx) read
// the converter from this context and convert their string children / placeholder, so no screen has to be patched.
// What the partner typed themselves (store name, address, owner ...) stays as entered (the web's "protected" values).
// TextInput values are never converted (the web skipped INPUT / TEXTAREA / SELECT).
import { createContext, createElement, useContext, useEffect, useState } from 'react';
import { getCurrentUser, isMyStorePartner } from '@food/utils/auth';

const WORDS = [
  [/Restaurants/g, 'Stores'],
  [/Restaurant/g, 'Store'],
  [/restaurants/g, 'stores'],
  [/restaurant/g, 'store'],
  [/RESTAURANTS/g, 'STORES'],
  [/RESTAURANT/g, 'STORE'],
  [/Outlets/g, 'Stores'],
  [/Outlet/g, 'Store'],
  [/outlets/g, 'stores'],
  [/outlet/g, 'store'],
  [/OUTLETS/g, 'STORES'],
  [/OUTLET/g, 'STORE'],
];
const TEST = /restaurant|outlet/i;

const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const swap = (text) => WORDS.reduce((acc, [from, to]) => acc.replace(from, to), text);

function buildConverter() {
  if (!isMyStorePartner()) return null;
  const user = getCurrentUser('restaurant') || {};
  const values = Object.values(user)
    .filter((v) => typeof v === 'string' && v.length >= 3 && TEST.test(v))
    .sort((a, b) => b.length - a.length);
  const key = values.join(' ');
  const protectedRe = values.length ? new RegExp(`(${values.map(escapeRe).join('|')})`, 'g') : null;
  const convertString = (text) => {
    if (!TEST.test(text)) return text;
    if (!protectedRe) return swap(text);
    // split() with a capture group keeps the protected pieces at the odd indexes
    return text.split(protectedRe).map((part, i) => (i % 2 ? part : swap(part))).join('');
  };
  convertString.key = key;
  return convertString;
}

const WordingContext = createContext(null);

/** The converter while a My Store partner is signed in, else null. */
export const useStoreWording = () => useContext(WordingContext);

/** string / array-of-strings children -> converted; anything else unchanged */
export function convertChildren(convert, children) {
  if (!convert) return children;
  if (typeof children === 'string') return convert(children);
  if (Array.isArray(children)) return children.map((c) => (typeof c === 'string' ? convert(c) : c));
  return children;
}

export function StoreWordingProvider({ children }) {
  const [convert, setConvert] = useState(() => buildConverter());
  useEffect(() => {
    const sync = () => {
      const next = buildConverter();
      setConvert((prev) => {
        if (!prev && !next) return prev;
        if (prev && next && prev.key === next.key) return prev;
        return next;
      });
    };
    window.addEventListener('restaurantAuthChanged', sync);
    window.addEventListener('storage', sync);
    // Login can finish without an auth event, so re-check now and then (web: every 1.5 s).
    const poll = setInterval(sync, 1500);
    return () => {
      clearInterval(poll);
      window.removeEventListener('restaurantAuthChanged', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return createElement(WordingContext.Provider, { value: convert }, children);
}
