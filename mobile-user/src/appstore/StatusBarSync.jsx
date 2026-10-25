// The web had no per-page status bar: it read the colour painted at the very top of each page and put it into
// <meta name="theme-color"> on every route / theme change, so the phone's status bar matched the page.
// In the app every screen with a coloured top sets its own status bar (<Screen statusBarStyle> / expo-status-bar).
// This is the default underneath them: React Native keeps status-bar settings as a stack, so a screen that sets
// nothing (a white page after the Taxi home's dark app bar, for example) falls back to dark icons in light mode and
// light icons in dark mode instead of keeping the previous screen's white icons on a white page.
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme';

export default function StatusBarSync() {
  const t = useTheme();
  return <StatusBar style={t.dark ? 'light' : 'dark'} />;
}
