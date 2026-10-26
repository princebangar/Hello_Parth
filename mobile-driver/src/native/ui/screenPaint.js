// "A new screen has been drawn" signal. The kept-alive tab layers (Taxi / Food main tabs) stay on screen when a page
// opens on top of them until that page has actually been laid out, instead of for a fixed time: a slow page used to
// leave an empty (white) frame between the tab disappearing and the page appearing.
import React from 'react';
import { View } from 'react-native';

const listeners = new Set();
let lastPaintAt = 0;

export function notifyScreenPainted() {
  lastPaintAt = Date.now();
  listeners.forEach((fn) => fn());
}

export function onScreenPainted(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const msSinceLastPaint = () => Date.now() - lastPaintAt;

// The layout event reaches JS before the UI thread has drawn a big page (measured on a Redmi 9: ~100 ms of empty
// frame); give the page this long to reach the screen.
const SETTLE_MS = 130;

const PROBE_STYLE = { position: 'absolute', width: 0, height: 0 };

// Rendered after a route's page (inside its Suspense, so a suspended page does not count): its layout arrives once the
// page has been mounted natively; SETTLE_MS later it is on screen.
export function PaintProbe() {
  return (
    <View
      pointerEvents="none"
      style={PROBE_STYLE}
      onLayout={() => setTimeout(notifyScreenPainted, SETTLE_MS)}
    />
  );
}
