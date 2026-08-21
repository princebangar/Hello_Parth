import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Suspense, lazy } from "react"
import Loader from "@/shared/components/Loader"
import { peekLoginReturnTo, resolvePostLoginRoute } from "@/shared/utils/activeModule.js"

const Login = lazy(() => import("./pages/Login"))

function LoginRedirect() {
  const location = useLocation()
  const from =
    location.state?.from ||
    peekLoginReturnTo() ||
    resolvePostLoginRoute() ||
    "/food/user"

  // Avoid a redirect loop on the login index itself.
  const path = String(location.pathname || "").replace(/\/+$/, "") || "/login"
  if (path === "/login") {
    return <Login />
  }

  return <Navigate to="/login" replace state={{ from }} />
}

export default function AuthRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route index element={<Login />} />
        <Route path="login" element={<Login />} />
        <Route path="services" element={<LoginRedirect />} />
        <Route path="*" element={<LoginRedirect />} />
      </Routes>
    </Suspense>
  )
}
