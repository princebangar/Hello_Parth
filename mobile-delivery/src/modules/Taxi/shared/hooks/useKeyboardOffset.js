import { useEffect, useState } from 'react';
import { Dimensions, Keyboard } from 'react-native';

// How many pixels of the screen the on-screen keyboard covers right now (0 = closed).
//
// Whether the window shrinks when the keyboard opens depends on the device (edge-to-edge Android does not resize):
// when it does, a bottom bar already rides on top of the keyboard (offset 0); when it does not, the bar would stay
// behind the keyboard - lifting it by this offset works for both, like the web's visualViewport version.
export default function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const covered = Math.round(Dimensions.get('window').height - (e?.endCoordinates?.screenY ?? Dimensions.get('window').height));
      setOffset(covered > 120 ? covered : 0);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setOffset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return offset;
}
