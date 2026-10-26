// Web: BusDriverBottomNav.jsx — the bus driver's tabs live inside BusDriverHome (state, not routes), drawn with the same
// floating DriverNavBar as the other driver apps. DriverNavBar places itself above the Android navigation bar
// (insets.bottom), so the page only renders it as the last child of its root view.
import React from 'react';
import { Bus, CalendarDays, ClipboardList, LayoutDashboard, User } from 'lucide-react-native';
import DriverNavBar from '../../shared/components/DriverNavBar';

const NAV_ITEMS = [
  { id: 'overview', label: 'Home', Icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { id: 'desk', label: 'Desk', Icon: Bus },
  { id: 'bookings', label: 'Bookings', Icon: ClipboardList },
  { id: 'profile', label: 'Account', Icon: User },
];

// Same floating glass bar as the other driver apps; the Bus driver's tabs live inside one page, so they switch state.
const BusDriverBottomNav = ({ activeTab = 'overview', onChangeTab }) => (
  <DriverNavBar
    items={NAV_ITEMS.map(({ id, label, Icon }) => ({
      key: id,
      label,
      Icon,
      active: activeTab === id,
      onSelect: () => onChangeTab?.(id),
    }))}
  />
);

export default BusDriverBottomNav;
