// While `hold` is true, keeps rendering the element it had when it was last visible: React sees the very same element
// and skips that subtree when the parent re-renders (a hidden kept-alive tab is not rebuilt on every route change).
// Hooks inside it that subscribe to their own state still update it — nothing is suspended or hidden, unlike
// react-freeze, whose Suspense-based freeze left text empty after un-freezing on the new architecture.
// When `hold` turns false the old element is kept for one more frame: the tab becomes visible in a cheap render first
// and is brought up to date right after (rebuilding it in the same render left a blank frame on Back).
import { useEffect, useRef, useState } from 'react';

export function HoldWhileHidden({ hold, children }) {
  const held = useRef(children);
  const [released, setReleased] = useState(!hold);
  useEffect(() => {
    if (hold) {
      setReleased(false);
      return undefined;
    }
    const id = requestAnimationFrame(() => setReleased(true));
    return () => cancelAnimationFrame(id);
  }, [hold]);
  if (!hold && released) held.current = children;
  return held.current;
}
