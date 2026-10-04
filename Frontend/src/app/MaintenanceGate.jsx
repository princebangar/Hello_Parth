import { lazy, Suspense } from "react"
import { useLocation } from "react-router-dom"
import { useMaintenanceMode } from "@food/hooks/useMaintenanceMode"

const MaintenancePage = lazy(() => import("@food/pages/shared/MaintenancePage"))

// Admin panels keep working while the apps are in maintenance (the server lets admin tokens through).
const isAdminPath = (pathname = "") => /^\/(taxi\/)?admin(\/|$)/.test(pathname)

// When the admin switches on "Under maintenance" (Global / Food > Customization Settings) the server answers every app API
// with 503 MAINTENANCE_MODE, so the apps used to show empty lists ("0 restaurants"). The maintenance screen and the hook
// that watches the flag already existed but were never mounted - this puts the screen over every non-admin app.
export default function MaintenanceGate() {
  const { pathname } = useLocation()
  const { enabled } = useMaintenanceMode({ active: !isAdminPath(pathname) })
  if (!enabled || isAdminPath(pathname)) return null
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[9999] bg-white" />}>
      <MaintenancePage />
    </Suspense>
  )
}
