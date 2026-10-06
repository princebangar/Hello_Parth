import { useState } from "react"
import { Download, Loader2, FileSpreadsheet } from "lucide-react"
import { toast } from "sonner"
import { SelectInput, SubPageHeader, TextInput } from "./kit"
import { Card, btn } from "./ui"
import { dayKey, fetchOrders, isCancelled, isCompleted } from "./desktopData"

const csvCell = (v) => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const download = (name, rows) => {
  const blob = new Blob([`﻿${rows.map((r) => r.map(csvCell).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const today = () => dayKey(new Date())
const daysAgo = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dayKey(d)
}

export default function DesktopReport() {
  const [kind, setKind] = useState("detailed")
  const [from, setFrom] = useState(daysAgo(7))
  const [to, setTo] = useState(today())
  const [scope, setScope] = useState("completed")
  const [busy, setBusy] = useState(false)

  const preset = (n) => {
    setFrom(daysAgo(n))
    setTo(today())
  }

  const run = async () => {
    if (!from || !to || from > to) return toast.error("Choose a valid date range")
    setBusy(true)
    try {
      const start = new Date(`${from}T00:00:00`)
      const end = new Date(`${to}T23:59:59.999`)
      const orders = (await fetchOrders({ maxPages: 20, fresh: true })).filter(
        (o) => o.createdAt >= start && o.createdAt <= end && (scope === "all" ? true : scope === "completed" ? isCompleted(o) : isCancelled(o)),
      )
      if (!orders.length) return toast.error("No orders found for this period")

      if (kind === "detailed") {
        const rows = [["Order ID", "Date", "Time", "Customer", "Type", "Items", "Payment", "Total (INR)", "Status"]]
        orders.forEach((o) =>
          rows.push([o.orderId, o.createdAt.toLocaleDateString("en-IN"), o.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }), o.customer, o.type, o.itemsText, o.payment || "", o.total.toFixed(2), o.status]),
        )
        download(`detailed-report_${from}_to_${to}.csv`, rows)
      } else {
        const m = new Map()
        orders.forEach((o) =>
          o.items.forEach((i) => {
            const q = Number(i.quantity) || 1
            const cur = m.get(i.name) || { name: i.name || "Item", qty: 0, revenue: 0 }
            cur.qty += q
            cur.revenue += (Number(i.price) || 0) * q
            m.set(i.name, cur)
          }),
        )
        const rows = [["Item", "Quantity sold", "Revenue (INR)"], ...[...m.values()].sort((a, b) => b.qty - a.qty).map((r) => [r.name, r.qty, r.revenue.toFixed(2)])]
        download(`item-sales-report_${from}_to_${to}.csv`, rows)
      }
      toast.success(`Report downloaded (${orders.length} orders)`)
    } catch {
      toast.error("Could not generate the report")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SubPageHeader title="Download report" subtitle="Export your sales as a spreadsheet (CSV)" />
      <Card className="max-w-3xl">
        <div className="grid grid-cols-2 gap-5">
          <SelectInput label="Report type" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: "detailed", label: "Detailed report (every order)" }, { value: "item", label: "Item sales report" }]} />
          <SelectInput label="Orders to include" value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: "completed", label: "Delivered / completed" }, { value: "cancelled", label: "Cancelled" }, { value: "all", label: "All orders" }]} />
          <TextInput label="From" type="date" max={to} value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextInput label="To" type="date" min={from} max={today()} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[["Last 7 days", 7], ["Last 14 days", 14], ["Last 30 days", 30], ["Last 90 days", 90]].map(([l, n]) => (
            <button key={n} onClick={() => preset(n)} className={btn.ghost}>{l}</button>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between rounded-xl bg-slate-50 p-4">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Opens in Excel, Google Sheets and Numbers.
          </div>
          <button onClick={run} disabled={busy} className={`${btn.primary} !h-10 px-5`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download report
          </button>
        </div>
      </Card>
    </>
  )
}
