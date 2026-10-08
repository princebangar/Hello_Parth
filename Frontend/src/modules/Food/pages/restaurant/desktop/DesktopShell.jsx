import { useEffect, useRef, useState } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Wallet,
  Star,
  CalendarCheck,
  Store,
  LifeBuoy,
  Settings,
  Search,
  Volume2,
  VolumeX,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
  Sun,
  Moon,
} from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import NewOrderModal from "./NewOrderModal"
import GlobalSearch from "./GlobalSearch"
import NotificationBell from "./NotificationBell"
import ProfileMenu from "./ProfileMenu"
import { StatusContext, StatusDialogs } from "./StatusContext"
import useRestaurantStatus from "./useRestaurantStatus"
import LogoutDialog from "./LogoutDialog"
import { BASE, imgUrl, pickRestaurant } from "./kit"
import { isMyStorePartner } from "@food/utils/auth"
import "./desktop.css"

const NAV = [
  { to: BASE, label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: `${BASE}/orders`, label: "Orders", icon: ShoppingBag },
  { to: `${BASE}/inventory`, label: "Inventory", icon: Package },
  { to: `${BASE}/earnings`, label: "Earnings", icon: Wallet },
  { to: `${BASE}/reviews`, label: "Reviews", icon: Star },
  { to: `${BASE}/reservations`, label: "Reservations", icon: CalendarCheck },
  { to: `${BASE}/settings`, label: "Outlet Settings", icon: Store },
  { to: `${BASE}/support`, label: "Help & Support", icon: LifeBuoy },
  { to: `${BASE}/account`, label: "Settings", icon: Settings },
]

// My Store partners have no table reservations (no dining).
const STORE_HIDDEN_NAV = new Set([`${BASE}/reservations`])

const THEME_KEY = "restaurant_desktop_theme"
const readTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) === "dark"
  } catch {
    return false
  }
}

const PILL = {
  Online: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Closed: "border-amber-200 bg-amber-50 text-amber-700",
  Offline: "border-slate-200 bg-slate-100 text-slate-600",
}
const DOT = { Online: "bg-emerald-500 animate-pulse", Closed: "bg-amber-500", Offline: "bg-slate-400" }

