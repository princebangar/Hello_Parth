import React from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Briefcase,
  Bus,
  CalendarCheck,
  Car,
  Home,
  IndianRupee,
  Trophy,
  User,
  History,
  Users,
} from "lucide-react";
import { useSettings } from "../../../shared/context/SettingsContext";
import { getAuthenticatedDriverRole } from "../../driver/services/registrationService";
import DriverNavBar from "./DriverNavBar";
import { preloadDriverPath } from "../../driver/driverTabPages";

const isEnabledFlag = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
};

// Bottom navigation of the Taxi driver, Owner and Pooling driver apps (the Bus driver has its own tabs).
const DriverBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const role = location.pathname.startsWith("/taxi/owner")
    ? "owner"
    : String(getAuthenticatedDriverRole() || "driver").toLowerCase();
  const isOwner = role === "owner";
  const routePrefix = isOwner ? "/taxi/owner" : "/taxi/driver";
  // The tapped tab lights up at once; the page (and the real route) catches up behind it.
  const [pendingPath, setPendingPath] = useState(null);
  useEffect(() => {
    setPendingPath(null);
  }, [location.pathname]);
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);

  const navItems = isOwner
    ? [
        { Icon: Home, label: "Dashboard", path: `${routePrefix}/dashboard` },
        { Icon: Users, label: "Drivers", path: `${routePrefix}/manage-drivers` },
        { Icon: Car, label: "Vehicle", path: `${routePrefix}/vehicle-fleet` },
        { Icon: Briefcase, label: "Pooling", path: `${routePrefix}/pooling-vehicles` },
        ...(busEnabled ? [{ Icon: Bus, label: "Bus", path: `${routePrefix}/bus-service` }] : []),
        { Icon: User, label: "Account", path: `${routePrefix}/profile` },
      ]
    : role === "pooling_driver"
      ? [
          { Icon: Home, label: "Home", path: "/taxi/driver/pooling", exact: true },
          { Icon: CalendarCheck, label: "Bookings", path: "/taxi/driver/pooling/bookings" },
        ]
      : [
          { Icon: Home, label: "Home", path: `${routePrefix}/home` },
          { Icon: History, label: "History", path: `${routePrefix}/history` },
          { Icon: IndianRupee, label: "Wallet", path: `${routePrefix}/wallet` },
          { Icon: Trophy, label: "Milestone", path: `${routePrefix}/incentives` },
          { Icon: User, label: "Profile", path: `${routePrefix}/profile` },
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
        // Straight away, like the delivery app: the screen is normally preloaded; if not, its skeleton shows in place
        // (a transition kept the old screen frozen until the code arrived - that was the 1 s wait).
        navigate(path);
      },
      // the screen's code starts loading as soon as a finger lands (normally it is already preloaded)
      onPreload: () => preloadDriverPath(path),
    };
  });

  return <DriverNavBar items={items} />;
};

export default DriverBottomNav;
