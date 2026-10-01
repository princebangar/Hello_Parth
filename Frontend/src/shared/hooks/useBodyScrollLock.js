import { useEffect } from "react";

// Plain `overflow:hidden` on body doesn't reliably block touch-drag scrolling
// on mobile. Pinning body with `position:fixed` at the current scroll offset
// (and restoring it on release) blocks scroll on touch and desktop, and doesn't
// jump the page afterwards.
//
// Ref-counted so a page-level lock and a dialog's own lock can be active at the
// same time — only the first one pins the body and only the last one releases it.
let lockCount = 0;
let saved = null;

function lockBody() {
  lockCount += 1;
  if (lockCount > 1) return;
  const body = document.body;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  saved = {
    scrollY,
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
  };
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";
}

function unlockBody() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0 || !saved) return;
  const body = document.body;
  body.style.overflow = saved.overflow;
  body.style.position = saved.position;
  body.style.top = saved.top;
  body.style.width = saved.width;
  window.scrollTo(0, saved.scrollY);
  saved = null;
}

export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return undefined;
    lockBody();
    return unlockBody;
  }, [locked]);
}
