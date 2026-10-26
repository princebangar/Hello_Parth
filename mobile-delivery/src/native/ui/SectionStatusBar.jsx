// Taxi and Food stay mounted side by side (app/(main)/_layout.jsx). React Native keeps status-bar settings as a stack
// where the newest entry wins, so the hidden half's screens would keep deciding the icon colour of the visible half.
// Screens inside a half use this StatusBar: it only exists while its half is the one on screen, and re-mounts (becomes
// the newest entry again) when that half comes back.
import React, { createContext, useContext } from 'react';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { usePathname } from 'expo-router';

const SectionActiveContext = createContext(true);

export function SectionActive({ prefix, children }) {
  const pathname = usePathname();
  const active = pathname === prefix || pathname.startsWith(`${prefix}/`);
  return <SectionActiveContext.Provider value={active}>{children}</SectionActiveContext.Provider>;
}

export function StatusBar(props) {
  const active = useContext(SectionActiveContext);
  return active ? <ExpoStatusBar {...props} /> : null;
}
