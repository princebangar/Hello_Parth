import React from "react";
import { useLocation } from "react-router-dom";
import { getAuthenticatedDriverRole } from "../../driver/services/registrationService";
import "./driverChrome.css";

const ROLES = {
  driver: { title: "Hello Parth", subtitle: "Taxi Driver" },
  bus_driver: { title: "Hello Parth", subtitle: "Bus Driver" },
  pooling_driver: { title: "Hello Parth", subtitle: "Pooling Driver" },
  owner: { title: "Hello Parth", subtitle: "Owner" },
};

/**
 * Header of the driver apps ("Hello Parth" + Taxi Driver / Bus Driver / Pooling Driver / Owner): same curved blue bar on every
 * main screen. `floating` pins it over a full-screen map (Taxi Home); children are the buttons on its right.
 */
const DriverTopBar = ({ floating = false, children = null }) => {
  const { pathname } = useLocation();
  const role = pathname.startsWith("/taxi/owner")
    ? "owner"
    : String(getAuthenticatedDriverRole() || "driver").toLowerCase();
  const { title, subtitle } = ROLES[role] || ROLES.driver;

  return (
    <header className={`driver-topbar${floating ? " is-floating" : ""}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
      <div className="min-w-0 flex-1">
        <p className="driver-topbar-title truncate">{title}</p>
        <p className="driver-topbar-subtitle truncate">{subtitle}</p>
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </header>
  );
};

export default DriverTopBar;
