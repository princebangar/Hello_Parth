import { useLocation } from "react-router-dom"
import { AppShellSkeleton } from "@food/components/ui/loading-skeletons"
import PolicyPageLoader from "./PolicyPageLoader"
import { isPolicyPath } from "../utils/policyPaths"

// Suspense fallback for the big route boundaries (the Food / Taxi / restaurant / delivery shells and their
// routers). Almost every route keeps the home-shaped skeleton; Terms / Privacy / Support get the plain loader
// instead, so opening one from a login screen never shows a skeleton first and a loader after it.
//
// It reads the location itself (and only exists while a boundary is suspended), so the boundaries that use it can
// stay free of useLocation() - see the notes on FoodAppWrapper in app/routes.jsx.
export default function AppRouteFallback() {
  const { pathname } = useLocation()
  return isPolicyPath(pathname) ? <PolicyPageLoader /> : <AppShellSkeleton />
}
