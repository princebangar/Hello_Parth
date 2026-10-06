import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Send, Ticket, Clock3, CheckCircle2, CircleDot } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import { SelectInput, TextArea, TextInput } from "./kit"
import { Card, Empty, Kpi, PageHeader, Spinner, btn } from "./ui"

const CATEGORY = [
  ["orders", "Orders"],
  ["payments", "Payments"],
  ["menu", "Menu"],
  ["restaurant", "Restaurant Profile"],
  ["technical", "Technical"],
  ["other", "Other"],
].map(([value, label]) => ({ value, label }))

const PRIORITY = [["low", "Low"], ["medium", "Medium"], ["high", "High"]].map(([value, label]) => ({ value, label }))
const STATUS = [["", "All"], ["open", "Open"], ["in-progress", "In progress"], ["resolved", "Resolved"]]

const badge = (s) =>
  s === "resolved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : s === "in-progress" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-amber-50 text-amber-700 ring-amber-200"

const empty = { category: "orders", issueType: "", subject: "", orderRef: "", priority: "medium", description: "" }

export default function DesktopSupport() {
  const [tickets, setTickets] = useState(null)
  const [status, setStatus] = useState("")
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const load = useCallback(async () => {
    try {
      const res = await restaurantAPI.getSupportTickets({ status: status || undefined, limit: 100, page: 1 })
      setTickets(res?.data?.data?.tickets || [])
    } catch (e) {
      toast.error(e?.response?.data?.message || "Failed to load support tickets")
      setTickets([])
    }
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const t = tickets || []
    return {
      total: t.length,
      open: t.filter((x) => x.status === "open").length,
      progress: t.filter((x) => x.status === "in-progress").length,
      resolved: t.filter((x) => x.status === "resolved").length,
    }
  }, [tickets])

  const submit = async (e) => {
    e.preventDefault()
    const err = {}
    if (!form.issueType.trim()) err.issueType = "Issue type is required"
    setErrors(err)
    if (Object.keys(err).length) return
    setBusy(true)
    try {
      await restaurantAPI.createSupportTicket({
        category: form.category,
        issueType: form.issueType.trim(),
        subject: form.subject.trim(),
        orderRef: form.orderRef.trim(),
        priority: form.priority,
        description: form.description.trim(),
      })
      toast.success("Support ticket submitted")
      setForm(empty)
      await load()
    } catch (e2) {
      toast.error(e2?.response?.data?.message || "Failed to submit support ticket")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Help & Support" subtitle="Raise a ticket and track our replies" />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Total tickets" value={stats.total} icon={Ticket} tone="blue" />
        <Kpi label="Open" value={stats.open} icon={CircleDot} tone="amber" />
        <Kpi label="In progress" value={stats.progress} icon={Clock3} tone="violet" />
        <Kpi label="Resolved" value={stats.resolved} icon={CheckCircle2} tone="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card title="Raise a new ticket" subtitle="Tell us what went wrong and we will get back to you">
          <form onSubmit={submit} className="mt-4 grid grid-cols-2 gap-4">
            <SelectInput label="Category" value={form.category} onChange={set("category")} options={CATEGORY} />
            <SelectInput label="Priority" value={form.priority} onChange={set("priority")} options={PRIORITY} />
            <TextInput label="Issue type" required placeholder="e.g. Payment not received" value={form.issueType} onChange={set("issueType")} error={errors.issueType} className="col-span-2" />
            <TextInput label="Subject" placeholder="Short title (optional)" value={form.subject} onChange={set("subject")} />
            <TextInput label="Order reference" placeholder="Order ID (optional)" value={form.orderRef} onChange={set("orderRef")} />
            <TextArea label="Description" rows={6} placeholder="Describe the problem in detail" value={form.description} onChange={set("description")} error={errors.description} className="col-span-2" />
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" className={btn.ghost} onClick={() => { setForm(empty); setErrors({}) }}>Clear</button>
              <button type="submit" disabled={busy} className={`${btn.primary} !h-10 px-5`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit ticket
              </button>
            </div>
          </form>
        </Card>

        <Card
          title="Your tickets"
          action={
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {STATUS.map(([v, l]) => (
                <button key={v} onClick={() => setStatus(v)} className={`h-7 rounded-md px-3 text-xs font-semibold ${status === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                  {l}
                </button>
              ))}
            </div>
          }
          bodyClass="p-0"
        >
          {!tickets ? (
            <Spinner label="Loading tickets…" />
          ) : tickets.length === 0 ? (
            <Empty title="No support tickets" hint="Tickets you raise will show up here." />
          ) : (
            <ul className="mt-3 max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
              {tickets.map((t) => (
                <li key={t._id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-500">#{String(t._id).slice(-6)} · {new Date(t.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${badge(t.status)}`}>{t.status}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-slate-900">{t.issueType}</p>
                  {(t.subject || t.orderRef) && (
                    <p className="mt-0.5 text-xs text-slate-500">{[t.subject, t.orderRef && `Order ${t.orderRef}`].filter(Boolean).join(" · ")}</p>
                  )}
                  {t.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{t.description}</p>}
                  {t.adminResponse && (
                    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <p className="text-[11px] font-bold uppercase text-blue-700">Admin response</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-blue-900">{t.adminResponse}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
