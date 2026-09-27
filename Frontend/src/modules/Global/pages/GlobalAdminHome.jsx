import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Activity,
  ArrowUpRight,
  Car,
  Globe,
  IndianRupee,
  RefreshCw,
  ShoppingBag,
  Store,
  Truck,
  UserCheck,
  Users,
  UtensilsCrossed,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@food/components/ui/card"
import { adminAPI } from "@food/api"
import { adminService as taxiAdminService } from "@/modules/Taxi/modules/admin/services/adminService"
import { FOOD_ADMIN_HOME, TAXI_ADMIN_HOME } from "@/shared/utils/activeModule.js"
import { getModuleAccess, readAdminProfile } from "@/shared/utils/adminAccess.js"

const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN")
const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`

/** One line inside a module card. */
const Stat = ({ icon: Icon, label, value }) => (
  <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
    <span className="flex items-center gap-2 text-sm text-slate-600">
      <Icon className="h-4 w-4 text-slate-400" />
      {label}
    </span>
    <span className="text-sm font-semibold text-slate-900 tabular-nums">{value}</span>
  </div>
)

const ModuleCard = ({ title, subtitle, icon: Icon, accent, status, onOpen, children }) => (
  <Card className="border-slate-200 shadow-sm">
    <CardHeader className="pb-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-slate-900">{title}</CardTitle>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </CardHeader>
    <CardContent>
      {status === "forbidden" ? (
        <p className="py-6 text-center text-sm text-slate-500">You do not have access to the {title} dashboard numbers.</p>
      ) : status === "error" ? (
        <p className="py-6 text-center text-sm text-rose-600">Couldn't load {title} numbers right now.</p>
      ) : status === "loading" ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        children
      )}
    </CardContent>
  </Card>
)

export default function GlobalAdminHome() {
  const navigate = useNavigate()
  // Only the modules this admin may open are queried and shown.
  const access = useMemo(() => getModuleAccess(readAdminProfile()), [])
  const [food, setFood] = useState({ status: access.food ? "loading" : "hidden", data: null })
  const [taxi, setTaxi] = useState({ status: access.taxi ? "loading" : "hidden", data: null })

  const load = useCallback(async () => {
    if (access.food) setFood((current) => ({ status: current.data ? "ready" : "loading", data: current.data }))
    if (access.taxi) setTaxi((current) => ({ status: current.data ? "ready" : "loading", data: current.data }))

    const [foodResult, taxiResult] = await Promise.allSettled([
      access.food ? adminAPI.getDashboardStats({ period: "overall" }) : Promise.resolve(null),
      access.taxi ? taxiAdminService.getDashboardData() : Promise.resolve(null),
    ])

    const failureStatus = (result) =>
      result.reason?.response?.status === 403 || result.reason?.status === 403 ? "forbidden" : "error"

    if (access.food) {
      if (foodResult.status === "fulfilled" && foodResult.value?.data?.success) {
        setFood({ status: "ready", data: foodResult.value.data.data || {} })
      } else {
        setFood((current) => ({ status: current.data ? "ready" : failureStatus(foodResult), data: current.data }))
      }
    }

    if (access.taxi) {
      if (taxiResult.status === "fulfilled") {
        const payload = taxiResult.value?.data || taxiResult.value || {}
        setTaxi({ status: "ready", data: payload })
      } else {
        setTaxi((current) => ({ status: current.data ? "ready" : failureStatus(taxiResult), data: current.data }))
      }
    }
  }, [access])

  useEffect(() => {
    load()
  }, [load])

  const foodData = food.data || {}
  const taxiData = taxi.data || {}

  // Customers live in one shared `users` collection, so summing the two counts would double-count.
  const sharedCustomers = Math.max(Number(foodData.customers?.total || 0), Number(taxiData.totalUsers || 0))
  const partners =
    Number(foodData.restaurants?.total || 0) +
    Number(foodData.deliveryBoys?.total || 0) +
    Number(taxiData.totalDrivers?.total || 0)
  const activityTotal = Number(foodData.orders?.total || 0) + Number(taxiData.overallTrips?.total || 0)

  const headline = useMemo(
    () => [
      { label: "Customers (one login, both apps)", value: formatNumber(sharedCustomers), icon: Users },
      { label: "Partners (restaurants, delivery, drivers)", value: formatNumber(partners), icon: UserCheck },
      { label: "Orders + trips (all time)", value: formatNumber(activityTotal), icon: Activity },
    ],
    [sharedCustomers, partners, activityTotal],
  )

  const refreshing = food.status === "loading" || taxi.status === "loading"
  const visibleModules = (access.food ? 1 : 0) + (access.taxi ? 1 : 0)

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900">
            <Globe className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Global Overview</h1>
            <p className="text-sm text-slate-500">Food and Taxi side by side — one place to see the whole platform.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {headline.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-slate-200 shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                <Icon className="h-5 w-5 text-slate-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${visibleModules > 1 ? "lg:grid-cols-2" : ""}`}>
        {access.food && <ModuleCard
          title="Food"
          subtitle="Restaurants, orders, delivery partners"
          icon={UtensilsCrossed}
          accent="bg-orange-500"
          status={food.status}
          onOpen={() => navigate(FOOD_ADMIN_HOME)}
        >
          <Stat icon={ShoppingBag} label="Total orders" value={formatNumber(foodData.orders?.total)} />
          <Stat icon={IndianRupee} label="Order value (all time)" value={formatMoney(foodData.revenue?.total)} />
          <Stat icon={IndianRupee} label="Admin earnings" value={formatMoney(foodData.totalAdminEarnings)} />
          <Stat icon={Store} label="Restaurants" value={formatNumber(foodData.restaurants?.total)} />
          <Stat icon={Truck} label="Delivery partners" value={formatNumber(foodData.deliveryBoys?.total)} />
          <Stat icon={Users} label="Customers" value={formatNumber(foodData.customers?.total)} />
        </ModuleCard>}

        {access.taxi && <ModuleCard
          title="Taxi"
          subtitle="Rides, parcels, bus, pooling, drivers"
          icon={Car}
          accent="bg-sky-600"
          status={taxi.status}
          onOpen={() => navigate(TAXI_ADMIN_HOME)}
        >
          <Stat icon={Activity} label="Trips today" value={formatNumber(taxiData.todayTrips?.total)} />
          <Stat icon={Activity} label="Trips (all time)" value={formatNumber(taxiData.overallTrips?.total)} />
          <Stat icon={IndianRupee} label="Earnings today" value={formatMoney(taxiData.todayEarnings?.total)} />
          <Stat icon={IndianRupee} label="Earnings (all time)" value={formatMoney(taxiData.overallEarnings?.total)} />
          <Stat icon={Car} label="Drivers (approved / total)" value={`${formatNumber(taxiData.totalDrivers?.approved)} / ${formatNumber(taxiData.totalDrivers?.total)}`} />
          <Stat icon={Users} label="Customers" value={formatNumber(taxiData.totalUsers)} />
        </ModuleCard>}
      </div>
    </div>
  )
}
