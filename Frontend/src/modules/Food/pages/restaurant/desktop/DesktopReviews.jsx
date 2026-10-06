import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Search, Star, MessageSquareWarning, ChevronDown, RefreshCw } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { fetchOrders, isCompleted } from "./desktopData"
import { Card, Empty, Kpi, PageHeader, Spinner, btn, timeAgo } from "./ui"

const rating = (o) => {
  const v = Number(o?.review?.rating ?? o?.ratings?.restaurant?.rating ?? o?.feedback?.rating ?? o?.rating)
  return Number.isFinite(v) && v > 0 ? Math.min(5, Math.round(v * 10) / 10) : null
}
const text = (o) =>
  String(o?.review?.comment ?? o?.review?.text ?? o?.ratings?.restaurant?.comment ?? o?.feedback?.comment ?? o?.feedback?.text ?? "").trim()

const FAQ = [
  ["How is my restaurant's rating calculated?", "Your rating is the average of all customer ratings received on delivery, takeaway and dining orders."],
  ["Why am I not getting a rating on all orders?", "Not every customer leaves a rating. Some skip the step after their order is delivered."],
  ["Can I call a customer to discuss a rating?", "Yes, from the order details if the customer has shared a phone number. Please stay polite and professional."],
  ["What if I don't agree with a rating?", "Raise a support ticket from Help & Support with the order number and we will review it."],
]

const RANGES = [
  ["all", "All time"],
  ["today", "Today"],
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
]

function Stars({ value }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
      ))}
    </span>
  )
}

