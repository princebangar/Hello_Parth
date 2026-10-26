// /food/delivery/** — the Hello Parth Delivery Partner app (web: modules/DeliveryV2: index.jsx theme root +
// DeliveryV2Router). DeliveryApp brings the theme root, the router's session listeners, the realtime shell, the
// kept-alive bottom-bar screens and the bottom bar; the Stack holds every other page. No slide animation: the web
// switches delivery screens instantly.
import React from 'react';
import { Stack } from 'expo-router';
import DeliveryApp from '@/modules/DeliveryV2/DeliveryApp';

export default function DeliveryLayout() {
  return (
    <DeliveryApp>
      <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
    </DeliveryApp>
  );
}
