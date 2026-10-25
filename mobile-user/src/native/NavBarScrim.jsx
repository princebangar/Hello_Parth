// The app draws edge to edge, so the Android navigation bar sits on top of the page. On phones that use the three
// navigation buttons the bar gets a solid strip in the page colour, with button icons that contrast with it (dark on
// light, light on dark), so the buttons stay visible and no content shows behind them. Gesture navigation (a thin
// handle, small bottom inset) stays full screen.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

const BUTTON_NAV_MIN_INSET = 40; // three-button bar is 48dp, the gesture handle area ~16-24dp

export function NavBarScrim() {
  const t = useTheme();
  const { bottom } = useSafeAreaInsets();
  const buttons = bottom >= BUTTON_NAV_MIN_INSET;
  return (
    <>
      <NavigationBar style={t.dark ? 'dark' : 'light'} />
      {buttons ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: bottom,
            backgroundColor: t.bg,
            // a thin line on top separates the buttons from the page (like other shopping apps' bars)
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: t.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
            zIndex: 999,
            elevation: 999,
          }}
        />
      ) : null}
    </>
  );
}
