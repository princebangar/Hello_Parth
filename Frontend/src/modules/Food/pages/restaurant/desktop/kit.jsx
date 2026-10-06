import { useCallback, useEffect, useState } from "react"
import { Loader2, X, ArrowLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { restaurantAPI } from "@food/api"
import { btn } from "./ui"

export const BASE = "/food/restaurant"

export const inputCls =
  "w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15 disabled:bg-slate-50 disabled:text-slate-500"

export function Field({ label, hint, error, required, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  )
}

export function TextInput({ label, hint, error, required, className = "", ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <input {...rest} className={`${inputCls} ${error ? "!border-rose-400" : ""}`} />
    </Field>
  )
}

export function TextArea({ label, hint, error, required, rows = 4, className = "", ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        rows={rows}
        {...rest}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#B80B3D] focus:ring-2 focus:ring-[#B80B3D]/15"
      />
    </Field>
  )
}

export function SelectInput({ label, hint, error, required, options, className = "", ...rest }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      <select {...rest} className={`${inputCls} pr-8`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-emerald-500" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  )
}

export function Chip({ active, onClick, children, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50 ${
        active ? "border-[#B80B3D] bg-[#B80B3D]/10 text-[#B80B3D]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  )
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = "max-w-lg" }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === "Escape" && onClose?.()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/50 p-6 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className={`w-full ${width} max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", tone = "danger", busy, onConfirm, onClose, children }) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className={btn.ghost}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} className={tone === "danger" ? "inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3.5 h-9 text-[13px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50" : btn.primary}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
      {children}
    </Modal>
  )
}

/** Header used by every settings sub page (back to the hub + title + save actions). */
export function SubPageHeader({ title, subtitle, back = `${BASE}/settings`, backLabel = "Outlet Settings", actions }) {
  const navigate = useNavigate()
  return (
    <div className="mb-6">
      <button onClick={() => (back === -1 ? (window.history.length > 1 ? navigate(-1) : navigate(`${BASE}/settings`)) : navigate(back))} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-[#B80B3D]">
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </button>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </div>
  )
}

export const pickRestaurant = (res) =>
  res?.data?.data?.restaurant || res?.data?.restaurant || res?.data?.data || null

/** Current restaurant profile with a reload helper (used by almost every settings page). */
export function useRestaurantProfile({ fresh = false } = {}) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    try {
      const res = fresh || profile ? await restaurantAPI.refreshCurrentRestaurant() : await restaurantAPI.getCurrentRestaurant()
      const r = pickRestaurant(res)
      setProfile(r)
      return r
    } catch {
      return null
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh])
  useEffect(() => {
    reload()
  }, [reload])
  return { profile, setProfile, loading, reload }
}

export const imgUrl = (f) => (!f ? "" : typeof f === "string" ? f : f.url || "")
