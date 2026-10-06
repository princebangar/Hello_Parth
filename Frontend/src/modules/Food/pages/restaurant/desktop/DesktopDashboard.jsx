import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ShoppingBag, IndianRupee, Clock, Receipt, Wallet, RefreshCw, ArrowRight } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import {
  buildDailySeries,
  buildHourSeries,
  buildTopItems,
  buildTypeSplit,
  dayKey,
  fetchOrders,
  inr,
  isActive,
  isCancelled,
  isCompleted,
  isNew,
} from "./desktopData"
import { BRAND, Card, Empty, Kpi, PageHeader, Spinner, StatusBadge, btn, timeAgo } from "./ui"

const PIE = [BRAND, "#2563eb", "#f59e0b", "#10b981", "#8b5cf6"]
const BASE = "/food/restaurant"

const ChartTip = ({ active, payload, label, money }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <p className="text-slate-300 mb-0.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="font-semibold">
          {p.name}: {money && p.dataKey === "revenue" ? inr(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function DesktopDashboard() {
  const navigate = useNavigate()
  const { newOrder } = useRestaurantNotifications()
  const [orders, setOrders] = useState(null)
  const [finance, setFinance] = useState(null)
  const [range, setRange] = useState(7)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (fresh = false) => {
    setRefreshing(true)
    try {
      const [o, f] = await Promise.allSettled([fetchOrders({ fresh }), restaurantAPI.getFinance()])
      if (o.status === "fulfilled") setOrders(o.value)
      else setOrders((prev) => prev || [])
      if (f.status === "fulfilled") setFinance(f.value?.data?.data || null)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(true), 30000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (newOrder) load(true)
  }, [newOrder, load])

  const stats = useMemo(() => {
    if (!orders) return null
    const today = dayKey(new Date())
    const todays = orders.filter((o) => dayKey(o.createdAt) === today)
    const valid = todays.filter((o) => !isCancelled(o))
    const revenue = valid.reduce((s, o) => s + o.total, 0)
    return {
      todayOrders: todays.length,
      revenue,
      avg: valid.length ? revenue / valid.length : 0,
      pending: orders.filter((o) => isNew(o) || isActive(o)).length,
      cancelled: todays.filter(isCancelled).length,
      completed: todays.filter(isCompleted).length,
    }
  }, [orders])

  const daily = useMemo(() => (orders ? buildDailySeries(orders, range) : []), [orders, range])
  const hours = useMemo(() => (orders ? buildHourSeries(orders) : []), [orders])
  const split = useMemo(() => (orders ? buildTypeSplit(orders) : []), [orders])
  const top = useMemo(() => (orders ? buildTopItems(orders) : []), [orders])
  const live = useMemo(() => (orders || []).filter((o) => isNew(o) || isActive(o)).slice(0, 6), [orders])
  const recent = useMemo(() => (orders || []).slice(0, 8), [orders])
  const rangeTotal = daily.reduce((s, d) => s + d.revenue, 0)

  if (!orders) return <Spinner label="Loading your dashboard…" />

  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
  const maxTop = Math.max(1, ...top.map((t) => t.qty))
  const totalSplit = split.reduce((s, x) => s + x.value, 0)

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={date}
        actions={
          <button onClick={() => load(true)} className={btn.ghost} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Today's orders" value={stats.todayOrders} hint={`${stats.completed} completed · ${stats.cancelled} cancelled`} icon={ShoppingBag} tone="rose" />
        <Kpi label="Today's revenue" value={inr(stats.revenue)} hint="Excludes cancelled orders" icon={IndianRupee} tone="emerald" />
        <Kpi label="Orders in progress" value={stats.pending} hint="New + preparing + ready" icon={Clock} tone="amber" />
        <Kpi label="Average order value" value={inr(stats.avg)} hint="Today" icon={Receipt} tone="blue" />
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card
          className="xl:col-span-2"
          title="Revenue"
          subtitle={`${inr(rangeTotal)} in the last ${range} days`}
          action={
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setRange(d)}
                  className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
                    range === d ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {d}D
                </button>
              ))}
            </div>
          }
        >
          <div className="h-[280px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef0f3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} padding={{ left: 8, right: 22 }} tick={{ fontSize: 11, fill: "#94a3b8" }} interval={range > 14 ? 2 : 0} />
                <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip content={<ChartTip money />} cursor={{ stroke: "#e2e8f0" }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={BRAND} strokeWidth={2.5} fill="url(#rv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Order types" subtitle="Delivery vs takeaway vs dining">
          {totalSplit === 0 ? (
            <Empty title="No orders yet" />
          ) : (
            <>
              <div className="h-[190px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={split} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                      {split.map((_, i) => (
                        <Cell key={i} fill={PIE[i % PIE.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-2xl font-bold tabular-nums">{totalSplit}</p>
                    <p className="text-[11px] text-slate-500">orders</p>
                  </div>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {split.map((s, i) => (
                  <li key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE[i % PIE.length] }} />
                      {s.name}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {s.value} <span className="text-slate-400 font-normal">· {Math.round((s.value / totalSplit) * 100)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Busiest hours" subtitle="Orders by time of day" className="xl:col-span-2">
          <div className="h-[220px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hours} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eef0f3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} interval={1} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="orders" name="Orders" fill={BRAND} radius={[5, 5, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top selling items" subtitle="From completed orders">
          {top.length === 0 ? (
            <Empty title="No completed orders yet" />
          ) : (
            <ul className="space-y-4">
              {top.map((t) => (
                <li key={t.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800 truncate pr-3">{t.name}</span>
                    <span className="text-slate-500 tabular-nums shrink-0">{t.qty} sold</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-[#B80B3D]" style={{ width: `${(t.qty / maxTop) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card
          className="xl:col-span-2"
          title="Live orders"
          subtitle="Needs your attention now"
          bodyClass="p-0"
          action={
            <button onClick={() => navigate(`${BASE}/orders`)} className="text-[13px] font-semibold text-[#B80B3D] flex items-center gap-1 hover:underline">
              Manage orders <ArrowRight className="h-3.5 w-3.5" />
            </button>
          }
        >
          {live.length === 0 ? (
            <Empty title="All caught up" hint="New orders will appear here instantly." />
          ) : (
            <table className="w-full text-sm mt-3">
              <tbody className="divide-y divide-slate-100">
                {live.map((o) => (
                  <tr key={o.key} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`${BASE}/orders`)}>
                    <td className="pl-5 py-3 font-semibold">#{o.orderId}</td>
                    <td className="py-3 text-slate-600 max-w-[260px] truncate">{o.itemsText}</td>
                    <td className="py-3 text-slate-500">{timeAgo(o.createdAt)}</td>
                    <td className="py-3 font-semibold tabular-nums">{inr(o.total)}</td>
                    <td className="pr-5 py-3 text-right"><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Balance" subtitle="Available to withdraw" action={<Wallet className="h-5 w-5 text-slate-400" />}>
          <p className="text-3xl font-bold tabular-nums">{inr(finance?.currentCycle?.estimatedPayout)}</p>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">This cycle earnings</dt>
              <dd className="font-semibold tabular-nums">{inr(finance?.currentCycle?.totalEarnings)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Orders this cycle</dt>
              <dd className="font-semibold tabular-nums">{finance?.currentCycle?.totalOrders ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Withdrawn / requested</dt>
              <dd className="font-semibold tabular-nums">{inr(finance?.currentCycle?.totalWithdrawn)}</dd>
            </div>
          </dl>
          <button onClick={() => navigate(`${BASE}/earnings`)} className={`${btn.primary} w-full mt-5`}>
            View earnings
          </button>
        </Card>
      </div>

      <Card title="Recent orders" className="mt-4" bodyClass="p-0">
        {recent.length === 0 ? (
          <Empty title="No orders yet" hint="Your orders will show up here." />
        ) : (
          <table className="w-full text-sm mt-3">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pl-5 py-2 font-semibold">Order</th>
                <th className="py-2 font-semibold">Customer</th>
                <th className="py-2 font-semibold">Items</th>
                <th className="py-2 font-semibold">Type</th>
                <th className="py-2 font-semibold">Placed</th>
                <th className="py-2 font-semibold">Total</th>
                <th className="pr-5 py-2 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map((o) => (
                <tr key={o.key} className="hover:bg-slate-50">
                  <td className="pl-5 py-3 font-semibold">#{o.orderId}</td>
                  <td className="py-3">{o.customer}</td>
                  <td className="py-3 text-slate-600 max-w-[280px] truncate">{o.itemsText}</td>
                  <td className="py-3 text-slate-600">{o.type}</td>
                  <td className="py-3 text-slate-500">{timeAgo(o.createdAt)}</td>
                  <td className="py-3 font-semibold tabular-nums">{inr(o.total)}</td>
                  <td className="pr-5 py-3 text-right"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
