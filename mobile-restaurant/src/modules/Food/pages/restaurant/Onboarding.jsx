// Web: modules/Food/pages/restaurant/Onboarding.jsx — 3-step restaurant / My Store registration (1: restaurant, owner,
// contact + location; 2: menu & profile photos, cuisines, timings, open days, takeaway; 3: PAN, GST, FSSAI, bank).
// Native changes (platform only, same texts / states / API calls):
// - photos: ImageSourcePicker (camera / gallery) -> { uri, name, type } files; FormData.append(field, file) uploads them
//   like the web's File objects (restaurantAPI.register / uploadAPI.uploadMedia);
// - the web kept picked files in IndexedDB across reloads; the app keeps their descriptors in sessionStorage (memory for
//   the app session, see FILE STORE below) — a screen reload does not exist in the app;
// - Google Places Autocomplete widget -> @/lib/google autocomplete + placeDetails, drawn as the same styled dropdown
//   (pac-container look) under the search box; the Nominatim fallback list stays (shown when Google has no result);
// - MUI MobileTimePicker / Calendar popover -> @react-native-community/datetimepicker (time / date);
// - the form sits in a KeyboardAwareScrollView (focused field above the keyboard); the footer hides while the keyboard is
//   open, like the web's keyboardInset rule.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, View } from "react-native"
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker"
import Svg, { Circle as SvgCircle, Path as SvgPath } from "react-native-svg"
import { LinearGradient } from "expo-linear-gradient"
import { Image as ImageIcon, Upload, Clock, Calendar as CalendarIcon, Sparkles, X, LogOut, ShoppingBag, ArrowLeft } from "lucide-react-native"
import { useNavigate, useSearchParams } from "@/lib/router"
import { toast } from "@/lib/toast"
import { autocomplete as placesAutocomplete, newSessionToken, placeDetails } from "@/lib/google"
import { AppImage, KeyboardAwareScrollView, Screen, Sheet, StatusBarSpacer, Text } from "@/native/ui"
import { alpha, colors, restaurantTheme, shadow } from "@/theme"
import useKeyboardOffset from "@/modules/Taxi/shared/hooks/useKeyboardOffset"
import { pw } from "@food/utils/adminPartnerLabels"
import { Input } from "@food/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@food/components/ui/select"
import { restaurantAPI, zoneAPI, uploadAPI } from "@food/api"
import { getZonesArea, rankLocationResults } from "@food/utils/zoneGeometry"
import { RESTAURANT_CUISINES, MAX_RESTAURANT_CUISINES } from "@food/constants/dining"
import { clearOnboardingFromLocalStorage, clearAllFilesFromDB, hasRestaurantStep1Progress } from "@food/utils/onboardingUtils"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { clearModuleAuth, clearAuthData, getModuleToken, setPendingPartnerType } from "@food/utils/auth"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { prepareUploadFile, prepareUploadFiles } from "@/shared/utils/imageCompressor"
import { EMAIL_REGEX } from "@/shared/utils/emailValidation"
import { OnboardingSkeleton } from "@food/components/ui/loading-skeletons"
import OnboardingExitModal from "@/shared/components/OnboardingExitModal"
import useOnboardingExitGuard from "@/shared/hooks/useOnboardingExitGuard"
import { collectFcmTokenForSignup, persistModuleFcmToken, syncPendingPartnerFcmQuick, clearOnboardingFcmLocal, prefetchModuleFcmToken } from "@food/utils/firebaseMessaging"
import { getAppRouteSearch } from "@/shared/utils/nativeShell"

const debugError = () => {}

const RED = restaurantTheme.brand
const RED_DARK = restaurantTheme.brandDark
const PRIMARY = restaurantTheme.primary // #DC2626

const normalizePhoneDigits = (value) => {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.slice(-10)
}

async function finalizeRestaurantPendingSubmission(navigate, phone, fcmOptions = {}) {
  const { fcmToken, platform, partnerType } = fcmOptions
  setPendingPartnerType(partnerType === "store" ? "store" : "restaurant")
  const normalizedPhone = normalizePhoneDigits(phone || "")

  try {
    const userStr = localStorage.getItem("restaurant_user")
    if (userStr) {
      const user = JSON.parse(userStr)
      user.status = "pending"
      localStorage.setItem("restaurant_user", JSON.stringify(user))
    }
  } catch {
    // ignore
  }

  if (normalizedPhone) {
    localStorage.setItem("restaurant_pendingPhone", normalizedPhone)
  }
  localStorage.setItem("restaurant_pendingStatus", "pending")
  localStorage.removeItem("restaurant_pendingMessage")

  try {
    syncPendingPartnerFcmQuick("restaurant", normalizedPhone, { fcmToken, platform, partnerType })
  } catch {
    // ignore
  }

  if (localStorage.getItem("restaurant_accessToken")) {
    try {
      persistModuleFcmToken("restaurant", { fcmToken, platform }).catch(() => {})
    } catch {
      // ignore
    }
  }

  navigate("/food/restaurant/pending-verification", {
    replace: true,
    state: { phone: normalizedPhone },
  })
}

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data"
const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const GST_NUMBER_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const FSSAI_NUMBER_REGEX = /^\d{14}$/
const BANK_ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/
const IFSC_CODE_REGEX = /^[A-Z0-9]{11}$/
const OWNER_NAME_REGEX = /^[A-Za-z ]+$/
const ACCOUNT_HOLDER_NAME_REGEX = /^[A-Za-z ]+$/
const GST_LEGAL_NAME_REGEX = /^[A-Za-z ]+$/
const CITY_OPTIONS = ["Indore", "Bhopal", "Gwalior", "Jabalpur", "Mumbai", "Pune", "Delhi", "Bangalore", "Ahmedabad", "Hyderabad", "Chennai", "Kolkata"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

let onboardingFileCache = {
  step2: {
    menuImages: [],
    profileImage: null,
  },
  step3: {
    panImage: null,
    gstImage: null,
    fssaiImage: null,
  },
}

/** A picked photo in the app: { uri, name, type } from the native picker (local file:// / content:// address). */
const isUploadableFile = (value) => {
  if (!value || typeof value !== "object") return false
  return typeof value.uri === "string" && value.uri.length > 0 && !/^https?:\/\//i.test(value.uri)
}

// ---- FILE STORE (web: IndexedDB "RestaurantOnboardingFiles") -------------------------------------------------------
// The picked files' descriptors are kept in sessionStorage (app-session memory). onboardingUtils.clearAllFilesFromDB
// only knows the web's IndexedDB, so clearOnboardingFileStore() is called next to it in this screen.
const FILE_STORE_PREFIX = "RestaurantOnboardingFiles:"

const toStoredFile = (file) => ({
  uri: file.uri,
  name: file.name,
  type: file.type,
  size: file.size,
  width: file.width,
  height: file.height,
})

const saveFileToDB = async (key, file) => {
  if (!file || !isUploadableFile(file)) return
  try {
    sessionStorage.setItem(`${FILE_STORE_PREFIX}${key}`, JSON.stringify(toStoredFile(file)))
  } catch (err) {
    debugError("File store save failed:", err)
  }
}

const getFileFromDB = async (key) => {
  try {
    const raw = sessionStorage.getItem(`${FILE_STORE_PREFIX}${key}`)
    if (!raw) return null
    const file = JSON.parse(raw)
    return isUploadableFile(file) ? file : null
  } catch (err) {
    debugError("File store load failed:", err)
    return null
  }
}

const deleteFileFromDB = async (key) => {
  try {
    sessionStorage.removeItem(`${FILE_STORE_PREFIX}${key}`)
  } catch (err) {
    debugError("File store delete failed:", err)
  }
}

const clearOnboardingFileStore = () => {
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(FILE_STORE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    // ignore
  }
}

const clearAllOnboardingFiles = async () => {
  clearOnboardingFileStore()
  await clearAllFilesFromDB()
}

// Ray-casting point-in-polygon on a zone's {latitude, longitude} boundary.
const isPointInZone = (lat, lng, zone) => {
  const points = (Array.isArray(zone?.coordinates) ? zone.coordinates : [])
    .map((c) => [Number(c?.latitude ?? c?.lat), Number(c?.longitude ?? c?.lng)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  if (points.length < 3) return false
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [yi, xi] = points[i]
    const [yj, xj] = points[j]
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

const findZoneForPoint = (lat, lng, zones = []) => {
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) return null
  return (Array.isArray(zones) ? zones : []).find((z) => z?.isActive !== false && isPointInZone(la, lo, z)) || null
}

const getZoneLabel = (zone) => zone?.name || zone?.zoneName || zone?.serviceLocation || ""

const getUploadableMenuFiles = (menuImages = []) =>
  (Array.isArray(menuImages) ? menuImages : [])
    .filter((img) => isUploadableFile(img))
    .slice(0, 10)

const persistMenuImagesToDB = async (menuImages = []) => {
  const uploadableMenuFiles = getUploadableMenuFiles(menuImages)
  for (let i = 0; i < 10; i++) {
    const file = uploadableMenuFiles[i]
    if (file) {
      await saveFileToDB(`menuImage_${i}`, file)
    } else {
      await deleteFileFromDB(`menuImage_${i}`)
    }
  }
}

const normalizePincode = (value) => String(value || "").replace(/\D/g, "").slice(0, 6)

const getVerifiedPhoneFromStoredRestaurant = () => {
  try {
    const pending = localStorage.getItem("restaurant_pendingPhone")
    if (pending && pending.trim()) {
      return pending.trim()
    }

    const storedUser = localStorage.getItem("restaurant_user")
    if (!storedUser) return ""
    const user = JSON.parse(storedUser)
    const candidates = [
      user?.ownerPhone,
      user?.primaryContactNumber,
      user?.phone,
      user?.phoneNumber,
      user?.mobile,
      user?.contactNumber,
      user?.contact?.phone,
      user?.owner?.phone,
      user?.restaurant?.phone,
    ]
    const phone = candidates.find((value) => typeof value === "string" && value.trim())
    return phone ? phone.trim() : ""
  } catch {
    return ""
  }
}

const normalizeEmail = (val) => {
  let email = String(val || "").toLowerCase().trim()
  // Auto-correct common Gmail typos
  email = email.replace(/@(gnail|gamil|gimail|gnil)\.com$/i, "@gmail.com")
  return email
}

const normalizeAccountTypeValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "saving" || normalized === "savings") return "Saving"
  if (normalized === "current") return "Current"
  return ""
}

const formatNameToCapital = (str) => {
  if (!str) return ""
  return str.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ")
}

const normalizeIFSC = (val) => String(val || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)
const normalizePAN = (val) => String(val || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
const normalizeGST = (val) => String(val || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15)
const normalizeBankAcc = (val) => String(val || "").replace(/\D/g, "").slice(0, 18)

// Helper function to convert Date object to "HH:mm" string
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

  // Already in HH:mm format
  if (/^\d{2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":").map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return ""
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }

  // Handle H:mm by zero-padding hour
  if (/^\d{1}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":")
    return to24Hour(h, m, "")
  }

  // Handle 12-hour format (e.g. "10:00 AM", "9:30pm")
  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/)
  if (ampm) {
    return to24Hour(ampm[1], ampm[2], ampm[3])
  }

  // Fallback for ISO / Date-like strings
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return timeToString(parsed)
  }

  return ""
}

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  const normalized = normalizeTimeValue(timeString)
  if (!normalized || !normalized.includes(":")) {
    return null
  }
  const [hours, minutes] = normalized.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 0, minutes || 0)
}

