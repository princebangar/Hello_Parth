// Web: pages/restaurant/EditOwner.jsx — "Edit Profile & Contact Details" (/edit-owner, from Outlet Info): four tabs
// (Owner Details, Restaurant Info, Bank & KYC, FSSAI & Docs) over one form loaded from GET current restaurant (forced
// refresh) + GET public zones; owner photo, name, email, phone (locked); restaurant name, primary contact, Pure Veg /
// Mixed menu, service zone, address (place search, "Select from map" -> /edit-address, address fields), opening /
// closing time, open days, estimated delivery time, cuisines (max 8); PAN + PAN copy, bank account, IFSC, account
// type, GST switch + GST fields + copy; FSSAI number, expiry date, FSSAI copy and up to 10 menu photos; the fixed
// "Save Profile Details" bar (validation -> first error's tab + toast, uploads, PATCH profile, back to Outlet Info).
// Same API calls, validation messages, toasts, session draft / tab keys and navigation.
// Native:
// - the form is a KeyboardAwareScrollView (each focused field scrolls above the keyboard and above the Save bar); the
//   fixed Save bar rides on the keyboard (useKeyboardOffset);
// - photos come from ImageSourcePicker (camera / gallery) as { uri, name, type, size } files (the web's File); the
//   file's uri is its preview, and it is uploaded with uploadAPI.uploadMedia on Save, like the web;
// - MUI MobileTimePicker -> the system time picker (shown "hh:mm a", stored "HH:mm"); <input type="date"> -> the
//   system date picker (shown dd/mm/yyyy like the phone browser, stored yyyy-mm-dd);
// - "Select from map": the map page hands the picked location back to this page (it stays mounted under it) through
//   the sessionStorage key below, read when this page is focused again (the web remounted /edit-owner with
//   { updatedLocation } in the route state — still handled the same way if it arrives in the route state). The web's
//   "replace the URL to drop updatedLocation" step is not needed natively (a replace would rebuild the page and lose
//   the merged location), so it is left out;
// - the unsaved draft (sessionStorage) is dropped when this page closes for good (Android back) — on the web it only
//   lived for the trip to the map page and back;
// - lenis -> nothing.
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Animated, Easing, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native"
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker"
import { LinearGradient } from "expo-linear-gradient"
import { useFocusEffect } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  ArrowLeft,
  User,
  Building,
  CreditCard,
  FileText,
  Upload,
  X,
  Image as ImageIcon,
  Check,
  Clock,
  Calendar as CalendarIcon,
  MapPin,
} from "lucide-react-native"
import { useLocation, useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { KeyboardAwareScrollView, Screen, Sheet, StatusBarSpacer, Text } from "@/native/ui"
import { alpha, colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import useKeyboardOffset from "@/modules/Taxi/shared/hooks/useKeyboardOffset"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { restaurantAPI, zoneAPI, uploadAPI } from "@food/api"
import OptimizedImage from "@food/components/OptimizedImage"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import LocationSearchInput from "@food/components/restaurant/LocationSearchInput"
import { dispatchRestaurantLocationUpdated, buildRestaurantLocationUpdatePayload } from "@food/utils/restaurantLocation"

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]

const timeToString = (date) => {
  if (!date) return ""
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

const normalizeTimeValue = (value) => {
  if (!value) return ""
  const raw = String(value).trim()
  if (!raw) return ""

  const to24Hour = (h, m, period) => {
    let hours = Number(h)
    const minutes = Number(m)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ""
    if (minutes < 0 || minutes > 59) return ""
    const p = String(period || "").toUpperCase()
    if (p === "AM") {
      if (hours === 12) hours = 0
    } else if (p === "PM") {
      if (hours !== 12) hours += 12
    }
    if (hours < 0 || hours > 23) return ""
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  }

  if (/^\d{2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":").map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return ""
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }

  if (/^\d{1}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":")
    return to24Hour(h, m, "")
  }

  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/)
  if (ampm) {
    return to24Hour(ampm[1], ampm[2], ampm[3])
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return timeToString(parsed)
  }
  return ""
}

const stringToTime = (timeString) => {
  const normalized = normalizeTimeValue(timeString)
  if (!normalized || !normalized.includes(":")) {
    return null
  }
  const [hours, minutes] = normalized.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 0, minutes || 0)
}

