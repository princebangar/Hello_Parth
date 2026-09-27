import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Ban, CheckCircle2, Loader2, RefreshCw, Search, ShoppingBag, Car, Users } from "lucide-react"
import { toast } from "sonner"
import AdminListPagination from "@food/components/admin/AdminListPagination"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { hasGlobalSection, readAdminProfile } from "@/shared/utils/adminAccess.js"
import { apiErrorMessage, globalAdminAPI } from "../api/globalAdminAPI"

const formatDate = (value) => {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const formatMoney = (value) => (value === null || value === undefined ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`)

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "blocked", label: "Blocked" },
]

const SummaryCard = ({ label, value, tone = "text-slate-900" }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{Number(value || 0).toLocaleString("en-IN")}</p>
  </div>
)

const ActivityCell = ({ count, last, unit }) => (
  <div className="text-sm">
    <span className="font-semibold text-slate-900 tabular-nums">{count}</span> <span className="text-slate-500">{unit}</span>
    {count > 0 && <p className="text-xs text-slate-400">Last {formatDate(last)}</p>}
  </div>
)

export default function GlobalCustomers() {
  const canEdit = useMemo(() => hasGlobalSection(readAdminProfile(), "customers", "edit"), [])
  const [customers, setCustomers] = useState([])
  const [summary, setSummary] = useState({ total: 0, active: 0, blocked: 0 })
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [acting, setActing] = useState(false)
  const requestIdRef = useRef(0)

  const fetchCustomers = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setRefreshing(true)
    try {
      const response = await globalAdminAPI.getCustomers({ search: search.trim() || undefined, status, page, limit: pageSize })
      if (requestId !== requestIdRef.current) return
      const data = response?.data?.data || {}
      setCustomers(Array.isArray(data.customers) ? data.customers : [])
      setSummary(data.summary || { total: 0, active: 0, blocked: 0 })
      setTotalItems(data.pagination?.total ?? 0)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      toast.error(apiErrorMessage(error, "Failed to load customers"))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [search, status, page, pageSize])

  useEffect(() => {
    setPage(1)
  }, [search, status])

  useEffect(() => {
    const timer = setTimeout(fetchCustomers, search.trim() ? 300 : 0)
    return () => {
      clearTimeout(timer)
      requestIdRef.current += 1
    }
  }, [fetchCustomers, search])

  const openDetail = async (customer) => {
    setDetail({ ...customer, recentOrders: [], recentRides: [] })
    setDetailLoading(true)
    try {
      const response = await globalAdminAPI.getCustomerById(customer.id)
      const full = response?.data?.data?.customer
      if (full) setDetail(full)
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to load customer"))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!confirm) return
    setActing(true)
    try {
      const response = await globalAdminAPI.updateCustomerStatus(confirm.customer.id, confirm.unblock)
      toast.success(response?.data?.message || (confirm.unblock ? "Customer unblocked" : "Customer blocked"))
      setConfirm(null)
      setDetail((current) => (current && current.id === confirm.customer.id ? { ...current, isBlocked: !confirm.unblock } : current))
      await fetchCustomers()
    } catch (error) {
      toast.error(apiErrorMessage(error, "Action failed"))
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <div className="space-y-4 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Customers</h1>
              <p className="text-sm text-slate-500">One profile per person across Food and Taxi.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Total customers" value={summary.total} />
          <SummaryCard label="Active" value={summary.active} tone="text-emerald-600" />
          <SummaryCard label="Blocked" value={summary.blocked} tone="text-rose-600" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 md:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, phone or email"
                className="pl-9 pr-3 py-2 w-full text-sm rounded-lg border border-slate-200 bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:bg-white transition-colors"
                aria-label="Search customers"
              />
            </div>
            <div className="flex items-center gap-2" role="group" aria-label="Status filter">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setStatus(filter.key)}
                  aria-pressed={status === filter.key}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    status === filter.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
              <button
                type="button"
                onClick={fetchCustomers}
                disabled={refreshing || loading}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 ml-1"
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw className={`w-[18px] h-[18px] ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Food</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Taxi</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Loading customers...</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">No customers found.</td></tr>
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-50/80 cursor-pointer" onClick={() => openDetail(customer)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                            {(customer.name || customer.phone || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{customer.name || "Unnamed customer"}</p>
                            <p className="text-xs text-slate-500 truncate">{customer.email || "No email"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{customer.phone || "—"}</td>
                      <td className="px-4 py-3"><ActivityCell count={customer.food.orders} last={customer.food.lastOrderAt} unit="orders" /></td>
                      <td className="px-4 py-3"><ActivityCell count={customer.taxi.rides} last={customer.taxi.lastRideAt} unit="rides" /></td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatDate(customer.joinedAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${customer.isBlocked ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>
                          {customer.isBlocked ? "Blocked" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setConfirm({ customer, unblock: customer.isBlocked })
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                              customer.isBlocked ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-rose-200 text-rose-600 hover:bg-rose-50"
                            }`}
                          >
                            {customer.isBlocked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                            {customer.isBlocked ? "Unblock" : "Block"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 pb-4">
            <AdminListPagination currentPage={page} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} itemLabel="customers" />
          </div>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-lg bg-white p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
            <DialogTitle>{detail?.name || "Customer"}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {[detail?.phone, detail?.email].filter(Boolean).join(" · ") || "No contact details"}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-1 font-semibold ${detail?.isBlocked ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>{detail?.isBlocked ? "Blocked in both apps" : "Active"}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">Joined {formatDate(detail?.joinedAt)}</span>
            </div>

            {detailLoading ? (
              <p className="text-sm text-slate-500"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Loading activity...</p>
            ) : (
              <>
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2"><ShoppingBag className="w-4 h-4" />Food orders ({detail?.food?.orders || 0})</h3>
                  {detail?.recentOrders?.length ? (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {detail.recentOrders.map((order) => (
                        <li key={order.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0"><span className="font-medium text-slate-800">{order.orderId || "Order"}</span> <span className="text-xs text-slate-500 capitalize">{String(order.status || "").replace(/_/g, " ")}</span></span>
                          <span className="text-slate-600 whitespace-nowrap">{formatMoney(order.total)} · {formatDate(order.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-slate-400">No food orders yet.</p>}
                </section>
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2"><Car className="w-4 h-4" />Taxi rides ({detail?.taxi?.rides || 0})</h3>
                  {detail?.recentRides?.length ? (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {detail.recentRides.map((ride) => (
                        <li key={ride.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0"><span className="font-medium text-slate-800 capitalize">{ride.serviceType || "Ride"}</span> <span className="text-xs text-slate-500 capitalize">{String(ride.status || "").replace(/_/g, " ")}</span></span>
                          <span className="text-slate-600 whitespace-nowrap">{formatMoney(ride.fare)} · {formatDate(ride.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-slate-400">No taxi rides yet.</p>}
                </section>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(open) => !open && !acting && setConfirm(null)}>
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
            <DialogTitle>{confirm?.unblock ? "Unblock customer" : "Block customer"}</DialogTitle>
            <DialogDescription className="sr-only">Confirm the change</DialogDescription>
          </DialogHeader>
          <div className="px-5 py-5 space-y-5">
            <p className="text-sm text-slate-700">
              {confirm?.unblock
                ? `Unblock ${confirm?.customer?.name || "this customer"}? They can use Food and Taxi again.`
                : `Block ${confirm?.customer?.name || "this customer"}? They will be blocked in both Food and Taxi.`}
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setConfirm(null)} disabled={acting} className="px-5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">No</button>
              <button type="button" onClick={handleConfirm} disabled={acting} className={`px-5 py-2 text-sm font-medium rounded-lg text-white inline-flex items-center gap-2 ${confirm?.unblock ? "bg-slate-900 hover:bg-slate-800" : "bg-red-600 hover:bg-red-700"}`}>
                {acting && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
