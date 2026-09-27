import { startTransition, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, Globe, Search, Truck, UtensilsCrossed, X } from "lucide-react"
import { cn } from "@food/utils/utils"
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo"
import {
  FOOD_ADMIN_HOME,
  GLOBAL_ADMIN_HOME,
  TAXI_ADMIN_HOME,
  prefetchFoodAdmin,
  prefetchTaxiAdmin,
} from "@/shared/utils/activeModule.js"
import { getModuleAccess, readAdminProfile } from "@/shared/utils/adminAccess.js"
import { getGlobalMenu } from "../constants/globalMenu"

const isActivePath = (pathname, item) => {
  const path = String(pathname || "").replace(/\/+$/, "") || "/"
  return item.exact ? path === item.path : path === item.path || path.startsWith(`${item.path}/`)
}

/**
 * Sidebar of the Global admin. Same shell as the Food and Taxi sidebars (module switcher on top) but it only
 * lists Global sections — never Food or Taxi menu items.
 */
export default function GlobalSidebar({ isOpen = false, isCollapsed = false, onClose, onToggleCollapse }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")

  // Read on every render: the layout re-renders this sidebar when the profile is refreshed from the server.
  const profile = readAdminProfile()
  const access = getModuleAccess(profile)

  const term = query.trim().toLowerCase()
  const groups = getGlobalMenu(profile)
  const menu = term
    ? groups
        .map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(term)) }))
        .filter((group) => group.items.length > 0)
    : groups

  const switchModule = (path) => {
    const go = () => startTransition(() => navigate(path))
    if (path === TAXI_ADMIN_HOME) return Promise.resolve(prefetchTaxiAdmin()).finally(go)
    if (path === FOOD_ADMIN_HOME) return Promise.resolve(prefetchFoodAdmin()).finally(go)
    return go()
  }

  return (
    <div
      className={cn(
        "bg-neutral-950 border-r border-neutral-800/60 h-screen fixed left-0 top-0 z-50 flex flex-col overflow-hidden",
        "transform transition-all duration-300 ease-in-out lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        isCollapsed ? "w-20" : "w-80",
      )}
    >
      {/* Brand */}
      <div className="shrink-0 px-3 py-3 border-b border-neutral-800/60 bg-neutral-900">
        <div className="relative flex items-center mb-3 min-h-[80px]">
          <img
            src={DEFAULT_BRAND_LOGO}
            alt="Hello Parth"
            className={isCollapsed ? "h-14 w-14 object-contain" : "h-20 w-20 object-contain"}
          />
          {!isCollapsed && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <h3 className="text-[15px] font-extrabold leading-tight text-white tracking-tight">Hello Parth</h3>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Global Admin</span>
              </div>
            </div>
          )}
          <div
            className={cn(
              "flex items-center gap-2 shrink-0 absolute top-1/2 -translate-y-1/2 z-[60]",
              isCollapsed ? "-right-3" : "right-0",
            )}
          >
            <button
              type="button"
              onClick={onToggleCollapse}
              className="text-neutral-300 hover:text-white transition-all duration-200 hover:scale-110 p-1.5 rounded-lg hover:bg-white/5"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden text-neutral-300 hover:text-white transition-all duration-200 hover:scale-110"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider text-left">Admin Panel</h2>
          </div>
        )}

        {!isCollapsed && (access.food || access.taxi) && (
          <div className="flex p-1 bg-neutral-800/40 backdrop-blur-sm rounded-xl mb-4 border border-white/5 shadow-inner">
            {access.food && (
              <button
                type="button"
                onClick={() => switchModule(FOOD_ADMIN_HOME)}
                onMouseEnter={prefetchFoodAdmin}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all duration-300 text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
              >
                <UtensilsCrossed className="w-3.5 h-3.5 text-neutral-500" />
                Food
              </button>
            )}
            {access.taxi && (
              <button
                type="button"
                onClick={() => switchModule(TAXI_ADMIN_HOME)}
                onMouseEnter={prefetchTaxiAdmin}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all duration-300 text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
              >
                <Truck className="w-3.5 h-3.5 text-neutral-500" />
                Taxi
              </button>
            )}
          </div>
        )}

        {!isCollapsed && (
          <button
            type="button"
            onClick={() => switchModule(GLOBAL_ADMIN_HOME)}
            className="w-full flex items-center justify-center gap-2 py-2 mb-4 -mt-2 text-xs font-bold rounded-lg border bg-white text-black border-white shadow-[0_4px_12px_rgba(255,255,255,0.15)]"
            aria-current="page"
          >
            <Globe className="w-3.5 h-3.5" />
            Global
          </button>
        )}

        {!isCollapsed && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4 z-10" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Menu..."
              className={cn(
                "w-full pl-9 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white placeholder:text-neutral-500",
                "focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all duration-200 text-left",
                query ? "pr-9" : "pr-3",
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white z-10"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="admin-sidebar-scroll flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3 space-y-2" aria-label="Global admin">
        {menu.length === 0 ? (
          <div className="px-3 py-12 text-left">
            <p className="text-neutral-300 text-sm font-medium">No menu items found</p>
            <p className="text-neutral-500 text-sm mt-2">Try a different search term</p>
          </div>
        ) : (
          menu.map((group, groupIndex) => (
            <div key={group.label} className={cn(groupIndex > 0 && "mt-4 pt-4 border-t border-neutral-800/60")}>
              {!isCollapsed && (
                <div className="px-3 py-2 mb-2">
                  <span className="text-neutral-400 font-bold text-sm uppercase tracking-wider text-left">{group.label}</span>
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active = isActivePath(location.pathname, item)
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      data-active={active ? "true" : undefined}
                      onClick={() => {
                        if (window.innerWidth < 1024 && onClose) onClose()
                      }}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold text-left outline-none focus:outline-none",
                        active
                          ? "bg-white/10 text-white border border-white/15"
                          : "text-neutral-300 hover:bg-white/5 hover:text-white transition-colors duration-200",
                        isCollapsed && "justify-center px-2",
                      )}
                    >
                      <Icon className={cn("shrink-0 w-4 h-4", active ? "text-white scale-110" : "text-neutral-300")} />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </nav>
    </div>
  )
}