/** MUI format "hh:mm a" -> "09:30 AM" */
const formatPickerTime = (date) => {
  const h = date.getHours()
  const hh = String(h % 12 || 12).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${hh}:${mm} ${h >= 12 ? "PM" : "AM"}`
}

/** "yyyy-mm-dd" <-> local Date (no UTC shift) */
const parseYMD = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""))
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}
const toYMD = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
/** the phone browser's date input shows dd/mm/yyyy */
const formatDMY = (value) => {
  const d = parseYMD(value)
  if (!d) return ""
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_NUMBER_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const FSSAI_NUMBER_REGEX = /^\d{14}$/
const BANK_ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/
const IFSC_CODE_REGEX = /^[A-Z0-9]{11}$/
const OWNER_NAME_REGEX = /^[A-Za-z ]+$/
const ACCOUNT_HOLDER_NAME_REGEX = /^[A-Za-z ]+$/
const GST_LEGAL_NAME_REGEX = /^[A-Za-z ]+$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EDIT_OWNER_DRAFT_KEY = "restaurant_edit_owner_draft"
const EDIT_OWNER_ACTIVE_TAB_KEY = "restaurant_edit_owner_active_tab"
// Native hand-off from the map page (EditRestaurantAddress writes it, this page reads it on focus).
const EDIT_OWNER_MAP_RETURN_KEY = "restaurant_edit_owner_map_return"
const TAB_IDS = ["owner", "restaurant", "kyc", "docs"]

const createDefaultFormData = () => ({
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  profileImage: null,
  restaurantName: "",
  pureVegRestaurant: false,
  primaryContactNumber: "",
  zoneId: "",
  location: {
    formattedAddress: "",
    addressLine1: "",
    addressLine2: "",
    area: "",
    city: "Indore",
    state: "Madhya Pradesh",
    pincode: "",
    landmark: "",
    latitude: "",
    longitude: "",
  },
  cuisines: [],
  openingTime: "",
  closingTime: "",
  openDays: [],
  estimatedDeliveryTime: "",
  panNumber: "",
  nameOnPan: "",
  panImage: null,
  accountNumber: "",
  confirmAccountNumber: "",
  ifscCode: "",
  accountHolderName: "",
  accountType: "Saving",
  gstRegistered: false,
  gstNumber: "",
  gstLegalName: "",
  gstAddress: "",
  gstImage: null,
  fssaiNumber: "",
  fssaiExpiry: "",
  fssaiImage: null,
  menuImages: [],
})

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const ALL_CUISINES = [
  "Burger",
  "Chinese",
  "Momos",
  "North Indian",
  "Pizza",
  "Rolls",
  "Sandwich",
  "Shawarma",
  "South Indian",
  "Biryani",
  "Desserts",
  "Ice Cream",
  "Fast Food",
  "Cafe",
  "Italian",
  "Mexican",
  "Thai",
  "Seafood",
  "Salad",
  "Healthy Food",
  "Juices",
  "Beverages",
  "Punjabi",
  "Gujarati",
  "Rajasthani",
  "Mughlai",
  "Street Food",
  "Bakery",
]

const formatNameToCapital = (str) => {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

const mergePendingLocation = (baseLocation, pendingLocation) => {
  if (!pendingLocation || typeof pendingLocation !== "object") return baseLocation

  return {
    ...baseLocation,
    formattedAddress: pendingLocation.formattedAddress || baseLocation.formattedAddress || "",
    addressLine1:
      pendingLocation.addressLine1 ||
      pendingLocation.placeName ||
      baseLocation.addressLine1 ||
      "",
    addressLine2: pendingLocation.addressLine2 || baseLocation.addressLine2 || "",
    area: pendingLocation.area || baseLocation.area || "",
    city: pendingLocation.city || baseLocation.city || "",
    state: pendingLocation.state || baseLocation.state || "",
    pincode: pendingLocation.pincode || baseLocation.pincode || "",
    landmark:
      pendingLocation.landmark ||
      pendingLocation.placeName ||
      pendingLocation.addressLine1 ||
      baseLocation.landmark ||
      "",
    latitude:
      pendingLocation.latitude != null && pendingLocation.latitude !== ""
        ? String(pendingLocation.latitude)
        : baseLocation.latitude,
    longitude:
      pendingLocation.longitude != null && pendingLocation.longitude !== ""
        ? String(pendingLocation.longitude)
        : baseLocation.longitude,
  }
}

const readStoredDraft = (pendingLocation = null) => {
  try {
    const draftRaw = sessionStorage.getItem(EDIT_OWNER_DRAFT_KEY)
    if (!draftRaw) return null
    const draft = JSON.parse(draftRaw)
    if (!draft || typeof draft !== "object") return null
    if (pendingLocation) {
      return {
        ...draft,
        location: mergePendingLocation(draft.location, pendingLocation),
      }
    }
    return draft
  } catch {
    return null
  }
}

/** a picked photo (the web's File): { uri, name, type, size } */
const isLocalFile = (value) => Boolean(value && typeof value === "object" && typeof value.uri === "string")

// ------------------------------------------------------------------ small pieces

function RingSpinner() {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [v])
  return (
    <Animated.View
      style={[s.ring, { transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }]}
    />
  )
}

function FieldLabel({ children, style }) {
  return <Text style={[s.fieldLabel, style]}>{children}</Text>
}

/** shadcn Input (h-11 text-sm) with the restaurant theme's focus border */
function Field({ style, disabled, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <Input
      {...props}
      disabled={disabled}
      placeholderTextColor={colors.gray[400]}
      onFocus={(e) => {
        setFocused(true)
        props.onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        props.onBlur?.(e)
      }}
      style={[s.input, style, focused && !disabled && { borderColor: restaurantTheme.focusBorder }]}
    />
  )
}

function SectionCard({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>
}

function CardTitle({ children }) {
  return (
    <View style={s.cardTitleRow}>
      <Text style={s.cardTitle}>{children}</Text>
    </View>
  )
}

function OutlineButton({ onPress, label, style, textColor = colors.gray[700] }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.outlineBtn, style, pressed && { backgroundColor: alpha(colors.red[50], 1) }]}
    >
      <Upload size={14} color={textColor} style={{ marginRight: 6 }} />
      <Text style={[s.outlineBtnText, { color: textColor }]}>{label}</Text>
    </Pressable>
  )
}

function RemoveBadge({ onPress, style, gradient = false, size = 14, bg = restaurantTheme.brand }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[s.removeBadge, { backgroundColor: gradient ? "transparent" : bg }, style]}>
      {gradient ? <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      <X size={size} color={colors.white} />
    </Pressable>
  )
}

/** PAN / GST / FSSAI copy box */
function DocUpload({ label, value, previewUrl, alt, onRemove, onUpload, buttonLabel }) {
  return (
    <View style={s.docBox}>
      <Label style={s.docLabel}>{label}</Label>
      {value ? (
        <View style={s.docPreview}>
          <OptimizedImage src={previewUrl} alt={alt} style={StyleSheet.absoluteFill} />
          <RemoveBadge onPress={onRemove} style={{ top: 6, right: 6 }} />
        </View>
      ) : (
        <View style={s.docEmpty}>
          <ImageIcon size={40} color={colors.gray[400]} style={{ marginBottom: 4 }} />
          <Text style={s.docEmptyText}>No document uploaded</Text>
        </View>
      )}
      <OutlineButton onPress={onUpload} label={buttonLabel} style={{ width: "100%", borderColor: colors.gray[300] }} />
    </View>
  )
}

/** Web: MUI MobileTimePicker (ampm, format "hh:mm a") -> the system time picker */
function TimeBox({ label, value, onTimeChange }) {
  const timeValue = stringToTime(value)
  const [iosOpen, setIosOpen] = useState(false)

  const open = () => {
    Keyboard.dismiss()
    const current = timeValue || new Date()
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "time",
        is24Hour: false,
        onValueChange: (_event, date) => {
          if (date) onTimeChange(date)
        },
      })
      return
    }
    setIosOpen(true)
  }

  return (
    <View style={s.timeBox}>
      <View style={s.timeHead}>
        <Clock size={16} color={colors.gray[800]} />
        <Text style={s.timeLabel}>{label}</Text>
      </View>
      <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [s.timeField, pressed && { borderColor: colors.gray[300] }]}>
        <Text style={[s.timeFieldText, !timeValue && { color: colors.gray[400] }]}>
          {timeValue ? formatPickerTime(timeValue) : "Select time"}
        </Text>
      </Pressable>
      {Platform.OS !== "android" ? (
        <Sheet open={iosOpen} onClose={() => setIosOpen(false)} style={s.iosSheet}>
          <DateTimePicker
            value={timeValue || new Date()}
            mode="time"
            display="spinner"
            onValueChange={(_event, date) => {
              if (date) onTimeChange(date)
            }}
          />
          <Pressable onPress={() => setIosOpen(false)} style={s.iosDone}>
            <Text style={s.iosDoneText}>Done</Text>
          </Pressable>
        </Sheet>
      ) : null}
    </View>
  )
}

// ------------------------------------------------------------------ screen

export default function EditOwner() {
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const insets = useSafeAreaInsets()
  const keyboardInset = useKeyboardOffset()
  const outletInfoPath = "/food/restaurant/outlet-info"
  // This page's own route state (the shared location follows whatever page is on top).
  const routeStateRef = useRef(routerLocation.state)
  const routePathRef = useRef(routerLocation.pathname)
  const routeState = routeStateRef.current
  const backTarget = routeState?.from || outletInfoPath
  const [restoredDraftOnMount] = useState(() => readStoredDraft(routeStateRef.current?.updatedLocation))
  const [barHeight, setBarHeight] = useState(80)

  // Tabs structure
  const TABS = [
    { id: "owner", label: "Owner Details", icon: User },
    { id: "restaurant", label: "Restaurant Info", icon: Building },
    { id: "kyc", label: "Bank & KYC", icon: CreditCard },
    { id: "docs", label: "FSSAI & Docs", icon: FileText },
  ]
  const [activeTab, setActiveTab] = useState(() => {
    const fromState = routeStateRef.current?.activeTab
    if (fromState && TAB_IDS.includes(fromState)) {
      return fromState
    }
    try {
      const saved = sessionStorage.getItem(EDIT_OWNER_ACTIVE_TAB_KEY)
      if (saved && TAB_IDS.includes(saved)) {
        return saved
      }
    } catch {
      // ignore storage errors
    }
    return "owner"
  })

  // Master Form Data
  const [formData, setFormData] = useState(() => restoredDraftOnMount || createDefaultFormData())

  const [initialData, setInitialData] = useState(null)
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(() => !restoredDraftOnMount)
  const [saving, setSaving] = useState(false)

  // Photo Picker helpers
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false)
  const [activeImageField, setActiveImageField] = useState(null)
  const activeImageFieldRef = useRef(null)
  const scrollRef = useRef(null)
  const [iosFssaiOpen, setIosFssaiOpen] = useState(false)

  const handleBack = () => {
    try {
      sessionStorage.removeItem(EDIT_OWNER_DRAFT_KEY)
    } catch {
      // ignore storage errors
    }
    if (initialData) {
      setFormData(JSON.parse(JSON.stringify(initialData)))
    }
    navigate(backTarget)
  }

  // The unsaved draft only lives for the trip to the map page and back.
  useEffect(
    () => () => {
      Keyboard.dismiss()
      try {
        sessionStorage.removeItem(EDIT_OWNER_DRAFT_KEY)
      } catch {
        // ignore storage errors
      }
    },
    [],
  )

  // Load Zones on Mount
  useEffect(() => {
    let cancelled = false
    zoneAPI
      .getPublicZones()
      .then((res) => {
        const list = res?.data?.data?.zones || res?.data?.zones || []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        console.error("Failed to load zones:", err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(EDIT_OWNER_ACTIVE_TAB_KEY, activeTab)
    } catch {
      // ignore storage errors
    }
  }, [activeTab])

  // Back from the map page (native hand-off; the web remounted this page with { updatedLocation })
  useFocusEffect(
    useCallback(() => {
      let payload = null
      try {
        const raw = sessionStorage.getItem(EDIT_OWNER_MAP_RETURN_KEY)
        if (raw) {
          sessionStorage.removeItem(EDIT_OWNER_MAP_RETURN_KEY)
          payload = JSON.parse(raw)
        }
      } catch {
        payload = null
      }
      if (!payload || typeof payload !== "object") return undefined
      const returnTab = payload.activeTab
      if (returnTab && TAB_IDS.includes(returnTab)) setActiveTab(returnTab)
      if (payload.updatedLocation) {
        setFormData((prev) => ({
          ...prev,
          location: mergePendingLocation(prev.location, payload.updatedLocation),
        }))
      }
      return undefined
    }, []),
  )

  // Fetch restaurant details
  useEffect(() => {
    const pendingLocation = routeStateRef.current?.updatedLocation
    const returnTab = routeStateRef.current?.activeTab
    let cancelled = false

    if (returnTab && TAB_IDS.includes(returnTab)) {
      setActiveTab(returnTab)
    }

    let draftData = restoredDraftOnMount
    if (!draftData) {
      try {
        const draftRaw = sessionStorage.getItem(EDIT_OWNER_DRAFT_KEY)
        if (draftRaw) {
          draftData = JSON.parse(draftRaw)
        }
      } catch {
        draftData = null
      }
    }

    const fetchRestaurantData = async () => {
      try {
        if (!draftData) {
          setLoading(true)
        }

        const response = await restaurantAPI.refreshCurrentRestaurant()
        if (cancelled) return
        const apiData = response?.data?.data?.restaurant || response?.data?.restaurant

        if (apiData) {
          // Backend returns flat fields via toRestaurantProfile() mapper
          const loc = apiData.location || {}

          // Helper to extract URL from image field (can be string URL or {url, publicId} object)
          const toImgUrl = (field) => {
            if (!field) return null
            if (typeof field === "string") return field
            if (field.url) return field.url
            return null
          }

          // menuImages come as array of {url, publicId} objects or string URLs
          const menuImagesArr = Array.isArray(apiData.menuImages)
            ? apiData.menuImages.map((m) => (typeof m === "string" ? m : m?.url || "")).filter(Boolean)
            : []

          const mappedData = {
            ownerName: apiData.ownerName || "",
            ownerEmail: apiData.ownerEmail || "",
            ownerPhone: (apiData.ownerPhone || "").replace(/\D/g, "").slice(-10),
            profileImage: toImgUrl(apiData.profileImage),

            restaurantName: apiData.restaurantName || apiData.name || "",
            pureVegRestaurant: Boolean(apiData.pureVegRestaurant),
            primaryContactNumber: (apiData.primaryContactNumber || "").replace(/\D/g, "").slice(-10),
            zoneId: apiData.zoneId ? String(apiData.zoneId) : "",
            location: {
              formattedAddress: loc.formattedAddress || loc.address || "",
              addressLine1: loc.addressLine1 || "",
              addressLine2: loc.addressLine2 || "",
              area: loc.area || "",
              city: loc.city || "Indore",
              state: loc.state || "Madhya Pradesh",
              pincode: loc.pincode || "",
              landmark: loc.landmark || "",
              latitude:
                loc.latitude != null && loc.latitude !== ""
                  ? String(loc.latitude)
                  : Array.isArray(loc.coordinates)
                    ? String(loc.coordinates[1] ?? "")
                    : "",
              longitude:
                loc.longitude != null && loc.longitude !== ""
                  ? String(loc.longitude)
                  : Array.isArray(loc.coordinates)
                    ? String(loc.coordinates[0] ?? "")
                    : "",
            },
            cuisines: Array.isArray(apiData.cuisines)
              ? apiData.cuisines
                  .flatMap((c) => (typeof c === "string" ? c.split(",").map((x) => x.trim()) : c))
                  .map((c) => ALL_CUISINES.find((ac) => ac.toLowerCase() === String(c).toLowerCase()) || c)
              : [],
            openingTime: apiData.openingTime || "",
            closingTime: apiData.closingTime || "",
            openDays: Array.isArray(apiData.openDays)
              ? apiData.openDays
                  .flatMap((d) => (typeof d === "string" ? d.split(",").map((x) => x.trim()) : d))
                  .map((d) => daysOfWeek.find((dw) => dw.toLowerCase() === String(d).toLowerCase()) || d)
              : [],
            estimatedDeliveryTime: apiData.estimatedDeliveryTime || "",

            panNumber: apiData.panNumber || "",
            nameOnPan: apiData.nameOnPan || "",
            panImage: toImgUrl(apiData.panImage),
            accountNumber: apiData.accountNumber || "",
            confirmAccountNumber: apiData.accountNumber || "",
            ifscCode: apiData.ifscCode || "",
            accountHolderName: apiData.accountHolderName || "",
            accountType: apiData.accountType || "Saving",
            gstRegistered: Boolean(apiData.gstRegistered),
            gstNumber: apiData.gstNumber || "",
            gstLegalName: apiData.gstLegalName || "",
            gstAddress: apiData.gstAddress || "",
            gstImage: toImgUrl(apiData.gstImage),

            fssaiNumber: apiData.fssaiNumber || "",
            fssaiExpiry: apiData.fssaiExpiry ? String(apiData.fssaiExpiry).split("T")[0] : "",
            fssaiImage: toImgUrl(apiData.fssaiImage),
            menuImages: menuImagesArr,
          }

          const savedInitial = JSON.parse(JSON.stringify(mappedData))

          let cachedDraft = draftData
          if (!cachedDraft) {
            try {
              const draftRaw = sessionStorage.getItem(EDIT_OWNER_DRAFT_KEY)
              if (draftRaw) {
                cachedDraft = JSON.parse(draftRaw)
              }
            } catch {
              cachedDraft = null
            }
          }

          let nextFormData = cachedDraft || mappedData
          if (pendingLocation) {
            nextFormData = {
              ...nextFormData,
              location: mergePendingLocation(nextFormData.location, pendingLocation),
            }
          }

          setInitialData(savedInitial)
          setFormData(nextFormData)
        }
      } catch (err) {
        if (cancelled) return
        console.error("Error loading restaurant data:", err)
        if (!draftData) {
          toast.error("Failed to load restaurant profile details")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchRestaurantData()
    return () => {
      cancelled = true
    }
    // runs once on mount, like the web
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Check for unsaved changes
  const hasChanges = initialData ? JSON.stringify(formData) !== JSON.stringify(initialData) : false

  // Field change helpers
  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleLocationChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        [field]: value,
      },
    }))
  }

  const handleLocationSearchSelect = (location) => {
    if (!location) return

    setFormData((prev) => {
      const next = {
        ...prev,
        location: {
          ...prev.location,
          formattedAddress: location.formattedAddress || prev.location.formattedAddress || "",
          addressLine1: location.addressLine1 || location.placeName || "",
          addressLine2: location.addressLine2 || "",
          area: location.area || "",
          city: location.city || prev.location.city || "Indore",
          state: location.state || prev.location.state || "Madhya Pradesh",
          pincode: location.pincode || "",
          landmark: location.landmark || location.placeName || "",
          latitude:
            location.latitude != null && location.latitude !== ""
              ? String(location.latitude)
              : prev.location.latitude,
          longitude:
            location.longitude != null && location.longitude !== ""
              ? String(location.longitude)
              : prev.location.longitude,
        },
      }

      try {
        sessionStorage.setItem(EDIT_OWNER_DRAFT_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }

      return next
    })
  }

  // Cuisines helper
  const handleCuisineToggle = (cuisine) => {
    setFormData((prev) => {
      const isSelected = prev.cuisines.includes(cuisine)
      if (isSelected) {
        return {
          ...prev,
          cuisines: prev.cuisines.filter((c) => c !== cuisine),
        }
      }
      if (prev.cuisines.length >= 8) {
        toast.error("You can select up to 8 cuisines only")
        return prev
      }
      return {
        ...prev,
        cuisines: [...prev.cuisines, cuisine],
      }
    })
  }

  // Open Days helper
  const handleDayToggle = (day) => {
    setFormData((prev) => {
      const isSelected = prev.openDays.includes(day)
      if (isSelected) {
        return {
          ...prev,
          openDays: prev.openDays.filter((d) => d !== day),
        }
      }
      return {
        ...prev,
        openDays: [...prev.openDays, day],
      }
    })
  }

  // File picker handler
  const handlePhotoClick = (field) => {
    Keyboard.dismiss()
    activeImageFieldRef.current = field
    setActiveImageField(field)
    setIsPhotoPickerOpen(true)
  }

  const handlePhotoSelect = (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size too large. Max 5MB allowed.")
      return
    }

    const field = activeImageFieldRef.current || activeImageField
    if (!field) return
    if (field === "menuImages") {
      setFormData((prev) => ({
        ...prev,
        menuImages: [...prev.menuImages, file],
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        [field]: file,
      }))
    }
    setIsPhotoPickerOpen(false)
  }

  const handleRemoveImage = (field, index = null) => {
    if (field === "menuImages" && index !== null) {
      setFormData((prev) => ({
        ...prev,
        menuImages: prev.menuImages.filter((_, idx) => idx !== index),
      }))
    } else {
      setFormData((prev) => ({
        ...prev,
        [field]: null,
      }))
    }
  }

  // Get image preview URL
  const getPreviewUrl = (value) => {
    if (!value) return ""
    if (typeof value === "string") return value
    if (isLocalFile(value)) return value.uri
    return value.url || ""
  }

  // Validation function
  const validateForm = () => {
    const errors = []

    // 1. Owner Details validation
    if (!formData.ownerName?.trim()) {
      errors.push({ tab: "owner", field: "ownerName", message: "Owner name is required" })
    } else if (!OWNER_NAME_REGEX.test(formData.ownerName.trim())) {
      errors.push({ tab: "owner", field: "ownerName", message: "Owner name must contain only letters" })
    }

    if (!formData.ownerEmail?.trim()) {
      errors.push({ tab: "owner", field: "ownerEmail", message: "Owner email is required" })
    } else if (!EMAIL_REGEX.test(formData.ownerEmail.trim())) {
      errors.push({ tab: "owner", field: "ownerEmail", message: "Please enter a valid email address" })
    }

    if (!formData.ownerPhone?.trim()) {
      errors.push({ tab: "owner", field: "ownerPhone", message: "Mobile phone number is required" })
    } else if (!/^\d{10}$/.test(formData.ownerPhone.replace(/\D/g, ""))) {
      errors.push({ tab: "owner", field: "ownerPhone", message: "Mobile number must be exactly 10 digits" })
    }

    if (!formData.profileImage) {
      errors.push({ tab: "owner", field: "profileImage", message: "Profile photo is required" })
    }

    // 2. Restaurant details validation
    if (!formData.restaurantName?.trim()) {
      errors.push({ tab: "restaurant", field: "restaurantName", message: "Restaurant name is required" })
    } else if (/[/-]/.test(formData.restaurantName)) {
      errors.push({ tab: "restaurant", field: "restaurantName", message: "Restaurant name cannot contain slashes (/) or hyphens (-)" })
    }

    if (!formData.primaryContactNumber?.trim()) {
      errors.push({ tab: "restaurant", field: "primaryContactNumber", message: "Primary contact number is required" })
    } else if (!/^\d{10}$/.test(formData.primaryContactNumber.replace(/\D/g, ""))) {
      errors.push({ tab: "restaurant", field: "primaryContactNumber", message: "Primary contact must be exactly 10 digits" })
    }

    if (!formData.zoneId) {
      errors.push({ tab: "restaurant", field: "zoneId", message: "Service zone selection is required" })
    }

    if (!formData.location?.addressLine1?.trim()) {
      errors.push({ tab: "restaurant", field: "addressLine1", message: "Address details are required" })
    }

    if (!formData.location?.area?.trim()) {
      errors.push({ tab: "restaurant", field: "area", message: "Area/Locality is required" })
    }

    if (!formData.location?.pincode?.trim()) {
      errors.push({ tab: "restaurant", field: "pincode", message: "Pincode is required" })
    } else if (!/^\d{6}$/.test(formData.location.pincode.replace(/\D/g, ""))) {
      errors.push({ tab: "restaurant", field: "pincode", message: "Pincode must be exactly 6 digits" })
    }

    if (!formData.openingTime || !formData.closingTime) {
      errors.push({ tab: "restaurant", field: "timings", message: "Opening & closing timings are required" })
    }

    if (!formData.openDays || formData.openDays.length === 0) {
      errors.push({ tab: "restaurant", field: "openDays", message: "Select at least one open day" })
    }

    if (!formData.estimatedDeliveryTime?.trim()) {
      errors.push({ tab: "restaurant", field: "estimatedDeliveryTime", message: "Estimated delivery time is required" })
    }

    // 3. Bank & KYC validation
    if (!formData.panNumber?.trim()) {
      errors.push({ tab: "kyc", field: "panNumber", message: "PAN card number is required" })
    } else if (!PAN_NUMBER_REGEX.test(formData.panNumber.trim().toUpperCase())) {
      errors.push({ tab: "kyc", field: "panNumber", message: "Invalid PAN card format (e.g. ABCDE1234F)" })
    }

    if (!formData.nameOnPan?.trim()) {
      errors.push({ tab: "kyc", field: "nameOnPan", message: "Name on PAN card is required" })
    }

    if (!formData.panImage) {
      errors.push({ tab: "kyc", field: "panImage", message: "PAN card copy upload is required" })
    }

    if (!formData.accountNumber?.trim()) {
      errors.push({ tab: "kyc", field: "accountNumber", message: "Bank account number is required" })
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(formData.accountNumber.trim())) {
      errors.push({ tab: "kyc", field: "accountNumber", message: "Bank account number must be 9 to 18 digits" })
    }

    if (formData.accountNumber !== formData.confirmAccountNumber) {
      errors.push({ tab: "kyc", field: "confirmAccountNumber", message: "Bank account confirmation does not match" })
    }

    if (!formData.ifscCode?.trim()) {
      errors.push({ tab: "kyc", field: "ifscCode", message: "IFSC code is required" })
    } else if (!IFSC_CODE_REGEX.test(formData.ifscCode.trim().toUpperCase())) {
      errors.push({ tab: "kyc", field: "ifscCode", message: "Invalid IFSC code format (11 digits alphanumeric)" })
    }

    if (!formData.accountHolderName?.trim()) {
      errors.push({ tab: "kyc", field: "accountHolderName", message: "Account holder name is required" })
    } else if (!ACCOUNT_HOLDER_NAME_REGEX.test(formData.accountHolderName.trim())) {
      errors.push({ tab: "kyc", field: "accountHolderName", message: "Account holder name must contain only letters" })
    }

    if (formData.gstRegistered) {
      if (!formData.gstNumber?.trim()) {
        errors.push({ tab: "kyc", field: "gstNumber", message: "GSTIN is required when registered" })
      } else if (!GST_NUMBER_REGEX.test(formData.gstNumber.trim().toUpperCase())) {
        errors.push({ tab: "kyc", field: "gstNumber", message: "Invalid GSTIN format (15 characters)" })
      }
      if (!formData.gstLegalName?.trim()) {
        errors.push({ tab: "kyc", field: "gstLegalName", message: "GST Legal name is required" })
      } else if (!GST_LEGAL_NAME_REGEX.test(formData.gstLegalName.trim())) {
        errors.push({ tab: "kyc", field: "gstLegalName", message: "GST Legal name must contain only letters" })
      }
      if (!formData.gstAddress?.trim()) {
        errors.push({ tab: "kyc", field: "gstAddress", message: "GST Registered address is required" })
      }
      if (!formData.gstImage) {
        errors.push({ tab: "kyc", field: "gstImage", message: "GST certificate upload is required" })
      }
    }

    // 4. Documents & FSSAI validation
    if (!formData.fssaiNumber?.trim()) {
      errors.push({ tab: "docs", field: "fssaiNumber", message: "FSSAI number is required" })
    } else if (!FSSAI_NUMBER_REGEX.test(formData.fssaiNumber.trim())) {
      errors.push({ tab: "docs", field: "fssaiNumber", message: "FSSAI number must be exactly 14 digits" })
    }

    if (!formData.fssaiExpiry) {
      errors.push({ tab: "docs", field: "fssaiExpiry", message: "FSSAI expiry date is required" })
    } else {
      const today = new Date().toISOString().split("T")[0]
      if (formData.fssaiExpiry < today) {
        errors.push({ tab: "docs", field: "fssaiExpiry", message: "FSSAI expiry date cannot be in the past" })
      }
    }

    if (!formData.fssaiImage) {
      errors.push({ tab: "docs", field: "fssaiImage", message: "FSSAI copy upload is required" })
    }

    if (!formData.menuImages || formData.menuImages.length === 0) {
      errors.push({ tab: "docs", field: "menuImages", message: "At least one menu image is required" })
    }

    return errors
  }

  // Upload handler wrapper
  const uploadSingleFile = async (file, folder) => {
    if (!file) return null
    if (typeof file === "string") return { url: file } // already uploaded
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      return res?.data?.data || res?.data || null
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || "Upload failed"
      throw new Error(errorMsg)
    }
  }

  // Save changes handler
  const handleSave = async () => {
    Keyboard.dismiss()
    const validationErrors = validateForm()
    if (validationErrors.length > 0) {
      // Surface first error, shift to its corresponding tab
      const firstError = validationErrors[0]
      setActiveTab(firstError.tab)
      toast.error(firstError.message)
      return
    }

    try {
      setSaving(true)

      // 1. Upload images in parallel
      const [profRes, panRes, gstRes, fssaiRes] = await Promise.all([
        uploadSingleFile(formData.profileImage, "food/restaurants/profile"),
        uploadSingleFile(formData.panImage, "food/restaurants/pan"),
        formData.gstRegistered
          ? uploadSingleFile(formData.gstImage, "food/restaurants/gst")
          : Promise.resolve(null),
        uploadSingleFile(formData.fssaiImage, "food/restaurants/fssai"),
      ])

      // 2. Upload menu images
      const menuImagesPayload = await Promise.all(
        formData.menuImages.map(async (img) => {
          if (isLocalFile(img)) {
            const res = await uploadSingleFile(img, "food/restaurants/menu")
            return res?.url || ""
          }
          return typeof img === "string" ? img : img?.url || ""
        }),
      )

      // 3. Construct update payload
      const updatePayload = {
        ownerName: formData.ownerName.trim(),
        ownerEmail: formData.ownerEmail.trim(),
        ownerPhone: formData.ownerPhone.trim(),
        profileImage: profRes?.url || "",

        restaurantName: formData.restaurantName.trim(),
        pureVegRestaurant: formData.pureVegRestaurant,
        primaryContactNumber: formData.primaryContactNumber.trim(),
        zoneId: formData.zoneId,
        location: buildRestaurantLocationUpdatePayload(formData.location),
        cuisines: formData.cuisines,
        openingTime: formData.openingTime,
        closingTime: formData.closingTime,
        openDays: formData.openDays,
        estimatedDeliveryTime: formData.estimatedDeliveryTime.trim(),

        panNumber: formData.panNumber.trim().toUpperCase(),
        nameOnPan: formData.nameOnPan.trim(),
        panImage: panRes?.url || "",
        accountNumber: formData.accountNumber.trim(),
        ifscCode: formData.ifscCode.trim().toUpperCase(),
        accountHolderName: formData.accountHolderName.trim(),
        accountType: formData.accountType,
        gstRegistered: formData.gstRegistered,
        gstNumber: formData.gstRegistered ? formData.gstNumber.trim().toUpperCase() : "",
        gstLegalName: formData.gstRegistered ? formData.gstLegalName.trim() : "",
        gstAddress: formData.gstRegistered ? formData.gstAddress.trim() : "",
        gstImage: formData.gstRegistered ? gstRes?.url || "" : "",

        fssaiNumber: formData.fssaiNumber.trim(),
        fssaiExpiry: formData.fssaiExpiry,
        fssaiImage: fssaiRes?.url || "",
        menuImages: menuImagesPayload.filter(Boolean),
      }

      const response = await restaurantAPI.updateProfile(updatePayload)

      if (response?.data?.success || response?.data?.data) {
        toast.success("Profile details updated successfully")
        try {
          sessionStorage.removeItem(EDIT_OWNER_DRAFT_KEY)
        } catch {
          // ignore storage errors
        }
        setInitialData(JSON.parse(JSON.stringify(formData)))
        navigate(backTarget, {
          state: {
            savedLocation: buildRestaurantLocationUpdatePayload(formData.location),
          },
        })
        setTimeout(() => {
          dispatchRestaurantLocationUpdated()
        }, 0)
      } else {
        throw new Error(response?.data?.message || "Failed to save profile changes")
      }
    } catch (error) {
      console.error("Error saving profile details:", error)
      toast.error(error.message || "Failed to update profile. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const goToMapPicker = () => {
    Keyboard.dismiss()
    try {
      sessionStorage.setItem(EDIT_OWNER_DRAFT_KEY, JSON.stringify(formData))
      sessionStorage.setItem(EDIT_OWNER_ACTIVE_TAB_KEY, activeTab)
    } catch {
      // ignore storage errors
    }
    navigate("/food/restaurant/edit-address", {
      state: {
        from: routePathRef.current,
        outletFrom: backTarget,
        currentLocation: formData.location,
        returnTab: activeTab,
      },
    })
  }

  // ---- FSSAI expiry date (web: <input type="date">) ----------------------------------------------------------------
  const openFssaiDate = () => {
    Keyboard.dismiss()
    const current = parseYMD(formData.fssaiExpiry) || new Date()
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onValueChange: (_event, date) => {
          if (date) handleInputChange("fssaiExpiry", toYMD(date))
        },
      })
      return
    }
    setIosFssaiOpen(true)
  }

  if (loading) {
    return (
      <Screen bg={colors.gray[50]}>
        <View style={s.loadingWrap}>
          <View style={{ alignItems: "center", gap: sp(3) }}>
            <RingSpinner />
            <Text style={s.loadingText}>Loading profile details...</Text>
          </View>
        </View>
      </Screen>
    )
  }

  const biasLocation =
    Number.isFinite(Number(formData.location?.latitude)) &&
    Number.isFinite(Number(formData.location?.longitude)) &&
    formData.location?.latitude !== "" &&
    formData.location?.longitude !== ""
      ? {
          latitude: Number(formData.location.latitude),
          longitude: Number(formData.location.longitude),
        }
      : null

  const saveDisabled = !hasChanges || loading || saving

  return (
    <Screen bg={colors.gray[50]} edges={[]}>
      {/* Header */}
      <View style={s.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={s.headerRow}>
          <Pressable
            onPress={handleBack}
            style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: colors.gray[100] }]}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <View>
            <Text style={s.headerTitle}>Edit Profile & Contact Details</Text>
            <Text style={s.headerSub}>Restaurant Control Panel</Text>
          </View>
        </View>
      </View>

      {/* Tab Switcher - Horizontal scroll on mobile */}
      <View style={s.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.tabRow}>
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[s.tab, isActive ? s.tabActive : null, isActive && { transform: [{ scale: 1.05 }] }]}
              >
                <Icon size={16} color={isActive ? restaurantTheme.brand : colors.gray[400]} />
                <Text style={[s.tabText, { color: isActive ? restaurantTheme.brand : colors.gray[500] }]}>{tab.label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Content Container */}
      <KeyboardAwareScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: sp(28) + insets.bottom }]}
        extraOffset={barHeight + sp(4)}
      >
        {/* TAB 1: OWNER DETAILS */}
        {activeTab === "owner" ? (
          <View style={s.tabBody}>
            {/* Profile Photo */}
            <SectionCard style={{ alignItems: "center", gap: sp(3) }}>
              <Label style={s.photoLabel}>Owner Profile Photo</Label>
              <View style={{ marginTop: sp(2) }}>
                <View style={s.avatar}>
                  {formData.profileImage ? (
                    <OptimizedImage src={getPreviewUrl(formData.profileImage)} alt="Owner Profile" style={StyleSheet.absoluteFill} />
                  ) : (
                    <User size={40} color={colors.gray[400]} />
                  )}
                </View>
                {formData.profileImage ? (
                  <RemoveBadge onPress={() => handleRemoveImage("profileImage")} gradient style={{ top: -4, right: -4, ...shadow.md }} />
                ) : null}
              </View>
              <OutlineButton
                onPress={() => handlePhotoClick("profileImage")}
                label="Choose Photo"
                textColor={restaurantTheme.brand}
                style={{ marginTop: sp(1), borderColor: restaurantTheme.brand, paddingHorizontal: sp(4) }}
              />
            </SectionCard>

            {/* Name & Email Fields */}
            <SectionCard>
              <View>
                <FieldLabel>Full Name</FieldLabel>
                <Field
                  value={formData.ownerName}
                  onChangeText={(text) => handleInputChange("ownerName", formatNameToCapital(text.replace(/[^A-Za-z ]/g, "")))}
                  placeholder="Enter owner full name"
                  autoCapitalize="words"
                />
              </View>

              <View>
                <FieldLabel>Owner Email Address</FieldLabel>
                <Field
                  type="email"
                  value={formData.ownerEmail}
                  onChangeText={(text) => handleInputChange("ownerEmail", text)}
                  placeholder="Enter owner email"
                />
              </View>

              <View>
                <FieldLabel>Mobile Phone Number</FieldLabel>
                <Field
                  type="tel"
                  value={formData.ownerPhone}
                  onChangeText={(text) => handleInputChange("ownerPhone", text.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Enter 10-digit mobile number"
                  inputMode="numeric"
                  disabled
                  style={{ backgroundColor: colors.gray[50], color: colors.gray[500] }}
                />
              </View>
            </SectionCard>
          </View>
        ) : null}

        {/* TAB 2: RESTAURANT INFO */}
        {activeTab === "restaurant" ? (
          <View style={s.tabBody}>
            {/* General details */}
            <SectionCard>
              <CardTitle>General Details</CardTitle>

              <View>
                <FieldLabel>Restaurant Name</FieldLabel>
                <Field
                  value={formData.restaurantName}
                  onChangeText={(text) => handleInputChange("restaurantName", text.replace(/[/-]/g, ""))}
                  placeholder="Enter restaurant name"
                />
              </View>

              <View>
                <FieldLabel>Primary Contact Number</FieldLabel>
                <Field
                  type="tel"
                  value={formData.primaryContactNumber}
                  onChangeText={(text) => handleInputChange("primaryContactNumber", text)}
                  placeholder="Enter primary contact number"
                />
              </View>

              <View style={s.menuTypeBlock}>
                <FieldLabel style={{ marginBottom: sp(2) }}>Menu Type</FieldLabel>
                <Text style={s.hint}>This helps users filter restaurants by dietary preference.</Text>
                <View style={{ flexDirection: "row", gap: sp(3) }}>
                  <Pressable
                    onPress={() => handleInputChange("pureVegRestaurant", true)}
                    style={[
                      s.pill,
                      formData.pureVegRestaurant === true
                        ? { backgroundColor: colors.green[600], borderColor: colors.green[600], ...shadow.sm }
                        : { backgroundColor: colors.white, borderColor: colors.gray[200] },
                    ]}
                  >
                    <Text style={[s.pillText, { color: formData.pureVegRestaurant === true ? colors.white : colors.gray[700] }]}>
                      🥦 Yes, Pure Veg
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleInputChange("pureVegRestaurant", false)}
                    style={[
                      s.pill,
                      formData.pureVegRestaurant === false
                        ? { borderColor: "transparent", ...shadow.sm }
                        : { backgroundColor: colors.white, borderColor: colors.gray[200] },
                    ]}
                  >
                    {formData.pureVegRestaurant === false ? (
                      <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    ) : null}
                    <Text style={[s.pillText, { color: formData.pureVegRestaurant === false ? colors.white : colors.gray[700] }]}>
                      🍖 No, Mixed Menu
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View>
                <FieldLabel>Service Zone</FieldLabel>
                <Select value={formData.zoneId} onValueChange={(val) => handleInputChange("zoneId", val)}>
                  <SelectTrigger style={s.selectTrigger} textStyle={{ fontSize: 14 }}>
                    <SelectValue placeholder="Select service zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => (
                      <SelectItem key={z._id || z.id} value={z._id || z.id}>
                        {z.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </View>
            </SectionCard>

            {/* Address details */}
            <SectionCard>
              <View style={[s.cardTitleRow, s.cardTitleRowSplit]}>
                <Text style={s.cardTitle}>Address & Location</Text>
                <Pressable onPress={goToMapPicker} style={({ pressed }) => [s.mapLink, pressed && { backgroundColor: colors.red[50] }]}>
                  <MapPin size={14} color={restaurantTheme.brand} />
                  <Text style={s.mapLinkText}>Select from map</Text>
                </Pressable>
              </View>

              <LocationSearchInput
                label="Search your outlet location"
                placeholder="Search area, street, landmark..."
                biasLocation={biasLocation}
                onLocationSelect={handleLocationSearchSelect}
              />

              <View>
                <FieldLabel>Full Address (line 1)*</FieldLabel>
                <Field
                  value={formData.location?.addressLine1 || ""}
                  onChangeText={(text) => handleLocationChange("addressLine1", text)}
                  placeholder="Building / Shop / Street number"
                />
              </View>

              <View>
                <FieldLabel>Address Line 2 (optional)</FieldLabel>
                <Field
                  value={formData.location?.addressLine2 || ""}
                  onChangeText={(text) => handleLocationChange("addressLine2", text)}
                  placeholder="Floor, wing, suite info"
                />
              </View>

              <View>
                <FieldLabel>Area / Locality*</FieldLabel>
                <Field
                  value={formData.location?.area || ""}
                  onChangeText={(text) => handleLocationChange("area", text)}
                  placeholder="Area / Sector / Colony"
                />
              </View>

              <View>
                <FieldLabel>Landmark (optional)</FieldLabel>
                <Field
                  value={formData.location?.landmark || ""}
                  onChangeText={(text) => handleLocationChange("landmark", text)}
                  placeholder="Nearby landmark"
                />
              </View>

              <View style={s.twoCols}>
                <View style={s.col}>
                  <FieldLabel>City</FieldLabel>
                  <Field
                    value={formData.location?.city || "Indore"}
                    onChangeText={(text) => handleLocationChange("city", text)}
                    placeholder="City"
                  />
                </View>
                <View style={s.col}>
                  <FieldLabel>Pincode</FieldLabel>
                  <Field
                    value={formData.location?.pincode || ""}
                    onChangeText={(text) => handleLocationChange("pincode", text.replace(/\D/g, ""))}
                    placeholder="6-digit PIN"
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </SectionCard>

            {/* Operational details */}
            <SectionCard>
              <CardTitle>Operation & Timings</CardTitle>
              <View style={{ gap: sp(4) }}>
                <TimeBox
                  label="Opening Time"
                  value={formData.openingTime}
                  onTimeChange={(newValue) => {
                    if (!newValue) {
                      handleInputChange("openingTime", "")
                      return
                    }
                    const nextOpening = timeToString(newValue)
                    handleInputChange("openingTime", nextOpening)
                  }}
                />
                <TimeBox
                  label="Closing Time"
                  value={formData.closingTime}
                  onTimeChange={(newValue) => {
                    if (!newValue) {
                      handleInputChange("closingTime", "")
                      return
                    }
                    const nextClosing = timeToString(newValue)
                    handleInputChange("closingTime", nextClosing)
                  }}
                />
              </View>

              <View>
                <View style={s.daysLabelRow}>
                  <CalendarIcon size={14} color={restaurantTheme.brand} />
                  <Text style={[s.fieldLabel, { marginBottom: 0 }]}>Operational Days</Text>
                </View>
                <View style={s.daysRow}>
                  {daysOfWeek.map((day) => {
                    const isActive = formData.openDays.includes(day)
                    return (
                      <Pressable
                        key={day}
                        onPress={() => handleDayToggle(day)}
                        style={({ pressed }) => [
                          s.dayBtn,
                          isActive
                            ? { backgroundColor: restaurantTheme.brand, ...shadow.sm }
                            : { backgroundColor: pressed ? colors.gray[200] : colors.gray[100] },
                        ]}
                      >
                        <Text style={[s.dayText, { color: isActive ? colors.white : colors.gray[800] }]}>{day.slice(0, 1)}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              <View>
                <FieldLabel>Estimated Delivery Time</FieldLabel>
                <Field
                  value={formData.estimatedDeliveryTime}
                  onChangeText={(text) => handleInputChange("estimatedDeliveryTime", text)}
                  placeholder="e.g., 30-40 mins"
                />
              </View>
            </SectionCard>

            {/* Cuisines Grid */}
            <SectionCard>
              <View style={[s.cardTitleRow, s.cardTitleRowSplit]}>
                <Text style={s.cardTitle}>Cuisines Served</Text>
                <Text style={s.maxBadge}>MAX 8 SELECTED</Text>
              </View>
              <ScrollView style={s.cuisineScroll} nestedScrollEnabled contentContainerStyle={s.cuisineGrid}>
                {ALL_CUISINES.map((cuisine) => {
                  const isSelected = formData.cuisines.includes(cuisine)
                  return (
                    <Pressable
                      key={cuisine}
                      onPress={() => handleCuisineToggle(cuisine)}
                      style={({ pressed }) => [
                        s.cuisineBtn,
                        isSelected
                          ? { borderColor: restaurantTheme.brand, backgroundColor: alpha(colors.red[50], 0.5) }
                          : { borderColor: colors.gray[200], backgroundColor: pressed ? colors.gray[50] : "transparent" },
                      ]}
                    >
                      <Text style={[s.cuisineText, { color: isSelected ? restaurantTheme.brand : colors.gray[700] }]} numberOfLines={1}>
                        {cuisine}
                      </Text>
                      {isSelected ? <Check size={14} color={restaurantTheme.brand} /> : null}
                    </Pressable>
                  )
                })}
              </ScrollView>
            </SectionCard>
          </View>
        ) : null}

        {/* TAB 3: BANK & KYC */}
        {activeTab === "kyc" ? (
          <View style={s.tabBody}>
            {/* PAN details */}
            <SectionCard>
              <CardTitle>PAN Card Information</CardTitle>

              <View>
                <FieldLabel>PAN Card Number</FieldLabel>
                <Field
                  value={formData.panNumber}
                  onChangeText={(text) => handleInputChange("panNumber", text.toUpperCase())}
                  placeholder="Enter 10-digit PAN (e.g. ABCDE1234F)"
                  maxLength={10}
                  autoCapitalize="characters"
                />
              </View>

              <View>
                <FieldLabel>Name on PAN Card</FieldLabel>
                <Field
                  value={formData.nameOnPan}
                  onChangeText={(text) => handleInputChange("nameOnPan", text)}
                  placeholder="Enter exact name on PAN card"
                />
              </View>

              {/* PAN Image */}
              <DocUpload
                label="PAN Card Upload"
                value={formData.panImage}
                previewUrl={getPreviewUrl(formData.panImage)}
                alt="PAN Copy"
                onRemove={() => handleRemoveImage("panImage")}
                onUpload={() => handlePhotoClick("panImage")}
                buttonLabel="Upload PAN"
              />
            </SectionCard>

            {/* Bank Account */}
            <SectionCard>
              <CardTitle>Bank Account Info</CardTitle>

              <View>
                <FieldLabel>Account Holder Name</FieldLabel>
                <Field
                  value={formData.accountHolderName}
                  onChangeText={(text) => handleInputChange("accountHolderName", formatNameToCapital(text.replace(/[^A-Za-z ]/g, "")))}
                  placeholder="Name as in bank records"
                  autoCapitalize="words"
                />
              </View>

              <View>
                <FieldLabel>Bank Account Number</FieldLabel>
                <Field
                  type="password"
                  value={formData.accountNumber}
                  onChangeText={(text) => handleInputChange("accountNumber", text.replace(/\D/g, ""))}
                  placeholder="Enter account number"
                  keyboardType="number-pad"
                />
              </View>

              <View>
                <FieldLabel>Confirm Account Number</FieldLabel>
                <Field
                  value={formData.confirmAccountNumber}
                  onChangeText={(text) => handleInputChange("confirmAccountNumber", text.replace(/\D/g, ""))}
                  placeholder="Re-enter account number"
                  keyboardType="number-pad"
                />
              </View>

              <View style={s.twoCols}>
                <View style={s.col}>
                  <FieldLabel>IFSC Code</FieldLabel>
                  <Field
                    value={formData.ifscCode}
                    onChangeText={(text) => handleInputChange("ifscCode", text.toUpperCase())}
                    placeholder="11-digit IFSC"
                    maxLength={11}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={s.col}>
                  <FieldLabel>Account Type</FieldLabel>
                  <Select value={formData.accountType} onValueChange={(val) => handleInputChange("accountType", val)}>
                    <SelectTrigger style={s.selectTrigger} textStyle={{ fontSize: 14 }}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Saving">Saving</SelectItem>
                      <SelectItem value="Current">Current</SelectItem>
                    </SelectContent>
                  </Select>
                </View>
              </View>
            </SectionCard>

            {/* GST details */}
            <SectionCard>
              <View style={[s.cardTitleRow, s.cardTitleRowSplit]}>
                <Text style={s.cardTitle}>GST Registration</Text>
                <Pressable
                  onPress={() => handleInputChange("gstRegistered", !formData.gstRegistered)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: formData.gstRegistered }}
                  style={[s.gstSwitch, { backgroundColor: formData.gstRegistered ? restaurantTheme.brand : colors.gray[200] }]}
                >
                  <View style={[s.gstThumb, { transform: [{ translateX: formData.gstRegistered ? 20 : 0 }] }]} />
                </Pressable>
              </View>

              {formData.gstRegistered ? (
                <View style={{ gap: sp(4), paddingTop: sp(2) }}>
                  <View>
                    <FieldLabel>GSTIN (GST Number)</FieldLabel>
                    <Field
                      value={formData.gstNumber}
                      onChangeText={(text) => handleInputChange("gstNumber", text.toUpperCase())}
                      placeholder="e.g. 22AAAAA1111A1Z1"
                      maxLength={15}
                      autoCapitalize="characters"
                    />
                  </View>

                  <View>
                    <FieldLabel>GST Legal Business Name</FieldLabel>
                    <Field
                      value={formData.gstLegalName}
                      onChangeText={(text) => handleInputChange("gstLegalName", text)}
                      placeholder="Legal firm / business name"
                    />
                  </View>

                  <View>
                    <FieldLabel>GST Registered Address</FieldLabel>
                    <Field
                      value={formData.gstAddress}
                      onChangeText={(text) => handleInputChange("gstAddress", text)}
                      placeholder="Registered business address"
                    />
                  </View>

                  {/* GST Image */}
                  <DocUpload
                    label="GST Registration Copy"
                    value={formData.gstImage}
                    previewUrl={getPreviewUrl(formData.gstImage)}
                    alt="GST Copy"
                    onRemove={() => handleRemoveImage("gstImage")}
                    onUpload={() => handlePhotoClick("gstImage")}
                    buttonLabel="Upload GST Certificate"
                  />
                </View>
              ) : null}
            </SectionCard>
          </View>
        ) : null}

        {/* TAB 4: DOCUMENTS & FSSAI */}
        {activeTab === "docs" ? (
          <View style={s.tabBody}>
            {/* FSSAI license details */}
            <SectionCard>
              <CardTitle>FSSAI License details</CardTitle>

              <View>
                <FieldLabel>FSSAI License Number</FieldLabel>
                <Field
                  value={formData.fssaiNumber}
                  onChangeText={(text) => handleInputChange("fssaiNumber", text.replace(/\D/g, ""))}
                  placeholder="Enter 14-digit license number"
                  maxLength={14}
                  keyboardType="number-pad"
                />
              </View>

              <View>
                <FieldLabel>License Expiry Date</FieldLabel>
                <Pressable onPress={openFssaiDate} accessibilityRole="button" style={({ pressed }) => [s.dateField, pressed && { borderColor: colors.black }]}>
                  <Text style={[s.dateText, !formData.fssaiExpiry && { color: colors.gray[500] }]}>
                    {formData.fssaiExpiry ? formatDMY(formData.fssaiExpiry) : "dd/mm/yyyy"}
                  </Text>
                  <CalendarIcon size={16} color={colors.gray[900]} />
                </Pressable>
                {Platform.OS !== "android" ? (
                  <Sheet open={iosFssaiOpen} onClose={() => setIosFssaiOpen(false)} style={s.iosSheet}>
                    <DateTimePicker
                      value={parseYMD(formData.fssaiExpiry) || new Date()}
                      mode="date"
                      display="inline"
                      onValueChange={(_event, date) => {
                        if (date) {
                          handleInputChange("fssaiExpiry", toYMD(date))
                          setIosFssaiOpen(false)
                        }
                      }}
                      onDismiss={() => setIosFssaiOpen(false)}
                    />
                  </Sheet>
                ) : null}
              </View>

              {/* FSSAI Image */}
              <DocUpload
                label="FSSAI Copy Upload"
                value={formData.fssaiImage}
                previewUrl={getPreviewUrl(formData.fssaiImage)}
                alt="FSSAI Copy"
                onRemove={() => handleRemoveImage("fssaiImage")}
                onUpload={() => handlePhotoClick("fssaiImage")}
                buttonLabel="Upload FSSAI License"
              />
            </SectionCard>

            {/* Menu Images Grid */}
            <SectionCard>
              <View style={[s.cardTitleRow, s.cardTitleRowSplit]}>
                <Text style={s.cardTitle}>Menu & Photos</Text>
                <Text style={[s.maxBadge, { backgroundColor: colors.blue[50] }]}>{formData.menuImages.length} / 10 PHOTOS</Text>
              </View>

              <View style={s.menuGrid}>
                {formData.menuImages.map((img, idx) => (
                  <View key={idx} style={s.menuCell}>
                    <View style={s.menuPhoto}>
                      <OptimizedImage src={getPreviewUrl(img)} alt={`Menu photo ${idx + 1}`} style={StyleSheet.absoluteFill} />
                      <RemoveBadge
                        onPress={() => handleRemoveImage("menuImages", idx)}
                        bg={alpha(colors.black, 0.6)}
                        size={12}
                        style={{ top: 6, right: 6 }}
                      />
                    </View>
                  </View>
                ))}

                {formData.menuImages.length < 10 ? (
                  <View style={s.menuCell}>
                    <Pressable
                      onPress={() => handlePhotoClick("menuImages")}
                      style={({ pressed }) => [s.addPhoto, pressed && { borderColor: restaurantTheme.brand }]}
                    >
                      <View style={s.addPhotoIcon}>
                        <ImageIcon size={18} color={colors.gray[600]} />
                      </View>
                      <Text style={s.addPhotoText}>Add Menu Photo</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </SectionCard>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {/* Save/Update Button fixed bottom */}
      <View
        style={[s.saveBar, { bottom: keyboardInset, paddingBottom: sp(4) + (keyboardInset ? 0 : insets.bottom) }]}
        onLayout={(e) => setBarHeight(Math.round(e.nativeEvent.layout.height - (keyboardInset ? 0 : insets.bottom)))}
      >
        <Pressable
          onPress={handleSave}
          disabled={saveDisabled}
          style={({ pressed }) => [
            s.saveBtn,
            saveDisabled ? { opacity: 0.5 } : s.saveBtnShadow,
            pressed && !saveDisabled && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Text style={s.saveText}>{saving ? "Uploading & Saving details..." : "Save Profile Details"}</Text>
        </Pressable>
      </View>

      <ImageSourcePicker
        isOpen={isPhotoPickerOpen}
        onClose={() => setIsPhotoPickerOpen(false)}
        onFileSelect={handlePhotoSelect}
        title={`Upload ${
          activeImageField === "profileImage"
            ? "Owner photo"
            : activeImageField === "panImage"
              ? "PAN copy"
              : activeImageField === "gstImage"
                ? "GST copy"
                : activeImageField === "fssaiImage"
                  ? "FSSAI copy"
                  : "Menu photo"
        }`}
        description="Choose file from gallery or snap with camera"
        fileNamePrefix={`${activeImageField || "photo"}`}
      />
    </Screen>
  )
}

const s = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 4, borderColor: colors.gray[200], borderTopColor: restaurantTheme.brand },
  loadingText: { ...fontSize.sm, fontWeight: "500", color: colors.gray[500] },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  headerRow: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3.5) },
  backBtn: { padding: sp(1.5), borderRadius: radius.lg },
  headerTitle: { ...fontSize.base, fontWeight: "700", color: colors.gray[900] },
  headerSub: { fontSize: 10, lineHeight: 14, fontWeight: "600", color: colors.gray[500], textTransform: "uppercase", letterSpacing: 0.5 },
  tabBar: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  tabRow: { paddingHorizontal: sp(4), gap: sp(5) },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2),
    paddingVertical: sp(3),
    paddingHorizontal: sp(1),
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: restaurantTheme.brand },
  tabText: { ...fontSize.xs, fontWeight: "600" },
  content: { paddingHorizontal: sp(4), paddingTop: sp(6) },
  tabBody: { gap: sp(6) },
  card: {
    backgroundColor: colors.white,
    padding: sp(5),
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderColor: colors.gray[100],
    gap: sp(4),
    ...shadow.sm,
  },
  cardTitleRow: { borderBottomWidth: 1, borderBottomColor: colors.gray[200], paddingBottom: sp(2) },
  cardTitleRowSplit: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { ...fontSize.sm, fontWeight: "700", color: colors.gray[900] },
  fieldLabel: {
    ...fontSize.xs,
    fontWeight: "700",
    color: colors.gray[700],
    marginBottom: sp(1.5),
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  input: { height: 44, fontSize: 14 },
  photoLabel: { alignSelf: "flex-start", fontSize: 12, lineHeight: 12, fontWeight: "700", color: colors.gray[800], textTransform: "uppercase", letterSpacing: 0.3 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  removeBadge: { position: "absolute", borderRadius: 9999, padding: sp(1), overflow: "hidden", ...shadow.md },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 32,
    paddingHorizontal: sp(3),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    ...shadow.xs,
  },
  outlineBtnText: { ...fontSize.xs, fontWeight: "600" },
  menuTypeBlock: { paddingTop: sp(2), borderTopWidth: 1, borderTopColor: colors.gray[100] },
  hint: { fontSize: 11, lineHeight: 16, color: colors.gray[500], marginBottom: sp(3) },
  pill: { flex: 1, paddingHorizontal: sp(3), paddingVertical: sp(2.5), borderRadius: 9999, borderWidth: 1, alignItems: "center", overflow: "hidden" },
  pillText: { ...fontSize.xs, fontWeight: "600" },
  selectTrigger: { width: "100%", height: 44, alignSelf: "stretch", backgroundColor: colors.white },
  mapLink: { flexDirection: "row", alignItems: "center", gap: sp(1), paddingHorizontal: sp(2), paddingVertical: sp(1), borderRadius: radius.md },
  mapLinkText: { fontSize: 10, lineHeight: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: restaurantTheme.brand },
  twoCols: { flexDirection: "row", gap: sp(4) },
  col: { flex: 1, minWidth: 0 },
  timeBox: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.md,
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    backgroundColor: alpha(colors.gray[50], 0.6),
  },
  timeHead: { flexDirection: "row", alignItems: "center", gap: sp(2), marginBottom: sp(2) },
  timeLabel: { ...fontSize.xs, fontWeight: "500", color: colors.gray[900] },
  timeField: {
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  timeFieldText: { fontSize: 12, color: colors.gray[900] },
  iosSheet: { backgroundColor: colors.white, paddingBottom: sp(4) },
  iosDone: { alignSelf: "flex-end", paddingHorizontal: sp(5), paddingVertical: sp(3) },
  iosDoneText: { ...fontSize.base, fontWeight: "600", color: restaurantTheme.brand },
  daysLabelRow: { flexDirection: "row", alignItems: "center", gap: sp(1), marginBottom: sp(2) },
  daysRow: { flexDirection: "row", gap: sp(1.5) },
  dayBtn: { flex: 1, height: 36, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  dayText: { ...fontSize.xs, fontWeight: "600" },
  maxBadge: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    color: restaurantTheme.brand,
    backgroundColor: alpha(restaurantTheme.brand, 0.1),
    paddingHorizontal: sp(2),
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  cuisineScroll: { maxHeight: 256 },
  cuisineGrid: { flexDirection: "row", flexWrap: "wrap", gap: sp(2), paddingRight: sp(1) },
  cuisineBtn: {
    width: "48%",
    flexGrow: 1,
    paddingVertical: sp(2),
    paddingHorizontal: sp(3),
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cuisineText: { flexShrink: 1, ...fontSize.xs, fontWeight: "600" },
  docBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.gray[200],
    borderRadius: radius.xl,
    padding: sp(4),
    backgroundColor: alpha(colors.gray[50], 0.5),
    alignItems: "center",
    gap: sp(3),
  },
  docLabel: { alignSelf: "flex-start", fontSize: 12, lineHeight: 12, fontWeight: "600", color: colors.gray[600] },
  docPreview: {
    width: "100%",
    maxWidth: 200,
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  docEmpty: { alignItems: "center", paddingVertical: sp(4) },
  docEmptyText: { fontSize: 11, lineHeight: 16, color: colors.gray[500] },
  gstSwitch: { width: 44, height: 24, borderRadius: 9999, borderWidth: 2, borderColor: "transparent", justifyContent: "center" },
  gstThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, ...shadow.DEFAULT },
  dateField: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.lg,
    paddingHorizontal: sp(3),
  },
  dateText: { ...fontSize.sm, color: colors.gray[900] },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -sp(1.5), rowGap: sp(3) },
  menuCell: { width: "50%", paddingHorizontal: sp(1.5) },
  menuPhoto: { aspectRatio: 4 / 3, borderRadius: radius.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.gray[200], ...shadow.sm },
  addPhoto: {
    aspectRatio: 4 / 3,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.gray[300],
    backgroundColor: alpha(colors.gray[50], 0.7),
    alignItems: "center",
    justifyContent: "center",
    gap: sp(1.5),
  },
  addPhotoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  addPhotoText: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: colors.gray[600], textTransform: "uppercase", letterSpacing: 0.3 },
  saveBar: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingHorizontal: sp(4),
    paddingTop: sp(4),
  },
  saveBtn: { width: "100%", height: 48, borderRadius: radius.xl, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  saveBtnShadow: { elevation: 8, shadowColor: "#B80B3D", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  saveText: { ...fontSize.sm, fontWeight: "700", letterSpacing: 0.35, color: colors.white },
})
