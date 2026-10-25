import React from "react"
import { View } from "react-native"
import { useLocation } from "@/lib/router"
import { AppShellSkeleton } from "@food/components/ui/loading-skeletons"
import { colors } from "@/theme"
import PolicyPageLoader from "./PolicyPageLoader"
import TaxiPageSkeleton, { taxiSkeletonVariant } from "./TaxiPageSkeleton"
import { isPolicyPath } from "../utils/policyPaths"

// The admin panels (/admin/*, /taxi/admin/*) are not the customer app: while one of their screens loads they must not
// flash the customer home skeleton. (The user app does not contain them; kept so the rule stays the web's.)
const isAdminPath = (pathname = "") => /^\/(taxi\/)?admin(\/|$)/.test(pathname)

// The partner apps (restaurant, delivery partner, taxi captain / owner / bus driver) are separate apps: a plain white
// page instead of the customer skeleton.
const isPartnerPath = (pathname = "") => /^\/(food\/(restaurant|delivery)|taxi\/(driver|owner))(\/|$)/.test(pathname)

// Every Taxi screen except its home (which has its own phone-shaped skeleton) gets a Taxi-shaped placeholder instead
// of Food's restaurant list.
const isTaxiScreen = (pathname = "") => pathname.startsWith("/taxi/") && pathname.replace(/\/+$/, "") !== "/taxi/user"

function PartnerRouteFallback() {
  return <View style={{ flex: 1, width: "100%", backgroundColor: colors.white }} accessibilityRole="progressbar" accessibilityLabel="Loading" />
}

function AdminRouteFallback() {
  // lg:block sidebar is desktop only: on a phone the admin fallback is the plain neutral-100 page
  return <View style={{ flex: 1, width: "100%", backgroundColor: colors.neutral[100] }} accessibilityRole="progressbar" accessibilityLabel="Loading admin panel" />
}

// Fallback for the big route boundaries (the Food / Taxi shells and their routers) while a screen is not ready yet.
// Almost every route keeps the home-shaped skeleton; Terms / Privacy / Support get the plain loader instead.
export default function AppRouteFallback() {
  const { pathname } = useLocation()
  if (isAdminPath(pathname)) return <AdminRouteFallback />
  if (isPolicyPath(pathname)) return <PolicyPageLoader />
  if (isPartnerPath(pathname)) return <PartnerRouteFallback />
  if (isTaxiScreen(pathname)) return <TaxiPageSkeleton variant={taxiSkeletonVariant(pathname)} />
  return <AppShellSkeleton />
}
