import { useCallback, useEffect, useRef, useState } from "react"
import { restaurantAPI } from "@food/api"
import { pickRestaurant } from "./kit"

const STATUS_KEYS = ["restaurant_delivery_status", "restaurant_online_status"]
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const persist = (value) => {
  STATUS_KEYS.forEach((k) => {
    try {
      localStorage.setItem(k, JSON.stringify(Boolean(value)))
    } catch {
      /* ignore */
    }
  })
}

// Same rule as the mobile "Restaurant status" screen: only the outlet timings decide if "now" is inside opening hours.
export function evaluateTimings(timings, now = new Date()) {
  const day = timings?.[DAY_NAMES[now.getDay()]]
  if (!day) return { dayClosed: false, within: true }
  if (day.isOpen === false) return { dayClosed: true, within: false }
  if (!day.openingTime || !day.closingTime) return { dayClosed: false, within: true }
  const [oh, om] = day.openingTime.split(":").map(Number)
  const [ch, cm] = day.closingTime.split(":").map(Number)
  const cur = now.getHours() * 60 + now.getMinutes()
  const open = oh * 60 + om
  const close = ch * 60 + cm
  const within = close > open ? cur >= open && cur <= close : cur >= open || cur <= close
  return { dayClosed: false, within }
}

/**
 * ONE source of truth for "is the restaurant taking orders", shared by the desktop header and the status page.
 * It talks to the same backend field (isAcceptingOrders) as the phone app and re-reads it regularly, so a change
 * made on the phone shows up here and the other way round.
 */
export default function useRestaurantStatus() {
  const [accepting, setAccepting] = useState(null)
  const [takeaway, setTakeaway] = useState(false)
  const [timings, setTimings] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null) // "day-closed" | "outside" | null
  const alive = useRef(true)

  const loadProfile = useCallback(async (fresh = false) => {
    try {
      const res = fresh ? await restaurantAPI.refreshCurrentRestaurant() : await restaurantAPI.getCurrentRestaurant()
      const r = pickRestaurant(res)
      if (!alive.current || !r) return
      if (r.isAcceptingOrders !== undefined) {
        setAccepting(Boolean(r.isAcceptingOrders))
        persist(r.isAcceptingOrders)
      } else setAccepting(false)
      setTakeaway(Boolean(r.takeawaySettings?.isEnabled ?? r.isTakeawayEnabled))
    } catch {
      if (alive.current) setAccepting((a) => (a === null ? false : a))
    }
  }, [])

  const loadTimings = useCallback(async () => {
    try {
      const res = await restaurantAPI.getOutletTimings()
      const t = res?.data?.data?.outletTimings || res?.data?.outletTimings
      if (alive.current && t) setTimings(t)
    } catch {
      /* keep previous */
    }
  }, [])

  useEffect(() => {
    alive.current = true
    loadProfile()
    loadTimings()
    const tick = setInterval(() => setNow(new Date()), 30000)
    // Pick up changes made on the phone (or another browser) without a manual refresh.
    const sync = setInterval(() => loadProfile(true), 30000)
    const onVisible = () => document.visibilityState === "visible" && loadProfile(true)
    const onStatus = (e) => typeof e.detail?.isOnline === "boolean" && setAccepting(e.detail.isOnline)
    window.addEventListener("restaurantStatusChanged", onStatus)
    window.addEventListener("outletTimingsUpdated", loadTimings)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive.current = false
      clearInterval(tick)
      clearInterval(sync)
      window.removeEventListener("restaurantStatusChanged", onStatus)
      window.removeEventListener("outletTimingsUpdated", loadTimings)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [loadProfile, loadTimings])

  const { dayClosed, within } = evaluateTimings(timings, now)
  // Same three labels as the mobile header pill.
  const label = accepting === null ? "…" : !accepting ? "Offline" : within && !dayClosed ? "Online" : "Closed"

  const setDelivery = useCallback(
    async (checked) => {
      if (checked && dayClosed) return setDialog("day-closed")
      if (checked && !within) return setDialog("outside")
      setBusy(true)
      const prev = accepting
      setAccepting(checked)
      try {
        await restaurantAPI.updateAcceptingOrders(checked)
        persist(checked)
        window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline: checked } }))
        return true
      } catch {
        setAccepting(prev)
        persist(prev)
        return false
      } finally {
        setBusy(false)
      }
    },
    [accepting, dayClosed, within],
  )

  const setTakeawayEnabled = useCallback(async (checked) => {
    setTakeaway(checked)
    try {
      await restaurantAPI.updateTakeawaySettings({ isEnabled: checked })
      return true
    } catch {
      setTakeaway(!checked)
      return false
    }
  }, [])

  return {
    accepting: Boolean(accepting),
    ready: accepting !== null,
    label,
    within,
    dayClosed,
    takeaway,
    busy,
    dialog,
    closeDialog: () => setDialog(null),
    setDelivery,
    setTakeawayEnabled,
    timings,
    now,
  }
}
