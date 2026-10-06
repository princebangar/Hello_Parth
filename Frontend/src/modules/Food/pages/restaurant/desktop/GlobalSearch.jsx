import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Search, ShoppingBag, UtensilsCrossed, LayoutGrid, ArrowRight, Loader2, Tags, Wallet, Star, CalendarCheck, Store, Clock, MapPin,
  ChefHat, UserRound, Landmark, ShieldCheck, Power, Download, Bell, LifeBuoy, Settings, Package, PlusCircle, Truck,
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import { BASE } from "./kit"
import { fetchOrders, inr, menuItemsFromResponse } from "./desktopData"

// Every screen of the panel, so the search finds settings too (not only orders and dishes).
export const PAGES = [
  { label: "Dashboard", hint: "Overview, revenue, charts", to: BASE, k: "home overview revenue chart" },
  { label: "Orders", hint: "Accept and manage orders", to: `${BASE}/orders`, k: "order accept reject takeaway dining" },
  { label: "Dining bookings", hint: "Table booking requests", to: `${BASE}/orders?mode=dining`, k: "table booking dining reservation" },
  { label: "Takeaway orders", hint: "Pickup orders only", to: `${BASE}/orders?mode=takeaway`, k: "takeaway pickup" },
  { label: "Inventory", hint: "Dishes, stock, add-ons", to: `${BASE}/inventory`, k: "menu dish item stock food addon" },
  { label: "Menu categories", hint: "Create and edit categories", to: `${BASE}/inventory?tab=categories`, k: "category" },
  { label: "Earnings", hint: "Balance and withdrawals", to: `${BASE}/earnings`, k: "money income payout withdraw wallet finance" },
  { label: "Reviews & complaints", hint: "Customer feedback", to: `${BASE}/reviews`, k: "rating review feedback complaint" },
  { label: "Reservations & dining setup", hint: "Dining settings and photos", to: `${BASE}/reservations`, k: "dining table photo" },
  { label: "Outlet settings", hint: "Everything about your outlet", to: `${BASE}/settings`, k: "setting" },
  { label: "Outlet info", hint: "Name, photos", to: `${BASE}/outlet-info`, k: "name photo image cover" },
  { label: "Outlet timings", hint: "Opening hours", to: `${BASE}/outlet-timings`, k: "time hours open close schedule" },
  { label: "Address & location", hint: "Restaurant address", to: `${BASE}/edit-address`, k: "address location city pincode" },
  { label: "Cuisines", hint: "What you serve", to: `${BASE}/edit-cuisines`, k: "cuisine" },
  { label: "Owner & business details", hint: "Owner, PAN, GST", to: `${BASE}/edit-owner`, k: "owner pan gst email phone contact" },
  { label: "Bank details", hint: "Payout account, UPI", to: `${BASE}/update-bank-details`, k: "bank account ifsc upi" },
  { label: "FSSAI licence", hint: "Licence number and expiry", to: `${BASE}/fssai`, k: "fssai licence license" },
  { label: "Delivery & takeaway status", hint: "Go online / offline, takeaway on or off", to: `${BASE}/status`, k: "online offline pause accepting delivery takeaway status" },
  { label: "Download report", hint: "Export sales as CSV", to: `${BASE}/download-report`, k: "report export csv sales" },
  { label: "Notifications", hint: "All alerts", to: `${BASE}/notifications`, k: "alert bell" },
  { label: "Help & Support", hint: "Raise a ticket", to: `${BASE}/support`, k: "help ticket issue contact" },
  { label: "Account settings", hint: "Logout, delete account", to: `${BASE}/account`, k: "delete logout account privacy terms" },
]

