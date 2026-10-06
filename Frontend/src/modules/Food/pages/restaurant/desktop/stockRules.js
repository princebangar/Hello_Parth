// Out-of-stock rules. Same storage key + shape as the phone Inventory screen so both screens understand each other
// when they are used in the same browser.
export const STOCK_RULES_KEY = "restaurant_inventory_stock_rules_v1"
export const RECOMMENDED_KEY = "restaurant_inventory_recommended_map"

export const readJson = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "{}")
    return v && typeof v === "object" ? v : {}
  } catch {
    return {}
  }
}
export const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

const normalizeDayName = (v) => String(v || "").trim().toLowerCase().replace(/^./, (c) => c.toUpperCase())

const timeParts = (value) => {
  const raw = String(value || "").trim()
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) return { hours: Math.min(23, Number(hhmm[1])), minutes: Math.min(59, Number(hhmm[2])) }
  const mer = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (mer) {
    let h = Number(mer[1])
    const m = Number(mer[2] || 0)
    const p = mer[3].toLowerCase()
    if (p === "pm" && h !== 12) h += 12
    if (p === "am" && h === 12) h = 0
    return { hours: Math.min(23, h), minutes: Math.min(59, m) }
  }
  return { hours: 9, minutes: 0 }
}

const nextBusinessDay = (profile) => {
  const now = new Date()
  const openDays = Array.isArray(profile?.openDays) ? profile.openDays.map(normalizeDayName).filter(Boolean) : []
  const { hours, minutes } = timeParts(profile?.openingTime || "09:00")
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    const name = normalizeDayName(d.toLocaleDateString("en-US", { weekday: "long" }))
    if (openDays.length && !openDays.includes(name)) continue
    d.setHours(hours, minutes, 0, 0)
    return d.toISOString()
  }
  const d = new Date(now)
  d.setDate(now.getDate() + 1)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

/** option: "specific-time" | "next-business-day" | "custom-date-time" | "manual" */
export const buildStockRule = ({ option, hours, customDate, customTime, profile }) => {
  const createdAt = new Date().toISOString()
  if (option === "manual") return { mode: "manual", createdAt, resumeAt: null }
  if (option === "next-business-day") return { mode: "next-business-day", createdAt, resumeAt: nextBusinessDay(profile) }
  if (option === "custom-date-time") {
    const d = customDate && customTime ? new Date(`${customDate}T${customTime}:00`) : null
    return { mode: "custom-date-time", createdAt, resumeAt: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null }
  }
  const h = Math.max(1, Number(hours) || 1)
  const d = new Date()
  d.setHours(d.getHours() + h)
  return { mode: "specific-time", createdAt, durationHours: h, resumeAt: d.toISOString() }
}

export const isRuleActive = (rule, nowMs = Date.now()) =>
  !!rule && (rule.mode === "manual" || (rule.resumeAt && new Date(rule.resumeAt).getTime() > nowMs))

export const ruleLabel = (rule) => {
  if (!rule) return "No time set. Turn item in stock manually."
  if (rule.mode === "manual") return "Manual off. Turn item in stock manually."
  const d = new Date(rule.resumeAt || "")
  if (Number.isNaN(d.getTime())) return "Out of stock"
  const f = d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true })
  return rule.mode === "next-business-day" ? `Back next business day at ${f}` : `Out of stock until ${f}`
}
