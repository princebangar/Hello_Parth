import { useLocation } from "react-router-dom"
import { AppShellSkeleton } from "@food/components/ui/loading-skeletons"
import PolicyPageLoader from "./PolicyPageLoader"
import { isPolicyPath } from "../utils/policyPaths"

// The admin panels (/admin/*, /taxi/admin/*) are not the customer app: while one of their screens loads they must not
// flash the customer home skeleton. Same look as the admin chrome instead - dark sidebar, light page - so the real
// panel simply fills in.
const isAdminPath = (pathname = "") => /^\/(taxi\/)?admin(\/|$)/.test(pathname)

function AdminRouteFallback() {
  return (
    <div className="h-screen w-full flex bg-neutral-100" role="status" aria-label="Loading admin panel">
      <div className="hidden lg:block w-80 shrink-0 bg-neutral-950" />
      <div className="flex-1 min-w-0" />
    </div>
  )
}

// Suspense fallback for the big route boundaries (the Food / Taxi / restaurant / delivery shells and their
// routers). Almost every route keeps the home-shaped skeleton; Terms / Privacy / Support get the plain loader
// instead, so opening one from a login screen never shows a skeleton first and a loader after it.
//
// It reads the location itself (and only exists while a boundary is suspended), so the boundaries that use it can
// stay free of useLocation() - see the notes on FoodAppWrapper in app/routes.jsx.
export default function AppRouteFallback() {
  const { pathname } = useLocation()
  if (isAdminPath(pathname)) return <AdminRouteFallback />
  return isPolicyPath(pathname) ? <PolicyPageLoader /> : <AppShellSkeleton />
}
