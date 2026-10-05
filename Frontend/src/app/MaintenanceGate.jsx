import { lazy, Suspense, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useMaintenanceMode } from "@food/hooks/useMaintenanceMode"

const MaintenancePage = lazy(() => import("@food/pages/shared/MaintenancePage"))
const GlobalMaintenancePage = lazy(() => import("@/modules/Global/pages/GlobalMaintenancePage"))

// Admin panels keep working while the apps are in maintenance (the server lets admin tokens through).
const isAdminPath = (pathname = "") => /^\/(taxi\/)?admin(\/|$)/.test(pathname)
// Everything that belongs to the Food module: the customer app and the restaurant / delivery partner apps.
const isFoodPath = (pathname = "") => /^\/(food|user|restaurant|delivery|usermain|profile|cart|orders)(\/|$)/.test(pathname)
// Food customers (not the partner apps) get a back arrow to Taxi, which keeps running while only Food is locked.
const isFoodCustomerPath = (pathname = "") => isFoodPath(pathname) && !/^\/food\/(restaurant|delivery)(\/|$)/.test(pathname)

// Two Under Maintenance switches, both answered by the public settings:
//  - Global admin > Customization Settings > Under Maintenance: every app (Food + Taxi, driver apps too) shows the
//    blue all-apps screen.
//  - Food admin > Customization Settings > Food Under Maintenance: only the Food module (customer, restaurant,
//    delivery) shows the orange Food screen. Login and Taxi keep running, so a customer can step back to Taxi.
// The server answers locked app APIs with 503 MAINTENANCE_MODE, so without this the apps would show empty lists.
export default function MaintenanceGate() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const adminPath = isAdminPath(pathname)
  const { food, global, ready } = useMaintenanceMode({ active: !adminPath })
  const foodLocked = !global && food && isFoodPath(pathname)
  const locked = !adminPath && (global || foodLocked)

  // index.html paints the maintenance screen on a refresh when the cached answer says "locked". If the server says
  // otherwise (switched off meanwhile, or another module), take that layer away once the answer is in.
  useEffect(() => {
    if (!locked && (ready || adminPath)) {
      const root = document.documentElement
      if (root.getAttribute("data-boot") === "maint") {
        root.removeAttribute("data-boot")
        root.removeAttribute("data-maint")
        root.removeAttribute("data-maint-back")
      }
    }
  }, [locked, ready, adminPath])

  if (!locked) return null
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[2000000] bg-white" />}>
      {global ? (
        <GlobalMaintenancePage />
      ) : (
        <MaintenancePage onBack={isFoodCustomerPath(pathname) ? () => navigate("/taxi/user", { replace: true }) : undefined} />
      )}
    </Suspense>
  )
}
