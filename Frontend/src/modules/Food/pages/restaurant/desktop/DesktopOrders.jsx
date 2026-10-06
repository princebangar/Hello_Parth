import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { Printer, Search, RefreshCw, X, Check, Loader2, MapPin, Phone, StickyNote, Clock, Store, UtensilsCrossed, ChevronRight, ArrowLeft, Volume2, UserCheck, Hourglass } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import { dayKey, fetchOrders, inr2, isCancelled, isCompleted, isNew } from "./desktopData"
import DiningBookings, { usePendingBookingCount } from "./DiningBookings"
import { Modal } from "./kit"
import { Card, Empty, PageHeader, PrepStepper, Spinner, StatusBadge, btn, timeAgo } from "./ui"

// Orders that are finished (these move to Full History, exactly like the phone "All orders" list).
const isFinished = (o) => isCompleted(o) || isCancelled(o) || /refund|reject/.test(String(o.status))
const isLive = (o) => o.type !== "Dining" && !isFinished(o)

const CHIPS = [
  { id: "all", label: "All", test: () => true },
  { id: "preparing", label: "Preparing", test: (o) => o.status === "preparing" },
  { id: "ready", label: "Ready", test: (o) => o.status === "ready" },
  { id: "out", label: "Out for delivery", test: (o) => o.status === "out_for_delivery" },
  // same six tabs as the phone; the last two look at finished orders
  { id: "completed", label: "Completed", test: (o) => isCompleted(o), finished: true },
  { id: "cancelled", label: "Cancelled", test: (o) => o.status === "cancelled", finished: true },
]

