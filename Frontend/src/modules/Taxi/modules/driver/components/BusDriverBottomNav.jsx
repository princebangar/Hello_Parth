import React from 'react';
import { Bus, CalendarDays, ClipboardList, LayoutDashboard, LogOut } from 'lucide-react';
import DriverNavBar from '../../shared/components/DriverNavBar';

const NAV_ITEMS = [
  { id: 'overview', label: 'Home', Icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { id: 'desk', label: 'Desk', Icon: Bus },
  { id: 'bookings', label: 'Bookings', Icon: ClipboardList },
  { id: 'logout', label: 'Logout', Icon: LogOut },
];

// Same floating glass bar as the other driver apps; the Bus driver's tabs live inside one page, so they switch state.
const BusDriverBottomNav = ({ activeTab = 'overview', onChangeTab, onLogout }) => (
  <DriverNavBar
    items={NAV_ITEMS.map(({ id, label, Icon }) => ({
      key: id,
      label,
      Icon,
      active: id !== 'logout' && activeTab === id,
      onSelect: () => (id === 'logout' ? onLogout?.() : onChangeTab?.(id)),
    }))}
  />
);

export default BusDriverBottomNav;
