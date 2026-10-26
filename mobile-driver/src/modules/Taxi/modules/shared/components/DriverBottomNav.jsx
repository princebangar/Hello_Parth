// Web: DriverBottomNav.jsx — bottom navigation of the Taxi driver and Owner apps (the Bus driver has its own tabs).
// Drawn once by the driver layout (not by each page) so it stays mounted while the pages change and the active pill can
// slide from tab to tab. A tap lights the tab at once and announces it to the kept-alive tab layer (lib/tabSwitch), which
// shows that tab in a tiny render; the router navigation follows right after.
import React, { useEffect, useState } from 'react';
import { Bus, Car, Home, IndianRupee, Trophy, User, History, Users } from 'lucide-react-native';
import { useLocationNow, useNavigate } from '@/lib/router';
import { announceTabSwitch, navigateAfterTabSwitch } from '@/lib/tabSwitch';
import { useSettings } from '../../../shared/context/SettingsContext';
import { getAuthenticatedDriverRole } from '../../driver/services/registrationService';
import DriverNavBar from './DriverNavBar';
import { preloadDriverPath, resolveDriverTab } from '../../driver/driverTabPages';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

const DriverBottomNav = () => {
  const location = useLocationNow();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const role = location.pathname.startsWith('/taxi/owner')
    ? 'owner'
    : String(getAuthenticatedDriverRole() || 'driver').toLowerCase();
  const isOwner = role === 'owner';
  const routePrefix = isOwner ? '/taxi/owner' : '/taxi/driver';
  // The tapped tab lights up at once; the page (and the real route) catches up behind it.
  const [pendingPath, setPendingPath] = useState(null);
  useEffect(() => {
    setPendingPath(null);
  }, [location.pathname]);
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);

  const navItems = isOwner
    ? [
        { Icon: Home, label: 'Home', path: `${routePrefix}/dashboard` },
        { Icon: Users, label: 'Drivers', path: `${routePrefix}/manage-drivers` },
        { Icon: Car, label: 'Vehicle', path: `${routePrefix}/vehicle-fleet` },
        ...(busEnabled ? [{ Icon: Bus, label: 'Bus', path: `${routePrefix}/bus-service` }] : []),
        { Icon: User, label: 'Account', path: `${routePrefix}/profile` },
      ]
    : [
        { Icon: Home, label: 'Home', path: `${routePrefix}/home` },
        { Icon: History, label: 'History', path: `${routePrefix}/history` },
        { Icon: IndianRupee, label: 'Wallet', path: `${routePrefix}/wallet` },
        { Icon: Trophy, label: 'Milestone', path: `${routePrefix}/incentives` },
        { Icon: User, label: 'Profile', path: `${routePrefix}/profile` },
      ];

  // Screens that belong to a tab without being the tab itself light that tab (the owner's landing path is /home but its
  // tab points at /dashboard; wallet / history open from the dashboard; bus bookings sit under Bus).
  const currentPath = location.pathname.replace(/\/+$/, '');
  const tabAlias = isOwner
    ? {
        [`${routePrefix}/home`]: `${routePrefix}/dashboard`,
        [`${routePrefix}/wallet`]: `${routePrefix}/dashboard`,
        [`${routePrefix}/history`]: `${routePrefix}/dashboard`,
        [`${routePrefix}/bus-bookings`]: `${routePrefix}/bus-service`,
      }
    : {};
  const litPath = tabAlias[currentPath] || currentPath;

  const items = navItems.map(({ Icon, label, path, exact }) => {
    const routeActive =
      litPath === path ||
      (!exact && litPath.startsWith(`${path}/`)) ||
      (path === `${routePrefix}/home` && currentPath === `${routePrefix}/dashboard`);
    const active = pendingPath ? pendingPath === path : routeActive;
    return {
      key: path,
      label,
      Icon,
      active,
      onSelect: () => {
        if (routeActive || pendingPath === path) return;
        setPendingPath(path);
        const tab = resolveDriverTab(path);
        if (tab) announceTabSwitch('driver', tab);
        navigateAfterTabSwitch(() => navigate(path));
      },
      onPreload: () => preloadDriverPath(path),
    };
  });

  return <DriverNavBar items={items} />;
};

export default DriverBottomNav;
