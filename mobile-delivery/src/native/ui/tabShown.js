// Kept-alive bottom-bar tabs keep their scroll position while hidden. Prince (26 Oct): after going to another tab and
// back, a tab starts again from the top (like the web, where the tab was rebuilt). TabShownProvider (set by the tab
// keep-alive layer) says whether a tab is the shown one; it stays true while a page is open on top of the tab, so
// Back from a page keeps the place. useTabScrollTop(ref) scrolls the tab's main list to the top as soon as another tab
// has been shown — while it is hidden, so nothing jumps on screen.
import { createContext, useContext, useEffect, useRef } from 'react';

const TabShownContext = createContext(true);

export const TabShownProvider = TabShownContext.Provider;
export const useTabShown = () => useContext(TabShownContext);

export function useTabScrollTop(ref) {
  const shown = useTabShown();
  const wasShown = useRef(shown);
  useEffect(() => {
    if (wasShown.current && !shown) {
      const list = ref.current;
      if (list?.scrollToOffset) list.scrollToOffset({ offset: 0, animated: false });
      else list?.scrollTo?.({ y: 0, animated: false });
    }
    wasShown.current = shown;
  }, [shown, ref]);
}
