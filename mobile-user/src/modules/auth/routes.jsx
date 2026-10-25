import React from "react"
import { Navigate, useLocation } from "@/lib/router"
import { peekLoginReturnTo, resolvePostLoginRoute } from "@/shared/utils/activeModule.js"
import Login from "./pages/Login"

// The web's /login/* routes: /login and /login/login show the login; any other /login/... address (e.g. the old
// /login/services) goes back to /login, remembering where the customer wanted to go.
// In the app these are src/app/login/index.jsx (Login) and src/app/login/[...rest].jsx (AuthRoutes below).
export function LoginRedirect() {
  const location = useLocation()
  const from =
    location.state?.from ||
    peekLoginReturnTo() ||
    resolvePostLoginRoute() ||
    "/taxi/user"

  // Avoid a redirect loop on the login index itself.
  const path = String(location.pathname || "").replace(/\/+$/, "") || "/login"
  if (path === "/login") {
    return <Login />
  }

  return <Navigate to="/login" replace state={{ from }} />
}

export default function AuthRoutes() {
  const location = useLocation()
  const path = String(location.pathname || "").replace(/\/+$/, "") || "/login"
  if (path === "/login" || path === "/login/login") return <Login />
  return <LoginRedirect />
}
