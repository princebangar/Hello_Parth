// Room a scrolling tab page needs at its end so the last card clears the floating bottom navigation
// (Food BottomNavigation / Taxi BottomNavbar: a 72px bar, 24px above the screen edge) and the Android
// system navigation bar under it (edge-to-edge: the app draws behind it, the web never had one).
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const BOTTOM_NAV_HEIGHT = 72;
export const BOTTOM_NAV_GAP = 24;

export function useBottomNavSpace(extra = 24) {
  const insets = useSafeAreaInsets();
  return BOTTOM_NAV_HEIGHT + BOTTOM_NAV_GAP + insets.bottom + extra;
}
