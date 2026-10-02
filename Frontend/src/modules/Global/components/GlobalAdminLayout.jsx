import { useEffect, useRef, useState } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { API_BASE_URL } from "@food/api/config"
import { getAdminHomePath, getModuleAccess, hasGlobalSection, readAdminProfile } from "@/shared/utils/adminAccess.js"
import GlobalSidebar from "./GlobalSidebar"
import GlobalTopbar from "./GlobalTopbar"
import { refreshAdminProfile } from "../utils/adminSession"
import { warmAdminPages } from "@/shared/utils/warmAdminPages.js"
import { prefetchCustomizationSettings } from "../api/globalAdminAPI"

const readCollapsed = () => {
  try {
    return Boolean(JSON.parse(localStorage.getItem("admin_sidebar_state") || "{}").isCollapsed)
  } catch {
    return false
  }
}

const writeCollapsed = (isCollapsed) => {
  try {
    const current = JSON.parse(localStorage.getItem("admin_sidebar_state") || "{}")
    localStorage.setItem("admin_sidebar_state", JSON.stringify({ ...current, isCollapsed }))
  } catch {
    // storage may be blocked — the sidebar simply forgets its state
  }
}

/** Shell of the Global admin: its own sidebar and top bar, no Food or Taxi menu. */
export default function GlobalAdminLayout() {
  const location = useLocation()
  const mainRef = useRef(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed)
  const [, setProfileVersion] = useState(0)

  // Load the Global admin pages in the background so sidebar clicks open instantly.
  useEffect(() => warmAdminPages(import.meta.glob("../pages/**/*.jsx")), [])

  // Customization Settings is the page admins open most: fetch its data a moment after the panel is up, so the
  // switches are already there when it is clicked.
  useEffect(() => {
    if (!hasGlobalSection(readAdminProfile(), "customization", "view")) return undefined
    const timer = window.setTimeout(() => prefetchCustomizationSettings(), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  // A change made by the super admin (modules, sidebar options) reaches an open panel without a new sign-in.
  useEffect(() => {
    let cancelled = false
    refreshAdminProfile()
      .then((changed) => {
        if (changed && !cancelled) setProfileVersion((value) => value + 1)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const offset = isCollapsed ? "2.5rem" : "10rem"
    document.documentElement.style.setProperty("--admin-sidebar-offset", offset)
    return () => document.documentElement.style.removeProperty("--admin-sidebar-offset")
  }, [isCollapsed])

  const profile = readAdminProfile()
  if (!getModuleAccess(profile).global) {
    return <Navigate to={getAdminHomePath(profile)} replace />
  }

  const toggleCollapse = () => {
    setIsCollapsed((current) => {
      writeCollapsed(!current)
      return !current
    })
  }

  return (
    <div className="h-screen bg-neutral-200 flex overflow-hidden admin-module-container">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <GlobalSidebar
        isOpen={sidebarOpen}
        isCollapsed={isCollapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={toggleCollapse}
      />

      <div
        className={`flex-1 flex min-h-0 flex-col transition-[margin-left] duration-300 ease-in-out min-w-0 ${
          isCollapsed ? "lg:ml-20" : "lg:ml-80"
        }`}
      >
        <GlobalTopbar onMenuClick={() => setSidebarOpen((value) => !value)} />

        {!API_BASE_URL && (
          <div className="w-full bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-sm text-amber-900">
            Backend disconnected. Data is not live.
          </div>
        )}

        <main ref={mainRef} className="flex-1 min-h-0 w-full max-w-full overflow-x-hidden overflow-y-auto bg-neutral-100">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
