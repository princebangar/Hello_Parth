import { useEffect } from "react";

/**
 * Login screens must not grab focus on their own (after a logout the keyboard stays closed until the person taps
 * the number box), but coming back from the code screen with the pencil / "Change number" has to put the cursor
 * straight into the number box. The pencil leaves a short-lived note; the number screen reads it once.
 */
const KEY = "hp_login_focus_phone_at";
const VALID_MS = 4000;

export function requestPhoneFocus() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage blocked: the person just taps the box
  }
}

const readRequest = () => {
  try {
    const at = Number(sessionStorage.getItem(KEY) || 0);
    return at > 0 && Date.now() - at <= VALID_MS;
  } catch {
    return false;
  }
};

const clearRequest = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};

/** Focuses the number input once, only when the pencil asked for it. `getInput` returns the element (or null yet). */
export function usePhoneFocusRequest(getInput, active = true) {
  useEffect(() => {
    if (!active || !readRequest()) return undefined;
    let tries = 0;
    // the form can mount a moment later (page transition), so retry briefly
    const timer = setInterval(() => {
      tries += 1;
      const el = getInput();
      if (el) {
        clearRequest();
        el.focus();
        // a click opens the soft keyboard inside Android / iOS WebViews, where focus() alone often does not
        try {
          el.click();
        } catch {
          // ignore
        }
        clearInterval(timer);
      } else if (tries >= 25) {
        clearRequest();
        clearInterval(timer);
      }
    }, 60);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
