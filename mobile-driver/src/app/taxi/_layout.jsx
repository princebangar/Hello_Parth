// /taxi/** — the Captain app: the web's driver / owner portal (/taxi/driver/*, /taxi/owner/*). DriverApp brings the web's
// providers (settings, push registration, the partner root: light, #F8F9FA, Outfit); DriverLayout is the portal shell
// (session / approval guard, kept-alive bottom-bar tabs, floating bottom bar, ride-request listener). One layout for
// both portals, like the web's two <Route element={<DriverLayout />}> blocks that never were on screen together.
// No slide animation: the web switches partner screens instantly.
import React from 'react';
import { Stack } from 'expo-router';
import DriverApp from '@/modules/Taxi/DriverApp';
import DriverLayout from '@/modules/Taxi/modules/driver/components/DriverLayout';

export default function TaxiLayout() {
  return (
    <DriverApp>
      <DriverLayout>
        <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
      </DriverLayout>
    </DriverApp>
  );
}
