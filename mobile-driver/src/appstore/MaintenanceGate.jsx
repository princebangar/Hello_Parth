import React from "react"
import { usePathname } from "expo-router"
import { useMaintenanceMode } from "@food/hooks/useMaintenanceMode"
import GlobalMaintenancePage from "@/modules/Global/pages/GlobalMaintenancePage"

// Web: app/MaintenanceGate.jsx. Global admin > Customization Settings > Under Maintenance locks every app (Food + Taxi),
// the driver / owner portal included: the server answers locked app APIs with 503 MAINTENANCE_MODE, so without this
// the screens would show empty lists. (Food's own switch only locks the Food module, which the Captain app does not
// contain.) Rendered above every screen (the web's fixed z-[2000000] layer).
export default function MaintenanceGate() {
  usePathname()
  const { global } = useMaintenanceMode({ active: true })
  if (!global) return null
  return <GlobalMaintenancePage />
}
