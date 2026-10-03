import { useEffect, useState } from 'react';

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'reset', 'color', 'image', 'hidden']);

// True for elements that open the on-screen keyboard.
export const isTypingElement = (element) => {
  if (!element || element === document.body) return false;
  if (element.isContentEditable) return true;
  const tag = String(element.tagName || '').toLowerCase();
  if (tag === 'textarea') return true;
  if (tag !== 'input') return false;
  return !NON_TEXT_INPUTS.has(String(element.type || 'text').toLowerCase());
};

const isTouchDevice = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)')?.matches || 'ontouchstart' in window);

// While the rider/driver is typing on a phone, the keyboard covers the bottom of the screen; bottom bars should
// step aside instead of floating on top of the keyboard and hiding the field.
export default function useTypingFocus() {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!isTouchDevice()) return undefined;

    const sync = () => setTyping(isTypingElement(document.activeElement));
    const handleFocusOut = () => {
      // focus moves to the next field after focusout; check once it has landed.
      setTimeout(sync, 0);
    };

    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', handleFocusOut);
    sync();
    return () => {
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return typing;
}

// Keeps the focused field in view when the keyboard opens (some Android WebViews do not scroll it into view).
export function useScrollFocusedFieldIntoView() {
  useEffect(() => {
    if (!isTouchDevice()) return undefined;

    let timer = null;
    const handleFocusIn = (event) => {
      const target = event.target;
      if (!isTypingElement(target)) return;
      clearTimeout(timer);
      // Wait for the keyboard to finish opening (viewport resize) before scrolling.
      timer = setTimeout(() => {
        if (document.activeElement !== target || typeof target.scrollIntoView !== 'function') return;
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 350);
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);
}