export default function DesktopShell() {
  const location = useLocation()
  const mainRef = useRef(null)
  const rootRef = useRef(null)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem("restaurant_desktop_sidebar_collapsed")
      if (saved !== null) return saved === "1"
    } catch {
      /* ignore */
    }
    return typeof window !== "undefined" && window.innerWidth < 1280
  })
  const [restaurant, setRestaurant] = useState(null)
  // Saved profile is known before the fetch finishes, so the menu doesn't flicker for stores.
  const isStore = restaurant ? restaurant.partnerType === "store" : isMyStorePartner()
  const navItems = isStore ? NAV.filter((item) => !STORE_HIDDEN_NAV.has(item.to)) : NAV
  const [searchOpen, setSearchOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [dark, setDark] = useState(readTheme)
  const status = useRestaurantStatus()
  const { newOrder, clearNewOrder, isMuted, setMuted } = useRestaurantNotifications()

  useEffect(() => {
    let alive = true
    restaurantAPI
      .getCurrentRestaurant()
      .then((res) => alive && setRestaurant(pickRestaurant(res)))
      .catch(() => {})
    const onProfile = () =>
      restaurantAPI
        .refreshCurrentRestaurant()
        .then((res) => alive && setRestaurant(pickRestaurant(res)))
        .catch(() => {})
    window.addEventListener("restaurantProfileUpdated", onProfile)
    return () => {
      alive = false
      window.removeEventListener("restaurantProfileUpdated", onProfile)
    }
  }, [])

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [location.pathname])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("restaurant_desktop_sidebar_collapsed", c ? "0" : "1")
      } catch {
        /* ignore */
      }
      return !c
    })

  // Light <-> dark with a circular reveal growing from the bottom-left corner (falls back to an instant switch).
  const toggleTheme = () => {
    const el = rootRef.current
    if (!el) return
    const next = !el.classList.contains("rt-dark")
    const apply = () => {
      try {
        localStorage.setItem(THEME_KEY, next ? "dark" : "light")
      } catch {
        /* ignore */
      }
      // flip the class straight away (no waiting for React), then let React catch up
      el.classList.toggle("rt-dark", next)
    }
    const sync = () => setDark(next)
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (!document.startViewTransition || reduce) {
      apply()
      sync()
      return
    }
    const root = document.documentElement
    root.classList.add("rt-theme-transition", "rt-no-transition")
    const t = document.startViewTransition(apply)
    t.ready
      .then(() => {
        const r = Math.hypot(window.innerWidth, window.innerHeight)
        root.animate(
          { clipPath: [`circle(0px at 0px ${window.innerHeight}px)`, `circle(${r}px at 0px ${window.innerHeight}px)`] },
          { duration: 420, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
        )
      })
      .catch(() => {})
    t.finished.finally(() => {
      root.classList.remove("rt-theme-transition", "rt-no-transition")
      sync()
    })
  }

  const toggleOnline = async () => {
    if (status.busy || !status.ready) return
    const next = !status.accepting
    const ok = await status.setDelivery(next)
    if (ok === false) toast.error("Error updating delivery status")
    else if (ok) toast.success(next ? "Delivery is now ON - You're receiving orders" : "Delivery is now OFF - Not receiving orders", { closeButton: false })
  }

  const name = restaurant?.name || restaurant?.restaurantName || "Your restaurant"
  const logo = imgUrl(restaurant?.profileImage)
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
  const showModal = Boolean(newOrder)

  return (
    <StatusContext.Provider value={status}>
      <div ref={rootRef} className={`rt-root ${dark ? "rt-dark" : ""} fixed inset-0 flex bg-[#f6f7f9] text-slate-900`}>
        {/* Sidebar */}
        <aside className={`${collapsed ? "w-[76px]" : "w-[272px]"} relative z-20 shrink-0 bg-neutral-950 border-r border-neutral-800 flex flex-col transition-[width] duration-200`}>
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-[26px] z-30 h-6 w-6 grid place-items-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-300 shadow-sm hover:text-white hover:border-neutral-500"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>

          <div className={`min-h-[72px] flex items-center border-b border-neutral-800 ${collapsed ? "justify-center px-2" : "gap-3 px-4 py-3"}`}>
            {logo ? (
              <img src={logo} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover border border-neutral-700" />
            ) : (
              <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-[#B80B3D] to-[#7d0728] grid place-items-center text-white">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="break-words text-[15px] font-bold leading-tight text-white line-clamp-2" title={name}>{name}</p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">{isStore ? "Store panel" : "Restaurant panel"}</p>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center ${collapsed ? "justify-center" : "gap-3 px-3"} h-11 rounded-xl text-[14px] font-medium transition-colors ${
                    isActive ? "bg-white/10 text-white shadow-[inset_3px_0_0_#ff3d6b]" : "text-neutral-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-neutral-800">
            <button
              onClick={() => setLogoutOpen(true)}
              className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3 px-3"} h-10 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10`}
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
              {!collapsed && "Logout"}
            </button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-[72px] shrink-0 bg-white border-b border-slate-200 px-6 flex items-center gap-5">
            <div className="min-w-0 flex-1 max-w-[430px]">
              <p className="truncate text-[17px] font-bold leading-tight text-slate-900" title={name}>{name}</p>
              <p className="truncate text-xs text-slate-500">{today}</p>
            </div>

            <button
              onClick={() => setSearchOpen(true)}
              className="hidden h-10 w-[340px] shrink items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-500 hover:bg-white hover:border-slate-300 md:flex"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">Search orders, dishes, settings…</span>
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">Ctrl K</kbd>
            </button>

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setSearchOpen(true)}
                className="md:hidden h-10 w-10 grid place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Search"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>

              <button
                onClick={toggleOnline}
                disabled={status.busy || !status.ready}
                role="switch"
                aria-checked={status.accepting}
                title={status.label === "Closed" ? "Delivery is on, but you are outside your outlet timings" : status.accepting ? "Click to turn delivery off" : "Click to turn delivery on"}
                className={`flex items-center gap-2.5 h-10 pl-3.5 pr-2 rounded-full border text-[13px] font-semibold transition-colors ${PILL[status.label] || PILL.Offline}`}
              >
                <span className={`h-2 w-2 rounded-full ${DOT[status.label] || DOT.Offline}`} />
                {status.label}
                <span className={`relative h-6 w-11 rounded-full transition-colors ${status.accepting ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${status.accepting ? "left-[22px]" : "left-0.5"}`} />
                </span>
              </button>

              <button
                onClick={toggleTheme}
                className="relative h-10 w-10 grid place-items-center overflow-hidden rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {/* shows the mode you will switch TO: sun while dark, moon while light (driven by the .rt-dark class, so it flips with the page) */}
                <Sun className="rt-theme-icon rt-icon-sun absolute h-[18px] w-[18px]" />
                <Moon className="rt-theme-icon rt-icon-moon absolute h-[18px] w-[18px]" />
              </button>

              <button
                onClick={() => setMuted(!isMuted)}
                className="h-10 w-10 grid place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                title={isMuted ? "Unmute order alerts on this device" : "Mute order alerts on this device"}
                aria-label={isMuted ? "Unmute order alerts" : "Mute order alerts"}
              >
                {isMuted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
              </button>

              <NotificationBell />
              <div className="pl-3 border-l border-slate-200">
                <ProfileMenu restaurant={restaurant} onLogout={() => setLogoutOpen(true)} />
              </div>
            </div>
          </header>

          <main ref={mainRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1400px] px-8 py-7">
              <Outlet />
            </div>
          </main>
        </div>

        {showModal && <NewOrderModal key={newOrder.orderMongoId || newOrder.orderId} order={newOrder} onDone={(o) => clearNewOrder(o)} />}
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <StatusDialogs status={status} />
        <LogoutDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} restaurant={restaurant} />
      </div>
    </StatusContext.Provider>
  )
}
