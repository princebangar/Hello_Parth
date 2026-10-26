import React from "react"
import { usePathname } from "expo-router"
import { useMaintenanceMode } from "@food/hooks/useMaintenanceMode"
import GlobalMaintenancePage from "@/modules/Global/pages/GlobalMaintenancePage"
import MaintenancePage from "@food/pages/shared/MaintenancePage"

// Web: app/MaintenanceGate.jsx. Two Under Maintenance switches, both answered by the public settings:
//  - Global admin > Customization Settings > Under Maintenance: every app shows the blue all-apps screen;
//  - Food admin > Customization Settings > Food Under Maintenance: the Food module (customer, restaurant, delivery)
//    shows the orange Food screen — the whole restaurant app is Food, so it always applies here (no back arrow: the web
//    gives one to Food customers only).
// The server answers locked app APIs with 503 MAINTENANCE_MODE, so without this the screens would show empty lists.
// Rendered above every screen (the web's fixed z-[2000000] layer).
export default function MaintenanceGate() {
  usePathname()
  const { food, global } = useMaintenanceMode({ active: true })
  if (global) return <GlobalMaintenancePage />
  if (food) return <MaintenancePage />
  return null
}
