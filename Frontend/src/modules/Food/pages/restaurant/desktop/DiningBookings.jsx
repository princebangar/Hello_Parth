import { useCallback, useEffect, useMemo, useState } from "react"
import { Calendar, Clock, Users, MessageSquare, Phone, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI, diningAPI } from "@food/api"
import { pickRestaurant } from "./kit"
import { Card, Empty, Spinner, btn } from "./ui"

const STATUS = {
  pending: { text: "Approval needed", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  accepted: { text: "Confirmed", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  confirmed: { text: "Confirmed", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  "checked-in": { text: "Checked in", cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  completed: { text: "Completed", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
}
const statusOf = (s) => STATUS[String(s || "").toLowerCase()] || { text: "Cancelled", cls: "bg-rose-50 text-rose-700 ring-rose-200" }

const FILTERS = [
  ["all", "All"],
  ["pending", "Needs approval"],
  ["upcoming", "Confirmed"],
  ["done", "Completed"],
  ["cancelled", "Cancelled"],
]

/** Table / dining bookings with accept & decline (same API as the mobile "Dining Booking" tab). */
export default function DiningBookings({ onCount, compact = false }) {
  const [bookings, setBookings] = useState(null)
  const [filter, setFilter] = useState("all")
  const [busyId, setBusyId] = useState("")

  const load = useCallback(async (silent = true) => {
    try {
      const res = await restaurantAPI.getCurrentRestaurant()
      const restaurant = pickRestaurant(res)
      if (!(restaurant?._id || restaurant?.id)) return setBookings((b) => b || [])
      const r = await diningAPI.getRestaurantBookings(restaurant)
      const list = Array.isArray(r?.data?.data) ? r.data.data : []
      setBookings(list)
      onCount?.(list.filter((b) => String(b.status).toLowerCase() === "pending").length)
    } catch {
      if (!silent) toast.error("Could not load bookings")
      setBookings((b) => b || [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  const update = async (id, status) => {
    setBusyId(id)
    try {
      const res = await diningAPI.updateBookingStatusRestaurant(id, status)
      if (res?.data?.success) {
        setBookings((prev) => prev.map((b) => (b._id === id ? { ...b, status } : b)))
        toast.success(`Booking ${status === "accepted" ? "confirmed" : "declined"}`)
        onCount?.(bookings.filter((b) => b._id !== id && String(b.status).toLowerCase() === "pending").length)
      }
    } catch {
      toast.error("Failed to update booking")
    } finally {
      setBusyId("")
    }
  }

  const list = useMemo(() => {
    const rows = (bookings || []).filter((b) => {
      const s = String(b.status || "").toLowerCase()
      if (filter === "pending") return s === "pending"
      if (filter === "upcoming") return ["accepted", "confirmed", "checked-in"].includes(s)
      if (filter === "done") return s === "completed"
      if (filter === "cancelled") return !["pending", "accepted", "confirmed", "checked-in", "completed"].includes(s)
      return true
    })
    const order = (s) => ({ pending: 0, confirmed: 1, accepted: 1, "checked-in": 2, completed: 3 }[String(s).toLowerCase()] ?? 4)
    return rows.sort((a, b) => order(a.status) - order(b.status) || new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
  }, [bookings, filter])

  if (!bookings) return <Spinner label="Loading bookings…" />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`h-9 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${filter === v ? "bg-[#B80B3D] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {l}
          </button>
        ))}
        <button onClick={() => load(false)} className={`${btn.ghost} ml-auto`}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {list.length === 0 ? (
        <Card><Empty title="No dining bookings" hint="Table booking requests from customers will appear here." /></Card>
      ) : (
        <div className={`grid gap-4 ${compact ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3"}`}>
          {list.map((b) => {
            const st = statusOf(b.status)
            const pending = String(b.status || "").toLowerCase() === "pending"
            const name = b.user?.name || b.customerName || "Guest"
            return (
              <div key={b._id} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="h-11 w-11 shrink-0 rounded-full bg-[#B80B3D]/10 font-bold text-[#B80B3D] grid place-items-center">{name[0]?.toUpperCase()}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{name}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" />{b.user?.phone || b.phone || "No phone"}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${st.cls}`}>{st.text}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                  <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-slate-400" />{new Date(b.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" />{b.timeSlot}</span>
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-slate-400" />{b.guests} guests</span>
                </div>
                {b.specialRequest && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs italic text-blue-800">
                    <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" /> {b.specialRequest}
                  </p>
                )}
                {pending && (
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => update(b._id, "cancelled")} disabled={busyId === b._id} className={`${btn.danger} flex-1`}>Decline</button>
                    <button onClick={() => update(b._id, "accepted")} disabled={busyId === b._id} className={`${btn.primary} flex-1`}>Accept</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Number of table bookings waiting for approval (badge on the Orders page). */
export function usePendingBookingCount(enabled = true) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    const run = async () => {
      try {
        const res = await restaurantAPI.getCurrentRestaurant()
        const restaurant = pickRestaurant(res)
        if (!(restaurant?._id || restaurant?.id)) return
        const r = await diningAPI.getRestaurantBookings(restaurant)
        const list = Array.isArray(r?.data?.data) ? r.data.data : []
        if (alive) setCount(list.filter((b) => String(b.status).toLowerCase() === "pending").length)
      } catch {
        /* badge only */
      }
    }
    run()
    const t = setInterval(run, 15000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [enabled])
  return [count, setCount]
}