// one icon + colour per page, picked from its address
const ICONS = [
  ["inventory?tab=categories", Tags, "bg-indigo-50 text-indigo-600"],
  ["inventory?tab=addons", PlusCircle, "bg-teal-50 text-teal-600"],
  ["inventory", Package, "bg-orange-50 text-orange-600"],
  ["mode=dining", UtensilsCrossed, "bg-lime-50 text-lime-700"],
  ["mode=takeaway", Store, "bg-amber-50 text-amber-600"],
  ["/orders", ShoppingBag, "bg-rose-50 text-rose-600"],
  ["earnings", Wallet, "bg-emerald-50 text-emerald-600"],
  ["reviews", Star, "bg-amber-50 text-amber-600"],
  ["reservations", CalendarCheck, "bg-lime-50 text-lime-700"],
  ["outlet-info", Store, "bg-rose-50 text-rose-600"],
  ["outlet-timings", Clock, "bg-blue-50 text-blue-600"],
  ["edit-address", MapPin, "bg-emerald-50 text-emerald-600"],
  ["edit-cuisines", ChefHat, "bg-amber-50 text-amber-600"],
  ["edit-owner", UserRound, "bg-violet-50 text-violet-600"],
  ["update-bank-details", Landmark, "bg-blue-50 text-blue-600"],
  ["fssai", ShieldCheck, "bg-violet-50 text-violet-600"],
  ["status", Power, "bg-cyan-50 text-cyan-600"],
  ["download-report", Download, "bg-sky-50 text-sky-600"],
  ["notifications", Bell, "bg-pink-50 text-pink-600"],
  ["support", LifeBuoy, "bg-rose-50 text-rose-600"],
  ["account", Settings, "bg-slate-100 text-slate-600"],
  ["settings", Store, "bg-rose-50 text-rose-600"],
]
const iconFor = (to) => ICONS.find(([k]) => to.includes(k)) || [null, to.endsWith("/restaurant") ? Truck : LayoutGrid, "bg-blue-50 text-blue-600"]

export default function GlobalSearch({ open, onClose }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [q, setQ] = useState("")
  const [orders, setOrders] = useState(null)
  const [dishes, setDishes] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    setQ("")
    setTimeout(() => inputRef.current?.focus(), 30)
    let alive = true
    setLoading(true)
    Promise.allSettled([fetchOrders({ maxPages: 2 }), restaurantAPI.getMenu()]).then(([o, m]) => {
      if (!alive) return
      setOrders(o.status === "fulfilled" ? o.value : [])
      setDishes(m.status === "fulfilled" ? menuItemsFromResponse(m.value) : [])
      setLoading(false)
    })
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => {
      alive = false
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  const query = q.trim().toLowerCase()
  const results = useMemo(() => {
    const pages = PAGES.filter((p) => !query || `${p.label} ${p.hint} ${p.k}`.toLowerCase().includes(query)).slice(0, query ? 6 : 8)
    if (!query) return { pages, orders: [], dishes: [] }
    const o = (orders || [])
      .filter((x) => `${x.orderId} ${x.customer} ${x.itemsText} ${x.phone}`.toLowerCase().includes(query))
      .slice(0, 5)
    const d = (dishes || []).filter((x) => `${x.name} ${x.category}`.toLowerCase().includes(query)).slice(0, 5)
    return { pages, orders: o, dishes: d }
  }, [query, orders, dishes])

  const go = (to) => {
    onClose()
    navigate(to)
  }

  if (!open) return null
  const empty = !results.pages.length && !results.orders.length && !results.dishes.length

  const Row = ({ icon: Icon, tone, title, sub, right, onClick }) => (
    <button onClick={onClick} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
      <span className={`h-9 w-9 shrink-0 rounded-lg grid place-items-center ${tone}`}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900">{title}</span>
        <span className="block truncate text-xs text-slate-500">{sub}</span>
      </span>
      {right && <span className="text-xs font-semibold text-slate-600 tabular-nums">{right}</span>}
      <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#B80B3D]" />
    </button>
  )
  const Group = ({ title, children }) => (
    <div className="mb-2">
      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      {children}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center bg-slate-900/50 px-6 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-5">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search orders, dishes, settings, pages…"
            className="rt-bare h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
          />
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400">ESC</kbd>}
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {empty ? (
            <p className="py-12 text-center text-sm text-slate-500">No results for “{q}”</p>
          ) : (
            <>
              {results.orders.length > 0 && (
                <Group title="Orders">
                  {results.orders.map((o) => (
                    <Row key={o.key} icon={ShoppingBag} tone="bg-rose-50 text-rose-600" title={`#${o.orderId} · ${o.customer}`} sub={o.itemsText} right={inr(o.total)} onClick={() => go(`${BASE}/orders?open=${o.key}`)} />
                  ))}
                </Group>
              )}
              {results.dishes.length > 0 && (
                <Group title="Dishes">
                  {results.dishes.map((d) => (
                    <Row key={d.id} icon={UtensilsCrossed} tone="bg-amber-50 text-amber-600" title={d.name} sub={d.category} right={inr(d.price)} onClick={() => go(`${BASE}/inventory?q=${encodeURIComponent(d.name)}`)} />
                  ))}
                </Group>
              )}
              {results.pages.length > 0 && (
                <Group title={query ? "Pages & settings" : "Quick links"}>
                  {results.pages.map((p) => (
                    <Row key={p.to + p.label} icon={iconFor(p.to)[1]} tone={iconFor(p.to)[2]} title={p.label} sub={p.hint} onClick={() => go(p.to)} />
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
