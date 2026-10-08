import { useCallback, useEffect, useMemo, useState } from "react"
import { CreditCard, Gift, Loader2, SlidersHorizontal, Store, TriangleAlert, Wallet, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@food/components/ui/switch"
import { hasGlobalSection, readAdminProfile } from "@/shared/utils/adminAccess.js"
import { getPageCache, setPageCache } from "@/shared/utils/pageCache.js"
import { CUSTOMIZATION_CACHE_KEY, apiErrorMessage, globalAdminAPI } from "../api/globalAdminAPI"

/** Who uses which gateway — shown on its card so the admin knows what a switch affects. */
const GATEWAY_USAGE = {
  razorpay: "Food: checkout + wallet top-up. Taxi: ride, tip, pooling, bus booking, driver QR, wallet top-up.",
  phonepe: "Taxi wallet top-up only (user and driver). Used when Razorpay is off.",
}

/** Switches in "Customer payment methods" and "App controls" (saved together through one endpoint). */
const USER_PAYMENT_SWITCHES = [
  {
    key: "user_cod_enabled",
    label: "User Global COD",
    description: "Cash on delivery / cash to the driver for every customer, in Food and Taxi.",
  },
  {
    key: "user_wallet_enabled",
    label: "User Wallet Payment",
    description: "Paying with the in-app wallet balance, in Food and Taxi.",
  },
  {
    key: "user_online_enabled",
    label: "User Online Payment",
    description: "Online payments (UPI, cards, netbanking) and wallet top-ups, in Food and Taxi.",
  },
]

const APP_CONTROL_SWITCHES = [
  {
    key: "default_location_enabled",
    label: "Default Location Mode",
    description:
      "Bypasses device location permission and sets the location to Indore for every customer, in Food and Taxi (use for App Store review).",
  },
  {
    key: "maintenance_mode_enabled",
    label: "Under Maintenance",
    description:
      "When ON, every app shows the Under Maintenance screen: Food (user, restaurant, delivery) and Taxi (user, driver). Admin panels stay available. To stop only the Food apps use Food admin > Customization Settings.",
  },
]

// Food "My Store" (brand stores). On unless switched off here.
const MY_STORE_SWITCH = [
  {
    key: "my_store_enabled",
    label: "My Store",
    description:
      "Brand-owned stores in Food. If you turn this off, it hides from everywhere.",
  },
]

export default function GlobalCustomizationSettings() {
  const profile = useMemo(() => readAdminProfile(), [])
  const canEdit = hasGlobalSection(profile, "customization", "edit")

  const cached = useMemo(() => getPageCache(CUSTOMIZATION_CACHE_KEY), [])
  const [loading, setLoading] = useState(!cached)
  const [gateways, setGateways] = useState(cached?.paymentGateways || [])
  const [referralEnabled, setReferralEnabled] = useState(cached?.referral?.enabled !== false)
  const [appSwitches, setAppSwitches] = useState(cached?.appSwitches || null)
  const [savingKey, setSavingKey] = useState(null)

  const applySettings = useCallback((data) => {
    if (!data) return
    setGateways(data.paymentGateways || [])
    setReferralEnabled(data.referral?.enabled !== false)
    setAppSwitches(data.appSwitches || null)
    setPageCache(CUSTOMIZATION_CACHE_KEY, data)
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const response = await globalAdminAPI.getCustomizationSettings()
      applySettings(response?.data?.data)
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to load customization settings"))
    } finally {
      setLoading(false)
    }
  }, [applySettings])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const toggleGateway = async (gateway, enabled) => {
    setSavingKey(gateway.key)
    try {
      const response = await globalAdminAPI.updatePaymentGateways({ [gateway.key]: enabled })
      const paymentGateways = response?.data?.data?.paymentGateways || []
      setGateways(paymentGateways)
      setPageCache(CUSTOMIZATION_CACHE_KEY, { ...(getPageCache(CUSTOMIZATION_CACHE_KEY) || {}), paymentGateways })
      toast.success(`${gateway.label} ${enabled ? "ON" : "OFF"}`)
    } catch (error) {
      toast.error(apiErrorMessage(error, `Failed to update ${gateway.label}`))
    } finally {
      setSavingKey(null)
    }
  }

  const toggleAppSwitch = async (item, enabled) => {
    setSavingKey(item.key)
    try {
      const response = await globalAdminAPI.updateAppSwitches({ [item.key]: enabled })
      const next = response?.data?.data?.appSwitches
      if (next) {
        setAppSwitches(next)
        setPageCache(CUSTOMIZATION_CACHE_KEY, { ...(getPageCache(CUSTOMIZATION_CACHE_KEY) || {}), appSwitches: next })
      }
      if (item.key === "maintenance_mode_enabled" || item.key === "default_location_enabled" || item.key === "my_store_enabled") {
        // Keep this browser's copy of the public settings in step so the customer app reacts straight away.
        // The public settings call the all-apps maintenance switch "global_maintenance_enabled".
        const publicKey = item.key === "maintenance_mode_enabled" ? "global_maintenance_enabled" : item.key
        try {
          const raw = localStorage.getItem("helloparth_customization_settings")
          const parsed = raw ? JSON.parse(raw) : {}
          localStorage.setItem("helloparth_customization_settings", JSON.stringify({ ...parsed, [publicKey]: enabled }))
        } catch {
          /* ignore */
        }
        if (item.key === "maintenance_mode_enabled") {
          window.dispatchEvent(new CustomEvent("maintenanceModeChanged"))
        }
      }
      toast.success(`${item.label} ${enabled ? "ON" : "OFF"}`)
    } catch (error) {
      toast.error(apiErrorMessage(error, `Failed to update ${item.label}`))
    } finally {
      setSavingKey(null)
    }
  }

  const toggleReferral = async (enabled) => {
    setSavingKey("referral")
    try {
      const response = await globalAdminAPI.updateReferral(enabled)
      const next = response?.data?.data?.referral?.enabled !== false
      setReferralEnabled(next)
      setPageCache(CUSTOMIZATION_CACHE_KEY, { ...(getPageCache(CUSTOMIZATION_CACHE_KEY) || {}), referral: { enabled: next } })
      toast.success(`Referral system ${next ? "ON" : "OFF"}`)
    } catch (error) {
      toast.error(apiErrorMessage(error, "Failed to update referral system"))
    } finally {
      setSavingKey(null)
    }
  }

  const spinner = <Loader2 className="w-5 h-5 animate-spin text-slate-400" />

  /** One switch tile; same look as the Food admin's Customization Settings. */
  const renderTile = ({ key, label, description, control }) => (
    <div key={key} className="flex items-start justify-between gap-3 p-3 border rounded-lg bg-slate-50/60 border-slate-200">
      <div className="space-y-0.5 min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500 leading-snug">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  )

  const renderSection = ({ icon: Icon, title, note, banner, loadingNow, tiles }) => (
    <section className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-5 h-5 text-slate-600" />
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>
      <p className="text-xs text-slate-500 mb-4">{note}</p>
      {banner}
      {loadingNow ? (
        <div className="py-6 text-center text-sm text-slate-500">
          <Loader2 className="inline w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">{tiles.map(renderTile)}</div>
      )}
    </section>
  )

  const appSwitchTiles = (items) =>
    items.map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description,
      control:
        savingKey === item.key ? (
          spinner
        ) : (
          <Switch
            checked={appSwitches?.[item.key] === true}
            onCheckedChange={(checked) => toggleAppSwitch(item, checked)}
            disabled={!canEdit}
            aria-label={`${item.label} on or off`}
            className="scale-90 data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300"
          />
        ),
    }))

  const noneActive = !loading && gateways.length > 0 && gateways.every((gateway) => !gateway.active)

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <SlidersHorizontal className="w-7 h-7 text-slate-800" />
          Customization Settings
        </h1>
        <p className="text-slate-600 mt-1">Switches that apply to the whole app — Food and Taxi.</p>
      </div>

      {renderSection({
        icon: CreditCard,
        title: "Payment Gateways",
        note: "Turning a gateway off stops new payments only — payments already started still verify and refund.",
        banner: noneActive ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 mb-4 text-xs text-amber-800">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>No gateway is active — customers can only pay by cash or wallet balance.</span>
          </div>
        ) : null,
        loadingNow: loading,
        tiles: gateways.map((gateway) => ({
          key: gateway.key,
          label: gateway.label,
          description: GATEWAY_USAGE[gateway.key],
          control:
            savingKey === gateway.key ? (
              spinner
            ) : (
              <Switch
                checked={gateway.enabled}
                onCheckedChange={(checked) => toggleGateway(gateway, checked)}
                disabled={!canEdit}
                aria-label={`${gateway.label} on or off`}
                className="scale-90 data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300"
              />
            ),
        })),
      })}

      {renderSection({
        icon: Wallet,
        title: "Customer Payment Methods",
        note: "One switch for every customer in Food and Taxi. Off here wins over the Food admin's own payment switches.",
        loadingNow: loading || !appSwitches,
        tiles: appSwitchTiles(USER_PAYMENT_SWITCHES),
      })}

      {renderSection({
        icon: Wrench,
        title: "App Controls",
        note: "Apply to the whole app — Food and Taxi.",
        loadingNow: loading || !appSwitches,
        tiles: appSwitchTiles(APP_CONTROL_SWITCHES),
      })}

      {renderSection({
        icon: Store,
        title: "My Store (Food)",
        note: "Applies to the Food app.",
        loadingNow: loading || !appSwitches,
        tiles: appSwitchTiles(MY_STORE_SWITCH),
      })}

      {renderSection({
        icon: Gift,
        title: "Referral System",
        note: 'Customer "Refer & Earn" in the Food and Taxi wallets. Turning it off hides it in both apps and stops new referral rewards. Rewards already paid stay in the wallets. Driver / rider referral is separate.',
        loadingNow: loading,
        tiles: [
          {
            key: "referral",
            label: "Customer referral",
            description: "Reward amount and limits are set in each app's own Referral settings.",
            control:
              savingKey === "referral" ? (
                spinner
              ) : (
                <Switch
                  checked={referralEnabled}
                  onCheckedChange={toggleReferral}
                  disabled={!canEdit}
                  aria-label="Referral system on or off"
                  className="scale-90 data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300"
                />
              ),
          },
        ],
      })}
    </div>
  )
}
