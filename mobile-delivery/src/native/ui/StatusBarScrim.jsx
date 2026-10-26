// A solid strip behind the Android status bar (clock, battery) at the top of a scrolling page. The app draws edge to
// edge, so without it the page's content scrolls under the status bar icons (inside the old WebView the page started
// below the status bar). Put it as the last child of the page's root view, in the page's background colour.
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function StatusBarScrim({ color }) {
  const insets = useSafeAreaInsets();
  if (!insets.top) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: color, zIndex: 50, elevation: 50 }}
    />
  );
}
