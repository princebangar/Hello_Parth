// true at once when `value` turns true; when it turns false, stays true until the page that opened has been drawn
// (PaintProbe in the route wrappers), at most `maxMs`.
// The kept-alive main tabs use it: when a page opens on top of a tab (address picker, ride booking ...), the tab layer
// stays painted (not touchable) until the new page under it has rendered, instead of disappearing first and showing an
// empty frame.
import { useEffect, useState } from 'react';
import { msSinceLastPaint, onScreenPainted } from './screenPaint';

export function useLingeringTrue(value, maxMs = 700) {
  const [shown, setShown] = useState(Boolean(value));
  useEffect(() => {
    if (value) {
      setShown(true);
      return undefined;
    }
    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      setShown(false);
    };
    // the page may already have reported itself drawn before this effect ran
    if (msSinceLastPaint() < 60) {
      hide();
      return undefined;
    }
    const off = onScreenPainted(hide);
    const t = setTimeout(hide, maxMs);
    return () => {
      done = true;
      off();
      clearTimeout(t);
    };
  }, [value, maxMs]);
  return value ? true : shown;
}
