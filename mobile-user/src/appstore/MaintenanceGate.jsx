import React from "react"
import { usePathname } from "expo-router"
import { navigateTo } from "@/lib/router"
import { useMaintenanceMode } from "@food/hooks/useMaintenanceMode"
import MaintenancePage from "@food/pages/shared/MaintenancePage"
import GlobalMaintenancePage from "@/modules/Global/pages/GlobalMaintenancePage"

// Admin panels keep working while the apps are in maintenance (the server lets admin tokens through).
const isAdminPath = (pathname = "") => /^\/(taxi\/)?admin(\/|$)/.test(pathname)
// Everything that belongs to the Food module: the customer app and the restaurant / delivery partner apps.
const isFoodPath = (pathname = "") => /^\/(food|user|restaurant|delivery|usermain|profile|cart|orders)(\/|$)/.test(pathname)
// Food customers (not the partner apps) get a back arrow to Taxi, which keeps running while only Food is locked.
const isFoodCustomerPath = (pathname = "") => isFoodPath(pathname) && !/^\/food\/(restaurant|delivery)(\/|$)/.test(pathname)

// Two Under Maintenance switches, both answered by the public settings:
//  - Global admin > Customization Settings > Under Maintenance: every app (Food + Taxi) shows the all-apps screen.
//  - Food admin > Customization Settings > Food Under Maintenance: only the Food module shows the Food screen. Login and
//    Taxi keep running, so a customer can step back to Taxi.
// The server answers locked app APIs with 503 MAINTENANCE_MODE, so without this the apps would show empty lists.
// Rendered by AppShell above every screen (the web's fixed z-[2000000] layer).
export default function MaintenanceGate() {
  const pathname = usePathname()
  const adminPath = isAdminPath(pathname)
  const { food, global } = useMaintenanceMode({ active: !adminPath })
  const foodLocked = !global && food && isFoodPath(pathname)
  const locked = !adminPath && (global || foodLocked)

  if (!locked) return null
  return global ? (
    <GlobalMaintenancePage />
  ) : (
    <MaintenancePage onBack={isFoodCustomerPath(pathname) ? () => navigateTo("/taxi/user", { replace: true }) : undefined} />
  )
}
