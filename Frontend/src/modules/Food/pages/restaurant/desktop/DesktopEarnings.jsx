import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Wallet, TrendingUp, ReceiptText, ArrowUpFromLine, Loader2, RefreshCw, Download } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { dayKey, inr, inr2 } from "./desktopData"
import { BRAND, Card, Empty, Kpi, PageHeader, Spinner, btn } from "./ui"

const WD = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
}

export default function DesktopEarnings() {
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") === "invoices" ? "invoices" : "payouts"
  const [finance, setFinance] = useState(null)
  const [custom, setCustom] = useState(false)
  const [from, setFrom] = useState(dayKey(new Date(Date.now() - 29 * 86400000)))
  const [to, setTo] = useState(dayKey(new Date()))
  const [history, setHistory] = useState([])
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [f, h] = await Promise.allSettled([restaurantAPI.getFinance(custom ? { startDate: from, endDate: to } : {}), restaurantAPI.getWithdrawalHistory()])
      setFinance(f.status === "fulfilled" ? f.value?.data?.data || {} : (p) => p || {})
      if (h.status === "fulfilled") {
        const d = h.value?.data?.data
        setHistory(Array.isArray(d) ? d : [])
      }
    } finally {
      setRefreshing(false)
    }
  }, [custom, from, to])

  useEffect(() => {
    load()
  }, [load])

  const cycle = finance?.currentCycle || {}
  const orders = (custom ? finance?.pastCycles?.orders : cycle.orders) || []
  const invoice = {
    count: orders.length,
    earnings: orders.reduce((s, o) => s + (Number(o.payout) || 0), 0),
    commission: orders.reduce((s, o) => s + (Number(o.commission) || 0), 0),
    gross: orders.reduce((s, o) => s + (Number(o.totalAmount ?? o.orderTotal) || 0), 0),
  }
  const available = Number(cycle.estimatedPayout) || 0

  const series = useMemo(() => {
    const m = new Map()
    orders.forEach((o) => {
      const k = dayKey(o.createdAt)
      const row = m.get(k) || { key: k, label: new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), payout: 0, orders: 0 }
      row.payout += Number(o.payout) || 0
      row.orders += 1
      m.set(k, row)
    })
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [orders])

  const commission = orders.reduce((s, o) => s + (Number(o.commission) || 0), 0)
  const gross = orders.reduce((s, o) => s + (Number(o.orderTotal) || 0), 0)

  const withdraw = async () => {
    const v = parseFloat(amount)
    if (!v || v <= 0) return toast.error("Enter a valid amount")
    if (v > available) return toast.error("Amount cannot exceed the available balance")
    setBusy(true)
    try {
      const res = await restaurantAPI.createWithdrawalRequest(v)
      if (res?.data?.success === false) throw new Error(res.data.message)
      toast.success("Withdrawal request submitted")
      setAmount("")
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || "Could not submit request")
    } finally {
      setBusy(false)
    }
  }

  const downloadPdf = async () => {
    if (!orders.length) return toast.error("No settled orders to put in a statement")
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")])
      const doc = new jsPDF("p", "mm", "a4")
      const label = custom ? `${from} to ${to}` : `Payout cycle ${cycle.start?.day || ""} ${cycle.start?.month || ""} - ${cycle.end?.day || ""} ${cycle.end?.month || ""}`
      doc.setFontSize(16)
      doc.text(finance?.restaurant?.name || "Restaurant statement", 14, 16)
      doc.setFontSize(10)
      doc.text(label, 14, 23)
      doc.text(`Orders: ${invoice.count}   Gross: Rs ${invoice.gross.toFixed(2)}   Commission: Rs ${invoice.commission.toFixed(2)}   Earnings: Rs ${invoice.earnings.toFixed(2)}`, 14, 30)
      autoTable(doc, {
        startY: 36,
        head: [["Order", "Date", "Order value", "Commission", "Payout"]],
        body: orders.map((o) => [`#${o.orderId}`, new Date(o.createdAt).toLocaleDateString("en-IN"), Number(o.orderTotal || 0).toFixed(2), Number(o.commission || 0).toFixed(2), Number(o.payout || 0).toFixed(2)]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [184, 11, 61] },
      })
      doc.save(`earnings-statement_${dayKey(new Date())}.pdf`)
    } catch {
      toast.error("Could not create the PDF")
    }
  }

  if (!finance) return <Spinner label="Loading earnings…" />

  const range = cycle.start && cycle.end ? `${cycle.start.day} ${cycle.start.month} – ${cycle.end.day} ${cycle.end.month}` : "Current cycle"

  return (
    <>
      <PageHeader
        title="Earnings"
        subtitle={`Payout cycle: ${range}`}
        actions={
          <>
            <button onClick={downloadPdf} className={btn.ghost}><Download className="h-4 w-4" /> Download statement</button>
            <button onClick={load} className={btn.ghost} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {[["payouts", "Payouts"], ["invoices", "Invoices & Taxes"]].map(([v, l]) => (
            <button key={v} onClick={() => setParams(v === "payouts" ? {} : { tab: v }, { replace: true })} className={`h-9 rounded-md px-5 text-[13px] font-semibold ${tab === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {[[false, "Current cycle"], [true, "Custom date range"]].map(([v, l]) => (
            <button key={l} onClick={() => setCustom(v)} className={`h-9 rounded-md px-4 text-[13px] font-semibold ${custom === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
        {custom && (
          <>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none" />
            <span className="text-sm text-slate-400">to</span>
            <input type="date" value={to} min={from} max={dayKey(new Date())} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none" />
          </>
        )}
      </div>

      {tab === "invoices" ? (
        <div className="space-y-4">
          <Card title="Invoices & Taxes Summary" subtitle={custom ? `${from} to ${to}` : `Payout cycle: ${range}`}>
            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[["Orders", invoice.count], ["Earnings", inr2(invoice.earnings)], ["Commission", inr2(invoice.commission)], ["Gross amount", inr2(invoice.gross)]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">{l}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{v}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Order invoice details" bodyClass="p-0">
            {orders.length === 0 ? (
              <Empty title="No invoice data available" hint="No settled orders for the selected range." />
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2.5 pl-5 font-semibold">Order</th>
                    <th className="py-2.5 font-semibold">Payment</th>
                    <th className="py-2.5 font-semibold">Status</th>
                    <th className="py-2.5 pr-5 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o, i) => (
                    <tr key={`${o.orderId}-${i}`} className="hover:bg-slate-50">
                      <td className="py-3 pl-5 font-semibold">#{o.orderId || "N/A"}</td>
                      <td className="py-3 uppercase text-slate-600">{String(o.paymentMethod || "N/A").replace("_", " ")}</td>
                      <td className="py-3 capitalize text-slate-600">{String(o.orderStatus || "N/A").replace(/_/g, " ")}</td>
                      <td className="py-3 pr-5 text-right font-semibold tabular-nums">{inr2(o.totalAmount ?? o.orderTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi label="Available balance" value={inr2(available)} hint="Ready to withdraw" icon={Wallet} tone="emerald" />
        <Kpi label="Cycle earnings" value={inr(cycle.totalEarnings)} hint="After commission" icon={TrendingUp} tone="rose" />
        <Kpi label="Orders this cycle" value={cycle.totalOrders ?? 0} hint={`Gross ${inr(gross)}`} icon={ReceiptText} tone="blue" />
        <Kpi label="Commission paid" value={inr(commission)} hint={`Withdrawn/requested ${inr(cycle.totalWithdrawn)}`} icon={ArrowUpFromLine} tone="amber" />
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Daily earnings" subtitle="Payout per day this cycle">
          {series.length === 0 ? (
            <Empty title="No earnings yet in this cycle" hint="Delivered orders will show up here." />
          ) : (
            <div className="h-[260px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ep" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eef0f3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} padding={{ left: 8, right: 22 }} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip
                    cursor={{ stroke: "#e2e8f0" }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
                          <p className="text-slate-300">{label}</p>
                          <p className="font-semibold">{inr2(payload[0].value)} · {payload[0].payload.orders} orders</p>
                        </div>
                      ) : null
                    }
                  />
                  <Area type="monotone" dataKey="payout" stroke={BRAND} strokeWidth={2.5} fill="url(#ep)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Withdraw money" subtitle="Request a payout to your bank account">
          <p className="text-xs text-slate-500">Available</p>
          <p className="text-3xl font-bold tabular-nums">{inr2(available)}</p>
          <div className="mt-4 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="Amount"
              className="w-full h-11 rounded-lg border border-slate-200 pl-7 pr-20 text-sm outline-none focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15"
            />
            <button onClick={() => setAmount(String(available))} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#B80B3D] px-2 py-1 rounded hover:bg-[#B80B3D]/10">
              MAX
            </button>
          </div>
          <button onClick={withdraw} disabled={busy || available <= 0} className={`${btn.primary} w-full mt-3 !h-11 !text-sm`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request withdrawal
          </button>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title="Settled orders" subtitle="Delivered orders in this cycle" bodyClass="p-0">
          {orders.length === 0 ? (
            <Empty title="No settled orders yet" />
          ) : (
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 bg-slate-50/70">
                  <th className="pl-5 py-2.5 font-semibold">Order</th>
                  <th className="py-2.5 font-semibold">Date</th>
                  <th className="py-2.5 font-semibold">Items</th>
                  <th className="py-2.5 font-semibold text-right">Order value</th>
                  <th className="py-2.5 font-semibold text-right">Commission</th>
                  <th className="pr-5 py-2.5 font-semibold text-right">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.slice(0, 50).map((o, i) => (
                  <tr key={`${o.orderId}-${i}`} className="hover:bg-slate-50">
                    <td className="pl-5 py-3 font-semibold">#{o.orderId}</td>
                    <td className="py-3 text-slate-500 whitespace-nowrap">{new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                    <td className="py-3 text-slate-600 max-w-[240px] truncate">{o.foodNames || "—"}</td>
                    <td className="py-3 text-right tabular-nums">{inr2(o.orderTotal)}</td>
                    <td className="py-3 text-right tabular-nums text-rose-600">−{inr2(o.commission)}</td>
                    <td className="pr-5 py-3 text-right font-semibold tabular-nums">{inr2(o.payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Withdrawal history" bodyClass="p-0">
          {history.length === 0 ? (
            <Empty title="No withdrawals yet" />
          ) : (
            <ul className="divide-y divide-slate-100 mt-3 max-h-[480px] overflow-y-auto">
              {history.map((h) => {
                const s = String(h.status || "pending").toLowerCase()
                return (
                  <li key={h._id} className="flex items-center justify-between px-5 py-3.5">
                    <div>
                      <p className="font-semibold tabular-nums">{inr2(h.amount)}</p>
                      <p className="text-xs text-slate-500">{new Date(h.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset capitalize ${WD[s] || WD.pending}`}>{s}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
      </>
      )}
    </>
  )
}