const RANGES = [
  ["today", "Today"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["month", "This month"],
  ["custom", "Custom date range"],
]

const HISTORY_STATUS = [
  ["all", "All statuses"],
  ["preparing", "Preparing"],
  ["ready", "Ready"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
  ["rejected", "Rejected"],
  ["cancelled", "Cancelled"],
]

const prepStart = (o) => {
  const t = o.raw?.tracking?.preparing?.timestamp
  return t ? new Date(t) : o.raw?.acceptedAt ? new Date(o.raw.acceptedAt) : o.createdAt
}
const etaLeft = (o, now) => {
  if (o.status !== "preparing" || !(o.prepTime > 0)) return null
  const left = o.prepTime * 60 - Math.floor((now - prepStart(o).getTime()) / 1000)
  return Math.max(0, left)
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
const isCash = (o) => ["cash", "cod"].includes(String(o.payment || "").toLowerCase().trim())

function Chips({ value, onChange, items }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${
            value === t.id ? "bg-[#B80B3D] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {t.label}
          {t.count != null && (
            <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] ${value === t.id ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function OrdersTable({ list, selectedKey, onSelect, now, empty }) {
  if (!list.length) return <Empty title={empty || "No orders here"} hint="Orders matching this view will appear automatically." />
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400">
          <th className="py-3 pl-5 font-semibold">Order</th>
          <th className="py-3 font-semibold">Customer</th>
          <th className="py-3 font-semibold">Items</th>
          <th className="py-3 font-semibold">Type</th>
          <th className="py-3 font-semibold">Total</th>
          <th className="py-3 font-semibold">Placed</th>
          <th className="py-3 pr-5 text-right font-semibold">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {list.map((o) => {
          const left = etaLeft(o, now)
          return (
            <tr key={o.key} onClick={() => onSelect(o.key)} className={`cursor-pointer transition-colors ${selectedKey === o.key ? "bg-[#B80B3D]/[0.05]" : "hover:bg-slate-50"}`}>
              <td className="py-3.5 pl-5 font-semibold">#{o.orderId}</td>
              <td className="py-3.5">{o.customer}</td>
              <td className="max-w-[220px] truncate py-3.5 text-slate-600">{o.itemsText}</td>
              <td className="py-3.5 text-slate-600">{o.type === "Delivery" ? "Home Delivery" : o.type}</td>
              <td className="py-3.5 font-semibold tabular-nums">{inr2(o.total)}</td>
              <td className="whitespace-nowrap py-3.5 text-slate-500">{timeAgo(o.createdAt)}</td>
              <td className="py-3.5 pr-5 text-right">
                <StatusBadge status={o.status} />
                {left != null && <span className="mt-1 block text-[11px] font-medium text-slate-500">ETA {mmss(left)}</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function OrderPanel({ order: o, now, readOnly, onClose, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [prep, setPrep] = useState(11)
  const [reason, setReason] = useState("")
  const [rejecting, setRejecting] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [otp, setOtp] = useState("")
  const [resending, setResending] = useState(false)

  const id = o.mongoId || o.orderId
  const run = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      await onChanged()
      return true
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Action failed")
      return false
    } finally {
      setBusy(false)
    }
  }

  const partner = o.raw?.deliveryPartnerId || null
  const dispatch = o.raw?.dispatch?.status || null
  const delivery = o.type === "Delivery"
  const left = etaLeft(o, now)

  // Same bill the phone prints (restaurant, order id, date, items table, total, delivery note)
  const printBill = async () => {
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")])
      const doc = new jsPDF()
      doc.setFontSize(18)
      doc.text(o.raw?.restaurantName || "Restaurant", 105, 30, { align: "center" })
      doc.setFontSize(10)
      doc.text(`Order ID: ${o.orderId}`, 20, 45)
      doc.text(`Date: ${o.createdAt.toLocaleString("en-GB")}`, 20, 52)
      doc.text(`Customer: ${o.customer}`, 20, 59)
      if (o.address) doc.text(doc.splitTextToSize(`Address: ${o.address}`, 170), 20, 66)
      autoTable(doc, {
        startY: 82,
        head: [["Item", "Qty", "Price", "Total"]],
        body: o.items.map((it) => [it.variantName ? `${it.name} (${it.variantName})` : it.name || "Item", it.quantity || 1, `Rs ${(it.price || 0).toFixed(2)}`, `Rs ${((it.price || 0) * (it.quantity || 1)).toFixed(2)}`]),
        theme: "striped",
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 9 },
      })
      let y = doc.lastAutoTable.finalY + 10
      doc.setFontSize(12)
      doc.text(`Total: Rs ${o.total.toFixed(2)}`, 20, y)
      y += 10
      doc.setFontSize(10)
      doc.text(`Payment: ${o.payment ? String(o.payment).replace("_", " ") : "N/A"}`, 20, y)
      if (o.note) {
        y += 10
        doc.text("Note:", 20, y)
        doc.text(doc.splitTextToSize(o.note, 170), 20, y + 7)
      }
      doc.save(`bill-${o.orderId}.pdf`)
    } catch {
      toast.error("Could not create the bill")
    }
  }

  const resend = async () => {
    setResending(true)
    try {
      const r = await restaurantAPI.resendDeliveryNotification(id)
      if (r?.data?.success) {
        toast.success("Resend successful")
        onChanged()
      } else toast.error(r?.data?.message || "Failed to send notification")
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to send notification. Please try again.")
    } finally {
      setResending(false)
    }
  }

  return (
    <Card
      title={`Order #${o.orderId}`}
      subtitle={`${o.type === "Delivery" ? "Home Delivery" : o.type} · ${o.createdAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
      action={<button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
    >
      <div className="flex items-center justify-between">
        <StatusBadge status={o.status} />
        {o.payment && <span className="text-xs font-medium uppercase text-slate-500">{String(o.payment).replace("_", " ")}</span>}
      </div>

      <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3.5 text-sm">
        <p className="font-semibold">{o.customer}</p>
        {o.phone && <p className="flex items-center gap-2 text-slate-600"><Phone className="h-3.5 w-3.5" />{o.phone}</p>}
        {o.address && <p className="flex items-start gap-2 text-slate-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{o.address}</p>}
        {left != null && <p className="flex items-center gap-2 text-slate-600"><Clock className="h-3.5 w-3.5" />Ready in {mmss(left)} (prep time {o.prepTime} min)</p>}
        {partner && <p className="flex items-center gap-2 text-emerald-600"><UserCheck className="h-3.5 w-3.5" />Delivery partner assigned</p>}
        {dispatch && delivery && !partner && <p className="flex items-center gap-2 text-slate-500"><Hourglass className="h-3.5 w-3.5" />Dispatch: {dispatch}</p>}
        {o.note && <p className="flex items-start gap-2 text-amber-700"><StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />{o.note}</p>}
      </div>

      {o.type === "Takeaway" && isCash(o) && !isFinished(o) && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Collect cash: {inr2(o.total)}</p>
      )}

      <ul className="mt-4 divide-y divide-slate-100 text-sm">
        {o.items.map((it, i) => (
          <li key={i} className="py-2.5"><b>{it.quantity || 1}×</b> {it.name}{it.variantName ? <span className="text-slate-500"> ({it.variantName})</span> : null}</li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between border-t border-slate-200 pt-3 font-bold"><span>Total</span><span className="tabular-nums">{inr2(o.total)}</span></div>
      <button onClick={printBill} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-[#B80B3D]"><Printer className="h-4 w-4" /> Print bill</button>

      {!readOnly && isNew(o) && !rejecting && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preparation time</p>
          <PrepStepper value={prep} onChange={setPrep} />
          <div className="mt-4 flex gap-2">
            <button onClick={() => setRejecting(true)} disabled={busy} className={`${btn.danger} !h-10 flex-1`}>Reject</button>
            <button onClick={() => run(() => restaurantAPI.acceptOrder(id, prep), `Order #${o.orderId} accepted`)} disabled={busy} className={`${btn.primary} !h-10 flex-[2]`}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept
            </button>
          </div>
        </div>
      )}
      {!readOnly && isNew(o) && rejecting && (
        <div className="mt-5">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason for rejecting" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#B80B3D]" />
          <div className="mt-3 flex gap-2">
            <button onClick={() => setRejecting(false)} className={`${btn.ghost} !h-10 flex-1`}>Back</button>
            <button
              onClick={() => (reason.trim() ? run(() => restaurantAPI.rejectOrder(id, reason.trim()), `Order #${o.orderId} rejected`) : toast.error("Please enter a reason"))}
              disabled={busy}
              className={`${btn.danger} !h-10 flex-1`}
            >Confirm reject</button>
          </div>
        </div>
      )}

      {!readOnly && (o.status === "preparing" || o.status === "ready") && delivery && !partner && dispatch !== "accepted" && (
        <button onClick={resend} disabled={resending} className={`${btn.ghost} mt-5 w-full !h-10`}>
          {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />} Resend notification to delivery partners
        </button>
      )}

      {!readOnly && o.status === "ready" && o.type === "Takeaway" && (
        <button onClick={() => { setOtp(""); setVerifyOpen(true) }} className={`${btn.primary} mt-3 w-full !h-10`}>Verify & complete takeaway</button>
      )}

      {!readOnly && o.status === "preparing" && (
        <button onClick={() => { setReason(""); setCancelOpen(true) }} className={`${btn.danger} mt-3 w-full !h-10`}>Cancel order</button>
      )}

      <Modal
        open={cancelOpen}
        onClose={() => !busy && setCancelOpen(false)}
        title="Cancel order"
        subtitle={`Order #${o.orderId} · ${o.customer}`}
        width="max-w-md"
        footer={
          <>
            <button onClick={() => setCancelOpen(false)} className={btn.ghost}>Keep order</button>
            <button
              disabled={busy}
              onClick={async () => {
                if (!reason.trim()) return toast.error("Please enter a reason")
                restaurantAPI.optimisticallyUpdateOrderStatus(id, "cancelled_by_restaurant")
                if (await run(() => restaurantAPI.rejectOrder(id, reason.trim()), `Order #${o.orderId} cancelled`)) setCancelOpen(false)
              }}
              className={btn.danger}
            >{busy && <Loader2 className="h-4 w-4 animate-spin" />} Cancel order</button>
          </>
        }
      >
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus placeholder="Reason for cancelling" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#B80B3D]" />
      </Modal>

      <Modal
        open={verifyOpen}
        onClose={() => !busy && setVerifyOpen(false)}
        title="Verify takeaway"
        subtitle={`Ask ${o.customer} for the pickup OTP`}
        width="max-w-sm"
        footer={
          <>
            <button onClick={() => setVerifyOpen(false)} className={btn.ghost}>Close</button>
            <button
              disabled={busy || otp.length < 4}
              onClick={async () => {
                if (await run(() => restaurantAPI.completeTakeawayOrder(id, otp.trim()), `Order #${o.orderId} handed over`)) setVerifyOpen(false)
              }}
              className={btn.primary}
            >{busy && <Loader2 className="h-4 w-4 animate-spin" />} Complete order</button>
          </>
        }
      >
        {isCash(o) && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Collect cash: {inr2(o.total)}</p>}
        <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="Enter OTP" autoFocus className="h-12 w-full rounded-xl border-2 border-slate-100 px-4 text-center text-lg font-bold tracking-[0.4em] outline-none focus:border-[#B80B3D]" />
      </Modal>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

export default function DesktopOrders() {
  const { newOrder } = useRestaurantNotifications()
  const [params, setParams] = useSearchParams()
  const routeId = useParams().id
  const mode = ["takeaway", "dining"].includes(params.get("mode")) ? params.get("mode") : "all"
  const view = params.get("view") === "history" || params.get("tab") === "all" ? "history" : "live"
  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, v)))
    next.delete("tab")
    setParams(next, { replace: true })
  }

  const [pendingBookings, setPendingBookings] = usePendingBookingCount()
  const [orders, setOrders] = useState(null)
  const [chip, setChip] = useState("all")
  const [query, setQuery] = useState("")
  const [selectedKey, setSelectedKey] = useState(params.get("open") || routeId || null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [pendingDining, setPendingDining] = useState(null)
  // full history filters
  const [range, setRange] = useState("30")
  const [from, setFrom] = useState(dayKey(new Date()))
  const [to, setTo] = useState(dayKey(new Date()))
  const [hStatus, setHStatus] = useState("all")
  const [hType, setHType] = useState("all")
  const markedReady = useRef(new Set())

  const load = useCallback(async (fresh = false) => {
    setRefreshing(true)
    try {
      setOrders(await fetchOrders({ fresh, maxPages: 5 }))
    } catch {
      setOrders((p) => p || [])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(true), 15000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearInterval(t)
      clearInterval(tick)
    }
  }, [load])

  useEffect(() => {
    if (newOrder) load(true)
  }, [newOrder, load])

  useEffect(() => {
    let alive = true
    const check = () =>
      restaurantAPI
        .getPendingDiningRequest()
        .then((r) => alive && setPendingDining(r?.data?.success && r.data.data?._id ? r.data.data : null))
        .catch(() => {})
    check()
    const t = setInterval(check, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  // Same as the phone: once the prep time you picked has run out, the order is marked ready automatically.
  useEffect(() => {
    if (!orders) return
    orders.forEach((o) => {
      if (o.status !== "preparing" || !(o.prepTime > 0) || o.type === "Dining") return
      const left = etaLeft(o, now)
      if (left == null || left > 2 || markedReady.current.has(o.key)) return
      markedReady.current.add(o.key)
      restaurantAPI
        .markOrderReady(o.mongoId || o.orderId)
        .then(() => load(true))
        .catch((e) => {
          const msg = String(e?.response?.data?.message || e?.message || "").toLowerCase()
          if (!(e?.response?.status === 409 || msg.includes("already") || msg.includes("ahead"))) markedReady.current.delete(o.key)
        })
    })
  }, [now, orders, load])

  const live = useMemo(() => (orders || []).filter(isLive), [orders])
  const modeList = useMemo(() => (mode === "takeaway" ? live.filter((o) => o.type === "Takeaway") : live), [live, mode])
  const takeawayActive = live.filter((o) => o.type === "Takeaway").length

  const foodOrders = useMemo(() => (orders || []).filter((o) => o.type !== "Dining"), [orders])
  const chipItems = CHIPS.map((c) => ({ ...c, count: (c.finished ? foodOrders : modeList).filter(c.test).length }))
  const chipDef = CHIPS.find((x) => x.id === chip)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (chipDef.finished ? foodOrders : modeList).filter(chipDef.test).filter((o) => !q || `${o.orderId} ${o.itemsText}`.toLowerCase().includes(q))
  }, [modeList, foodOrders, chipDef, query])

  const history = useMemo(() => {
    const start = new Date()
    let end = new Date()
    if (range === "custom") {
      start.setTime(new Date(`${from}T00:00:00`).getTime())
      end = new Date(`${to}T23:59:59.999`)
    } else {
      start.setHours(0, 0, 0, 0)
      if (range === "7") start.setDate(start.getDate() - 6)
      if (range === "30") start.setDate(start.getDate() - 29)
      if (range === "month") start.setDate(1)
    }
    const q = query.trim().toLowerCase()
    return (orders || []).filter((o) => {
      if (o.createdAt < start || o.createdAt > end) return false
      if (hStatus === "delivered" && !isCompleted(o)) return false
      if (hStatus === "cancelled" && o.status !== "cancelled") return false
      if (hStatus === "rejected" && !/reject/.test(String(o.status))) return false
      if (["preparing", "ready", "out_for_delivery"].includes(hStatus) && o.status !== hStatus) return false
      if (hType !== "all" && o.type.toLowerCase() !== hType) return false
      return !q || `${o.orderId} ${o.customer} ${o.itemsText}`.toLowerCase().includes(q)
    })
  }, [orders, range, from, to, hStatus, hType, query])

  const selected = useMemo(() => (orders || []).find((o) => o.key === selectedKey || o.orderId === selectedKey) || null, [orders, selectedKey])
  const refresh = () => load(true)

  if (!orders) return <Spinner label="Loading orders…" />

  /* ------------------------------ Full history ------------------------------ */
  if (view === "history") {
    return (
      <>
        <button onClick={() => update({ view: null })} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-[#B80B3D]">
          <ArrowLeft className="h-4 w-4" /> Orders
        </button>
        <PageHeader title="Full History" subtitle={`${history.length} orders in this period`} actions={<button onClick={refresh} className={btn.ghost} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh</button>} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order ID, customer or dish" className="h-9 w-72 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#B80B3D]" />
          </div>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none">
            {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {range === "custom" && (
            <>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none" />
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none" />
            </>
          )}
          <select value={hStatus} onChange={(e) => setHStatus(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none">
            {HISTORY_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={hType} onChange={(e) => setHType(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none">
            {[["all", "All order types"], ["delivery", "Home delivery"], ["takeaway", "Takeaway"], ["dining", "Dining"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_380px]">
          <Card bodyClass="p-0 overflow-hidden"><OrdersTable list={history} selectedKey={selected?.key} onSelect={setSelectedKey} now={now} empty="No orders found" /></Card>
          <div className="xl:sticky xl:top-0">
            {selected ? <OrderPanel key={selected.key} order={selected} now={now} readOnly={isFinished(selected)} onClose={() => setSelectedKey(null)} onChanged={refresh} /> : <Card><Empty title="Select an order" hint="Click any order to see its details." /></Card>}
          </div>
        </div>
      </>
    )
  }

  /* ------------------------------ Live orders ------------------------------ */
  const heading = chipDef.finished ? `${chipDef.label} orders` : mode === "takeaway" ? "Takeaway orders" : "All orders"
  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Accept, prepare and hand over orders"
        actions={
          mode === "dining" ? null : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by order ID or dish name" className="h-9 w-72 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15" />
              </div>
              <button onClick={refresh} className={btn.ghost} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
            </>
          )
        }
      />

      {pendingDining && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Dining Activation Request Pending</p>
            <p className="text-sm text-slate-600">
              Your request to {pendingDining.requestedSettings?.isEnabled ? "enable" : "update"} dining services is being reviewed by our team. You'll be notified once it's approved.
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-blue-600">Under review</p>
          </div>
        </div>
      )}

      {mode !== "dining" && (
        <div className="mb-4">
          <Chips
            value={chip}
            onChange={(id) => {
              setChip(id)
              // Takeaway / Dining buttons only belong to the live tabs (same as the phone)
              if (CHIPS.find((c) => c.id === id)?.finished && mode !== "all") update({ mode: null, open: null })
            }}
            items={chipItems}
          />
        </div>
      )}

      {!chipDef.finished && (
      <div className="mb-5 flex gap-3">
        <button
          onClick={() => update({ mode: mode === "takeaway" ? null : "takeaway", open: null })}
          className={`flex h-12 items-center gap-2.5 rounded-xl border px-5 text-sm font-semibold transition-all ${mode === "takeaway" ? "border-transparent bg-gradient-to-br from-[#B80B3D] to-[#66001D] text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          <Store className="h-[18px] w-[18px]" /> Takeaway Orders
          {takeawayActive > 0 && <span className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-[11px] font-bold ${mode === "takeaway" ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"}`}>{takeawayActive}</span>}
        </button>
        <button
          onClick={() => update({ mode: mode === "dining" ? null : "dining", open: null })}
          className={`flex h-12 items-center gap-2.5 rounded-xl border px-5 text-sm font-semibold transition-all ${mode === "dining" ? "border-transparent bg-gradient-to-br from-[#B80B3D] to-[#66001D] text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          <UtensilsCrossed className="h-[18px] w-[18px]" /> Dining Booking
          {pendingBookings > 0 && <span className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-[11px] font-bold ${mode === "dining" ? "bg-white/25 text-white" : "bg-rose-100 text-[#B80B3D]"}`}>{pendingBookings}</span>}
        </button>
      </div>

      )}

      {mode === "dining" ? (
        <DiningBookings onCount={setPendingBookings} />
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              {heading} <span className="text-sm font-medium text-slate-400">({list.length})</span>
            </h2>
            <button onClick={() => update({ view: "history" })} className="inline-flex items-center gap-0.5 text-[13px] font-bold text-[#B80B3D] hover:underline">
              Full History <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_380px]">
            <Card bodyClass="p-0 overflow-hidden"><OrdersTable list={list} selectedKey={selected?.key} onSelect={setSelectedKey} now={now} empty="No orders found" /></Card>
            <div className="xl:sticky xl:top-0">
              {selected ? (
                <OrderPanel key={selected.key} order={selected} now={now} readOnly={isFinished(selected)} onClose={() => setSelectedKey(null)} onChanged={refresh} />
              ) : (
                <Card><Empty title="Select an order" hint="Click any order to see details and take action." /></Card>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
