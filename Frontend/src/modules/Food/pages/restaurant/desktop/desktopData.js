import { restaurantAPI } from "@food/api"

export const inr = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

export const inr2 = (n) =>
  `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
}
export { dayKey }

export function normalizeOrder(o) {
  const type = String(o.orderType || "").toLowerCase()
  const items = Array.isArray(o.items) ? o.items : []
  return {
    key: String(o._id || o.orderId || o.id),
    mongoId: String(o._id || o.id || ""),
    orderId: o.orderId || o.order_id || String(o._id || "").slice(-6),
    status: o.status || "confirmed",
    type: type === "takeaway" ? "Takeaway" : type === "dining" ? "Dining" : "Delivery",
    customer: o.userId?.name || o.customerName || o.user?.name || "Customer",
    phone: o.userId?.phone || o.customerPhone || "",
    items,
    itemsText: items.map((i) => `${i.quantity || 1}× ${i.name}`).join(", ") || "—",
    itemCount: items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
    total: Number(o.pricing?.total ?? o.total ?? 0) || 0,
    payment: o.paymentMethod || null,
    address: o.address?.formattedAddress || o.address?.address || (typeof o.address === "string" ? o.address : ""),
    note: o.restaurantNote || o.note || "",
    prepTime: Number(o.preparationTime) || null,
    createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
    raw: o,
  }
}

/** Pulls several pages (100 per page, backend max) so charts have real history. */
export async function fetchOrders({ maxPages = 5, fresh = false } = {}) {
  if (fresh) restaurantAPI.invalidateOrdersCache()
  const all = []
  let page = 1
  let totalPages = 1
  do {
    const res = await restaurantAPI.getOrders({ page, limit: 100 })
    const payload = res?.data?.data || {}
    const rows = Array.isArray(payload.orders) ? payload.orders : []
    all.push(...rows)
    totalPages = Number(payload.meta?.totalPages) || 1
    page += 1
  } while (page <= totalPages && page <= maxPages)
  return all.map(normalizeOrder).sort((a, b) => b.createdAt - a.createdAt)
}

export const NEW_STATUSES = ["confirmed", "pending", "created"]
export const isNew = (o) => NEW_STATUSES.includes(o.status)
export const isCompleted = (o) => ["delivered", "completed"].includes(o.status)
export const isCancelled = (o) => o.status === "cancelled" || String(o.status).includes("reject")
export const isActive = (o) => !isNew(o) && !isCompleted(o) && !isCancelled(o)

export const STATUS_META = {
  confirmed: { label: "New", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  preparing: { label: "Preparing", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  ready: { label: "Ready", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  out_for_delivery: { label: "Out for delivery", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  delivered: { label: "Delivered", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  completed: { label: "Completed", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  cancelled: { label: "Cancelled", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
}
export const statusMeta = (s) =>
  STATUS_META[s] || { label: String(s || "—").replace(/_/g, " "), cls: "bg-slate-100 text-slate-700 ring-slate-200" }

/** Revenue / order series for the last `days` days (cancelled orders excluded from revenue). */
export function buildDailySeries(orders, days = 7) {
  const out = []
  const map = new Map()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const row = {
      key: dayKey(d),
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      revenue: 0,
      orders: 0,
    }
    map.set(row.key, row)
    out.push(row)
  }
  orders.forEach((o) => {
    const row = map.get(dayKey(o.createdAt))
    if (!row) return
    row.orders += 1
    if (!isCancelled(o)) row.revenue += o.total
  })
  return out
}

export function buildHourSeries(orders) {
  const rows = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`,
    orders: 0,
  }))
  orders.forEach((o) => {
    if (!isCancelled(o)) rows[o.createdAt.getHours()].orders += 1
  })
  return rows
}

export function buildTypeSplit(orders) {
  const m = {}
  orders.filter((o) => !isCancelled(o)).forEach((o) => {
    m[o.type] = (m[o.type] || 0) + 1
  })
  return Object.entries(m).map(([name, value]) => ({ name, value }))
}

export function buildTopItems(orders, limit = 6) {
  const m = new Map()
  orders.filter(isCompleted).forEach((o) =>
    o.items.forEach((i) => {
      const k = i.name || "Item"
      const cur = m.get(k) || { name: k, qty: 0, revenue: 0 }
      const q = Number(i.quantity) || 1
      cur.qty += q
      cur.revenue += (Number(i.price) || 0) * q
      m.set(k, cur)
    }),
  )
  return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, limit)
}

export function menuItemsFromResponse(res) {
  const sections = res?.data?.data?.menu?.sections || []
  const out = []
  sections.forEach((s) => {
    const push = (item, category) =>
      out.push({
        id: String(item.id),
        name: item.name || "Unnamed item",
        image: item.image || "",
        price: Number(item.price) || 0,
        foodType: item.foodType || "",
        category: category || s.name || "Uncategorised",
        isAvailable: item.isAvailable !== false,
        approvalStatus: String(item.approvalStatus || "approved").toLowerCase(),
      })
    ;(s.items || []).forEach((i) => push(i, s.name))
    ;(s.subsections || []).forEach((sub) => (sub.items || []).forEach((i) => push(i, s.name)))
  })
  return out
}
