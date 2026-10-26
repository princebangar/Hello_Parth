// Web: DeliveryBottomNav.jsx — the same floating bottom bar (and icon style) as the Taxi / Owner / Bus driver apps.
// On the web DeliveryHomeV2 and OrdersV2 each drew it; here the delivery layout draws it once on the bottom-bar paths
// (never render it in a page), so it stays mounted while the screens change and the active pill can slide. A tap
// lights the tab at once and announces it to the kept-alive layer (lib/tabSwitch); the router navigation follows.
import React, { useEffect, useMemo, useState } from 'react';
import { History, LayoutGrid, Package, User as UserIcon, Wallet } from 'lucide-react-native';
import { useLocationNow, useNavigate } from '@/lib/router';
import { announceTabSwitch, navigateAfterTabSwitch } from '@/lib/tabSwitch';
import { useDeliveryStore, dedupeOrdersByIdentity } from '@/modules/DeliveryV2/store/useDeliveryStore';
import DriverNavBar from '@/modules/Taxi/modules/shared/components/DriverNavBar';
import { deliveryTheme } from '@/theme';
import { resolveDeliveryTab } from '../deliveryTabPages';

export default function DeliveryBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocationNow();
  const currentTab = resolveDeliveryTab(pathname) || 'feed';
  const newOrders = useDeliveryStore((state) => state.newOrders);
  const newOrdersCount = useMemo(() => dedupeOrdersByIdentity(newOrders).length, [newOrders]);
  // the tapped tab lights up at once; the screen (and the real route) catches up behind it
  const [pendingTab, setPendingTab] = useState(null);
  useEffect(() => {
    setPendingTab(null);
  }, [pathname]);

  const tabs = [
    { key: 'feed', label: 'Feed', Icon: LayoutGrid, path: '/food/delivery/feed' },
    { key: 'orders', label: 'Orders', Icon: Package, path: '/food/delivery/orders', badge: newOrdersCount > 0 ? (newOrdersCount > 9 ? '9+' : newOrdersCount) : null },
    { key: 'pocket', label: 'Pocket', Icon: Wallet, path: '/food/delivery/pocket' },
    { key: 'history', label: 'History', Icon: History, path: '/food/delivery/history' },
    { key: 'profile', label: 'Profile', Icon: UserIcon, path: '/food/delivery/profile' },
  ];

  return (
    <DriverNavBar
      accent={deliveryTheme.primary}
      items={tabs.map(({ key, label, Icon, path, badge }) => ({
        key,
        label,
        Icon,
        badge,
        active: (pendingTab || currentTab) === key,
        onSelect: () => {
          // web: navigate(path) on every tap (also the active tab: same address, nothing changes)
          if ((pendingTab || currentTab) === key) return;
          setPendingTab(key);
          announceTabSwitch('delivery', key);
          navigateAfterTabSwitch(() => navigate(path));
        },
      }))}
    />
  );
}
