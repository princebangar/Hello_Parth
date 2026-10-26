// /food/restaurant/** — the Hello Parth Restaurant Partner app (web: RestaurantRouter, phone layout). RestaurantApp
// brings the theme root, the router's session listeners, the global new-order card, the kept-alive bottom-bar
// screens and the bottom bar; the Stack holds every other page. No slide animation: the web switches restaurant
// screens instantly.
import React from 'react';
import { Stack } from 'expo-router';
import RestaurantApp from '@food/components/restaurant/RestaurantApp';

export default function RestaurantLayout() {
  return (
    <RestaurantApp>
      <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
    </RestaurantApp>
  );
}
