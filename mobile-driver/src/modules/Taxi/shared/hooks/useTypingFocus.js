// Web: true while a text field has focus on a touch device (the on-screen keyboard is open), so bottom bars step
// aside instead of floating on top of the keyboard. Native: the keyboard's own show/hide events say the same.
import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

// Kept for callers that checked an element; native inputs always open the keyboard.
export const isTypingElement = (element) => Boolean(element);

export default function useTypingFocus() {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    setTyping(Keyboard.isVisible?.() || false);
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return typing;
}

// Web: scrolled the focused field into view for WebViews that did not. Native screens use KeyboardAvoidingView /
// `Screen keyboard` and the ScrollView keeps the focused input visible, so nothing to do here.
export function useScrollFocusedFieldIntoView() {}
