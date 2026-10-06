import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, RefreshCw, ShoppingBag, Megaphone, X, CheckCheck } from "lucide-react"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
import { restaurantAPI } from "@food/api"
import { BASE } from "./kit"
import { fetchOrders } from "./desktopData"
import { Card, Empty, PageHeader, Spinner, btn, timeAgo } from "./ui"

const DISMISSED_KEY = "restaurant_dismissed_notifications"

const ORDER_LABEL = {
  confirmed: "New order received",
  preparing: "Order is being prepared",
  ready: "Order is ready for pickup",
  out_for_delivery: "Order is out for delivery",
  delivered: "Order delivered",
  completed: "Order completed",
  cancelled: "Order cancelled",
}

export default function DesktopNotifications() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState(null)
  const [tab, setTab] = useState("all")
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]")
    } catch {
      return []
    }
  })
  const { items, loading, markAsRead, dismiss, dismissAll, refresh } = useNotificationInbox("restaurant", { limit: 100, pollMs: 60 * 1000 })

  const loadOrders = useCallback(async () => {
    try {
      restaurantAPI.invalidateOrdersCache()
      setOrders((await fetchOrders({ maxPages: 1 })).slice(0, 30))
    } catch {
      setOrders([])
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed))
    } catch {
      /* ignore */
    }
  }, [dismissed])

  const rows = useMemo(() => {
    const broadcast = (items || []).map((n) => ({
      id: n.id,
      source: "broadcast",
      title: n.title,
      detail: n.message,
      read: n.read,
      at: new Date(n.createdAt),
    }))
    const orderRows = (orders || [])
      .filter((o) => !dismissed.includes(o.key))
      .map((o) => ({
        id: o.key,
        source: "order",
        title: `${ORDER_LABEL[o.status] || "Order update"} · #${o.orderId}`,
        detail: `${o.customer} · ${o.itemsText}`,
        read: true,
        at: o.createdAt,
        to: `${BASE}/orders?open=${o.key}`,
      }))
    return [...broadcast, ...orderRows].sort((a, b) => b.at - a.at)
  }, [items, orders, dismissed])

  const shown = rows.filter((r) => tab === "all" || (tab === "orders" ? r.source === "order" : r.source === "broadcast"))
  const unread = rows.filter((r) => !r.read).length

  const clearAll = () => {
    dismissAll()
    setDismissed((d) => [...new Set([...d, ...(orders || []).map((o) => o.key)])])
  }

  const remove = (r) => (r.source === "broadcast" ? dismiss(r.id) : setDismissed((d) => [...d, r.id]))

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "Order updates and announcements"}
        actions={
          <>
            <button onClick={() => { refresh({ force: true }); loadOrders() }} className={btn.ghost}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            {rows.length > 0 && (
              <button onClick={clearAll} className={btn.ghost}>
                <CheckCheck className="h-4 w-4" /> Clear all
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 flex rounded-lg bg-slate-100 p-0.5 w-fit">
        {[["all", "All"], ["broadcast", "Announcements"], ["orders", "Order updates"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`px-4 h-8 rounded-md text-[13px] font-semibold ${tab === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
            {l}
          </button>
        ))}
      </div>

      <Card bodyClass="p-0">
        {loading && !orders ? (
          <Spinner label="Loading notifications…" />
        ) : shown.length === 0 ? (
          <Empty title="No notifications" hint="New alerts will appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((r) => (
              <li
                key={`${r.source}-${r.id}`}
                className={`group flex items-start gap-4 px-6 py-4 ${r.read ? "" : "bg-[#B80B3D]/[0.03]"} ${r.to ? "cursor-pointer hover:bg-slate-50" : ""}`}
                onClick={() => {
                  if (r.source === "broadcast" && !r.read) markAsRead(r.id)
                  if (r.to) navigate(r.to)
                }}
              >
                <span className={`mt-0.5 h-10 w-10 shrink-0 rounded-xl grid place-items-center ${r.source === "order" ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"}`}>
                  {r.source === "order" ? <ShoppingBag className="h-[18px] w-[18px]" /> : <Megaphone className="h-[18px] w-[18px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                  {r.detail && <p className="mt-0.5 text-sm text-slate-600 line-clamp-2">{r.detail}</p>}
                  <p className="mt-1 text-xs text-slate-400">{timeAgo(r.at)}</p>
                </div>
                {!r.read && <span className="mt-2 h-2 w-2 rounded-full bg-[#B80B3D]" />}
                <button
                  onClick={(e) => { e.stopPropagation(); remove(r) }}
                  className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
