// true at once when `value` turns true; when it turns false, stays true for `ms` more. The kept-alive tab layers use it
// on sign-out: their screens (the live map, lists, sockets) are unmounted a moment after the login screen is up, not in
// the same frame — tearing them down while the login screen appeared made the hand-over stutter (Prince, 26 Oct).
import { useEffect, useState } from 'react';

export function useDelayedFalse(value, ms = 900) {
  const [delayed, setDelayed] = useState(Boolean(value));
  useEffect(() => {
    if (value) {
      setDelayed(true);
      return undefined;
    }
    const t = setTimeout(() => setDelayed(false), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return Boolean(value) || delayed;
}
