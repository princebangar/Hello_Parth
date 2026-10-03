import { useEffect } from 'react';

// Stops the page behind a popup/sheet from scrolling while `locked` is true.
// Several popups can be open at once; the page is unlocked when the last one closes.
let lockCount = 0;
let savedOverflow = '';

export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return undefined;

    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) document.body.style.overflow = savedOverflow;
    };
  }, [locked]);
}