export default function DesktopReviews() {
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") === "complaints" ? "complaints" : "reviews"
  const setTab = (t) => setParams(t === "reviews" ? {} : { tab: t }, { replace: true })
  const [orders, setOrders] = useState(null)
  const [complaints, setComplaints] = useState(null)
  const [query, setQuery] = useState("")
  const [stars, setStars] = useState(0)
  const [range, setRange] = useState("all")
  const [open, setOpen] = useState(-1)
  const [refreshing, setRefreshing] = useState(false)

  const loadReviews = useCallback(async () => {
    try {
      setOrders(await fetchOrders({ maxPages: 10, fresh: true }))
    } catch {
      setOrders([])
    }
  }, [])

  const loadComplaints = useCallback(async () => {
    try {
      const p = {}
      if (range !== "all") {
        const from = new Date()
        from.setHours(0, 0, 0, 0)
        if (range !== "today") from.setDate(from.getDate() - Number(range))
        p.fromDate = from.toISOString()
        p.toDate = new Date().toISOString()
      }
      if (query.trim() && tab === "complaints") p.search = query.trim()
      const res = await restaurantAPI.getComplaints(p)
      setComplaints(res?.data?.data?.complaints || [])
    } catch {
      setComplaints([])
    }
  }, [range, query, tab])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  useEffect(() => {
    const t = setTimeout(loadComplaints, 250)
    return () => clearTimeout(t)
  }, [loadComplaints])

  const reviews = useMemo(
    () =>
      (orders || [])
        .filter(isCompleted)
        .map((o) => ({ o, rating: rating(o.raw), comment: text(o.raw) }))
        .filter((r) => r.rating !== null || r.comment),
    [orders],
  )

  const summary = useMemo(() => {
    const rated = reviews.filter((r) => r.rating !== null)
    const avg = rated.length ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : 0
    const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: rated.filter((r) => Math.round(r.rating) === n).length }))
    return { avg, count: rated.length, dist }
  }, [reviews])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reviews.filter(
      (r) =>
        (!stars || Math.round(r.rating || 0) === stars) &&
        (!q || `${r.o.customer} ${r.comment} ${r.o.orderId}`.toLowerCase().includes(q)),
    )
  }, [reviews, stars, query])

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([loadReviews(), loadComplaints()])
    setRefreshing(false)
  }

  if (!orders) return <Spinner label="Loading reviews…" />
  const maxDist = Math.max(1, ...summary.dist.map((d) => d.c))
  const openComplaints = (complaints || []).filter((c) => (c.status || "open") === "open").length

  return (
    <>
      <PageHeader
        title="Reviews & Complaints"
        subtitle="What customers are saying about your restaurant"
        actions={
          <button onClick={refresh} className={btn.ghost} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Kpi label="Average rating" value={summary.count ? summary.avg.toFixed(1) : "—"} hint={summary.count ? `${summary.count} ratings` : "No ratings yet"} icon={Star} tone="amber" />
        <Kpi label="Total reviews" value={reviews.length} hint="Ratings and written reviews" icon={Star} tone="emerald" />
        <Kpi label="Open complaints" value={openComplaints} hint="Waiting for a response" icon={MessageSquareWarning} tone="rose" />
        <Card className="xl:row-span-1" bodyClass="p-4">
          <p className="text-[13px] font-medium text-slate-500">Rating breakdown</p>
          <ul className="mt-2 space-y-1.5">
            {summary.dist.map((d) => (
              <li key={d.n} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-slate-600">{d.n}</span>
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(d.c / maxDist) * 100}%` }} />
                </span>
                <span className="w-6 text-right tabular-nums text-slate-500">{d.c}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {[["reviews", "Reviews"], ["complaints", "Complaints"]].map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className={`h-9 rounded-md px-5 text-[13px] font-semibold ${tab === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "reviews" ? "Search reviews" : "Search complaints"}
            className="h-9 w-72 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15"
          />
        </div>
        {tab === "reviews" ? (
          <div className="flex gap-1.5">
            {[0, 5, 4, 3, 2, 1].map((n) => (
              <button key={n} onClick={() => setStars(n)} className={`h-9 rounded-lg border px-3 text-[13px] font-semibold ${stars === n ? "border-[#B80B3D] bg-[#B80B3D]/10 text-[#B80B3D]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {n === 0 ? "All" : `${n}★`}
              </button>
            ))}
          </div>
        ) : (
          <select value={range} onChange={(e) => setRange(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 outline-none">
            {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px] items-start">
        <div>
          {tab === "reviews" ? (
            shown.length === 0 ? (
              <Card><Empty title="No reviews yet" hint="Customer ratings and reviews will appear here after delivery." /></Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                {shown.map(({ o, rating: r, comment }) => (
                  <div key={o.key} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#B80B3D]/10 font-bold text-[#B80B3D]">{o.customer[0]?.toUpperCase()}</span>
                        <div>
                          <p className="font-semibold text-slate-900">{o.customer}</p>
                          <p className="text-xs text-slate-500">Order #{o.orderId} · {timeAgo(o.createdAt)}</p>
                        </div>
                      </div>
                      {r !== null && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white">
                          {r.toFixed(1)} <Star className="h-3 w-3 fill-white" />
                        </span>
                      )}
                    </div>
                    {r !== null && <div className="mt-3"><Stars value={r} /></div>}
                    <p className={`mt-3 text-sm ${comment ? "text-slate-700" : "italic text-slate-400"}`}>{comment || "No written review"}</p>
                    <p className="mt-3 truncate text-xs text-slate-400">{o.itemsText}</p>
                  </div>
                ))}
              </div>
            )
          ) : !complaints ? (
            <Spinner label="Loading complaints…" />
          ) : complaints.length === 0 ? (
            <Card><Empty title="No complaints found" hint="Great! Customers have not raised any complaints." /></Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {complaints.map((c) => (
                <div key={c._id} className="rounded-2xl border border-slate-200/80 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset capitalize ${(c.status || "open") === "open" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
                      {c.status || "open"}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 font-bold text-slate-500">{c.userId?.name?.[0] || "U"}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{c.userId?.name || "Customer"}</p>
                      <p className="text-xs text-slate-500">Order #{c.orderId?.orderId || "N/A"}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#B80B3D]">{c.issueType}</p>
                    <p className="mt-1 text-sm text-slate-800">{c.description}</p>
                  </div>
                  {c.adminResponse && (
                    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                      <p className="text-[11px] font-bold uppercase text-blue-700">Admin response</p>
                      <p className="mt-1 text-sm text-blue-900">{c.adminResponse}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <Card title="Ratings FAQ" subtitle="How ratings work" bodyClass="p-2">
          <ul className="divide-y divide-slate-100">
            {FAQ.map(([q, a], i) => (
              <li key={q}>
                <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-slate-800 hover:text-[#B80B3D]">
                  {q}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open === i ? "rotate-180" : ""}`} />
                </button>
                {open === i && <p className="px-3 pb-3 text-sm text-slate-600">{a}</p>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
