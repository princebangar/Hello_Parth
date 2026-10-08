import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, LayoutGrid, Package, User as UserIcon, Wallet } from 'lucide-react';
import { useDeliveryStore, dedupeOrdersByIdentity } from '@/modules/DeliveryV2/store/useDeliveryStore';
import DriverNavBar from '@/modules/Taxi/modules/shared/components/DriverNavBar';

// Same floating bottom bar (and icon style) as the Taxi / Owner / Bus / Pooling driver apps.
export default function DeliveryBottomNav({ currentTab = 'feed' }) {
  const navigate = useNavigate();
  const newOrders = useDeliveryStore((state) => state.newOrders);
  const newOrdersCount = useMemo(() => dedupeOrdersByIdentity(newOrders).length, [newOrders]);

  const tabs = [
    { key: 'feed', label: 'Feed', Icon: LayoutGrid, path: '/food/delivery/feed' },
    { key: 'orders', label: 'Orders', Icon: Package, path: '/food/delivery/orders', badge: newOrdersCount > 0 ? (newOrdersCount > 9 ? '9+' : newOrdersCount) : null },
    { key: 'pocket', label: 'Pocket', Icon: Wallet, path: '/food/delivery/pocket' },
    { key: 'history', label: 'History', Icon: History, path: '/food/delivery/history' },
    { key: 'profile', label: 'Profile', Icon: UserIcon, path: '/food/delivery/profile' },
  ];

  return (
    <DriverNavBar
      items={tabs.map(({ key, label, Icon, path, badge }) => ({
        key,
        label,
        Icon,
        badge,
        active: currentTab === key,
        onSelect: () => navigate(path),
      }))}
    />
  );
}
