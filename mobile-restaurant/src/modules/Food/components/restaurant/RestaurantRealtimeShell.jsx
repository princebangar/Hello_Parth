// Web: modules/Food/routes.jsx RestaurantGlobalNotificationListener(+Inner). Off the orders page there is no accept
// popup, so a new-order card (NewOrderNotification) takes the restaurant to the orders page (which opens accept /
// reject). The ring runs while the card is up; Dismiss silences it. Shown only for an approved, signed-in restaurant on
// a restaurant page that is not an auth page and not an order-managed page (/food/restaurant, /orders, /orders/:id).
// Native: mounted by RestaurantApp while the restaurant is signed in; it also keeps the shared restaurant socket
// (useRestaurantNotifications: one global socket + alert loop for every user of the hook) alive on every page, so a new
// order rings on any screen and while the app is in the background.
import React, { useState } from 'react';
import { useLocationNow, useNavigate } from '@/lib/router';
import { useRestaurantNotifications } from '@food/hooks/useRestaurantNotifications';
import NewOrderNotification from './NewOrderNotification';
import { isRestaurantAuthPath, isRestaurantOrderManagedPath, restaurantApproved } from './restaurantTabPages';

export default function RestaurantRealtimeShell() {
  const navigate = useNavigate();
  const { pathname } = useLocationNow();
  const { newOrder, stopSound } = useRestaurantNotifications();
  const [dismissedKey, setDismissedKey] = useState('');

  const shouldListen =
    pathname.startsWith('/food/restaurant') &&
    !isRestaurantAuthPath(pathname) &&
    !isRestaurantOrderManagedPath(pathname) &&
    restaurantApproved();
  if (!shouldListen) return null;

  const orderKey = String(newOrder?.orderMongoId || newOrder?.orderId || newOrder?._id || '');
  if (!newOrder || !orderKey || orderKey === dismissedKey) return null;
  return (
    <NewOrderNotification
      order={newOrder}
      onClose={() => {
        setDismissedKey(orderKey);
        stopSound();
      }}
      onViewOrder={() => navigate('/food/restaurant')}
    />
  );
}
