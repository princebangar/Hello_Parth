import { useEffect, useState } from 'react';

// How many pixels of the screen the on-screen keyboard covers right now (0 = closed).
//
// Browsers / WebViews differ: some resize the page when the keyboard opens (a fixed bottom bar then rides on top of the
// keyboard by itself, offset 0), others only shrink the *visual* viewport (a fixed bottom bar stays behind the keyboard
// and disappears - the "Pay button vanishes while typing" bug). Lifting a bottom bar by this offset works for both.
export default function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!viewport) return undefined;

    const sync = () => {
      const covered = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
      // a small difference is the browser's address bar, not a keyboard
      setOffset(covered > 120 ? covered : 0);
    };

    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    sync();
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, []);

  return offset;
}