/** MobileTimePicker format="hh:mm a" */
const formatPickerTime = (date) => {
  if (!date) return ""
  const h = date.getHours()
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${String(hour).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} ${period}`
}

const formatDateToLocalYMD = (date) => {
  if (!date || Number.isNaN(date.getTime?.())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getTodayLocalYMD = () => formatDateToLocalYMD(new Date())

const parseLocalYMDDate = (value) => {
  if (!value || typeof value !== "string") return undefined
  const parts = value.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

/** toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) -> "Oct 26, 2026" */
const formatExpiryLabel = (date) => (date ? `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}` : "")

// Helper functions for localStorage
const saveOnboardingToLocalStorage = (step1, step2, step3, currentStep) => {
  try {
    // Persist only stable URL-based values. Picked files are kept in the file store.
    const serializableStep2 = {
      ...step2,
      menuImages: (step2.menuImages || []).filter(
        (img) => !isUploadableFile(img) && (img?.url || (typeof img === "string" && img.trim())),
      ),
      profileImage:
        !isUploadableFile(step2.profileImage) &&
        (step2.profileImage?.url || (typeof step2.profileImage === "string" && step2.profileImage.trim()))
          ? step2.profileImage
          : null,
    }

    const serializableStep3 = {
      ...step3,
      panImage:
        !isUploadableFile(step3.panImage) &&
        (step3.panImage?.url || (typeof step3.panImage === "string" && step3.panImage.trim()))
          ? step3.panImage
          : null,
      gstImage:
        !isUploadableFile(step3.gstImage) &&
        (step3.gstImage?.url || (typeof step3.gstImage === "string" && step3.gstImage.trim()))
          ? step3.gstImage
          : null,
      fssaiImage:
        !isUploadableFile(step3.fssaiImage) &&
        (step3.fssaiImage?.url || (typeof step3.fssaiImage === "string" && step3.fssaiImage.trim()))
          ? step3.fssaiImage
          : null,
    }

    const dataToSave = {
      step1,
      step2: serializableStep2,
      step3: serializableStep3,
      currentStep,
      timestamp: Date.now(),
    }

    const userStr = localStorage.getItem("restaurant_user")
    let key = ONBOARDING_STORAGE_KEY
    if (userStr) {
      const user = JSON.parse(userStr)
      const userId = user._id || user.id
      if (userId) key = `restaurant_onboarding_data_${userId}`
    }
    localStorage.setItem(key, JSON.stringify(dataToSave))
  } catch (error) {
    debugError("Failed to save onboarding data to localStorage:", error)
  }
}

const loadOnboardingFromLocalStorage = () => {
  try {
    const userStr = localStorage.getItem("restaurant_user")
    let key = ONBOARDING_STORAGE_KEY
    if (userStr) {
      const user = JSON.parse(userStr)
      const userId = user._id || user.id
      if (userId) key = `restaurant_onboarding_data_${userId}`
    }
    const stored = localStorage.getItem(key)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    debugError("Failed to load onboarding data from localStorage:", error)
  }
  return null
}

const syncOnboardingFileCache = (step2, step3) => {
  onboardingFileCache = {
    step2: {
      menuImages: (step2?.menuImages || []).filter((img) => isUploadableFile(img)),
      profileImage: isUploadableFile(step2?.profileImage) ? step2.profileImage : null,
    },
    step3: {
      panImage: isUploadableFile(step3?.panImage) ? step3.panImage : null,
      gstImage: isUploadableFile(step3?.gstImage) ? step3.gstImage : null,
      fssaiImage: isUploadableFile(step3?.fssaiImage) ? step3.fssaiImage : null,
    },
  }
  return onboardingFileCache
}

const clearOnboardingFileCache = () => {
  onboardingFileCache = {
    step2: {
      menuImages: [],
      profileImage: null,
    },
    step3: {
      panImage: null,
      gstImage: null,
      fssaiImage: null,
    },
  }
}

// ---- small UI pieces (the web's shadcn Label / Input / Button + Tailwind) -----------------------------------------

/** Label className="text-xs text-gray-700" */
function FieldLabel({ children, style }) {
  return <Text style={[styles.label, style]}>{children}</Text>
}

/** shadcn Input + "bg-white text-sm"; focused border = restaurant focus colour */
const OInput = React.forwardRef(function OInput({ style, onFocus, onBlur, disabled, ...props }, ref) {
  const [focused, setFocused] = useState(false)
  return (
    <Input
      ref={ref}
      {...props}
      disabled={disabled}
      onFocus={(e) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        onBlur?.(e)
      }}
      placeholderTextColor={colors.gray[400]}
      style={[styles.input, focused && styles.inputFocused, style]}
    />
  )
})

/** Button variant="outline" className="w-full text-xs" with the Upload icon */
function UploadButton({ onPress, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.uploadBtn, pressed && { backgroundColor: colors.gray[50] }, style]}
    >
      <Upload size={16} color={colors.gray[900]} />
      <Text style={styles.uploadBtnText}>Upload</Text>
    </Pressable>
  )
}

/** bg-gradient-to-br from-[#B80B3D] to-[#66001D] text-white rounded-full p-1 (remove image) */
function RemoveImageButton({ onPress, style }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.removeBtn, style, pressed && { opacity: 0.85 }]}>
      <LinearGradient colors={[RED, RED_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.removeBtnInner}>
        <X size={12} color={colors.white} />
      </LinearGradient>
    </Pressable>
  )
}

/** Toggle pill: active = brand gradient (or a solid colour), inactive = the given plain style */
function Pill({ active, onPress, label, activeColor, inactiveStyle, inactiveTextColor = colors.gray[800], activeBorder, disabled, style }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.pillShell, style, disabled && { opacity: 0.7 }, pressed && { opacity: 0.85 }]}
    >
      {active && !activeColor ? (
        <LinearGradient
          colors={[RED, RED_DARK]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.pill, activeBorder ? { borderWidth: 1, borderColor: activeBorder } : null]}
        >
          <Text style={[styles.pillText, { color: colors.white }]}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.pill, active ? { backgroundColor: activeColor, borderWidth: 1, borderColor: activeBorder || activeColor } : inactiveStyle]}>
          <Text style={[styles.pillText, { color: active ? colors.white : inactiveTextColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

/** h-11 brand gradient footer button */
function FooterButton({ onPress, disabled, label, style, dim }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.footerBtnShell, style, (disabled || dim) && { opacity: 0.5 }, pressed && !disabled && { transform: [{ scale: 0.98 }] }]}
    >
      <LinearGradient colors={[RED, RED_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.footerBtn}>
        <Text style={styles.footerBtnText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  )
}

function SmallSpinner({ color = PRIMARY }) {
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [spin])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
  return <Animated.View style={[styles.spinner, { borderColor: color, borderTopColor: "transparent", transform: [{ rotate }] }]} />
}

/** the red map pin of the suggestion rows */
function PinIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <SvgPath d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <SvgCircle cx="12" cy="10" r="3" />
    </Svg>
  )
}

/** Image preview box (aspect 4/3 or 4/5) — "Preview unavailable" when the image cannot be shown */
function PreviewImage({ uri, style, children, small, label }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [uri])
  return (
    <View style={[styles.previewBox, style]}>
      {uri && !failed ? (
        <AppImage src={uri} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} onError={() => setFailed(true)} />
      ) : (
        <View style={styles.previewEmpty}>
          <Text style={[styles.previewEmptyText, small && { fontSize: 11 }]}>Preview unavailable</Text>
        </View>
      )}
      {children}
    </View>
  )
}

/** Web TimeSelector (MUI MobileTimePicker, ampm, format "hh:mm a") -> the system time picker */
function TimeSelector({ label, value, onValueChange: onChange }) {
  const timeValue = stringToTime(value)
  const [iosOpen, setIosOpen] = useState(false)

  const handleTimeChange = (newValue) => {
    if (!newValue) {
      onChange("")
      return
    }
    const timeString = timeToString(newValue)
    onChange(timeString)
  }

  const open = () => {
    Keyboard.dismiss()
    const current = timeValue || new Date()
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "time",
        is24Hour: false,
        onValueChange: (_event, date) => {
          if (date) handleTimeChange(date)
        },
      })
      return
    }
    setIosOpen(true)
  }

  return (
    <View style={styles.timeBox}>
      <View style={styles.timeHead}>
        <Clock size={16} color={colors.gray[800]} />
        <Text style={styles.timeLabel}>{label}</Text>
      </View>
      <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.timeField, pressed && { borderColor: colors.gray[300] }]}>
        <Text style={[styles.timeFieldText, !timeValue && { color: colors.gray[400] }]}>
          {timeValue ? formatPickerTime(timeValue) : "Select time"}
        </Text>
      </Pressable>
      {Platform.OS !== "android" ? (
        <Sheet open={iosOpen} onClose={() => setIosOpen(false)} style={styles.iosSheet}>
          <DateTimePicker
            value={timeValue || new Date()}
            mode="time"
            display="spinner"
            onValueChange={(_event, date) => {
              if (date) handleTimeChange(date)
            }}
          />
          <Pressable onPress={() => setIosOpen(false)} style={styles.iosDone}>
            <Text style={styles.iosDoneText}>Done</Text>
          </Pressable>
        </Sheet>
      ) : null}
    </View>
  )
}

export default function RestaurantOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const scrollRef = useRef(null)
  // web: the footer is hidden while the soft keyboard is open (keyboardInset)
  const keyboardInset = useKeyboardOffset()

  useEffect(() => {
    prefetchModuleFcmToken("restaurant")
  }, [])

  // Close the keyboard when the screen goes away
  useEffect(() => () => Keyboard.dismiss(), [])

  const scrollToTop = () => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false })
  }

  const handleExitAnyway = useCallback(() => {
    Keyboard.dismiss()
    navigate("/food/restaurant/login", { replace: true })

    void (async () => {
      try {
        clearOnboardingFcmLocal("restaurant")
        clearOnboardingFromLocalStorage()
        clearOnboardingFileCache()
        await clearAllOnboardingFiles()

        const hasSession = Boolean(localStorage.getItem("restaurant_refreshToken"))
        if (hasSession) {
          await restaurantAPI.logout().catch(() => {})
        }
        clearModuleAuth("restaurant")
        clearAuthData()
        window.dispatchEvent(new Event("restaurantAuthChanged"))
      } catch (e) {
        debugError("Error clearing onboarding data on exit:", e)
      }
    })()
  }, [navigate])

  const goToPreviousOnboardingStep = useCallback(() => {
    setStep((currentStep) => Math.max(1, currentStep - 1))
    scrollRef.current?.scrollTo?.({ y: 0, animated: false })
  }, [])

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    Keyboard.dismiss()
    try {
      await restaurantAPI.logout()
      clearModuleAuth("restaurant")
      clearAuthData()
      // Clear onboarding data and files
      clearOnboardingFromLocalStorage()
      await clearAllOnboardingFiles()

      window.dispatchEvent(new Event("restaurantAuthChanged"))
      navigate("/food/restaurant/login", { replace: true })
    } catch (err) {
      debugError("Logout failed:", err)
      clearModuleAuth("restaurant")
      navigate("/food/restaurant/login", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const [verifiedPhoneNumber] = useState(() => getVerifiedPhoneFromStoredRestaurant())
  const [isEditing, setIsEditing] = useState(true)
  const [hasExistingRestaurantProfile, setHasExistingRestaurantProfile] = useState(false)
  // "My Store" partner: same onboarding, but no takeaway option and "store" wording.
  // Comes from ?type=store (set after the My Store OTP login) or the saved profile.
  const [isStore, setIsStore] = useState(() => searchParams.get("type") === "store")
  const w = (t) => pw(t, isStore ? "store" : "restaurant")
  const [iosFssaiOpen, setIosFssaiOpen] = useState(false)
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [isOnboardingHydrated, setIsOnboardingHydrated] = useState(false)
  const isHydratingRef = useRef(false)

  const [step1, setStep1] = useState({
    restaurantName: "",
    pureVegRestaurant: null,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    zoneId: "",
    location: {
      formattedAddress: "",
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      state: "",
      pincode: "",
      landmark: "",
      latitude: "",
      longitude: "",
    },
  })

  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    estimatedDeliveryTime: "",
    openingTime: "",
    closingTime: "",
    openDays: [],
    isTakeawayEnabled: false,
    isTakeawayCodEnabled: false,
  })

  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  const hasStep1UnsavedProgress = useCallback(
    () => hasRestaurantStep1Progress(step1),
    [step1],
  )

  const {
    showExitModal,
    handleBack,
    handleStay,
    handleExit,
    requestExit,
  } = useOnboardingExitGuard({
    isFirstStep: step === 1,
    onPreviousStep: goToPreviousOnboardingStep,
    onExit: handleExitAnyway,
    hasUnsavedProgress: hasStep1UnsavedProgress,
  })

  // Zone follows the picked location (no manual pick) — outside every zone is an error.
  const hasLocationPoint =
    Number.isFinite(Number(step1.location?.latitude)) &&
    Number.isFinite(Number(step1.location?.longitude)) &&
    String(step1.location?.latitude ?? "") !== "" &&
    String(step1.location?.longitude ?? "") !== ""
  const detectedZone = useMemo(
    () => (hasLocationPoint ? findZoneForPoint(step1.location.latitude, step1.location.longitude, zones) : null),
    [hasLocationPoint, step1.location?.latitude, step1.location?.longitude, zones],
  )
  const isLocationOutsideZones = hasLocationPoint && zones.length > 0 && !detectedZone
  useEffect(() => {
    if (!hasLocationPoint || zones.length === 0) return
    const nextZoneId = detectedZone ? String(detectedZone._id || detectedZone.id || "") : ""
    setStep1((prev) => (String(prev.zoneId || "") === nextZoneId ? prev : { ...prev, zoneId: nextZoneId }))
  }, [detectedZone, hasLocationPoint, zones.length])

  // Text of the suggestion just picked: typing into the box re-runs the search,
  // and setting the box to the picked address re-opened the dropdown, so the
  // same place had to be picked again and again.
  const pickedLocationTextRef = useRef("")
  const locationSearchInputRef = useRef(null)
  const placesSessionRef = useRef(newSessionToken())
  const [sourcePicker, setSourcePicker] = useState({
    isOpen: false,
    title: "",
    onSelectFile: null,
    fileNamePrefix: "camera-image",
    fallbackInputRef: null,
  })

  // Search states: Google predictions (web: the Places Autocomplete dropdown) + the Nominatim fallback list
  const [locationSearchValue, setLocationSearchValue] = useState("")
  const [placePredictions, setPlacePredictions] = useState([])
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [isSearchingLocation, setIsSearchingLocation] = useState(false)
  const [isLocationSearchFocused, setIsLocationSearchFocused] = useState(false)

  const getPreviewImageUrl = (value) => {
    if (!value) return null
    if (typeof value === "string") return value
    if (value?.url && typeof value.url === "string") return value.url
    if (isUploadableFile(value)) return value.uri
    return null
  }

  const openImageSourcePicker = ({ title, onSelectFile, fileNamePrefix, fallbackInputRef, multiple = false }) => {
    Keyboard.dismiss()
    setSourcePicker({
      isOpen: true,
      title: title || "Select image source",
      onSelectFile,
      fileNamePrefix: fileNamePrefix || "camera-image",
      fallbackInputRef: fallbackInputRef || null,
      multiple,
    })
  }

  const closeImageSourcePicker = () => {
    setSourcePicker((prev) => ({ ...prev, isOpen: false }))
  }

  // Functional update: a multi-pick calls this once per image in a row, and a
  // closure copy of step2 would keep only the last one.
  const handleMenuImagesSelected = (files = []) => {
    if (!files.length) return
    setStep2((prev) => {
      const nextMenuImages = [...(prev.menuImages || []), ...files]
      void persistMenuImagesToDB(nextMenuImages)
      return { ...prev, menuImages: nextMenuImages }
    })
  }

  const handleProfileImageSelected = (file) => {
    if (!file) return
    setStep2((prev) => ({
      ...prev,
      profileImage: file,
    }))
    void saveFileToDB("profileImage", file)
  }

  const handlePanImageSelected = (file) => {
    if (!file) return
    setStep3((prev) => ({ ...prev, panImage: file }))
  }

  const handleGstImageSelected = (file) => {
    if (!file) return
    setStep3((prev) => ({ ...prev, gstImage: file }))
  }

  const handleFssaiImageSelected = (file) => {
    if (!file) return
    setStep3((prev) => ({ ...prev, fssaiImage: file }))
  }

  const isPersistedImageValue = (value) =>
    !isUploadableFile(value) &&
    ((typeof value === "string" && value.trim()) ||
      (value?.url && typeof value.url === "string"))

  const getPersistedImagePayload = (value) => {
    if (typeof value === "string" && value.trim()) {
      return { url: value.trim(), publicId: null }
    }

    if (value?.url && typeof value.url === "string" && value.url.trim()) {
      return {
        url: value.url.trim(),
        publicId: value.publicId || null,
      }
    }

    return null
  }

  const toPersistedMenuImagesPayload = (menuImages = []) =>
    (Array.isArray(menuImages) ? menuImages : [])
      .filter((img) => isPersistedImageValue(img))
      .map((img) =>
        typeof img === "string"
          ? img
          : {
              url: img.url,
              publicId: img.publicId || null,
            },
      )

  const handleRemoveMenuImage = async (indexToRemove) => {
    const currentMenuImages = step2.menuImages || []
    const imageToRemove = currentMenuImages[indexToRemove]
    const nextMenuImages = currentMenuImages.filter((_, i) => i !== indexToRemove)

    setStep2((prev) => ({
      ...prev,
      menuImages: nextMenuImages,
    }))
    await persistMenuImagesToDB(nextMenuImages)

    if (!isPersistedImageValue(imageToRemove)) {
      return
    }

    try {
      await restaurantAPI.updateProfile({
        menuImages: toPersistedMenuImagesPayload(nextMenuImages),
      })
    } catch (err) {
      setStep2((prev) => ({
        ...prev,
        menuImages: currentMenuImages,
      }))
      await persistMenuImagesToDB(currentMenuImages)
      setError(err?.response?.data?.message || "Failed to remove menu image")
    }
  }

  const handleRemoveProfileImage = async () => {
    const currentProfileImage = step2.profileImage
    setStep2((prev) => ({
      ...prev,
      profileImage: null,
    }))

    if (!isPersistedImageValue(currentProfileImage)) {
      return
    }

    try {
      await restaurantAPI.updateProfile({ profileImage: "" })
    } catch (err) {
      setStep2((prev) => ({
        ...prev,
        profileImage: currentProfileImage,
      }))
      setError(err?.response?.data?.message || "Failed to remove profile image")
    }
  }

  const handleUpload = async (file, folder) => {
    try {
      if (!isUploadableFile(file)) {
        throw new Error("Invalid image file")
      }

      const response = await uploadAPI.uploadMedia(file, { folder })
      const uploadedImage = response?.data?.data

      if (!uploadedImage?.url) {
        throw new Error("Uploaded image URL was not returned")
      }

      return uploadedImage
    } catch (err) {
      // Provide more informative error message for upload failures
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      debugError("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  const resolveImageForProfileUpdate = async (value, folder) => {
    if (!value) return null

    if (isUploadableFile(value)) {
      const uploaded = await handleUpload(value, folder)
      return uploaded || null
    }

    return getPersistedImagePayload(value)
  }

  const resolveMenuImagesForProfileUpdate = async (menuImages = []) => {
    const items = Array.isArray(menuImages) ? menuImages : []
    const resolved = await Promise.all(
      items.map(async (image) => {
        if (isUploadableFile(image)) {
          return handleUpload(image, "food/restaurants/menu")
        }

        return getPersistedImagePayload(image)
      }),
    )

    return resolved.filter((image) => image?.url)
  }

  // Load from localStorage on mount and check URL parameter
  useEffect(() => {
    if (isOnboardingHydrated || isHydratingRef.current) return
    isHydratingRef.current = true

    // Check if step is specified in URL (from OTP login redirect)
    const stepParam = new URLSearchParams(getAppRouteSearch()).get("step")

    const loadData = async () => {
      let failSafeTimer = null
      try {
        setLoading(true)
        // Fail-safe: Force loading off after 7 seconds if something hangs on mobile
        failSafeTimer = setTimeout(() => {
          setIsOnboardingHydrated(true)
          setLoading(false)
        }, 7000)

        const currentPhone = getVerifiedPhoneFromStoredRestaurant()
        let localData = loadOnboardingFromLocalStorage()

        // 1. First fetch API data to have the latest backend state
        let apiData = null
        try {
          // Only fetch if we have a token (existing user session)
          if (getModuleToken("restaurant")) {
            const res = await restaurantAPI.getCurrentRestaurant()
            apiData = res?.data?.data?.restaurant || res?.data?.restaurant
          }
        } catch (err) {
          debugError("API fetch skipped/failed:", err)
        }

        // 2. Hydrate from API if exists
        if (apiData) {
          setHasExistingRestaurantProfile(true)
          if (apiData.partnerType === "store") setIsStore(true)
          const onboarding = apiData.onboarding || {}
          const s1 = onboarding.step1 || {}
          const s2 = onboarding.step2 || {}
          const s3 = onboarding.step3 || {}
          const loc = s1.location || apiData.location || {}
          const pay = s3.bank || apiData.bankAccount || {}

          setStep1((prev) => ({
            ...prev,
            restaurantName: s1.restaurantName || apiData.name || apiData.restaurantName || "",
            pureVegRestaurant: typeof s1.pureVegRestaurant === "boolean" ? s1.pureVegRestaurant : (apiData.pureVegRestaurant ?? null),
            ownerName: s1.ownerName || apiData.ownerName || "",
            ownerEmail: s1.ownerEmail || apiData.ownerEmail || apiData.email || "",
            ownerPhone: s1.ownerPhone || apiData.ownerPhone || apiData.phone || "",
            primaryContactNumber: s1.primaryContactNumber || apiData.primaryContactNumber || "",
            zoneId: s1.zoneId || apiData.zoneId || "",
            location: {
              ...prev.location,
              formattedAddress: loc.formattedAddress || loc.address || apiData.address || "",
              addressLine1: loc.addressLine1 || "",
              addressLine2: loc.addressLine2 || "",
              area: loc.area || apiData.area || "",
              city: loc.city || apiData.city || "",
              state: loc.state || apiData.state || "",
              pincode: loc.pincode || apiData.pincode || "",
              landmark: loc.landmark || "",
              latitude: loc.latitude || "",
              longitude: loc.longitude || "",
            },
          }))

          setStep2((prev) => ({
            ...prev,
            menuImages: s2.menuImageUrls || apiData.menuImages || [],
            profileImage: s2.profileImageUrl || apiData.profileImage || null,
            cuisines: s2.cuisines || apiData.cuisines || [],
            estimatedDeliveryTime: s2.estimatedDeliveryTime || apiData.estimatedDeliveryTime || "",
            openingTime: normalizeTimeValue(s2.openingTime || apiData.openingTime),
            closingTime: normalizeTimeValue(s2.closingTime || apiData.closingTime),
            openDays: s2.openDays || apiData.openDays || [],
            isTakeawayEnabled: s2.isTakeawayEnabled || apiData.takeawaySettings?.isEnabled || false,
          }))

          setStep3((prev) => ({
            ...prev,
            panNumber: s3.pan?.panNumber || apiData.panNumber || "",
            nameOnPan: s3.pan?.nameOnPan || apiData.nameOnPan || "",
            panImage: s3.pan?.image || apiData.panImage || null,
            gstRegistered: s3.gst?.isRegistered ?? apiData.gstRegistered ?? false,
            gstNumber: s3.gst?.gstNumber || apiData.gstNumber || "",
            gstLegalName: s3.gst?.legalName || apiData.gstLegalName || "",
            gstAddress: s3.gst?.address || apiData.gstAddress || "",
            gstImage: s3.gst?.image || apiData.gstImage || null,
            fssaiNumber: s3.fssai?.registrationNumber || apiData.fssaiNumber || "",
            fssaiExpiry: s3.fssai?.expiryDate ? String(s3.fssai.expiryDate).split("T")[0] : (apiData.fssaiExpiry ? String(apiData.fssaiExpiry).split("T")[0] : ""),
            fssaiImage: s3.fssai?.image || apiData.fssaiImage || null,
            accountNumber: pay.accountNumber || apiData.accountNumber || "",
            confirmAccountNumber: pay.accountNumber || apiData.accountNumber || "",
            ifscCode: normalizeIFSC(pay.ifscCode || apiData.ifscCode),
            accountHolderName: pay.accountHolderName || apiData.accountHolderName || "",
            accountType: normalizeAccountTypeValue(pay.accountType || apiData.accountType),
          }))
        }

        // 3. APPLY LOCAL OVERRIDES (The "Persistence" fix)
        // If localStorage has unsaved changes for this user, apply them over the API/Initial state.
        if (localData) {
          const savedPhone = normalizePhoneDigits(localData.step1?.ownerPhone || "")
          const normalizedCurrent = normalizePhoneDigits(currentPhone)

          // Only use local data if it belongs to the same user
          if (savedPhone && normalizedCurrent && savedPhone === normalizedCurrent) {
            if (localData.step1) {
              setStep1((prev) => ({ ...prev, ...localData.step1, location: { ...prev.location, ...localData.step1.location } }))
            }
            if (localData.step2) {
              // Note: picked files are re-hydrated from the file store (below)
              setStep2((prev) => ({
                ...prev,
                ...localData.step2,
                openingTime: normalizeTimeValue(localData.step2.openingTime),
                closingTime: normalizeTimeValue(localData.step2.closingTime),
              }))
            }
            if (localData.step3) {
              setStep3((prev) => ({ ...prev, ...localData.step3 }))
            }

            // Restore Step
            if (localData.currentStep && !stepParam) {
              setStep(Math.min(3, Math.max(1, Number(localData.currentStep))))
            }
          } else if (savedPhone && normalizedCurrent && savedPhone !== normalizedCurrent) {
            localData = null // Bypass the file store check for a mismatched user
            clearOnboardingFromLocalStorage()
            clearAllOnboardingFiles().catch((e) => debugError("Cleanup failed:", e))
          }
        }

        // 4. Finally re-hydrate picked files from the file store if they exist
        if (localData || apiData) {
          const [prof, pan, gst, fs] = await Promise.all([
            getFileFromDB("profileImage"),
            getFileFromDB("panImage"),
            getFileFromDB("gstImage"),
            getFileFromDB("fssaiImage"),
          ])

          if (prof) setStep2((p) => ({ ...p, profileImage: prof }))
          if (pan) setStep3((p) => ({ ...p, panImage: pan }))
          if (gst) setStep3((p) => ({ ...p, gstImage: gst }))
          if (fs) setStep3((p) => ({ ...p, fssaiImage: fs }))

          const menuPromises = Array.from({ length: 10 }, (_, i) => getFileFromDB(`menuImage_${i}`))
          const restoredMenuImages = (await Promise.all(menuPromises)).filter(Boolean)

          if (restoredMenuImages.length) {
            setStep2((p) => ({ ...p, menuImages: [...p.menuImages.filter((im) => !isUploadableFile(im)), ...restoredMenuImages] }))
          }
        }

        // If step is explicitly in URL, use it
        if (stepParam) {
          const s = parseInt(stepParam, 10)
          if (s >= 1 && s <= 3) setStep(s)
        }
      } catch (err) {
        debugError("Onboarding hydration failed:", err)
      } finally {
        if (failSafeTimer) clearTimeout(failSafeTimer)
        setIsOnboardingHydrated(true)
        setLoading(false)
        isHydratingRef.current = false
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!verifiedPhoneNumber) return
    setStep1((prev) => ({
      ...prev,
      ownerPhone: verifiedPhoneNumber,
    }))
  }, [verifiedPhoneNumber])

  // Save to localStorage whenever step data changes
  useEffect(() => {
    if (!isOnboardingHydrated) return
    saveOnboardingToLocalStorage(step1, step2, step3, step)

    // Save picked files to the file store
    const saveFiles = async () => {
      if (step2.profileImage && isUploadableFile(step2.profileImage)) {
        await saveFileToDB("profileImage", step2.profileImage)
      } else if (!step2.profileImage) {
        await deleteFileFromDB("profileImage")
      }
      if (step3.panImage && isUploadableFile(step3.panImage)) {
        await saveFileToDB("panImage", step3.panImage)
      }
      if (step3.gstImage && isUploadableFile(step3.gstImage)) {
        await saveFileToDB("gstImage", step3.gstImage)
      }
      if (step3.fssaiImage && isUploadableFile(step3.fssaiImage)) {
        await saveFileToDB("fssaiImage", step3.fssaiImage)
      }

      await persistMenuImagesToDB(step2.menuImages || [])
    }
    saveFiles()
  }, [isOnboardingHydrated, step1, step2, step3, step])

  useEffect(() => {
    syncOnboardingFileCache(step2, step3)
  }, [step2, step3])

  // Validation functions for each step
  const validateStep1 = () => {
    const errors = []

    if (!step1.restaurantName?.trim()) {
      errors.push(isStore ? "Store name is required" : "Restaurant name is required")
    } else if (/[/-]/.test(step1.restaurantName)) {
      errors.push(`${isStore ? "Store" : "Restaurant"} name cannot contain slashes (/) or hyphens (-)`)
    }
    if (typeof step1.pureVegRestaurant !== "boolean") {
      errors.push(w("Please select whether your restaurant is pure veg"))
    }
    if (!step1.ownerName?.trim()) {
      errors.push("Owner name is required")
    } else if (!OWNER_NAME_REGEX.test(step1.ownerName.trim())) {
      errors.push("Owner name must contain only letters")
    }
    if (!step1.ownerEmail?.trim()) {
      errors.push("Owner email is required")
    } else if (!EMAIL_REGEX.test(step1.ownerEmail.trim())) {
      errors.push("Please enter a valid email address")
    } else if (step1.ownerEmail.toLowerCase().includes("@gnail.com") || step1.ownerEmail.toLowerCase().includes("@gnil.com")) {
      errors.push("Invalid email domain. Did you mean '@gmail.com'?")
    }
    if (!step1.ownerPhone?.trim()) {
      errors.push("Owner phone number is required")
    } else if (!/^\d{10}$/.test(normalizePhoneDigits(step1.ownerPhone))) {
      errors.push("Owner phone number must be exactly 10 digits")
    }
    if (!step1.primaryContactNumber?.trim()) {
      errors.push("Primary contact number is required")
    } else if (!/^\d{10}$/.test(normalizePhoneDigits(step1.primaryContactNumber))) {
      errors.push("Primary contact number must be exactly 10 digits")
    }
    if (!hasLocationPoint) {
      errors.push(w("Please search and select your restaurant location"))
    } else if (isLocationOutsideZones) {
      errors.push("This location is outside our service zones")
    } else if (!step1.zoneId?.trim()) {
      errors.push("Service zone is required")
    }
    if (!step1.location?.area?.trim()) {
      errors.push("Area/Sector/Locality is required")
    }
    if (!step1.location?.city?.trim()) {
      errors.push("City is required")
    }
    if (!step1.location?.pincode?.trim()) {
      errors.push("Pincode is required")
    } else if (!/^\d{6}$/.test(normalizePincode(step1.location.pincode))) {
      errors.push("Pincode must be exactly 6 digits")
    }

    return errors
  }

  const validateStep2 = () => {
    const errors = []

    // Check menu images - must have at least one File or existing URL
    const hasMenuImages = step2.menuImages && step2.menuImages.length > 0
    if (!hasMenuImages) {
      errors.push("At least one menu image is required")
    } else {
      const validMenuImages = step2.menuImages.filter((img) => {
        if (isUploadableFile(img)) return true
        if (img?.url && typeof img.url === "string") return true
        if (typeof img === "string" && img.trim()) return true
        return false
      })
      if (validMenuImages.length === 0) {
        errors.push("Please upload at least one valid menu image")
      }
    }

    // Check profile image - must be a File or existing URL
    if (!step2.profileImage) {
      errors.push(w("Restaurant profile image is required"))
    } else {
      const isValidProfileImage =
        isUploadableFile(step2.profileImage) ||
        (step2.profileImage?.url && typeof step2.profileImage.url === "string") ||
        (typeof step2.profileImage === "string" && step2.profileImage.trim())
      if (!isValidProfileImage) {
        errors.push(w("Please upload a valid restaurant profile image"))
      }
    }

    if (!step2.openingTime?.trim()) {
      errors.push("Opening time is required")
    }
    if (!step2.closingTime?.trim()) {
      errors.push("Closing time is required")
    }
    if (!Array.isArray(step2.cuisines) || step2.cuisines.length === 0) {
      errors.push("Please select at least one cuisine")
    }
    if (!step2.openDays || step2.openDays.length === 0) {
      errors.push("Please select at least one open day")
    }
    if (!step2.estimatedDeliveryTime?.trim()) {
      errors.push("Estimated delivery time is required")
    }

    return errors
  }

  const validateStep3 = () => {
    const errors = []

    if (!step3.panNumber?.trim()) {
      errors.push("PAN number is required")
    } else if (!PAN_NUMBER_REGEX.test(step3.panNumber.trim().toUpperCase())) {
      errors.push("PAN number must be valid (e.g., ABCDE1234F)")
    }
    if (!step3.nameOnPan?.trim()) {
      errors.push("Name on PAN is required")
    }
    if (!step3.panImage) {
      errors.push("PAN image is required")
    } else {
      const isValidPanImage =
        isUploadableFile(step3.panImage) ||
        (step3.panImage?.url && typeof step3.panImage.url === "string") ||
        (typeof step3.panImage === "string" && step3.panImage.trim())
      if (!isValidPanImage) {
        errors.push("Please upload a valid PAN image")
      }
    }

    if (!step3.fssaiNumber?.trim()) {
      errors.push("FSSAI number is required")
    } else if (!FSSAI_NUMBER_REGEX.test(step3.fssaiNumber.trim())) {
      errors.push("FSSAI number must contain exactly 14 digits")
    }
    if (!step3.fssaiExpiry?.trim()) {
      errors.push("FSSAI expiry date is required")
    } else if (step3.fssaiExpiry < getTodayLocalYMD()) {
      errors.push("FSSAI expiry date cannot be in the past")
    }
    if (!step3.fssaiImage) {
      errors.push("FSSAI image is required")
    } else {
      const isValidFssaiImage =
        isUploadableFile(step3.fssaiImage) ||
        (step3.fssaiImage?.url && typeof step3.fssaiImage.url === "string") ||
        (typeof step3.fssaiImage === "string" && step3.fssaiImage.trim())
      if (!isValidFssaiImage) {
        errors.push("Please upload a valid FSSAI image")
      }
    }

    // Validate GST details if GST registered
    if (step3.gstRegistered) {
      if (!step3.gstNumber?.trim()) {
        errors.push("GST number is required when GST registered")
      } else if (!GST_NUMBER_REGEX.test(step3.gstNumber.trim().toUpperCase())) {
        errors.push("GST number must be a valid 15-character GSTIN")
      }
      if (!step3.gstLegalName?.trim()) {
        errors.push("GST legal name is required when GST registered")
      } else if (!GST_LEGAL_NAME_REGEX.test(step3.gstLegalName.trim())) {
        errors.push("GST legal name must contain only letters")
      }
      if (!step3.gstAddress?.trim()) {
        errors.push("GST registered address is required when GST registered")
      }
      if (!step3.gstImage) {
        errors.push("GST image is required when GST registered")
      } else {
        const isValidGstImage =
          isUploadableFile(step3.gstImage) ||
          (step3.gstImage?.url && typeof step3.gstImage.url === "string") ||
          (typeof step3.gstImage === "string" && step3.gstImage.trim())
        if (!isValidGstImage) {
          errors.push("Please upload a valid GST image")
        }
      }
    }

    if (!step3.accountNumber?.trim()) {
      errors.push("Account number is required")
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3.accountNumber.trim())) {
      errors.push("Account number must contain 9 to 18 digits only")
    }
    if (!step3.confirmAccountNumber?.trim()) {
      errors.push("Please confirm your account number")
    } else if (!BANK_ACCOUNT_NUMBER_REGEX.test(step3.confirmAccountNumber.trim())) {
      errors.push("Confirm account number must contain 9 to 18 digits only")
    }
    if (step3.accountNumber && step3.confirmAccountNumber && step3.accountNumber !== step3.confirmAccountNumber) {
      errors.push("Account number and confirmation do not match")
    }
    if (!step3.ifscCode?.trim()) {
      errors.push("IFSC code is required")
    } else if (!IFSC_CODE_REGEX.test(step3.ifscCode.trim().toUpperCase())) {
      errors.push("IFSC code must contain exactly 11 alphanumeric characters")
    }
    if (!step3.accountHolderName?.trim()) {
      errors.push("Account holder name is required")
    } else if (!ACCOUNT_HOLDER_NAME_REGEX.test(step3.accountHolderName.trim())) {
      errors.push("Account holder name must contain only letters")
    }
    if (!step3.accountType?.trim()) {
      errors.push("Account type is required")
    } else if (!["Saving", "Current"].includes(step3.accountType.trim())) {
      errors.push("Account type must be either Saving or Current")
    }

    return errors
  }

  const handleNext = async () => {
    setError("")
    Keyboard.dismiss()

    // Validate current step before proceeding
    let validationErrors = []
    if (step === 1) {
      validationErrors = validateStep1()
    } else if (step === 2) {
      validationErrors = validateStep2()
    } else if (step === 3) {
      validationErrors = validateStep3()
    }

    if (validationErrors.length > 0) {
      setError(validationErrors[0])
      toast.error(validationErrors[0])
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        setStep(2)
        scrollToTop()
      } else if (step === 2) {
        setStep(3)
        scrollToTop()
      } else if (step === 3) {
        const { fcmToken, platform } = await collectFcmTokenForSignup("restaurant")

        if (hasExistingRestaurantProfile) {
          const [
            menuImagesPayload,
            profileImagePayload,
            panImagePayload,
            gstImagePayload,
            fssaiImagePayload,
          ] = await Promise.all([
            resolveMenuImagesForProfileUpdate(step2.menuImages || []),
            resolveImageForProfileUpdate(step2.profileImage, "food/restaurants/profile"),
            resolveImageForProfileUpdate(step3.panImage, "food/restaurants/pan"),
            step3.gstRegistered
              ? resolveImageForProfileUpdate(step3.gstImage, "food/restaurants/gst")
              : Promise.resolve(null),
            resolveImageForProfileUpdate(step3.fssaiImage, "food/restaurants/fssai"),
          ])

          const updatePayload = {
            restaurantName: step1.restaurantName || "",
            pureVegRestaurant: step1.pureVegRestaurant === true,
            ownerName: step1.ownerName || "",
            ownerEmail: (step1.ownerEmail || "").trim(),
            ownerPhone: normalizePhoneDigits(step1.ownerPhone),
            primaryContactNumber: normalizePhoneDigits(step1.primaryContactNumber),
            zoneId: step1.zoneId || "",
            location: {
              formattedAddress: step1.location?.formattedAddress || "",
              addressLine1: step1.location?.addressLine1 || "",
              addressLine2: step1.location?.addressLine2 || "",
              area: step1.location?.area || "",
              city: step1.location?.city || "",
              state: step1.location?.state || "",
              pincode: step1.location?.pincode || "",
              landmark: step1.location?.landmark || "",
              latitude: step1.location?.latitude || "",
              longitude: step1.location?.longitude || "",
            },
            cuisines: Array.isArray(step2.cuisines) ? step2.cuisines : [],
            estimatedDeliveryTime: (step2.estimatedDeliveryTime || "").trim(),
            openingTime: normalizeTimeValue(step2.openingTime) || "",
            closingTime: normalizeTimeValue(step2.closingTime) || "",
            openDays: Array.isArray(step2.openDays) ? step2.openDays : [],
            menuImages: menuImagesPayload,
            profileImage: profileImagePayload || "",
            panNumber: step3.panNumber || "",
            nameOnPan: step3.nameOnPan || "",
            panImage: panImagePayload || "",
            gstRegistered: Boolean(step3.gstRegistered),
            gstNumber: step3.gstRegistered ? step3.gstNumber || "" : "",
            gstLegalName: step3.gstRegistered ? step3.gstLegalName || "" : "",
            gstAddress: step3.gstRegistered ? step3.gstAddress || "" : "",
            gstImage: step3.gstRegistered ? (gstImagePayload || "") : "",
            fssaiNumber: step3.fssaiNumber || "",
            fssaiExpiry: step3.fssaiExpiry || "",
            fssaiImage: fssaiImagePayload || "",
            accountNumber: step3.accountNumber || "",
            ifscCode: (step3.ifscCode || "").toUpperCase(),
            accountHolderName: step3.accountHolderName || "",
            accountType: step3.accountType || "",
            isTakeawayEnabled: !isStore && step2.isTakeawayEnabled === true,
            isTakeawayCodEnabled: !isStore && step2.isTakeawayCodEnabled === true,
          }

          if (fcmToken) {
            updatePayload.fcmToken = fcmToken
            updatePayload.platform = platform
          }

          await restaurantAPI.updateProfile(updatePayload)

          clearOnboardingFromLocalStorage()
          clearOnboardingFileCache()
          await clearAllOnboardingFiles()

          toast.success("Registration submitted. Awaiting admin approval.", { duration: 4000 })
          await finalizeRestaurantPendingSubmission(navigate, step1.ownerPhone, { fcmToken, platform, partnerType: isStore ? "store" : "restaurant" })
          return
        }

        // Final submit: create restaurant in DB using backend multipart endpoint.
        const formData = new FormData()

        // Step 1
        formData.append("restaurantName", step1.restaurantName || "")
        if (isStore) formData.append("partnerType", "store")
        formData.append(
          "pureVegRestaurant",
          step1.pureVegRestaurant === true ? "true" : "false",
        )
        formData.append("ownerName", step1.ownerName || "")
        formData.append("ownerEmail", (step1.ownerEmail || "").trim())
        formData.append("ownerPhone", normalizePhoneDigits(step1.ownerPhone))
        formData.append("primaryContactNumber", normalizePhoneDigits(step1.primaryContactNumber))
        formData.append("zoneId", step1.zoneId || "")
        formData.append("addressLine1", step1.location?.addressLine1 || "")
        formData.append("addressLine2", step1.location?.addressLine2 || "")
        formData.append("area", step1.location?.area || "")
        formData.append("city", step1.location?.city || "")
        formData.append("state", step1.location?.state || "")
        formData.append("pincode", step1.location?.pincode || "")
        formData.append("landmark", step1.location?.landmark || "")
        formData.append("formattedAddress", step1.location?.formattedAddress || "")
        formData.append("latitude", String(step1.location?.latitude || ""))
        formData.append("longitude", String(step1.location?.longitude || ""))

        // Step 2
        formData.append("cuisines", (step2.cuisines || []).join(","))
        formData.append("estimatedDeliveryTime", (step2.estimatedDeliveryTime || "").trim())
        formData.append("openingTime", normalizeTimeValue(step2.openingTime) || "")
        formData.append("closingTime", normalizeTimeValue(step2.closingTime) || "")
        formData.append("openDays", (step2.openDays || []).join(","))
        formData.append("isTakeawayEnabled", !isStore && step2.isTakeawayEnabled ? "true" : "false")
        formData.append("isTakeawayCodEnabled", !isStore && step2.isTakeawayCodEnabled ? "true" : "false")

        const menuFiles = (step2.menuImages || []).filter((f) => isUploadableFile(f))
        if (menuFiles.length === 0) {
          throw new Error("At least one menu image must be uploaded")
        }
        const preparedMenuFiles = await prepareUploadFiles(menuFiles)
        preparedMenuFiles.forEach((file) => formData.append("menuImages", { uri: file.uri, name: file.name, type: file.type }))

        if (!isUploadableFile(step2.profileImage)) {
          throw new Error(w("Restaurant profile image is required"))
        }
        const preparedProfile = await prepareUploadFile(step2.profileImage, { preset: "profile" })
        formData.append("profileImage", { uri: preparedProfile.uri, name: preparedProfile.name, type: preparedProfile.type })

        // Step 3
        formData.append("panNumber", step3.panNumber || "")
        formData.append("nameOnPan", step3.nameOnPan || "")
        if (!isUploadableFile(step3.panImage)) {
          throw new Error("PAN image is required")
        }
        const preparedPan = await prepareUploadFile(step3.panImage)
        formData.append("panImage", { uri: preparedPan.uri, name: preparedPan.name, type: preparedPan.type })

        formData.append("gstRegistered", step3.gstRegistered ? "true" : "false")
        if (step3.gstRegistered) {
          formData.append("gstNumber", step3.gstNumber || "")
          formData.append("gstLegalName", step3.gstLegalName || "")
          formData.append("gstAddress", step3.gstAddress || "")
          if (!isUploadableFile(step3.gstImage)) {
            throw new Error("GST image is required when GST registered")
          }
          const preparedGst = await prepareUploadFile(step3.gstImage)
          formData.append("gstImage", { uri: preparedGst.uri, name: preparedGst.name, type: preparedGst.type })
        }

        formData.append("fssaiNumber", step3.fssaiNumber || "")
        formData.append("fssaiExpiry", step3.fssaiExpiry || "")
        if (!isUploadableFile(step3.fssaiImage)) {
          throw new Error("FSSAI image is required")
        }
        const preparedFssai = await prepareUploadFile(step3.fssaiImage)
        formData.append("fssaiImage", { uri: preparedFssai.uri, name: preparedFssai.name, type: preparedFssai.type })

        formData.append("accountNumber", step3.accountNumber || "")
        formData.append("ifscCode", (step3.ifscCode || "").toUpperCase())
        formData.append("accountHolderName", step3.accountHolderName || "")
        formData.append("accountType", step3.accountType || "")

        if (fcmToken) {
          formData.append("fcmToken", fcmToken)
          formData.append("platform", platform)
        }

        await restaurantAPI.register(formData)

        // Clear localStorage when onboarding is complete
        clearOnboardingFromLocalStorage()
        clearOnboardingFileCache()
        try {
          await clearAllOnboardingFiles()
        } catch {
          // ignore
        }

        toast.success("Registration submitted. Awaiting admin approval.", { duration: 4000 })
        await finalizeRestaurantPendingSubmission(navigate, step1.ownerPhone, { fcmToken, platform, partnerType: isStore ? "store" : "restaurant" })
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const toggleDay = (day) => {
    setStep2((prev) => {
      const exists = prev.openDays.includes(day)
      if (exists) {
        return { ...prev, openDays: prev.openDays.filter((d) => d !== day) }
      }
      return { ...prev, openDays: [...prev.openDays, day] }
    })
  }

  // ---- location search ---------------------------------------------------------------------------------------------

  const zonesCenter = useMemo(() => getZonesArea(zones)?.center || null, [zones])

  const parsePlace = (place) => {
    const formattedAddress = place?.formatted_address || ""
    const comps = Array.isArray(place?.address_components) ? place.address_components : []
    const get = (types) => comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || ""

    const area = get(["sublocality_level_1", "sublocality", "neighborhood"]) || get(["locality"])
    const city = get(["locality"]) || get(["administrative_area_level_2"])
    const state = get(["administrative_area_level_1"]) || get(["administrative_area_level_2"])
    const pincode = get(["postal_code"])
    const lat = Number(place?.geometry?.location?.lat)
    const lng = Number(place?.geometry?.location?.lng)

    return {
      formattedAddress,
      area,
      city,
      state,
      pincode,
      latitude: Number.isFinite(lat) ? Number(lat.toFixed(6)) : "",
      longitude: Number.isFinite(lng) ? Number(lng.toFixed(6)) : "",
    }
  }

  // web: autocomplete "place_changed"
  const handlePickPrediction = async (prediction) => {
    try {
      const place = await placeDetails(prediction.place_id, {
        sessionToken: placesSessionRef.current,
        fields: ["formattedAddress", "addressComponents", "location"],
      })
      placesSessionRef.current = newSessionToken()
      if (!place?.geometry?.location || !Number.isFinite(Number(place.geometry.location.lat))) return

      const parsed = parsePlace(place)
      setStep1((prev) => ({
        ...prev,
        location: {
          ...prev.location,
          formattedAddress: parsed.formattedAddress || prev.location.formattedAddress,
          addressLine1: parsed.formattedAddress || prev.location.addressLine1 || "",
          area: parsed.area || prev.location.area,
          city: parsed.city || prev.location.city,
          state: parsed.state || prev.location.state,
          pincode: parsed.pincode || prev.location.pincode,
          latitude: parsed.latitude !== "" ? parsed.latitude : prev.location.latitude,
          longitude: parsed.longitude !== "" ? parsed.longitude : prev.location.longitude,
        },
      }))

      pickedLocationTextRef.current = parsed.formattedAddress || ""
      setLocationSearchValue(parsed.formattedAddress)
      setPlacePredictions([])
      setLocationSuggestions([])
      locationSearchInputRef.current?.blur()
    } catch (e) {
      debugError("Place details error:", e)
    }
  }

  const handlePickSuggestion = (s) => {
    const { lat, lng, display, addr } = s
    const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.locality || ""
    const city = addr.city || addr.town || addr.village || ""
    const state = addr.state || ""
    const pincode = addr.postcode || ""

    setStep1((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        formattedAddress: display,
        addressLine1: display,
        area: area || prev.location.area,
        city: city || prev.location.city,
        state: state || prev.location.state,
        pincode: pincode || prev.location.pincode,
        latitude: lat,
        longitude: lng,
      },
    }))
    pickedLocationTextRef.current = display
    setLocationSearchValue(display)
    setLocationSuggestions([])
    setPlacePredictions([])
    locationSearchInputRef.current?.blur()
  }

  // Google predictions (web: Places Autocomplete on the search box, biased towards the service zones)
  useEffect(() => {
    if (step !== 1) return undefined
    const q = String(locationSearchValue || "").trim()
    if (!q || q === String(pickedLocationTextRef.current || "").trim()) {
      setPlacePredictions([])
      return undefined
    }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const list = await placesAutocomplete(q, {
          sessionToken: placesSessionRef.current,
          country: "in",
          lat: zonesCenter?.lat,
          lng: zonesCenter?.lng,
        })
        if (!cancelled) setPlacePredictions(Array.isArray(list) ? list.slice(0, 5) : [])
      } catch (e) {
        debugError("Autocomplete error:", e)
        if (!cancelled) setPlacePredictions([])
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [locationSearchValue, step, zonesCenter])

  // Hybrid Search Fallback (Nominatim)
  useEffect(() => {
    if (step !== 1) return undefined
    const q = String(locationSearchValue || "").trim()

    // Box was just filled with a picked suggestion — don't search for it again.
    if (q.length < 3 || q === String(pickedLocationTextRef.current || "").trim()) {
      setLocationSuggestions([])
      setIsSearchingLocation(false)
      return undefined
    }
    pickedLocationTextRef.current = ""

    const t = setTimeout(async () => {
      try {
        setIsSearchingLocation(true)
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(q)}&countrycodes=in`
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = await res.json()
        const mapped = (Array.isArray(json) ? json : []).map((r) => ({
          id: r.place_id,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          addr: r.address || {},
        }))
        // one entry per place, nearest to the service zones first (same list rules as the admin form)
        setLocationSuggestions(rankLocationResults(mapped, getZonesArea(zones)?.center || null, 6))
      } catch (e) {
        debugError("Nominatim search failed:", e)
      } finally {
        setIsSearchingLocation(false)
      }
    }, 400)

    return () => clearTimeout(t)
  }, [locationSearchValue, step, zones])

  // web: a tap outside the search box closes both dropdowns. Here: the box losing focus (a tap on the page closes the
  // keyboard and blurs it); a tap on a suggestion keeps the focus (keyboardShouldPersistTaps) and picks it first.
  useEffect(() => {
    if (isLocationSearchFocused) return undefined
    const t = setTimeout(() => {
      setLocationSuggestions([])
      setPlacePredictions([])
    }, 250)
    return () => clearTimeout(t)
  }, [isLocationSearchFocused])

  // Load zones for onboarding dropdown (public endpoint).
  useEffect(() => {
    if (step !== 1) return undefined
    let cancelled = false
    setZonesLoading(true)
    zoneAPI.getPublicZones()
      .then((res) => {
        const list = res?.data?.data?.zones || res?.data?.zones || []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setZones([])
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false)
      })
    return () => { cancelled = true }
  }, [step])

  // ---- FSSAI expiry date (web: Calendar popover, past days disabled) ----------------------------------------------
  const openFssaiCalendar = () => {
    Keyboard.dismiss()
    const today = parseLocalYMDDate(getTodayLocalYMD())
    const current = parseLocalYMDDate(step3.fssaiExpiry) || today
    const onPicked = (date) => {
      if (date && formatDateToLocalYMD(date) >= getTodayLocalYMD()) {
        const formattedDate = formatDateToLocalYMD(date)
        setStep3((prev) => ({ ...prev, fssaiExpiry: formattedDate }))
        setIosFssaiOpen(false)
      }
    }
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        minimumDate: today,
        onValueChange: (_event, date) => onPicked(date),
      })
      return
    }
    setIosFssaiOpen(true)
  }

  // ---- render ------------------------------------------------------------------------------------------------------

  const renderStep1 = () => {
    const showPredictions = placePredictions.length > 0
    const showFallback = !showPredictions && locationSuggestions.length > 0
    return (
      <View style={styles.stepStack}>
        <View style={styles.section}>
          <Text style={[styles.h2, { marginBottom: 16 }]}>{isStore ? "Store information" : "Restaurant information"}</Text>
          <View style={{ gap: 12 }}>
            <View>
              <FieldLabel>{isStore ? "Store name*" : "Restaurant name*"}</FieldLabel>
              <OInput
                value={step1.restaurantName || ""}
                onChangeText={(text) => {
                  const sanitizedVal = text.replace(/[/-]/g, "")
                  setStep1({ ...step1, restaurantName: formatNameToCapital(sanitizedVal) })
                }}
                style={styles.mt1}
                placeholder="Customers will see this name"
                disabled={!isEditing}
                autoCapitalize="words"
              />
            </View>
            <View>
              <FieldLabel>{isStore ? "Pure veg store?*" : "Pure veg restaurant?*"}</FieldLabel>
              <View style={styles.pillRow}>
                <Pill
                  active={step1.pureVegRestaurant === true}
                  onPress={() => isEditing && setStep1({ ...step1, pureVegRestaurant: true })}
                  label="Yes, Pure Veg"
                  activeColor={colors.green[600]}
                  inactiveStyle={styles.pillOutline}
                  inactiveTextColor={colors.gray[700]}
                  disabled={!isEditing}
                />
                <Pill
                  active={step1.pureVegRestaurant === false}
                  onPress={() => isEditing && setStep1({ ...step1, pureVegRestaurant: false })}
                  label="No, Mixed Menu"
                  activeBorder={colors.gray[900]}
                  inactiveStyle={styles.pillOutline}
                  inactiveTextColor={colors.gray[700]}
                  disabled={!isEditing}
                />
              </View>
              <Text style={styles.hint}>{w("This helps users filter restaurants by dietary preference.")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.h2, { marginBottom: 16 }]}>Owner details</Text>
          <Text style={styles.sectionNote}>These details will be used for all business communications and updates.</Text>
          <View style={{ gap: 16 }}>
            <View>
              <FieldLabel>Full name*</FieldLabel>
              <OInput
                value={step1.ownerName || ""}
                onChangeText={(text) =>
                  setStep1({
                    ...step1,
                    ownerName: formatNameToCapital(text.replace(/[^A-Za-z ]/g, "")),
                  })
                }
                style={styles.mt1}
                placeholder="Owner full name"
                disabled={!isEditing}
                autoCapitalize="words"
              />
            </View>
            <View>
              <FieldLabel>Email address*</FieldLabel>
              <OInput
                type="email"
                value={step1.ownerEmail || ""}
                onChangeText={(text) => setStep1({ ...step1, ownerEmail: normalizeEmail(text) })}
                style={styles.mt1}
                placeholder="ritu@gmail.com"
                disabled={!isEditing}
                autoComplete="email"
              />
            </View>
            <View>
              <FieldLabel>Phone number*</FieldLabel>
              <OInput
                value={step1.ownerPhone || ""}
                onChangeText={(text) => {
                  const val = text.replace(/\D/g, "").slice(0, 10)
                  setStep1({ ...step1, ownerPhone: val })
                }}
                readOnly={Boolean(verifiedPhoneNumber)}
                inputMode="tel"
                style={styles.mt1}
                placeholder="10 digit mobile number"
                disabled={!isEditing}
              />
            </View>
          </View>
        </View>

        <View style={[styles.section, { gap: 16 }]}>
          <Text style={styles.h2}>{w("Restaurant contact & location")}</Text>
          <View>
            <FieldLabel>Primary contact number*</FieldLabel>
            <OInput
              value={step1.primaryContactNumber || ""}
              onChangeText={(text) => {
                const val = text.replace(/\D/g, "").slice(0, 10)
                setStep1({ ...step1, primaryContactNumber: val })
              }}
              inputMode="numeric"
              maxLength={10}
              style={styles.mt1}
              placeholder={w("Restaurant's primary contact number")}
              disabled={!isEditing}
            />
            <Text style={styles.hint}>
              {`Customers, delivery partners and ${companyName} may call on this number for order support.`}
            </Text>
          </View>
          <View style={{ gap: 12 }}>
            <Text style={styles.bodySm}>{w("Add your restaurant's location for order pick-up.")}</Text>
            <View>
              <FieldLabel>Search location</FieldLabel>
              <View style={styles.searchWrap}>
                <OInput
                  ref={locationSearchInputRef}
                  value={locationSearchValue}
                  onChangeText={setLocationSearchValue}
                  onFocus={() => setIsLocationSearchFocused(true)}
                  onBlur={() => setIsLocationSearchFocused(false)}
                  style={[styles.mt1, { color: colors.black, paddingRight: 36 }]}
                  placeholder={isLocationSearchFocused ? "" : w("Start typing your restaurant address...")}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {isSearchingLocation ? (
                  <View style={styles.searchSpinner} pointerEvents="none">
                    <SmallSpinner />
                  </View>
                ) : null}
              </View>

              {/* Google predictions (web: the styled .pac-container dropdown) */}
              {showPredictions ? (
                <View style={styles.dropdown}>
                  {placePredictions.map((p, i) => (
                    <Pressable
                      key={p.place_id}
                      onPress={() => handlePickPrediction(p)}
                      style={({ pressed }) => [styles.pacItem, i === placePredictions.length - 1 && styles.lastItem, pressed && styles.itemPressed]}
                    >
                      {({ pressed }) => (
                        <>
                          <PinIcon />
                          <Text style={styles.pacText} numberOfLines={1}>
                            <Text style={[styles.pacQuery, pressed && { color: PRIMARY }]}>{p.structured_formatting?.main_text || p.description}</Text>
                            {p.structured_formatting?.secondary_text ? (
                              <Text style={[styles.pacSecondary, pressed && { color: PRIMARY }]}>{` ${p.structured_formatting.secondary_text}`}</Text>
                            ) : null}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {/* Fallback suggestions dropdown (Nominatim) */}
              {showFallback ? (
                <View style={styles.dropdown}>
                  {locationSuggestions.map((s, i) => (
                    <Pressable
                      key={String(s.id)}
                      onPress={() => handlePickSuggestion(s)}
                      style={({ pressed }) => [styles.suggestionItem, i === locationSuggestions.length - 1 && styles.lastItem, pressed && styles.itemPressed]}
                    >
                      <PinIcon />
                      <Text style={styles.suggestionText} numberOfLines={1}>{s.display}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Text style={styles.hint}>Select a suggestion to auto-fill area/city/state/pincode and coordinates.</Text>
            </View>
            <OInput
              value={step1.location?.addressLine1 || ""}
              onChangeText={(text) =>
                setStep1({
                  ...step1,
                  location: { ...step1.location, addressLine1: text },
                })
              }
              placeholder="Shop no. / building no. (optional)"
            />
            <OInput
              value={step1.location?.addressLine2 || ""}
              onChangeText={(text) =>
                setStep1({
                  ...step1,
                  location: { ...step1.location, addressLine2: text },
                })
              }
              placeholder="Floor / tower (optional)"
            />
            <OInput
              value={step1.location?.landmark || ""}
              onChangeText={(text) =>
                setStep1({
                  ...step1,
                  location: { ...step1.location, landmark: text },
                })
              }
              placeholder="Nearby landmark (optional)"
            />
            <OInput
              value={step1.location?.area || ""}
              onChangeText={(text) =>
                setStep1({
                  ...step1,
                  location: { ...step1.location, area: text },
                })
              }
              placeholder="Area / Sector / Locality*"
            />
            <Select
              value={step1.location?.city || ""}
              onValueChange={(value) =>
                setStep1((prev) => ({
                  ...prev,
                  location: { ...prev.location, city: value },
                }))
              }
            >
              <SelectTrigger style={styles.selectTrigger} textStyle={{ fontSize: 14, color: colors.gray[700] }}>
                <SelectValue placeholder="Select City*" />
              </SelectTrigger>
              <SelectContent>
                {CITY_OPTIONS.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <View style={{ gap: 12 }}>
              <OInput
                value={step1.location?.state || ""}
                onChangeText={(text) =>
                  setStep1({
                    ...step1,
                    location: { ...step1.location, state: text },
                  })
                }
                placeholder="State"
              />
              <OInput
                value={step1.location?.pincode || ""}
                onChangeText={(text) =>
                  setStep1({
                    ...step1,
                    location: { ...step1.location, pincode: normalizePincode(text) },
                  })
                }
                inputMode="numeric"
                placeholder="Pincode"
              />
            </View>
            {/* Service zone — filled from the picked location, not chosen by hand */}
            <View>
              <FieldLabel>Service zone*</FieldLabel>
              <View
                style={[
                  styles.zoneBox,
                  isLocationOutsideZones
                    ? { borderColor: colors.red[300], backgroundColor: colors.red[50] }
                    : detectedZone
                      ? { borderColor: colors.green[200], backgroundColor: colors.green[50] }
                      : { borderColor: "#f2f0ea", backgroundColor: colors.gray[50] },
                ]}
              >
                <Text
                  style={[
                    styles.zoneText,
                    { color: isLocationOutsideZones ? colors.red[700] : detectedZone ? colors.green[800] : colors.gray[500] },
                  ]}
                >
                  {zonesLoading
                    ? "Loading zones..."
                    : isLocationOutsideZones
                      ? w("This location is outside our service zones. Please pick your restaurant's exact location.")
                      : detectedZone
                        ? getZoneLabel(detectedZone)
                        : "Select your location above — the zone is filled automatically."}
                </Text>
              </View>
            </View>
            <Text style={styles.hint}>Please ensure that this address is the same as mentioned on your FSSAI license.</Text>
          </View>
        </View>
      </View>
    )
  }

  const renderStep2 = () => (
    <View style={styles.stepStack}>
      {/* Images section */}
      <View style={[styles.section, { gap: 20 }]}>
        <Text style={styles.h2}>Menu & photos</Text>
        <Text style={styles.noteXs}>
          Add clear photos of your printed menu and a primary profile image. This helps customers understand what you serve.
        </Text>

        {/* Menu images */}
        <View style={{ gap: 8 }}>
          <FieldLabel style={styles.labelMedium}>Menu images</FieldLabel>
          <View style={styles.dropZone}>
            <View style={styles.dropZoneHead}>
              <View style={styles.dropZoneIcon}>
                <ImageIcon size={20} color={colors.gray[700]} />
              </View>
              <View>
                <Text style={styles.dropZoneTitle}>Upload menu images</Text>
                <Text style={styles.hintNoMargin}>JPG, PNG, WebP · You can select multiple files</Text>
              </View>
            </View>
            <UploadButton
              onPress={() =>
                openImageSourcePicker({
                  title: "Add menu image",
                  fileNamePrefix: "menu-image",
                  onSelectFile: (file) => handleMenuImagesSelected(file ? [file] : []),
                  multiple: true,
                })
              }
            />
          </View>

          {/* Menu image previews */}
          {step2.menuImages.length ? (
            <View style={styles.menuGrid}>
              {step2.menuImages.map((file, idx) => {
                let imageUrl = null
                let imageName = `Image ${idx + 1}`

                if (isUploadableFile(file)) {
                  imageUrl = getPreviewImageUrl(file)
                  imageName = file.name || imageName
                } else if (file?.url) {
                  imageUrl = file.url
                  imageName = file.name || `Image ${idx + 1}`
                } else if (typeof file === "string") {
                  imageUrl = file
                }

                return (
                  <PreviewImage
                    key={`${imageUrl || "menu"}-${idx}`}
                    uri={imageUrl}
                    small
                    style={styles.menuTile}
                  >
                    <RemoveImageButton onPress={() => handleRemoveMenuImage(idx)} style={{ top: 4, right: 4 }} />
                    <View style={styles.menuTileCaption}>
                      <Text style={styles.menuTileCaptionText} numberOfLines={1}>{imageName}</Text>
                    </View>
                  </PreviewImage>
                )
              })}
            </View>
          ) : null}
        </View>

        {/* Profile image */}
        <View style={{ gap: 8 }}>
          <FieldLabel style={styles.labelMedium}>{w("Restaurant profile image")}</FieldLabel>
          <View style={styles.profileRow}>
            <View>
              <View style={styles.profileCircle}>
                {step2.profileImage && getPreviewImageUrl(step2.profileImage) ? (
                  <AppImage src={getPreviewImageUrl(step2.profileImage)} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Restaurant profile" />
                ) : (
                  <ImageIcon size={24} color={colors.gray[500]} />
                )}
              </View>
              {step2.profileImage ? (
                <RemoveImageButton onPress={() => handleRemoveProfileImage()} style={{ top: -4, right: -4 }} />
              ) : null}
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <View>
                <Text style={styles.dropZoneTitle}>Upload profile image</Text>
                <Text style={styles.hintNoMargin}>{w("This will be shown on your listing card and restaurant page.")}</Text>
              </View>
            </View>
          </View>
          <UploadButton
            onPress={() =>
              openImageSourcePicker({
                title: "Upload profile image",
                fileNamePrefix: "profile-image",
                onSelectFile: handleProfileImageSelected,
              })
            }
          />
        </View>
      </View>

      {/* Operational details */}
      <View style={[styles.section, { gap: 20 }]}>
        {/* Cuisines - customers search and filter by these, dining pages show them */}
        <View>
          <FieldLabel>{`Cuisines you serve (up to ${MAX_RESTAURANT_CUISINES})*`}</FieldLabel>
          <View style={styles.chipWrap}>
            {RESTAURANT_CUISINES.map((cuisine) => {
              const active = (step2.cuisines || []).includes(cuisine)
              return (
                <Pressable
                  key={cuisine}
                  onPress={() => {
                    setStep2((prev) => {
                      const list = Array.isArray(prev.cuisines) ? prev.cuisines : []
                      if (list.includes(cuisine)) return { ...prev, cuisines: list.filter((c) => c !== cuisine) }
                      if (list.length >= MAX_RESTAURANT_CUISINES) return prev
                      return { ...prev, cuisines: [...list, cuisine] }
                    })
                  }}
                  // bg-black button -> restaurant primary (restaurantTheme.css)
                  style={[styles.chip, active ? { backgroundColor: PRIMARY, borderColor: PRIMARY } : { backgroundColor: colors.gray[100], borderColor: "transparent" }]}
                >
                  <Text style={[styles.pillText, { color: active ? colors.white : colors.gray[800] }]}>{cuisine}</Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={styles.hint}>{`${(step2.cuisines || []).length} of ${MAX_RESTAURANT_CUISINES} selected`}</Text>
        </View>

        {/* Timings */}
        <View style={{ gap: 12 }}>
          <FieldLabel>Outlet timings</FieldLabel>
          <View style={{ gap: 16 }}>
            <TimeSelector
              label="Opening time"
              value={step2.openingTime || ""}
              onValueChange={(val) => {
                const nextOpening = normalizeTimeValue(val) || ""
                setStep2((prev) => ({ ...prev, openingTime: nextOpening }))
              }}
            />
            <TimeSelector
              label="Closing time"
              value={step2.closingTime || ""}
              onValueChange={(val) => {
                const nextClosing = normalizeTimeValue(val) || ""
                setStep2((prev) => ({ ...prev, closingTime: nextClosing }))
              }}
            />
          </View>
          <View>
            <FieldLabel>Estimated delivery time*</FieldLabel>
            <OInput
              value={step2.estimatedDeliveryTime || ""}
              onChangeText={(text) => setStep2((prev) => ({ ...prev, estimatedDeliveryTime: text }))}
              style={styles.mt1}
              placeholder="e.g., 25-30 mins"
            />
          </View>
        </View>

        {/* Open days in a calendar-like grid */}
        <View style={{ gap: 8 }}>
          <View style={styles.labelRow}>
            <CalendarIcon size={14} color={colors.gray[800]} />
            <FieldLabel>Open days</FieldLabel>
          </View>
          <Text style={styles.hintNoMargin}>{w("Select the days your restaurant accepts delivery orders.")}</Text>
          <View style={styles.daysRow}>
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day)
              return (
                <Pressable key={day} onPress={() => toggleDay(day)} style={({ pressed }) => [styles.dayCell, pressed && { opacity: 0.85 }]}>
                  {active ? (
                    <LinearGradient colors={[RED, RED_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dayInner}>
                      <Text style={[styles.dayText, { color: colors.white }]}>{day.charAt(0)}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.dayInner, { backgroundColor: colors.gray[100] }]}>
                      <Text style={[styles.dayText, { color: colors.gray[800] }]}>{day.charAt(0)}</Text>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>

      {/* Takeaway Service Toggle — not offered to My Store partners */}
      {!isStore ? (
        <View style={styles.section}>
          <View style={styles.takeawayRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.labelRow}>
                <ShoppingBag size={16} color={colors.green[600]} />
                <Text style={styles.takeawayTitle}>Takeaway (Pickup) order</Text>
              </View>
              <Text style={[styles.hintNoMargin, { lineHeight: 18 }]}>
                {w("Enable this to allow customers to pick up orders themselves from your restaurant.")}
              </Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: step2.isTakeawayEnabled }}
              onPress={() => setStep2((prev) => ({ ...prev, isTakeawayEnabled: !prev.isTakeawayEnabled }))}
              style={[styles.switchTrack, { backgroundColor: step2.isTakeawayEnabled ? colors.green[600] : colors.gray[200] }]}
            >
              <View style={[styles.switchThumb, { transform: [{ translateX: step2.isTakeawayEnabled ? 20 : 0 }] }]} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )

  const renderDocPreview = (value, alt, onRemove) =>
    value ? (
      <PreviewImage uri={getPreviewImageUrl(value)} style={styles.docPreview} label={alt}>
        <RemoveImageButton onPress={onRemove} style={{ top: 8, right: 8 }} />
      </PreviewImage>
    ) : null

  const renderStep3 = () => (
    <View style={styles.stepStack}>
      <View style={[styles.section, { gap: 16 }]}>
        <Text style={styles.h2}>PAN details</Text>
        <View style={{ gap: 16 }}>
          <View>
            <FieldLabel>PAN number</FieldLabel>
            <OInput
              value={step3.panNumber || ""}
              onChangeText={(text) => setStep3({ ...step3, panNumber: normalizePAN(text) })}
              style={styles.mt1}
              placeholder="ABCDE1234F"
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>
          <View>
            <FieldLabel>PAN Card Holder Name</FieldLabel>
            <OInput
              value={step3.nameOnPan || ""}
              onChangeText={(text) =>
                setStep3({
                  ...step3,
                  nameOnPan: formatNameToCapital(text.replace(/[^A-Za-z ]/g, "")),
                })
              }
              style={styles.mt1}
              autoCapitalize="words"
            />
          </View>
        </View>
        <View>
          <FieldLabel>PAN image</FieldLabel>
          <UploadButton
            style={{ marginTop: 8 }}
            onPress={() =>
              openImageSourcePicker({
                title: "Upload PAN image",
                fileNamePrefix: "pan-image",
                onSelectFile: handlePanImageSelected,
              })
            }
          />
          {renderDocPreview(step3.panImage, "PAN document", () => setStep3((prev) => ({ ...prev, panImage: null })))}
        </View>
      </View>

      <View style={[styles.section, { gap: 16 }]}>
        <Text style={styles.h2}>GST details</Text>
        <View style={styles.gstRow}>
          <Text style={styles.bodySm}>GST registered?</Text>
          <Pill
            active={Boolean(step3.gstRegistered)}
            onPress={() => setStep3({ ...step3, gstRegistered: true })}
            label="Yes"
            inactiveStyle={{ backgroundColor: colors.gray[100] }}
          />
          <Pill
            active={!step3.gstRegistered}
            onPress={() => setStep3({ ...step3, gstRegistered: false })}
            label="No"
            inactiveStyle={{ backgroundColor: colors.gray[100] }}
          />
        </View>
        {step3.gstRegistered ? (
          <View style={{ gap: 12 }}>
            <OInput
              value={step3.gstNumber || ""}
              onChangeText={(text) => setStep3({ ...step3, gstNumber: normalizeGST(text) })}
              placeholder="GST number (15 characters)"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <OInput
              value={step3.gstLegalName || ""}
              onChangeText={(text) =>
                setStep3({
                  ...step3,
                  gstLegalName: formatNameToCapital(text.replace(/[^A-Za-z ]/g, "")),
                })
              }
              placeholder="Legal name"
              autoCapitalize="words"
            />
            <OInput
              value={step3.gstAddress || ""}
              onChangeText={(text) => setStep3({ ...step3, gstAddress: text })}
              placeholder="Registered address"
            />
            <UploadButton
              onPress={() =>
                openImageSourcePicker({
                  title: "Upload GST image",
                  fileNamePrefix: "gst-image",
                  onSelectFile: handleGstImageSelected,
                })
              }
            />
            {renderDocPreview(step3.gstImage, "GST document", () => setStep3((prev) => ({ ...prev, gstImage: null })))}
          </View>
        ) : null}
      </View>

      <View style={[styles.section, { gap: 16 }]}>
        <Text style={styles.h2}>FSSAI details</Text>
        <View style={{ gap: 16 }}>
          <OInput
            value={step3.fssaiNumber || ""}
            onChangeText={(text) => setStep3({ ...step3, fssaiNumber: text.replace(/\D/g, "").slice(0, 14) })}
            inputMode="numeric"
            placeholder="FSSAI number (14 digits)"
          />
          <View>
            <FieldLabel style={{ marginBottom: 4 }}>FSSAI expiry date</FieldLabel>
            <Pressable
              onPress={openFssaiCalendar}
              accessibilityRole="button"
              style={({ pressed }) => [styles.dateBtn, pressed && { backgroundColor: colors.gray[50] }]}
            >
              <Text style={[styles.dateBtnText, { color: step3.fssaiExpiry ? colors.gray[900] : colors.gray[500] }]}>
                {step3.fssaiExpiry ? formatExpiryLabel(parseLocalYMDDate(step3.fssaiExpiry)) : "Select expiry date"}
              </Text>
              <CalendarIcon size={16} color={colors.gray[500]} />
            </Pressable>
            {Platform.OS !== "android" ? (
              <Sheet open={iosFssaiOpen} onClose={() => setIosFssaiOpen(false)} style={styles.iosSheet}>
                <DateTimePicker
                  value={parseLocalYMDDate(step3.fssaiExpiry) || new Date()}
                  mode="date"
                  display="inline"
                  minimumDate={parseLocalYMDDate(getTodayLocalYMD())}
                  onValueChange={(_event, date) => {
                    if (date && formatDateToLocalYMD(date) >= getTodayLocalYMD()) {
                      setStep3((prev) => ({ ...prev, fssaiExpiry: formatDateToLocalYMD(date) }))
                      setIosFssaiOpen(false)
                    }
                  }}
                  onDismiss={() => setIosFssaiOpen(false)}
                />
              </Sheet>
            ) : null}
          </View>
        </View>
        <UploadButton
          onPress={() =>
            openImageSourcePicker({
              title: "Upload FSSAI image",
              fileNamePrefix: "fssai-image",
              onSelectFile: handleFssaiImageSelected,
            })
          }
        />
        {renderDocPreview(step3.fssaiImage, "FSSAI document", () => setStep3((prev) => ({ ...prev, fssaiImage: null })))}
      </View>

      <View style={[styles.section, { gap: 16 }]}>
        <Text style={styles.h2}>Bank account details</Text>
        <View style={{ gap: 16 }}>
          <OInput
            value={step3.accountNumber || ""}
            onChangeText={(text) => setStep3({ ...step3, accountNumber: normalizeBankAcc(text) })}
            inputMode="numeric"
            placeholder="Account number"
          />
          <OInput
            value={step3.confirmAccountNumber || ""}
            onChangeText={(text) => setStep3({ ...step3, confirmAccountNumber: normalizeBankAcc(text) })}
            inputMode="numeric"
            placeholder="Re-enter account number"
          />
        </View>
        <View style={{ gap: 16 }}>
          <OInput
            value={step3.ifscCode || ""}
            onChangeText={(text) => setStep3({ ...step3, ifscCode: normalizeIFSC(text) })}
            placeholder="IFSC code"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Select
            value={step3.accountType || ""}
            onValueChange={(value) => setStep3((prev) => ({ ...prev, accountType: value }))}
          >
            <SelectTrigger style={styles.selectTrigger} textStyle={{ fontSize: 14 }}>
              <SelectValue placeholder="Select account type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Saving">Saving</SelectItem>
              <SelectItem value="Current">Current</SelectItem>
            </SelectContent>
          </Select>
        </View>
        <OInput
          value={step3.accountHolderName || ""}
          onChangeText={(text) =>
            setStep3({
              ...step3,
              accountHolderName: formatNameToCapital(text.replace(/[^A-Za-z ]/g, "")),
            })
          }
          placeholder="Account holder name"
          autoCapitalize="words"
        />
      </View>
    </View>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    return renderStep3()
  }

  if (loading) {
    return (
      <Screen bg={colors.gray[100]}>
        <OnboardingSkeleton />
      </Screen>
    )
  }

  return (
    <Screen bg={colors.gray[100]} edges={["bottom"]}>
      <StatusBarSpacer color={colors.white} />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {step === 1 ? (
            <Pressable
              onPress={requestExit}
              accessibilityLabel="Close onboarding"
              style={({ pressed }) => [styles.roundBtn, pressed && { transform: [{ scale: 0.9 }], backgroundColor: colors.gray[100] }]}
            >
              <X size={18} color={colors.gray[700]} strokeWidth={2.5} />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleBack}
              accessibilityLabel="Go back"
              style={({ pressed }) => [styles.roundBtn, pressed && { transform: [{ scale: 0.9 }], backgroundColor: colors.gray[100] }]}
            >
              <ArrowLeft size={18} color={colors.gray[700]} strokeWidth={2.5} />
            </Pressable>
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>{w("Restaurant onboarding")}</Text>
        </View>
        <View style={styles.headerRight}>
          {!isEditing ? (
            <Pressable onPress={() => setIsEditing(true)} accessibilityLabel="Edit Details" style={styles.editBtn}>
              <Sparkles size={12} color={colors.blue[700]} />
              <Text style={styles.editBtnText}>Edit Details</Text>
            </Pressable>
          ) : null}
          <Text style={styles.stepText}>{`STEP ${step} OF 3`}</Text>
          <Pressable
            onPress={handleLogout}
            disabled={isLoggingOut}
            accessibilityLabel="Logout"
            style={({ pressed }) => [styles.logoutBtn, isLoggingOut && { opacity: 0.5 }, pressed && { backgroundColor: colors.red[50] }]}
          >
            <LogOut size={16} color={RED} />
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.main}
        extraOffset={32}
        showsVerticalScrollIndicator={false}
      >
        <View pointerEvents={!isEditing ? "none" : "auto"}>{renderStep()}</View>
      </KeyboardAwareScrollView>

      <ImageSourcePicker
        isOpen={sourcePicker.isOpen}
        onClose={closeImageSourcePicker}
        onFileSelect={sourcePicker.onSelectFile}
        title={sourcePicker.title}
        fileNamePrefix={sourcePicker.fileNamePrefix}
        galleryInputRef={sourcePicker.fallbackInputRef}
        multiple={Boolean(sourcePicker.multiple)}
      />

      <OnboardingExitModal
        open={showExitModal}
        onStay={handleStay}
        onExit={handleExit}
        theme="restaurant"
      />

      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!keyboardInset ? (
        <View style={styles.footer}>
          <View style={[styles.footerRow, step > 1 && { gap: 12 }]}>
            {step > 1 ? (
              <FooterButton onPress={handleBack} disabled={saving} label="Back" style={{ flex: 1 }} />
            ) : null}
            <FooterButton
              onPress={handleNext}
              disabled={saving || (step === 3 && !isEditing)}
              dim={step === 3 && !isEditing}
              label={step === 3 ? (saving ? "Saving..." : "Finish") : saving ? "Saving..." : "Continue"}
              style={step === 1 ? { width: "100%" } : { flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  )
}

const INPUT_BORDER = "#f2f0ea" // shadcn border-input

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e6e0d1",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: alpha(colors.gray[200], 0.8),
    ...shadow.sm,
  },
  headerTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.black, flexShrink: 1 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue[300],
    backgroundColor: colors.blue[50],
  },
  editBtnText: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.blue[700] },
  stepText: { fontSize: 10, lineHeight: 14, fontWeight: "700", letterSpacing: 0.5, color: colors.gray[500], textAlign: "right" },
  logoutBtn: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  main: { paddingHorizontal: 16, paddingVertical: 16 },
  stepStack: { gap: 24 },
  section: { backgroundColor: colors.white, padding: 16, borderRadius: 8 },
  h2: { fontSize: 18, lineHeight: 28, fontWeight: "600", color: colors.black },
  sectionNote: { fontSize: 14, lineHeight: 20, color: colors.gray[600], marginBottom: 16 },
  noteXs: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  bodySm: { fontSize: 14, lineHeight: 20, color: colors.gray[700] },
  label: { fontSize: 12, lineHeight: 14, fontWeight: "500", color: colors.gray[700] },
  labelMedium: { fontWeight: "500" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  hint: { fontSize: 11, lineHeight: 16, color: colors.gray[500], marginTop: 4 },
  hintNoMargin: { fontSize: 11, lineHeight: 16, color: colors.gray[500] },
  mt1: { marginTop: 4 },
  input: { backgroundColor: colors.white, fontSize: 14, borderColor: INPUT_BORDER },
  inputFocused: { borderColor: restaurantTheme.focusBorder },
  selectTrigger: { alignSelf: "stretch", width: "100%", backgroundColor: colors.white },
  pillRow: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  pillShell: { borderRadius: 9999 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  pillOutline: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200] },
  pillText: { fontSize: 12, lineHeight: 16 },
  searchWrap: { justifyContent: "center" },
  searchSpinner: { position: "absolute", right: 12, top: 4, bottom: 0, justifyContent: "center" },
  spinner: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  dropdown: {
    marginTop: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 16,
    padding: 4,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  pacItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    marginBottom: 2,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  lastItem: { borderBottomWidth: 0, marginBottom: 0 },
  itemPressed: { backgroundColor: "#FEF2F2" },
  pacText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  pacQuery: { fontSize: 14, fontWeight: "600", color: colors.gray[900] },
  pacSecondary: { fontSize: 14, color: colors.gray[600] },
  suggestionText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.gray[800] },
  zoneBox: { marginTop: 4, width: "100%", minHeight: 36, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  zoneText: { fontSize: 14, lineHeight: 20 },
  dropZone: {
    marginTop: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.gray[300],
    borderRadius: 8,
    backgroundColor: alpha(colors.gray[50], 0.7),
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    gap: 12,
  },
  dropZoneHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  dropZoneIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  dropZoneTitle: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.gray[900] },
  uploadBtn: {
    width: "100%",
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: INPUT_BORDER,
    backgroundColor: colors.white,
    ...shadow.xs,
  },
  uploadBtnText: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: "#270e01" },
  menuGrid: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 12 },
  menuTile: { width: "47%", aspectRatio: 4 / 5 },
  menuTileCaption: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: alpha(colors.black, 0.6), paddingHorizontal: 8, paddingVertical: 4 },
  menuTileCaptionText: { fontSize: 10, lineHeight: 14, color: colors.white },
  previewBox: { borderRadius: 8, overflow: "hidden", backgroundColor: colors.gray[100] },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  previewEmptyText: { fontSize: 12, lineHeight: 16, color: colors.gray[500], textAlign: "center" },
  docPreview: { marginTop: 12, width: "100%", aspectRatio: 4 / 3 },
  removeBtn: { position: "absolute", zIndex: 30, borderRadius: 9999, ...shadow.md },
  removeBtnInner: { padding: 4, borderRadius: 9999 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  profileCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.gray[100],
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  chipWrap: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, borderWidth: 1 },
  timeBox: { borderWidth: 1, borderColor: colors.gray[200], borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: alpha(colors.gray[50], 0.6) },
  timeHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  timeLabel: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.gray[900] },
  timeField: { height: 36, borderRadius: 4, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white, paddingHorizontal: 12, justifyContent: "center" },
  timeFieldText: { fontSize: 12, lineHeight: 16, color: colors.gray[900] },
  daysRow: { marginTop: 4, flexDirection: "row", gap: 6 },
  dayCell: { flex: 1, aspectRatio: 1 },
  dayInner: { flex: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 11, lineHeight: 14, fontWeight: "500" },
  takeawayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  takeawayTitle: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.gray[900] },
  switchTrack: { width: 44, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "transparent", justifyContent: "center" },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white, ...shadow.DEFAULT },
  gstRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  dateBtn: {
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 8,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateBtnText: { fontSize: 14, lineHeight: 20 },
  iosSheet: { padding: 16, paddingBottom: 24 },
  iosDone: { marginTop: 8, height: 44, borderRadius: 8, backgroundColor: PRIMARY, alignItems: "center", justifyContent: "center" },
  iosDoneText: { fontSize: 15, fontWeight: "600", color: colors.white },
  errorBar: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4, backgroundColor: colors.gray[100] },
  errorText: { fontSize: 12, lineHeight: 16, color: RED },
  footer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.slate[100] },
  footerRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  footerBtnShell: {
    borderRadius: 8,
    elevation: 4,
    shadowColor: RED,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  footerBtn: { height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  footerBtnText: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.white },
})
