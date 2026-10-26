// A ScrollView for screens with inputs. Edge-to-edge Android does not resize the window for the keyboard, so a field in
// the lower half stayed under it (the biggest complaint on the Captain app's login). While the keyboard is up this view
// adds the keyboard's height as room at its end and scrolls the focused input (and `extraOffset` px below it, e.g. for
// its error text or a button right under it) into the visible area; focusing another field does the same.
// Same props as ScrollView (keyboardShouldPersistTaps defaults to "handled").
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Dimensions, Keyboard, ScrollView, StyleSheet, TextInput } from 'react-native';

const GAP = 16;
const basePadding = (style) => {
  const flat = StyleSheet.flatten(style) || {};
  return Number(flat.paddingBottom ?? flat.paddingVertical ?? flat.padding) || 0;
};

export const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  { children, contentContainerStyle, extraOffset = 24, onScroll, scrollEventThrottle, ...props },
  ref,
) {
  const scrollRef = useRef(null);
  const yRef = useRef(0);
  const kbRef = useRef(0); // room to add at the end: the part of the window the keyboard covers (0 when the window shrank)
  const kbTopRef = useRef(null); // the keyboard's top edge on screen while it is up
  const [kb, setKb] = useState(0);
  const [kbShown, setKbShown] = useState(false);
  useImperativeHandle(ref, () => scrollRef.current);

  const reveal = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput?.();
    const scroll = scrollRef.current;
    if (!input || !scroll || kbTopRef.current == null) return;
    input.measureInWindow?.((x, y, w, h) => {
      // works both when the window shrinks for the keyboard (adjustResize) and when the keyboard covers it
      const visibleBottom = Math.min(Dimensions.get('window').height, kbTopRef.current) - GAP;
      const bottom = y + h + extraOffset;
      if (bottom > visibleBottom) {
        scroll.scrollTo({ y: yRef.current + (bottom - visibleBottom), animated: true });
      } else if (y < GAP + 40) {
        scroll.scrollTo({ y: Math.max(0, yRef.current - (GAP + 40 - y)), animated: true });
      }
    });
  }, [extraOffset]);

  // a field focused while the keyboard is already up (next field / tap on another one): no keyboard event fires
  useEffect(() => {
    if (!kbShown) return undefined;
    let last = TextInput.State.currentlyFocusedInput?.();
    const id = setInterval(() => {
      const now = TextInput.State.currentlyFocusedInput?.();
      if (now && now !== last) reveal();
      last = now;
    }, 250);
    return () => clearInterval(id);
  }, [kbShown, reveal]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const h = Dimensions.get('window').height;
      const top = e?.endCoordinates?.screenY ?? h;
      const covered = Math.round(h - top);
      kbRef.current = covered > 120 ? covered : 0;
      kbTopRef.current = top;
      setKb(kbRef.current);
      setKbShown(true);
      // after the extra room has been laid out
      requestAnimationFrame(() => requestAnimationFrame(reveal));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbRef.current = 0;
      kbTopRef.current = null;
      setKb(0);
      setKbShown(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [reveal]);

  return (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      {...props}
      scrollEventThrottle={scrollEventThrottle ?? 16}
      onScroll={(e) => {
        yRef.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      contentContainerStyle={[contentContainerStyle, kb ? { paddingBottom: basePadding(contentContainerStyle) + kb + GAP } : null]}
    >
      {children}
    </ScrollView>
  );
});
