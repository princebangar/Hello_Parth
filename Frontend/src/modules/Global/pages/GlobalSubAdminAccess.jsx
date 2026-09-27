import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Globe, Loader2, MapPin, RotateCcw, Shield, Truck, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"
import { getSubAdminPermissionModules } from "@food/utils/subAdminPermissions"
import { ADMIN_PERMISSION_GROUPS } from "@/modules/Taxi/modules/admin/constants/adminAccess"
import { GLOBAL_ADMIN_HOME } from "@/shared/utils/activeModule.js"
import { GLOBAL_SECTIONS } from "@/shared/utils/adminAccess.js"
import PermissionMatrix, { matrixHasAccess, normalizeMatrix } from "../components/PermissionMatrix"
import { apiErrorMessage, globalAdminAPI } from "../api/globalAdminAPI"

// Managing admins stays with the platform super admin, so it is not offered for Taxi here.
const TAXI_GROUPS = ADMIN_PERMISSION_GROUPS
  .map((group) => ({ ...group, items: group.items.filter((item) => item.key !== "subadmins.manage") }))
  .filter((group) => group.items.length > 0)

const MODULE_CARDS = [
  { key: "food", label: "Food", description: "Restaurants, orders, delivery partners", Icon: UtensilsCrossed },
  { key: "taxi", label: "Taxi", description: "Rides, drivers, bus, pooling, pricing", Icon: Truck },
]

const sortedCopy = (list) => [...list].sort()

const snapshotOf = (state) =>
  JSON.stringify({
    services: sortedCopy(state.services),
    global: state.global,
    food: state.food,
    taxi: sortedCopy(state.taxi),
    locations: sortedCopy(state.locations),
    zones: sortedCopy(state.zones),
  })

const countRows = (matrix = {}) => Object.values(matrix).filter((row) => row?.view || row?.create || row?.edit || row?.delete).length

