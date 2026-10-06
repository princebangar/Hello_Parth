import { Loader2 } from "lucide-react"
import { statusMeta } from "./desktopData"

export const BRAND = "#B80B3D"

export function Card({ title, subtitle, action, children, className = "", bodyClass = "p-5" }) {
  return (
    <section className={`rounded-2xl bg-white border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

const TONES = {
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
}

export function Kpi({ label, value, hint, icon: Icon, tone = "rose" }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={`h-9 w-9 rounded-xl grid place-items-center ${TONES[tone]}`}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-3 text-[28px] leading-none font-bold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function StatusBadge({ status }) {
  const m = statusMeta(status)
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${m.cls}`}>
      {m.label}
    </span>
  )
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

export function Empty({ title, hint }) {
  return (
    <div className="py-14 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#B80B3D] px-3.5 h-9 text-[13px] font-semibold text-white hover:bg-[#9c0933] transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 h-9 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 h-9 text-[13px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50",
}

export function PrepStepper({ value, onChange }) {
  return (
    <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-lg font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100" aria-label="Decrease">−</button>
      <span className="text-base font-bold tabular-nums text-slate-900">{value} mins</span>
      <button type="button" onClick={() => onChange(value + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-white text-lg font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100" aria-label="Increase">+</button>
    </div>
  )
}

export function timeAgo(date) {
  const s = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000))
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
}
