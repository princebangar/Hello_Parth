import React from "react"
import { View } from "react-native"
import { useLocation } from "@/lib/router"
import { colors } from "@/theme"
import PolicyPageLoader from "./PolicyPageLoader"
import { isPolicyPath } from "../utils/policyPaths"

// Fallback for the big route boundaries while a screen is not ready yet (web: shared/components/AppRouteFallback.jsx).
// The Captain app only has partner screens: the web shows them a plain white page (not the customer skeleton), and the
// Terms / Privacy / Support screens get the plain policy loader.
export default function AppRouteFallback() {
  const { pathname } = useLocation()
  if (isPolicyPath(pathname)) return <PolicyPageLoader />
  return <View style={{ flex: 1, width: "100%", backgroundColor: colors.white }} accessibilityRole="progressbar" accessibilityLabel="Loading" />
}