export default function GlobalSubAdminAccess() {
  const navigate = useNavigate()
  const { id } = useParams()
  const backPath = `${GLOBAL_ADMIN_HOME}/sub-admins`

  const foodRows = useMemo(() => getSubAdminPermissionModules(), [])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subAdmin, setSubAdmin] = useState(null)
  const [scope, setScope] = useState({ serviceLocations: [], zones: [] })
  const [tab, setTab] = useState("global")

  const [services, setServices] = useState([])
  const [globalPerms, setGlobalPerms] = useState({})
  const [foodPerms, setFoodPerms] = useState({})
  const [taxiKeys, setTaxiKeys] = useState([])
  const [locationIds, setLocationIds] = useState([])
  const [zoneIds, setZoneIds] = useState([])
  const [savedSnapshot, setSavedSnapshot] = useState("")

  const applyFromServer = useCallback((admin) => {
    const next = {
      services: Array.isArray(admin.servicesAccess) ? admin.servicesAccess : [],
      global: normalizeMatrix(admin.permissions?.global, GLOBAL_SECTIONS),
      food: normalizeMatrix(admin.permissions?.food, foodRows),
      taxi: Array.isArray(admin.permissions?.taxi) ? admin.permissions.taxi : [],
      locations: Array.isArray(admin.service_location_ids) ? admin.service_location_ids : [],
      zones: Array.isArray(admin.zone_ids) ? admin.zone_ids : [],
    }
    setSubAdmin(admin)
    setServices(next.services)
    setGlobalPerms(next.global)
    setFoodPerms(next.food)
    setTaxiKeys(next.taxi)
    setLocationIds(next.locations)
    setZoneIds(next.zones)
    setSavedSnapshot(snapshotOf(next))
  }, [foodRows])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const [adminResponse, scopeResponse] = await Promise.all([
          globalAdminAPI.getSubAdminById(id),
          globalAdminAPI.getSubAdminScopeOptions().catch(() => null),
        ])
        if (cancelled) return
        const admin = adminResponse?.data?.data?.subAdmin
        if (!admin) {
          toast.error("Sub admin not found")
          navigate(backPath, { replace: true })
          return
        }
        applyFromServer(admin)
        const scopeData = scopeResponse?.data?.data
        if (scopeData) setScope({ serviceLocations: scopeData.serviceLocations || [], zones: scopeData.zones || [] })
      } catch (error) {
        if (cancelled) return
        toast.error(apiErrorMessage(error, "Failed to load sub admin"))
        navigate(backPath, { replace: true })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, navigate, backPath, applyFromServer])

  const hasFood = services.includes("food")
  const hasTaxi = services.includes("taxi")
  const activeTab = tab === "food" && !hasFood ? "global" : tab === "taxi" && !hasTaxi ? "global" : tab

  const currentSnapshot = snapshotOf({ services, global: globalPerms, food: foodPerms, taxi: taxiKeys, locations: locationIds, zones: zoneIds })
  const dirty = savedSnapshot !== "" && currentSnapshot !== savedSnapshot

  const toggleService = (module) => {
    setServices((current) => (current.includes(module) ? current.filter((item) => item !== module) : [...current, module]))
  }

  const toggleTaxiKey = (key, checked) =>
    setTaxiKeys((current) => (checked ? [...new Set([...current, key])] : current.filter((item) => item !== key)))

  const toggleTaxiGroup = (group, checked) => {
    const keys = group.items.map((item) => item.key)
    setTaxiKeys((current) => (checked ? [...new Set([...current, ...keys])] : current.filter((item) => !keys.includes(item))))
  }

  const toggleLocation = (locationId, checked) => {
    setLocationIds((current) => (checked ? [...new Set([...current, locationId])] : current.filter((item) => item !== locationId)))
    if (!checked) {
      // zones of a location that is no longer selected must go with it
      setZoneIds((current) => current.filter((zoneId) => scope.zones.find((zone) => zone.id === zoneId)?.service_location_id !== locationId))
    }
  }

  const toggleZone = (zoneId, checked) =>
    setZoneIds((current) => (checked ? [...new Set([...current, zoneId])] : current.filter((item) => item !== zoneId)))

  const handleReset = () => {
    if (!subAdmin) return
    applyFromServer(subAdmin)
  }

  const handleSave = async () => {
    if (saving || !dirty) return

    if (services.length === 0) {
      toast.error("Give access to at least one module (Food or Taxi)")
      return
    }
    if (hasTaxi && taxiKeys.length > 0 && locationIds.length === 0) {
      setTab("taxi")
      toast.error("Choose at least one service location for Taxi access")
      return
    }

    setSaving(true)
    try {
      const response = await globalAdminAPI.updateSubAdminAccess(id, {
        servicesAccess: services,
        global: globalPerms,
        food: hasFood ? foodPerms : {},
        taxi: hasTaxi ? taxiKeys : [],
        service_location_ids: hasTaxi ? locationIds : [],
        zone_ids: hasTaxi ? zoneIds : [],
      })
      const saved = response?.data?.data?.subAdmin
      if (saved) applyFromServer(saved)
      toast.success("Access saved. It applies on their next page load.")
      navigate(backPath)
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to save access"))
    } finally {
      setSaving(false)
    }
  }

  const visibleZones = scope.zones.filter((zone) => locationIds.includes(zone.service_location_id))

  if (loading) {
    return (
      <div className="p-6 min-h-full flex items-center justify-center text-slate-500 gap-2" role="status">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading...
      </div>
    )
  }

  const tabs = [
    { key: "global", label: "Global", Icon: Globe, badge: countRows(globalPerms) },
    ...(hasFood ? [{ key: "food", label: "Food", Icon: UtensilsCrossed, badge: countRows(foodPerms) }] : []),
    ...(hasTaxi ? [{ key: "taxi", label: "Taxi", Icon: Truck, badge: taxiKeys.length }] : []),
  ]

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <div className="space-y-4 max-w-6xl mx-auto pb-24">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(backPath)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Sub Admin Access</h1>
              {subAdmin && (
                <p className="text-sm text-slate-500 mt-0.5 truncate">
                  {subAdmin.name}
                  {subAdmin.email ? ` (${subAdmin.email})` : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleReset}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-45 disabled:cursor-not-allowed shrink-0"
              title={dirty ? "Discard unsaved changes" : "No unsaved changes"}
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-slate-900">Module access</h2>
          <p className="text-sm text-slate-500 mt-0.5 mb-3">Which parts of the admin panel this sub admin can open.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MODULE_CARDS.map(({ key, label, description, Icon }) => {
              const checked = services.includes(key)
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-colors ${
                    checked ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleService(key)} className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900" aria-label={`${label} access`} />
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{label}</span>
                    <span className="block text-xs text-slate-500">{description}</span>
                  </span>
                </label>
              )
            })}
          </div>
          {!hasFood && !hasTaxi && <p className="mt-2 text-sm text-rose-600">Select at least one module.</p>}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-slate-200 px-3 pt-3" role="tablist" aria-label="Sidebar options by module">
            {tabs.map(({ key, label, Icon, badge }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  activeTab === key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{badge}</span>
              </button>
            ))}
          </div>

          {activeTab === "global" && (
            <div role="tabpanel">
              <p className="px-4 pt-4 text-sm text-slate-500 sm:px-5">Sections of the Global admin sidebar this sub admin can use.</p>
              <div className="pt-3">
                <PermissionMatrix rows={GLOBAL_SECTIONS} value={globalPerms} onChange={setGlobalPerms} />
              </div>
            </div>
          )}

          {activeTab === "food" && hasFood && (
            <div role="tabpanel">
              <p className="px-4 pt-4 text-sm text-slate-500 sm:px-5">Food admin sidebar options. Same view / create / edit / delete rules as a Food sub admin.</p>
              <div className="pt-3">
                <PermissionMatrix rows={foodRows} value={foodPerms} onChange={setFoodPerms} />
              </div>
              {!matrixHasAccess(foodPerms) && <p className="px-4 pb-4 text-sm text-amber-700 sm:px-5">No Food option selected yet — they will see an empty Food sidebar.</p>}
            </div>
          )}

          {activeTab === "taxi" && hasTaxi && (
            <div role="tabpanel" className="px-4 py-4 sm:px-5 space-y-6">
              <p className="text-sm text-slate-500">Taxi admin sidebar options, and the service locations this sub admin is limited to.</p>

              {TAXI_GROUPS.map((group) => {
                const keys = group.items.map((item) => item.key)
                const allChecked = keys.every((key) => taxiKeys.includes(key))
                return (
                  <fieldset key={group.title}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <legend className="text-sm font-semibold text-slate-900">{group.title}</legend>
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={allChecked} onChange={(event) => toggleTaxiGroup(group, event.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        Select all
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {group.items.map((item) => (
                        <label key={item.key} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 cursor-pointer hover:bg-slate-50">
                          <input type="checkbox" checked={taxiKeys.includes(item.key)} onChange={(event) => toggleTaxiKey(item.key, event.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )
              })}

              <fieldset className="rounded-xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  Service locations
                </legend>
                <p className="text-xs text-slate-500 mb-3">A Taxi sub admin only sees data of the locations chosen here.</p>
                {scope.serviceLocations.length === 0 ? (
                  <p className="text-sm text-slate-500">No service locations found. Add one in the Taxi admin first.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {scope.serviceLocations.map((location) => (
                      <label key={location.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={locationIds.includes(location.id)} onChange={(event) => toggleLocation(location.id, event.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        {location.name}
                      </label>
                    ))}
                  </div>
                )}
                {taxiKeys.length > 0 && locationIds.length === 0 && (
                  <p className="mt-3 text-sm text-rose-600">Choose at least one service location to save Taxi access.</p>
                )}

                {visibleZones.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-slate-800 mb-1">Zones <span className="text-xs font-normal text-slate-500">(optional — leave empty for every zone of the chosen locations)</span></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {visibleZones.map((zone) => (
                        <label key={zone.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 cursor-pointer hover:bg-slate-50">
                          <input type="checkbox" checked={zoneIds.includes(zone.id)} onChange={(event) => toggleZone(zone.id, event.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          {zone.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </fieldset>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 lg:-mx-6 -mb-4 lg:-mb-6 border-t border-slate-200 bg-white/95 backdrop-blur px-4 lg:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            title={dirty ? "Save access" : "Change something to enable save"}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-all disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Access
          </button>
          <button
            type="button"
            onClick={() => navigate(backPath)}
            disabled={saving}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        </div>
      </div>
    </div>
  )
}
