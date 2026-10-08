import React from "react";
import { startTransition, useEffect, useState } from "react";
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

// Page chunks, warmed on touch so a tab opens without a "load" pause (same files the router lazy-loads).
const PRELOAD = {
  home: () => import("../../driver/pages/DriverHome"),
  history: () => import("../../driver/pages/RideRequests"),
  wallet: () => import("../../driver/pages/DriverWallet"),
  incentives: () => import("../../driver/pages/DriverIncentives"),
  profile: () => import("../../driver/pages/DriverProfile"),
  dashboard: () => import("../../driver/pages/OwnerDashboard"),
  ownerWallet: () => import("../../driver/pages/OwnerWallet"),
  "manage-drivers": () => import("../../driver/pages/settings/ManageDrivers"),
  "vehicle-fleet": () => import("../../driver/pages/settings/OwnerVehicleFleet"),
  "pooling-vehicles": () => import("../../driver/pages/OwnerPoolingVehicles"),
  "bus-service": () => import("../../driver/pages/OwnerBusServicePage"),
};

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

  const items = navItems.map(({ Icon, label, path, exact }) => {
    const routeActive =
      location.pathname === path ||
      (!exact && location.pathname.startsWith(`${path}/`)) ||
      (path === `${routePrefix}/home` && location.pathname === `${routePrefix}/dashboard`);
    const active = pendingPath ? pendingPath === path : routeActive;
    return {
      key: path,
      label,
      Icon,
      active,
      onSelect: () => {
        if (routeActive || pendingPath === path) return;
        setPendingPath(path);
        // A transition keeps the current screen on show until the next one is ready (no blank flash in between).
        startTransition(() => navigate(path));
      },
      onPreload: () => {
        const slug = path.split("/").pop();
        const load = isOwner && slug === "wallet" ? PRELOAD.ownerWallet : PRELOAD[slug];
        load?.().catch(() => {});
      },
    };
  });

  return <DriverNavBar items={items} />;
};

export default DriverBottomNav;
