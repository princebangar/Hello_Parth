// Web: pages/restaurant/Inventory.jsx — the Inventory tab (/inventory and /menu): the restaurant navbar, "All items" /
// "Add ons" tabs (tap or swipe the content sideways), the search + filter card with filter chips, menu categories as
// accordions (category / item in-stock switches, Recommended counts, approval badges, Edit / Fix -> item page), the
// add-on form and list, the Filters sheet, the "Mark ... out of stock" sheet (for specific hours, next business day,
// custom date & time with a calendar and a time wheel, manual) with the local stock rules + 15 s auto re-enable, and
// the floating "+ Add item" / "Menu" (jump to category) buttons. Same API calls, texts, local storage keys and rules.
// Native (kept-alive tab, see CONVERSION_GUIDE section 7):
// - RestaurantTabKeepAlive renders this screen once; useRestaurantTabActive() says whether it is the one on screen.
//   The stock-rule interval runs, popups show and the status bar is set only while it is active; what the web loaded
//   on mount (restaurant profile, menu, add-ons on the Add ons tab) is loaded again each time it becomes active (old
//   data stays on screen meanwhile). The bottom bar is drawn by the layout: the content ends with
//   useRestaurantNavSpace() room (or the web's pb-32, whichever is larger). Prince (27 Oct): the last item's switch hid
//   behind the floating "+ Add item" / "Menu" pair, so on the items tab the content ends above that pair instead.
// - Main scroll = KeyboardAwareScrollView (the add-on form fields stay above the keyboard), pull-to-refresh reloads
//   what opening the screen loads, useTabScrollTop starts it at the top after another tab was shown.
// - Filters / out-of-stock popups are Sheets, the calendar and the time wheel are Dialogs (native Modals).
// - The web's mouse-drag swipe (desktop) is not needed; the touch swipe is kept (filter chips do not flip the tab).
// - "Jump to category" scrolls the list to the card (measured with onLayout) instead of scrollIntoView.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Minus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  Utensils,
  X,
} from "lucide-react-native"
import RestaurantNavbar from "@food/components/restaurant/RestaurantNavbar"
import { useRestaurantNavSpace } from "@food/components/restaurant/BottomNavOrders"
import { useRestaurantTabActive } from "@food/components/restaurant/restaurantTabPages"
import { Switch } from "@food/components/ui/switch"
import { useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { AppImage, Dialog, KeyboardAwareScrollView, Sheet, Text, TextInput } from "@/native/ui"
import { StatusBar } from "@/native/ui/SectionStatusBar"
import { useTabScrollTop, useTabShown } from "@/native/ui/tabShown"
import { alpha, colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import { restaurantAPI, uploadAPI } from "@food/api"
import { openGallery } from "@food/utils/imageUploadUtils"
import dishFallbackImage from "@food/assets/dish_fallback.webp"
const debugWarn = () => {}
const debugError = () => {}

const INVENTORY_STORAGE_KEY = "restaurant_inventory_state"
const INVENTORY_RECOMMENDED_KEY = "restaurant_inventory_recommended_map"
const INVENTORY_ACTIVE_TAB_KEY = "restaurant_inventory_active_tab"
const INVENTORY_ADDON_FORM_KEY = "restaurant_inventory_addon_form"
const INVENTORY_STOCK_RULES_KEY = "restaurant_inventory_stock_rules_v1"

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]
const BRAND_COLOR = restaurantTheme.brand
const STRONG = restaurantTheme.primaryStrong // text-green-700 / emerald-700 / amber-700 in the restaurant theme
const PAGE_BG = "#f3f5f8"

const MENU_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "in-stock", label: "In stock" },
  { value: "out-of-stock", label: "Out of stock" },
  { value: "recommended", label: "Recommended" },
  { value: "veg", label: "Veg" },
  { value: "non-veg", label: "Non-veg" },
]

const ADDON_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
]

// web: the approval badge classes with "bg-" turned into "bg-white border-" (white pill, coloured border + text)
const getApprovalDisplayMeta = (approvalStatus) => {
  const normalizedStatus = String(approvalStatus || "approved").toLowerCase()

  if (normalizedStatus === "rejected") {
    return { label: "Rejected", border: colors.red[200], text: colors.red[700] }
  }

  if (normalizedStatus === "pending") {
    return { label: "Pending", border: colors.amber[200], text: STRONG }
  }

  return { label: "Approved", border: colors.emerald[200], text: STRONG }
}

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : fallback
    return parsed && typeof parsed === "object" ? parsed : fallback
  } catch {
    return fallback
  }
}

const normalizeDayName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")

const parseRestaurantTimeToParts = (value) => {
  const raw = String(value || "").trim()
  if (!raw) return { hours: 9, minutes: 0 }

  const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmmMatch) {
    return {
      hours: Math.max(0, Math.min(23, Number(hhmmMatch[1]))),
      minutes: Math.max(0, Math.min(59, Number(hhmmMatch[2]))),
    }
  }

  const meridiemMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1])
    const minutes = Number(meridiemMatch[2] || 0)
    const period = meridiemMatch[3].toLowerCase()
    if (period === "pm" && hours !== 12) hours += 12
    if (period === "am" && hours === 12) hours = 0
    return {
      hours: Math.max(0, Math.min(23, hours)),
      minutes: Math.max(0, Math.min(59, minutes)),
    }
  }

  return { hours: 9, minutes: 0 }
}

const buildSpecificTimeResumeAt = (hours) => {
  const totalHours = Math.max(1, Number(hours) || 1)
  const date = new Date()
  date.setHours(date.getHours() + totalHours)
  return date.toISOString()
}

const buildCustomResumeAt = (selectedDate, selectedTime) => {
  if (!selectedDate || !selectedTime) return null

  const date = new Date(selectedDate)
  if (Number.isNaN(date.getTime())) return null

  let hours = Number(selectedTime.hour || 0)
  const minutes = Number(selectedTime.minute || 0)
  const period = String(selectedTime.period || "am").toLowerCase()

  if (period === "pm" && hours !== 12) hours += 12
  if (period === "am" && hours === 12) hours = 0

  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

const buildNextBusinessDayResumeAt = (restaurantProfile) => {
  const now = new Date()
  const openDays = Array.isArray(restaurantProfile?.openDays)
    ? restaurantProfile.openDays.map(normalizeDayName).filter(Boolean)
    : []
  const openingTime = parseRestaurantTimeToParts(restaurantProfile?.openingTime || "09:00")

  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + offset)
    const dayName = normalizeDayName(candidate.toLocaleDateString("en-US", { weekday: "long" }))

    if (openDays.length > 0 && !openDays.includes(dayName)) continue

    candidate.setHours(openingTime.hours, openingTime.minutes, 0, 0)
    return candidate.toISOString()
  }

  const fallback = new Date(now)
  fallback.setDate(now.getDate() + 1)
  fallback.setHours(openingTime.hours, openingTime.minutes, 0, 0)
  return fallback.toISOString()
}

const buildStockRule = ({ selectedOption, hours, selectedDate, selectedTime, restaurantProfile }) => {
  const createdAt = new Date().toISOString()

  if (selectedOption === "manual") {
    return { mode: "manual", createdAt, resumeAt: null }
  }

  if (selectedOption === "next-business-day") {
    return {
      mode: "next-business-day",
      createdAt,
      resumeAt: buildNextBusinessDayResumeAt(restaurantProfile),
    }
  }

  if (selectedOption === "custom-date-time") {
    const resumeAt = buildCustomResumeAt(selectedDate, selectedTime)
    return { mode: "custom-date-time", createdAt, resumeAt }
  }

  return {
    mode: "specific-time",
    createdAt,
    durationHours: Math.max(1, Number(hours) || 1),
    resumeAt: buildSpecificTimeResumeAt(hours),
  }
}

const getRuleStatusLabel = (rule) => {
  if (!rule) return "No time set. Turn item in stock manually."
  if (rule.mode === "manual") {
    return "Manual off. Turn item in stock manually."
  }

  const resumeAt = new Date(rule.resumeAt || "")
  if (Number.isNaN(resumeAt.getTime())) {
    return "Out of stock"
  }

  const formatted = resumeAt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  if (rule.mode === "specific-time") return `Out of stock until ${formatted}`
  if (rule.mode === "next-business-day") return `Back next business day at ${formatted}`
  if (rule.mode === "custom-date-time") return `Out of stock until ${formatted}`
  return "Out of stock"
}

function Gradient({ style, round }) {
  return (
    <LinearGradient
      colors={BRAND}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, round != null && { borderRadius: round }, style]}
    />
  )
}

/** <input> / <textarea> with the restaurant theme's focus border */
function Field({ style, focusStyle, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      placeholderTextColor={colors.slate[400]}
      {...props}
      onFocus={(e) => {
        setFocused(true)
        props.onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        props.onBlur?.(e)
      }}
      style={[style, focused && (focusStyle || { borderColor: restaurantTheme.focusBorder })]}
    />
  )
}

function Radio({ checked }) {
  return (
    <View style={[s.radio, checked && { borderColor: BRAND_COLOR }]}>
      {checked ? <View style={s.radioDot} /> : null}
    </View>
  )
}

// web: framer-motion entrance fade. App: shown at once (Prince, 27 Oct: the fade read as a blink on every open)
function FadeIn({ children, style }) {
  return <View style={style}>{children}</View>
}

function PulseDot({ style }) {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [v])
  return <Animated.View style={[style, { opacity: v }]} />
}

// ------------------------------------------------------------------ Time Picker Wheel (web: copied from DaySlots.jsx)
const WHEEL_ITEM = 40
const WHEEL_HEIGHT = 192 // h-48
const WHEEL_PAD = (WHEEL_HEIGHT - WHEEL_ITEM) / 2

function WheelColumn({ values, selected, onSelect, format = (v) => String(v) }) {
  const ref = useRef(null)
  const startIndex = Math.max(0, values.indexOf(selected))
  const indexAt = (y) => Math.max(0, Math.min(values.length - 1, Math.round(y / WHEEL_ITEM)))

  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollTo({ y: startIndex * WHEEL_ITEM, animated: false }), 50)
    return () => clearTimeout(t)
    // only when the wheel opens (the column is built per opening)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const settle = (e) => {
    const value = values[indexAt(e.nativeEvent.contentOffset.y)]
    if (value !== undefined) onSelect(value)
  }

  return (
    <ScrollView
      ref={ref}
      style={{ height: WHEEL_HEIGHT, width: "100%" }}
      contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
      contentOffset={{ x: 0, y: startIndex * WHEEL_ITEM }}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={16}
      onScroll={(e) => {
        const value = values[indexAt(e.nativeEvent.contentOffset.y)]
        if (value !== undefined && value !== selected) onSelect(value)
      }}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
    >
      {values.map((value) => (
        <View key={String(value)} style={s.wheelItem}>
          <Text style={selected === value ? s.wheelItemOn : s.wheelItemOff}>{format(value)}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

const WHEEL_HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const WHEEL_MINUTES = Array.from({ length: 60 }, (_, i) => i)
const WHEEL_PERIODS = ["am", "pm"]

function TimePickerWheel({ isOpen, onClose, initialHour, initialMinute, initialPeriod, onConfirm }) {
  const parsedHour = Math.max(1, Math.min(12, parseInt(initialHour) || 1))
  const parsedMinute = Math.max(0, Math.min(59, parseInt(initialMinute) || 0))
  const parsedPeriod = initialPeriod === "am" || initialPeriod === "pm" ? initialPeriod : "am"

  const [selectedHour, setSelectedHour] = useState(parsedHour)
  const [selectedMinute, setSelectedMinute] = useState(parsedMinute)
  const [selectedPeriod, setSelectedPeriod] = useState(parsedPeriod)

  useEffect(() => {
    if (isOpen) {
      setSelectedHour(parsedHour)
      setSelectedMinute(parsedMinute)
      setSelectedPeriod(parsedPeriod)
    }
  }, [isOpen, parsedHour, parsedMinute, parsedPeriod])

  const handleConfirm = () => {
    const hourStr = selectedHour.toString()
    const minuteStr = selectedMinute.toString().padStart(2, "0")
    onConfirm(hourStr, minuteStr, selectedPeriod)
    onClose()
  }

  return (
    <Dialog open={isOpen} onClose={onClose} style={s.wheelCard}>
      {isOpen ? (
        <View style={s.wheelBody}>
          <View style={s.wheelCol}>
            <WheelColumn values={WHEEL_HOURS} selected={selectedHour} onSelect={setSelectedHour} />
          </View>
          <View style={s.wheelColon}>
            <Text style={s.wheelColonText}>:</Text>
          </View>
          <View style={s.wheelCol}>
            <WheelColumn
              values={WHEEL_MINUTES}
              selected={selectedMinute}
              onSelect={setSelectedMinute}
              format={(m) => m.toString().padStart(2, "0")}
            />
          </View>
          <View style={s.wheelCol}>
            <WheelColumn values={WHEEL_PERIODS} selected={selectedPeriod} onSelect={setSelectedPeriod} />
          </View>
          <View pointerEvents="none" style={s.wheelLines}>
            <View style={s.wheelLine} />
            <View style={[s.wheelLine, { marginTop: WHEEL_ITEM - 1 }]} />
          </View>
        </View>
      ) : null}
      <View style={s.wheelFooter}>
        <Pressable onPress={handleConfirm} hitSlop={8}>
          <Text style={s.wheelOkay}>Okay</Text>
        </Pressable>
      </View>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Simple Calendar
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function SimpleCalendar({ selectedDate, onDateSelect, isOpen, onClose }) {
  const [currentMonth, setCurrentMonth] = useState(() => (selectedDate ? new Date(selectedDate) : new Date()))

  useEffect(() => {
    if (selectedDate) {
      setCurrentMonth(new Date(selectedDate))
    }
  }, [selectedDate])

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - startDate.getDay() + (startDate.getDay() === 0 ? -6 : 1))

    const days = []
    const currentDate = new Date(startDate)

    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return days
  }, [currentMonth])

  const isCurrentMonth = (date) => date.getMonth() === currentMonth.getMonth()
  const isSelected = (date) => (selectedDate ? date.toDateString() === new Date(selectedDate).toDateString() : false)
  const isToday = (date) => date.toDateString() === new Date().toDateString()

  const weeks = []
  for (let i = 0; i < calendarDays.length; i += 7) weeks.push(calendarDays.slice(i, i + 7))

  return (
    <Dialog open={isOpen} onClose={onClose} style={s.calendarCard}>
      <View style={{ padding: sp(4) }}>
        <View style={s.calendarHead}>
          <Pressable
            onPress={() => {
              const prevMonth = new Date(currentMonth)
              prevMonth.setMonth(prevMonth.getMonth() - 1)
              setCurrentMonth(prevMonth)
            }}
            style={s.calendarNav}
          >
            <ChevronLeft size={20} color={restaurantTheme.text} />
          </Pressable>
          <Text style={s.calendarTitle}>{`${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`}</Text>
          <Pressable
            onPress={() => {
              const nextMonth = new Date(currentMonth)
              nextMonth.setMonth(nextMonth.getMonth() + 1)
              setCurrentMonth(nextMonth)
            }}
            style={s.calendarNav}
          >
            <ChevronRight size={20} color={restaurantTheme.text} />
          </Pressable>
        </View>

        <View style={[s.calendarRow, { marginBottom: sp(2) }]}>
          {DAY_NAMES.map((day) => (
            <View key={day} style={s.calendarCell}>
              <Text style={s.calendarDayName}>{day}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 4 }}>
          {weeks.map((week, w) => (
            <View key={w} style={s.calendarRow}>
              {week.map((date, index) => {
                const isCurrent = isCurrentMonth(date)
                const isSelectedDate = isSelected(date)
                const isTodayDate = isToday(date)
                const selectedStyle = isCurrent && isSelectedDate
                const todayStyle = isCurrent && !isSelectedDate && isTodayDate
                return (
                  <Pressable
                    key={index}
                    onPress={() => {
                      onDateSelect(new Date(date))
                      onClose()
                    }}
                    style={[s.calendarDay, todayStyle && { backgroundColor: "#f9f0f7" }]}
                  >
                    {selectedStyle ? <Gradient round={radius.DEFAULT} /> : null}
                    <Text
                      style={[
                        s.calendarDayText,
                        !isCurrent
                          ? { color: colors.gray[300] }
                          : selectedStyle
                            ? { color: colors.white }
                            : todayStyle
                              ? { color: BRAND_COLOR, fontWeight: "600" }
                              : { color: colors.gray[700] },
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
      </View>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Inventory
export default function Inventory() {
  const navigate = useNavigate()
  const tabActive = useRestaurantTabActive()
  const tabShown = useTabShown()
  const navSpace = useRestaurantNavSpace()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const scrollRef = useRef(null)
  useTabScrollTop(scrollRef)

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = localStorage.getItem(INVENTORY_ACTIVE_TAB_KEY)
      return saved || "all-items"
    } catch {
      return "all-items"
    }
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState("all")
  const [isLoading, setIsLoading] = useState(false)
  const [loadingInventory, setLoadingInventory] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [categories, setCategories] = useState(() => {
    try {
      const saved = localStorage.getItem(INVENTORY_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    } catch (error) {
      debugError("Error loading inventory from storage:", error)
    }
    return []
  })
  const [expandedCategories, setExpandedCategories] = useState([])
  const [togglePopupOpen, setTogglePopupOpen] = useState(false)
  const [toggleTarget, setToggleTarget] = useState(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // Toggle popup state
  const [selectedOption, setSelectedOption] = useState("specific-time")
  const [hours, setHours] = useState(3)
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState({ hour: "2", minute: "30", period: "pm" })
  const [showCalendar, setShowCalendar] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [restaurantProfile, setRestaurantProfile] = useState(null)
  const [stockRules, setStockRules] = useState(() => readJson(INVENTORY_STOCK_RULES_KEY, {}))
  const stockRulesRef = useRef(stockRules)
  stockRulesRef.current = stockRules

  // where each category card sits in the scroll content (scrollIntoView)
  const contentYRef = useRef(0)
  const listYRef = useRef(0)
  const categoryYRef = useRef({})

  // Swipe gesture refs
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const touchStartY = useRef(0)
  const isSwiping = useRef(false)
  const noSwipeTouchRef = useRef(false)
  const gestureIgnored = useRef(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [addons, setAddons] = useState([])
  const [loadingAddons, setLoadingAddons] = useState(false)
  const [isAddAddonOpen, setIsAddAddonOpen] = useState(false)
  const [addonName, setAddonName] = useState("")
  const [addonDescription, setAddonDescription] = useState("")
  const [addonPrice, setAddonPrice] = useState("")
  const [addonImageFile, setAddonImageFile] = useState(null)
  const [addonImagePreview, setAddonImagePreview] = useState("")
  const [addonPreviewFailed, setAddonPreviewFailed] = useState(false)
  const [failedAddonImages, setFailedAddonImages] = useState({})
  const [savingAddon, setSavingAddon] = useState(false)
  const [recommendedMap, setRecommendedMap] = useState(() => readJson(INVENTORY_RECOMMENDED_KEY, {}))

  const inventoryTabs = ["all-items", "add-ons"]
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab

  const fetchRestaurantProfile = useCallback(async () => {
    try {
      const response = await restaurantAPI.getCurrentRestaurant()
      const profile =
        response?.data?.data?.restaurant ||
        response?.data?.restaurant ||
        response?.data?.data ||
        null
      setRestaurantProfile(profile)
    } catch (error) {
      debugWarn("Failed to load restaurant profile for stock rules:", error)
    }
  }, [])

  useEffect(() => {
    fetchRestaurantProfile()
  }, [fetchRestaurantProfile])

  // Fetch menu items from API and convert to inventory format
  const fetchMenuData = useCallback(async () => {
    const toInventoryItem = (item, section, subsection) => ({
      id: String(item.id || Date.now() + Math.random()),
      name: item.name || "Unnamed Item",
      description: item.description || "",
      image: item.image || "",
      images: item.image ? [item.image] : [],
      price: item.price ?? "",
      variants: Array.isArray(item.variants) ? item.variants : Array.isArray(item.variations) ? item.variations : [],
      category: section.name || subsection?.name || "",
      categoryId: section.categoryId || section.id || "",
      inStock: item.isAvailable !== undefined ? item.isAvailable : true,
      isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
      isVeg: item.foodType === "Veg",
      foodType: item.foodType || "Non-Veg",
      approvalStatus: String(item.approvalStatus || "approved").toLowerCase(),
      rejectionReason: item.rejectionReason || "",
      // Backend menu is generated from food_items and currently doesn't persist "recommended".
      // Keep as a local UI preference keyed by food item id, but respect backend if it provides it.
      isRecommended: Boolean(
        item.recommended === true || item.isRecommended === true || item.is_recommended === true || recommendedMap?.[String(item.id)],
      ),
      stockQuantity: item.stock || "Unlimited",
      unit: item.itemSizeUnit || "piece",
      expiryDate: null,
      lastRestocked: null,
    })

    try {
      setLoadingInventory(true)

      const menuResponse = await restaurantAPI.getMenu()

      if (menuResponse.data && menuResponse.data.success && menuResponse.data.data && menuResponse.data.data.menu) {
        const menuSections = menuResponse.data.data.menu.sections || []

        const convertedCategories = menuSections.map((section, sectionIndex) => {
          const allItems = []

          if (Array.isArray(section.items)) {
            section.items.forEach((item) => {
              allItems.push(toInventoryItem(item, section))
            })
          }

          if (Array.isArray(section.subsections)) {
            section.subsections.forEach((subsection) => {
              if (Array.isArray(subsection.items)) {
                subsection.items.forEach((item) => {
                  allItems.push(toInventoryItem(item, section, subsection))
                })
              }
            })
          }

          // Menu snapshots are disabled on backend; treat category toggle as derived from items (all in stock).
          const categoryInStock = allItems.length > 0 ? allItems.every((i) => i.inStock) : true
          const itemCount = allItems.length

          return {
            id: section.id || `category-${sectionIndex}`,
            name: section.name || "Unnamed Category",
            description: section.description || "",
            itemCount,
            inStock: categoryInStock,
            items: allItems,
            order: section.order !== undefined ? section.order : sectionIndex,
          }
        })

        const nowMs = Date.now()
        const rules = stockRulesRef.current
        const withStockRules = convertedCategories.map((category) => {
          const ruledItems = (category.items || []).map((item) => {
            const rule = rules?.[String(item.id)] || null
            const isActiveRule =
              rule && (rule.mode === "manual" || (rule.resumeAt && new Date(rule.resumeAt).getTime() > nowMs))

            if (!isActiveRule) return item
            return {
              ...item,
              inStock: false,
              isAvailable: false,
              stockRule: rule,
            }
          })

          return {
            ...category,
            items: ruledItems,
            itemCount: ruledItems.length,
            inStock: ruledItems.length > 0 ? ruledItems.every((item) => item.inStock) : true,
          }
        })

        setCategories(withStockRules)
        setExpandedCategories(withStockRules.map((c) => c.id))
      } else {
        // Empty menu - start fresh
        setCategories([])
        setExpandedCategories([])
      }
    } catch (error) {
      // Only log and show toast if it's not a network/timeout error
      if (error.code !== "ERR_NETWORK" && error.code !== "ECONNABORTED" && !error.message?.includes("timeout")) {
        debugError("Error fetching menu data:", error)
        toast.error("Failed to load menu data")
      }
      setCategories([])
      setExpandedCategories([])
    } finally {
      setLoadingInventory(false)
    }
  }, [recommendedMap])

  useEffect(() => {
    fetchMenuData()
  }, [fetchMenuData])

  // Fetch add-ons when add-ons tab is active
  const fetchAddons = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoadingAddons(true)
      const response = await restaurantAPI.getAddons()
      const data = response?.data?.data?.addons || response?.data?.addons || []
      const getAddonCreatedMs = (addon = {}) => {
        const candidates = [addon.requestedAt, addon.createdAt, addon.updatedAt]
          .map((v) => new Date(v).getTime())
          .find((ms) => Number.isFinite(ms) && ms > 0)
        if (candidates) return candidates
        const rawId = String(addon.id || "")
        const match = rawId.match(/\d{10,}/)
        if (!match) return 0
        const fromId = Number(match[0])
        return Number.isFinite(fromId) ? fromId : 0
      }
      const sortedAddons = [...data].sort((a, b) => getAddonCreatedMs(b) - getAddonCreatedMs(a))
      setAddons(sortedAddons)
    } catch (error) {
      debugError("Error fetching add-ons:", error)
      toast.error("Failed to load add-ons")
      setAddons([])
    } finally {
      if (showLoading) setLoadingAddons(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "add-ons") {
      fetchAddons(true)
    }
  }, [activeTab, fetchAddons])

  // Native: the web rebuilt this screen (and loaded its data again) on every visit; here it stays mounted, so the
  // same data is loaded again each time the tab is shown again. Old data stays on screen meanwhile.
  const wasActiveRef = useRef(tabActive)
  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = tabActive
    if (!tabActive) {
      setIsMenuOpen(false)
      return
    }
    if (wasActive) return
    fetchRestaurantProfile()
    // a new map object loads the menu again (the item page may have changed "recommended" in storage)
    setRecommendedMap(readJson(INVENTORY_RECOMMENDED_KEY, {}))
    if (activeTabRef.current === "add-ons") fetchAddons(false)
  }, [tabActive, fetchRestaurantProfile, fetchAddons])

  // Pull to refresh: what opening the screen loads
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        fetchRestaurantProfile(),
        fetchMenuData(),
        activeTabRef.current === "add-ons" ? fetchAddons(true) : Promise.resolve(),
      ])
    } finally {
      setRefreshing(false)
    }
  }, [fetchRestaurantProfile, fetchMenuData, fetchAddons])

  // Persist active tab
  useEffect(() => {
    try {
      localStorage.setItem(INVENTORY_ACTIVE_TAB_KEY, activeTab)
    } catch {
      /* ignore */
    }
  }, [activeTab])

  // Load persisted add-on form
  useEffect(() => {
    try {
      const raw = localStorage.getItem(INVENTORY_ADDON_FORM_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setAddonName(parsed?.name || "")
        setAddonDescription(parsed?.description || "")
        setAddonPrice(parsed?.price || "")
        if (parsed?.isOpen) setIsAddAddonOpen(true)
        if (parsed?.preview) {
          setAddonImagePreview(parsed.preview)
        }
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Persist form state
  useEffect(() => {
    try {
      const payload = {
        name: addonName,
        description: addonDescription,
        price: addonPrice,
        preview: addonImagePreview,
        isOpen: isAddAddonOpen,
      }
      localStorage.setItem(INVENTORY_ADDON_FORM_KEY, JSON.stringify(payload))
    } catch {
      /* ignore */
    }
  }, [addonName, addonDescription, addonPrice, addonImagePreview, isAddAddonOpen])

  const resetAddonForm = () => {
    setAddonName("")
    setAddonDescription("")
    setAddonPrice("")
    setAddonImageFile(null)
    setAddonImagePreview("")
    setAddonPreviewFailed(false)
    setIsAddAddonOpen(false)
    localStorage.removeItem(INVENTORY_ADDON_FORM_KEY)
  }

  const processAddonImageFile = (file) => {
    if (!file) return
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"]
    if (!allowed.includes(file.type)) {
      toast.error("Invalid image type. Please use PNG, JPG, JPEG, WEBP, HEIC, or HEIF.")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB.")
      return
    }
    setAddonImageFile(file)
    setAddonImagePreview(file.uri)
    setAddonPreviewFailed(false)
  }

  const handleAddonImagePick = () => {
    openGallery({
      onSelectFile: processAddonImageFile,
      fileNamePrefix: "addon-image",
    })
  }

  const handleSaveAddon = async () => {
    if (!addonName.trim()) {
      toast.error("Please enter add-on name")
      return
    }
    const parsedPrice = parseFloat(addonPrice)
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error("Please enter a valid price")
      return
    }
    setSavingAddon(true)
    try {
      let imageUrl = ""
      if (addonImageFile) {
        const uploadRes = await uploadAPI.uploadMedia(addonImageFile, { folder: "helloparth/restaurant/addons" })
        imageUrl = uploadRes?.data?.data?.url || uploadRes?.data?.url || ""
      }
      const payload = {
        name: addonName.trim(),
        description: addonDescription.trim(),
        price: parsedPrice,
        image: imageUrl,
        images: imageUrl ? [imageUrl] : [],
      }
      await restaurantAPI.addAddon(payload)
      toast.success("Add-on submitted to admin for approval")
      resetAddonForm()
      setIsAddAddonOpen(false)
      fetchAddons(true)
    } catch (error) {
      debugError("Error saving add-on:", error)
      toast.error(error?.response?.data?.message || "Failed to save add-on")
    } finally {
      setSavingAddon(false)
    }
  }

  // Handle addon toggle
  const handleAddonToggle = async (addonId, isAvailable) => {
    try {
      await restaurantAPI.updateAddon(addonId, {
        isAvailable,
      })

      setAddons((prev) => prev.map((a) => (a.id === addonId ? { ...a, isAvailable } : a)))

      toast.success(`Add-on ${isAvailable ? "enabled" : "disabled"} successfully`)
    } catch (error) {
      debugError("Error toggling addon:", error)
      toast.error("Failed to update add-on availability")
    }
  }

  // Swipe gestures. A swipe that starts on the filter chips scrolls THAT row; it must not also flip the whole page to
  // the other tab (All items <-> Add-ons).
  const handleTouchStart = (e) => {
    gestureIgnored.current = noSwipeTouchRef.current
    noSwipeTouchRef.current = false
    if (gestureIgnored.current) return

    touchStartX.current = e.nativeEvent.pageX
    touchStartY.current = e.nativeEvent.pageY
    touchEndX.current = e.nativeEvent.pageX
    isSwiping.current = false
  }

  const handleTouchMove = (e) => {
    if (gestureIgnored.current) return
    const { pageX, pageY } = e.nativeEvent
    if (!isSwiping.current) {
      const deltaX = Math.abs(pageX - touchStartX.current)
      const deltaY = Math.abs(pageY - touchStartY.current)

      // Determine if this is a horizontal swipe
      if (deltaX > deltaY && deltaX > 10) {
        isSwiping.current = true
      }
    }

    if (isSwiping.current) {
      touchEndX.current = pageX
    }
  }

  const handleTouchEnd = () => {
    if (gestureIgnored.current) {
      gestureIgnored.current = false
      return
    }
    if (!isSwiping.current) {
      touchStartX.current = 0
      touchEndX.current = 0
      return
    }

    const swipeDistance = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50
    const swipeVelocity = Math.abs(swipeDistance)

    if (swipeVelocity > minSwipeDistance && !isTransitioning) {
      const currentIndex = inventoryTabs.findIndex((tab) => tab === activeTab)
      let newIndex = currentIndex

      if (swipeDistance > 0 && currentIndex < inventoryTabs.length - 1) {
        newIndex = currentIndex + 1
      } else if (swipeDistance < 0 && currentIndex > 0) {
        newIndex = currentIndex - 1
      }

      if (newIndex !== currentIndex) {
        setIsTransitioning(true)
        setTimeout(() => {
          setActiveTab(inventoryTabs[newIndex])
          setTimeout(() => {
            setIsTransitioning(false)
          }, 300)
        }, 50)
      }
    }

    touchStartX.current = 0
    touchEndX.current = 0
    touchStartY.current = 0
    isSwiping.current = false
  }

  // Persist categories whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(categories))
    } catch (error) {
      debugError("Error saving inventory to storage:", error)
    }
  }, [categories])

  useEffect(() => {
    try {
      localStorage.setItem(INVENTORY_STOCK_RULES_KEY, JSON.stringify(stockRules))
    } catch (error) {
      debugWarn("Failed to save stock rules:", error)
    }
  }, [stockRules])

  // Update menu API when category/item toggles change
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  const updateAvailabilityAPI = useCallback(async (categoryId, itemId, isAvailable) => {
    try {
      if (!categoryId) return

      // Backend source of truth is food_items. Update availability via /food/restaurant/foods/:id.
      if (itemId) {
        await restaurantAPI.updateFood(itemId, { isAvailable: Boolean(isAvailable) })
        return
      }

      const category = categoriesRef.current.find((c) => c.id === categoryId)
      const items = category?.items || []
      // Bulk update all items in a category.
      await Promise.all(items.map((it) => restaurantAPI.updateFood(it.id, { isAvailable: Boolean(isAvailable) })))
    } catch (error) {
      debugError("Error updating availability:", error)
      toast.error(error?.response?.data?.message || "Failed to update availability")
    }
  }, [])

  // Scheduled stock rules: re-enable expired items (every 15 s while this screen is the one on screen)
  useEffect(() => {
    if (!tabActive) return undefined
    if (!stockRules || Object.keys(stockRules).length === 0) return undefined

    const runExpiryCheck = async () => {
      const nowMs = Date.now()
      const expiredItemIds = Object.entries(stockRules)
        .filter(([, rule]) => rule?.mode !== "manual")
        .filter(([, rule]) => {
          const resumeAtMs = new Date(rule?.resumeAt || "").getTime()
          return Number.isFinite(resumeAtMs) && resumeAtMs <= nowMs
        })
        .map(([itemId]) => itemId)

      if (expiredItemIds.length === 0) return

      const affectedByCategory = new Map()
      categoriesRef.current.forEach((category) => {
        ;(category.items || []).forEach((item) => {
          if (expiredItemIds.includes(String(item.id))) affectedByCategory.set(String(item.id), category.id)
        })
      })
      setCategories((prev) =>
        prev.map((category) => {
          let changed = false
          const updatedItems = (category.items || []).map((item) => {
            if (!expiredItemIds.includes(String(item.id))) return item
            changed = true
            return {
              ...item,
              inStock: true,
              isAvailable: true,
              stockRule: null,
            }
          })

          if (!changed) return category
          return {
            ...category,
            items: updatedItems,
            inStock: updatedItems.every((item) => item.inStock),
          }
        }),
      )

      setStockRules((prev) => {
        const next = { ...prev }
        expiredItemIds.forEach((itemId) => {
          delete next[itemId]
        })
        return next
      })

      await Promise.all(
        expiredItemIds.map(async (itemId) => {
          try {
            const categoryId = affectedByCategory.get(String(itemId))
            await updateAvailabilityAPI(categoryId, itemId, true)
          } catch (error) {
            debugWarn("Failed to auto-enable scheduled inventory item:", error)
          }
        }),
      )
    }

    runExpiryCheck()
    const intervalId = setInterval(runExpiryCheck, 15000)
    return () => clearInterval(intervalId)
  }, [stockRules, tabActive, updateAvailabilityAPI])

  // Calculate total items
  const totalItems = useMemo(
    () => categories.reduce((sum, cat) => sum + (cat.itemCount || cat.items?.length || 0), 0),
    [categories],
  )

  const activeFilterOptions = useMemo(() => {
    if (activeTab === "add-ons") return ADDON_FILTER_OPTIONS
    const isPureVeg = restaurantProfile?.pureVegRestaurant === true
    if (!isPureVeg) return MENU_FILTER_OPTIONS
    // Pure-veg restaurants: hide veg/non-veg diet filters
    return MENU_FILTER_OPTIONS.filter((option) => option.value !== "veg" && option.value !== "non-veg")
  }, [activeTab, restaurantProfile?.pureVegRestaurant])

  useEffect(() => {
    if (!activeFilterOptions.some((option) => option.value === selectedFilter)) {
      setSelectedFilter("all")
    }
  }, [activeFilterOptions, selectedFilter])

  useEffect(() => {
    if (restaurantProfile?.pureVegRestaurant === true && (selectedFilter === "non-veg" || selectedFilter === "veg")) {
      setSelectedFilter("all")
    }
  }, [restaurantProfile?.pureVegRestaurant, selectedFilter])

  // A dish is live for customers only once admin approved it AND it is in stock. Dishes under review or rejected are
  // neither "in stock" nor "out of stock" - they are not on the menu at all yet.
  const isItemApproved = (item) => String(item?.approvalStatus || "approved").toLowerCase() === "approved"
  const isItemLive = (item) => isItemApproved(item) && Boolean(item?.inStock)

  const filterMenuItems = (items = [], filterValue = "all") => {
    if (filterValue === "all") return items
    if (filterValue === "in-stock") return items.filter(isItemLive)
    if (filterValue === "out-of-stock") return items.filter((item) => isItemApproved(item) && !item.inStock)
    if (filterValue === "recommended") return items.filter((item) => item.isRecommended)
    if (filterValue === "veg") return items.filter((item) => item.isVeg)
    if (filterValue === "non-veg") return items.filter((item) => !item.isVeg)
    return items
  }

  const filterAddonsList = (items = [], filterValue = "all") => {
    if (filterValue === "all") return items
    if (filterValue === "available") return items.filter((item) => item.isAvailable !== false)
    if (filterValue === "unavailable") return items.filter((item) => item.isAvailable === false)
    if (filterValue === "approved") return items.filter((item) => item.approvalStatus === "approved")
    if (filterValue === "pending") return items.filter((item) => item.approvalStatus === "pending")
    if (filterValue === "rejected") return items.filter((item) => item.approvalStatus === "rejected")
    return items
  }

  const menuFilterCounts = useMemo(
    () =>
      MENU_FILTER_OPTIONS.reduce((acc, option) => {
        acc[option.value] = categories.reduce((sum, category) => sum + filterMenuItems(category.items || [], option.value).length, 0)
        return acc
      }, {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories],
  )

  const addonFilterCounts = useMemo(
    () =>
      ADDON_FILTER_OPTIONS.reduce((acc, option) => {
        acc[option.value] = filterAddonsList(addons, option.value).length
        return acc
      }, {}),
     
    [addons],
  )

  // Filter categories based on selected filter
  const statusFilteredCategories = useMemo(() => {
    return categories
      .map((category) => {
        const filteredItems = filterMenuItems(category.items || [], selectedFilter)
        if (filteredItems.length === 0) return null

        return {
          ...category,
          items: filteredItems,
          itemCount: filteredItems.length,
          inStock: filteredItems.every((item) => item.inStock),
        }
      })
      .filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, selectedFilter])

  // Apply text search on categories & items
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return statusFilteredCategories

    return statusFilteredCategories
      .map((category) => {
        const items = category.items || []
        const matchesCategory = category.name?.toLowerCase().includes(q) || (category.description || "").toLowerCase().includes(q)

        const matchingItems = items.filter((item) => item.name?.toLowerCase().includes(q))

        if (!matchesCategory && matchingItems.length === 0) {
          return null
        }

        return {
          ...category,
          items: matchingItems.length > 0 ? matchingItems : items,
          itemCount: matchingItems.length > 0 ? matchingItems.length : items.length,
          inStock: (matchingItems.length > 0 ? matchingItems : items).every((item) => item.inStock),
        }
      })
      .filter(Boolean)
  }, [statusFilteredCategories, searchQuery])

  const filteredAddons = useMemo(() => {
    const byFilter = filterAddonsList(addons, selectedFilter)
    const q = searchQuery.trim().toLowerCase()
    if (!q) return byFilter

    return byFilter.filter((addon) => {
      const status = String(addon?.approvalStatus || "").toLowerCase()
      return (
        String(addon?.name || "").toLowerCase().includes(q) ||
        String(addon?.description || "").toLowerCase().includes(q) ||
        status.includes(q)
      )
    })
     
  }, [addons, searchQuery, selectedFilter])

  // When on Add-ons tab, keep the list empty (no items shown)
  const listToRender = activeTab === "add-ons" ? [] : filteredCategories

  const activeFilterCount = activeTab === "add-ons" ? addonFilterCounts[selectedFilter] || 0 : menuFilterCounts[selectedFilter] || 0

  const hasActiveTools = searchQuery.trim().length > 0 || selectedFilter !== "all"

  // Category summary: how many dishes are paused, waiting for admin review or rejected
  const getCategoryStockSummary = (category) => {
    const items = category?.items || []
    const status = (item) => String(item?.approvalStatus || "approved").toLowerCase()
    const paused = items.filter((item) => status(item) === "approved" && !item.inStock).length
    const underReview = items.filter((item) => status(item) === "pending").length
    const rejected = items.filter((item) => status(item) === "rejected").length
    return { paused, underReview, rejected, allLive: items.length > 0 && paused + underReview + rejected === 0 }
  }

  // Handle filter apply
  const filterTimerRef = useRef(null)
  useEffect(() => () => clearTimeout(filterTimerRef.current), [])
  const handleFilterApply = () => {
    setIsLoading(true)
    setFilterOpen(false)

    // Simulate loading (web parity)
    clearTimeout(filterTimerRef.current)
    filterTimerRef.current = setTimeout(() => {
      setIsLoading(false)
    }, 1500)
  }

  // Handle filter clear
  const handleFilterClear = () => {
    setSelectedFilter("all")
    setFilterOpen(false)
  }

  const getTargetItemIds = (type, categoryId, itemId) => {
    const category = categories.find((entry) => entry.id === categoryId)
    const items = Array.isArray(category?.items) ? category.items : []

    if (type === "category") {
      return items.map((item) => String(item.id)).filter(Boolean)
    }

    return itemId ? [String(itemId)] : []
  }

  // Handle toggle click
  const handleToggleChange = async (type, categoryId, itemId, nextChecked) => {
    if (nextChecked) {
      const targetItemIds = getTargetItemIds(type, categoryId, itemId)

      // Turning ON - apply immediately without popup
      setCategories((prev) =>
        prev.map((category) => {
          if (category.id !== categoryId) return category
          const items = category.items || []

          if (type === "category") {
            const updatedItems = items.map((item) => ({
              ...item,
              inStock: true,
              isAvailable: true,
              stockRule: null,
            }))
            return {
              ...category,
              inStock: true,
              items: updatedItems,
            }
          }

          const updatedItems = items.map((item) =>
            item.id === itemId ? { ...item, inStock: true, isAvailable: true, stockRule: null } : item,
          )
          // Category toggle stays independent of item toggles
          return {
            ...category,
            items: updatedItems,
          }
        }),
      )

      setStockRules((prev) => {
        const next = { ...prev }
        targetItemIds.forEach((ruleId) => {
          delete next[ruleId]
        })
        return next
      })

      if (type === "category") {
        await updateAvailabilityAPI(categoryId, null, true)
      } else {
        await updateAvailabilityAPI(categoryId, itemId, true)
      }
      return
    }

    // Turning OFF - open popup and wait for confirmation
    setToggleTarget({ type, categoryId, itemId })
    setSelectedOption("specific-time")
    setHours(3)
    setSelectedDate(null)
    setSelectedTime({ hour: "2", minute: "30", period: "pm" })
    setShowCalendar(false)
    setShowTimePicker(false)
    setTogglePopupOpen(true)
  }

  // Handle toggle confirm
  const handleToggleConfirm = async () => {
    if (!toggleTarget || isConfirming) return

    const { type, categoryId, itemId } = toggleTarget
    const targetItemIds = getTargetItemIds(type, categoryId, itemId)
    const nextRule = buildStockRule({
      selectedOption,
      hours,
      selectedDate,
      selectedTime,
      restaurantProfile,
    })

    if (selectedOption === "custom-date-time") {
      if (!nextRule.resumeAt) {
        toast.error("Please select a valid custom date and time")
        return
      }

      if (new Date(nextRule.resumeAt).getTime() <= Date.now()) {
        toast.error("Custom date & time must be in the future")
        return
      }
    }

    // Close popup immediately to prevent double-clicks
    setTogglePopupOpen(false)
    setToggleTarget(null)
    setIsConfirming(true)

    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category
        const items = category.items || []

        if (type === "category") {
          const updatedItems = items.map((item) => ({
            ...item,
            inStock: false,
            isAvailable: false,
            stockRule: nextRule,
          }))
          return {
            ...category,
            inStock: false,
            items: updatedItems,
          }
        }

        const updatedItems = items.map((item) =>
          item.id === itemId ? { ...item, inStock: false, isAvailable: false, stockRule: nextRule } : item,
        )
        return {
          ...category,
          items: updatedItems,
        }
      }),
    )

    setStockRules((prev) => {
      const next = { ...prev }
      targetItemIds.forEach((ruleId) => {
        next[ruleId] = nextRule
      })
      return next
    })

    try {
      if (type === "category") {
        await updateAvailabilityAPI(categoryId, null, false)
      } else {
        await updateAvailabilityAPI(categoryId, itemId, false)
      }
    } finally {
      setIsConfirming(false)
    }
  }

  const getCategoryData = () => {
    if (!toggleTarget || toggleTarget.type !== "category") return null
    return categories.find((cat) => cat.id === toggleTarget.categoryId)
  }

  const formatDate = (date) => {
    if (!date) return ""
    const day = date.getDate()
    const month = date.toLocaleString("en-US", { month: "short" })
    const year = date.getFullYear()
    return `${day} ${month} ${year}`
  }

  const formatTime = (time) => {
    if (!time) return ""
    const minute = time.minute.padStart(2, "0")
    const period = time.period.toUpperCase()
    return `${time.hour}:${minute} ${period}`
  }

  const handleTimePickerConfirm = (hour, minute, period) => {
    setSelectedTime({ hour, minute, period })
    setShowTimePicker(false)
  }

  const toggleCategory = (categoryId) => {
    setExpandedCategories((prev) => (prev.includes(categoryId) ? prev.filter((cid) => cid !== categoryId) : [...prev, categoryId]))
  }

  const scrollToCategory = (categoryId) => {
    const y = categoryYRef.current[categoryId]
    if (y == null) return
    scrollRef.current?.scrollTo?.({ y: Math.max(0, contentYRef.current + listYRef.current + y - sp(4)), animated: true })
  }

  const handleEditItem = (category, item) => {
    if (!item?.id) return

    navigate(`/food/restaurant/hub-menu/item/${item.id}`, {
      state: {
        backTo: "/food/restaurant/inventory",
        item: {
          ...item,
          category: category?.name || "",
          categoryId: category?.id || category?.categoryId || "",
          isAvailable: item.inStock,
        },
        category: category?.name || "",
        categoryId: category?.id || category?.categoryId || "",
        groupId: category?.id || category?.categoryId || "",
      },
    })
  }

  // ---------------------------------------------------------------- render pieces
  const renderTabButton = (tab, label, count) => {
    const active = activeTab === tab
    return (
      <Pressable onPress={() => setActiveTab(tab)} style={[s.tabBtn, active ? s.tabBtnOn : s.tabBtnOff, active && { transform: [{ scale: 1.02 }] }]}>
        {active ? <Gradient round={24} /> : null}
        <View style={s.tabInner}>
          <Text numberOfLines={1} style={[s.tabText, { color: active ? colors.white : restaurantTheme.muted }]}>
            {label}
          </Text>
          <View style={[s.tabCount, { backgroundColor: active ? colors.white : "#f6ecf3" }]}>
            <Text style={[s.tabCountText, { color: active ? BRAND_COLOR : restaurantTheme.muted }]}>{count}</Text>
          </View>
        </View>
      </Pressable>
    )
  }

  const renderAddonsSection = () => (
    <>
      {isAddAddonOpen && (
        <View style={s.addonForm}>
          <View>
            <Text style={s.addonLabel}>Add-on Name *</Text>
            <Field value={addonName} onChangeText={setAddonName} style={s.addonInput} placeholder="e.g., Coke, Chips" placeholderTextColor={colors.gray[400]} />
          </View>
          <View>
            <Text style={s.addonLabel}>Description</Text>
            <Field
              value={addonDescription}
              onChangeText={setAddonDescription}
              style={[s.addonInput, { minHeight: 3 * 24 + 16 }]}
              multiline
              textAlignVertical="top"
              placeholder="Describe the add-on..."
              placeholderTextColor={colors.gray[400]}
            />
          </View>
          <View>
            <Text style={s.addonLabel}>Price (₹) *</Text>
            <Field
              value={addonPrice}
              onChangeText={setAddonPrice}
              keyboardType="decimal-pad"
              style={s.addonInput}
              placeholder="0.00"
              placeholderTextColor={colors.gray[400]}
            />
          </View>
          <View>
            <Text style={s.addonLabel}>Image (1 only)</Text>
            {addonImagePreview && !addonPreviewFailed ? (
              <View style={{ marginBottom: sp(2) }}>
                <AppImage src={addonImagePreview} style={s.addonPreview} contentFit="cover" onError={() => setAddonPreviewFailed(true)} />
              </View>
            ) : null}
            <Pressable onPress={handleAddonImagePick} style={({ pressed }) => [s.addonUpload, pressed && { backgroundColor: colors.gray[100] }]}>
              <View style={s.rowGap2}>
                <Upload size={16} color={colors.gray[500]} />
                <Text style={s.addonUploadTitle} numberOfLines={1}>
                  {addonImageFile?.name || "Upload image"}
                </Text>
              </View>
              <Text style={s.addonUploadSub}>{addonImageFile ? "Image selected successfully" : "Tap to choose 1 image from your device"}</Text>
            </Pressable>
            <Text style={[s.addonUploadSub, { marginTop: sp(1) }]}>PNG, JPG, WEBP, HEIC up to 5MB.</Text>
          </View>
          <View style={[s.rowGap2, { gap: sp(3) }]}>
            <Pressable
              onPress={() => {
                resetAddonForm()
                setIsAddAddonOpen(false)
              }}
              style={s.addonCancel}
            >
              <Text style={s.addonCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSaveAddon} disabled={savingAddon} style={[s.addonSubmit, savingAddon && { opacity: 0.5 }]}>
              <Gradient round={radius.md} />
              {savingAddon ? <ActivityIndicator size="small" color={colors.white} /> : null}
              <Text style={s.addonSubmitText}>{savingAddon ? "Saving..." : "Submit for approval"}</Text>
            </Pressable>
          </View>
        </View>
      )}
      {loadingAddons ? (
        <View style={s.addonLoading}>
          <ActivityIndicator size="large" color={colors.slate[400]} />
        </View>
      ) : filteredAddons.length === 0 ? (
        <View style={[s.emptyCard, { paddingHorizontal: sp(4), paddingVertical: sp(20) }]}>
          <Text style={s.emptyTitle}>{hasActiveTools ? "No matching add-ons found" : "No add-ons available"}</Text>
          <Text style={s.emptyText}>{hasActiveTools ? "Try changing your search or filters" : "All add-ons will appear here"}</Text>
        </View>
      ) : (
        <View style={{ gap: sp(4) }}>
          {filteredAddons.map((addon) => {
            const available = addon.isAvailable !== false
            const image = addon.images && addon.images.length > 0 ? addon.images[0] : null
            return (
              <View key={addon.id} style={s.addonCard}>
                <View style={s.addonCardRow}>
                  <View style={s.flex1}>
                    <View style={s.addonBadges}>
                      <Text style={s.addonName}>{addon.name}</Text>
                      <View style={[s.smallPill, { backgroundColor: available ? colors.emerald[50] : colors.slate[100] }]}>
                        <Text style={[s.smallPillText, { color: available ? STRONG : colors.slate[600] }]}>{available ? "Live" : "Paused"}</Text>
                      </View>
                      {addon.approvalStatus === "approved" && (
                        <View style={[s.smallPill, { backgroundColor: colors.green[100] }]}>
                          <Text style={[s.smallPillText, { color: colors.green[800] }]}>Approved</Text>
                        </View>
                      )}
                      {addon.approvalStatus === "pending" && (
                        <View style={[s.smallPill, { backgroundColor: colors.yellow[100] }]}>
                          <Text style={[s.smallPillText, { color: colors.yellow[800] }]}>Pending</Text>
                        </View>
                      )}
                      {addon.approvalStatus === "rejected" && (
                        <View style={[s.smallPill, { backgroundColor: colors.red[100] }]}>
                          <Text style={[s.smallPillText, { color: colors.red[800] }]}>Rejected</Text>
                        </View>
                      )}
                    </View>
                    {addon.description ? <Text style={s.addonDesc}>{addon.description}</Text> : null}
                    <Text style={s.addonPrice}>{`Rs. ${addon.price}`}</Text>
                    {addon.approvalStatus === "rejected" && addon.rejectionReason ? (
                      <Text style={s.addonReason}>{`Reason: ${addon.rejectionReason}`}</Text>
                    ) : null}
                  </View>
                  <View style={s.addonRight}>
                    {image && !failedAddonImages[addon.id] ? (
                      <AppImage
                        src={image}
                        style={s.addonImage}
                        contentFit="cover"
                        onError={() => setFailedAddonImages((prev) => ({ ...prev, [addon.id]: true }))}
                      />
                    ) : null}
                    <View style={s.addonSwitchWrap}>
                      <Switch checked={available} onCheckedChange={(checked) => handleAddonToggle(addon.id, checked)} />
                    </View>
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}
    </>
  )

  const renderItem = (category, item) => {
    const approvalMeta = getApprovalDisplayMeta(item.approvalStatus)
    const isRejectedItem = item.approvalStatus === "rejected"
    const approved = item.approvalStatus === "approved"

    return (
      <View key={item.id} style={{ paddingHorizontal: sp(1) }}>
        <View style={s.itemCard}>
          <View style={s.itemLeft}>
            <View style={s.itemThumb}>
              <AppImage src={item.image || dishFallbackImage} fallback={dishFallbackImage} style={s.fill} contentFit="cover" />
            </View>
            <View style={s.flex1}>
              <Text numberOfLines={1} style={s.itemName}>
                {item.name}
              </Text>

              <View style={s.itemBadges}>
                <View style={[s.vegPill, { borderColor: item.isVeg ? colors.green[100] : colors.red[100] }]}>
                  <View style={[s.vegBox, { borderColor: item.isVeg ? colors.green[600] : colors.red[600] }]}>
                    <View style={[s.vegDot, { backgroundColor: item.isVeg ? colors.green[600] : BRAND_COLOR }]} />
                  </View>
                  <Text style={[s.badgeText, { color: item.isVeg ? colors.green[600] : BRAND_COLOR }]}>{item.isVeg ? "VEG" : "NON-VEG"}</Text>
                </View>
                <View style={[s.approvalPill, { borderColor: approvalMeta.border }]}>
                  <Text style={[s.badgeText, { color: approvalMeta.text }]}>{approvalMeta.label.toUpperCase()}</Text>
                </View>
              </View>

              <View style={s.itemActions}>
                {/* Live / paused only means something once admin approved the item — an item under review or
                    rejected is not visible to customers. */}
                {approved && (
                  <Text style={[s.liveText, { color: item.inStock ? colors.green[500] : colors.rose[500] }]}>
                    {(item.inStock ? "● Live" : `● ${getRuleStatusLabel(item.stockRule)}`).toUpperCase()}
                  </Text>
                )}
                <Pressable
                  onPress={() => handleEditItem(category, item)}
                  style={({ pressed }) => [s.editBtn, !isRejectedItem && { backgroundColor: pressed ? BRAND_COLOR : colors.slate[100] }]}
                >
                  {({ pressed }) => (
                    <>
                      {isRejectedItem ? <Gradient round={radius.lg} /> : null}
                      <Pencil size={12} color={isRejectedItem || pressed ? colors.white : colors.slate[800]} />
                      <Text style={[s.editText, { color: isRejectedItem || pressed ? colors.white : colors.slate[800] }]}>
                        {isRejectedItem ? "FIX" : "EDIT"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              {item.isRecommended && (
                <View style={{ marginTop: sp(2.5), flexDirection: "row" }}>
                  <View style={s.recommendedPill}>
                    <Text style={[s.badgeText, { color: colors.blue[600] }]}>★ RECOMMENDED</Text>
                  </View>
                </View>
              )}

              {item.approvalStatus === "rejected" && item.rejectionReason ? (
                <Text style={s.itemReason}>{item.rejectionReason}</Text>
              ) : null}
            </View>
          </View>

          <View style={s.itemSwitchCol}>
            {/* Pending / rejected items stay off until admin approves them. */}
            <Switch
              checked={approved && item.inStock}
              disabled={!approved}
              onCheckedChange={(checked) => handleToggleChange("item", category.id, item.id, checked)}
              style={[{ transform: [{ scale: 0.9 }] }, !approved && { opacity: 0.4 }]}
            />
          </View>
        </View>
      </View>
    )
  }

  const renderCategory = (category, index) => {
    const isExpanded = expandedCategories.includes(category.id)
    const categoryItems = category.items || []
    // summary always over the whole category, not just the dishes left after a search / filter
    const stockSummary = getCategoryStockSummary(categories.find((c) => c.id === category.id) || category)

    return (
      <View
        key={category.id}
        onLayout={(e) => {
          categoryYRef.current[category.id] = e.nativeEvent.layout.y
        }}
      >
        <FadeIn delay={index * 50} style={[s.categoryCard, { opacity: isLoading ? 0.6 : 1 }]}>
          {/* Category Header - Clickable */}
          <Pressable onPress={() => toggleCategory(category.id)} style={({ pressed }) => [s.categoryHead, pressed && { backgroundColor: alpha(colors.slate[50], 0.5) }]}>
            <View style={s.categoryHeadRow}>
              <View style={s.flex1}>
                <View style={s.categoryTitleRow}>
                  <Text style={s.categoryTitle}>{category.name}</Text>
                  <View style={s.rowGap2}>
                    <View style={s.countPill}>
                      <Text style={s.countPillText}>{`${category.items?.length || category.itemCount || 0} ITEMS`}</Text>
                    </View>
                    <View
                      style={[
                        s.countPill,
                        stockSummary.allLive
                          ? { backgroundColor: colors.green[50], borderWidth: 1, borderColor: colors.green[100] }
                          : { backgroundColor: restaurantTheme.primarySoft, borderWidth: 1, borderColor: colors.amber[100] },
                      ]}
                    >
                      <Text style={[s.countPillText, { color: STRONG }]}>{stockSummary.allLive ? "HEALTHY" : "NEEDS ATTENTION"}</Text>
                    </View>
                  </View>
                </View>

                <View style={s.summaryRow}>
                  {stockSummary.allLive ? (
                    <View style={[s.summaryChip, { backgroundColor: alpha(colors.green[50], 0.5), borderColor: alpha(colors.green[100], 0.5) }]}>
                      <PulseDot style={[s.summaryDot, { backgroundColor: colors.green[500] }]} />
                      <Text style={[s.summaryText, { color: STRONG }]}>All items live</Text>
                    </View>
                  ) : null}
                  {stockSummary.paused > 0 ? (
                    <View style={[s.summaryChip, { backgroundColor: alpha(colors.rose[50], 0.5), borderColor: alpha(colors.rose[100], 0.5) }]}>
                      <View style={[s.summaryDot, { backgroundColor: colors.rose[500] }]} />
                      <Text style={[s.summaryText, { color: colors.rose[700] }]}>
                        {`${stockSummary.paused} ${stockSummary.paused === 1 ? "Item" : "Items"} paused`}
                      </Text>
                    </View>
                  ) : null}
                  {stockSummary.underReview > 0 ? (
                    <View style={[s.summaryChip, { backgroundColor: alpha(colors.amber[50], 0.5), borderColor: alpha(colors.amber[100], 0.5) }]}>
                      <View style={[s.summaryDot, { backgroundColor: restaurantTheme.primary }]} />
                      <Text style={[s.summaryText, { color: STRONG }]}>{`${stockSummary.underReview} under review`}</Text>
                    </View>
                  ) : null}
                  {stockSummary.rejected > 0 ? (
                    <View style={[s.summaryChip, { backgroundColor: alpha(colors.red[50], 0.5), borderColor: alpha(colors.red[100], 0.5) }]}>
                      <View style={[s.summaryDot, { backgroundColor: colors.red[500] }]} />
                      <Text style={[s.summaryText, { color: colors.red[700] }]}>{`${stockSummary.rejected} rejected`}</Text>
                    </View>
                  ) : null}
                  <View style={[s.summaryChip, { backgroundColor: alpha(colors.blue[50], 0.5), borderColor: alpha(colors.blue[100], 0.5) }]}>
                    <Text style={[s.summaryText, { color: colors.blue[700] }]}>
                      {`${categoryItems.filter((item) => item.isRecommended).length} Recommended`}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={[s.rowGap2, { gap: sp(4) }]}>
                {/* Category Toggle Switch */}
                <View style={{ transform: [{ scale: 1.1 }] }}>
                  <Switch
                    checked={category.inStock}
                    onCheckedChange={(checked) => handleToggleChange("category", category.id, null, checked)}
                  />
                </View>

                <Pressable
                  onPress={() => toggleCategory(category.id)}
                  style={[s.expandBtn, isExpanded ? { borderColor: colors.slate[900] } : { backgroundColor: colors.white, borderColor: colors.slate[200] }]}
                >
                  {isExpanded ? <Gradient round={radius.xl} /> : null}
                  {isExpanded ? <ChevronUp size={20} color={colors.white} /> : <ChevronDown size={20} color={colors.slate[600]} />}
                </Pressable>
              </View>
            </View>
          </Pressable>

          {/* Category Items */}
          {isExpanded && (
            <FadeIn y={0} style={s.categoryItems}>
              {categoryItems.map((item) => renderItem(category, item))}
            </FadeIn>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <View style={s.cardLoading}>
              <ActivityIndicator size="small" color={colors.slate[400]} />
            </View>
          )}
        </FadeIn>
      </View>
    )
  }

  const toggleCategoryData = toggleTarget?.type === "category" ? getCategoryData() : null

  return (
    <View style={s.root} collapsable={false}>
      {/* shown (not "active"): the icons switch in the same frame as the tab, not after the route change */}
      {tabShown ? <StatusBar style="light" /> : null}

      {/* Navbar */}
      <View style={s.navWrap}>
        <RestaurantNavbar showSearch={false} showOfflineOnlineTag={false} showNotifications={false} />
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={s.flex1}
        contentContainerStyle={{ paddingBottom: activeTab !== "add-ons" ? navBarOffset(navSpace, 18) + FAB_COLUMN_SPACE : Math.max(128, navSpace) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[BRAND_COLOR]} tintColor={BRAND_COLOR} />}
      >
        {/* Tabs */}
        <View style={s.tabsWrap}>
          <View style={s.tabsRow}>
            {renderTabButton("all-items", "All items", totalItems)}
            {renderTabButton("add-ons", "Add ons", addons.length)}
          </View>
        </View>

        {/* Main Content */}
        <View
          style={s.content}
          onLayout={(e) => {
            contentYRef.current = e.nativeEvent.layout.y
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {/* Search and Filter */}
          <View style={s.searchWrap}>
            <View style={s.searchCard}>
              <View style={s.searchHead}>
                <View style={s.flex1}>
                  <Text style={s.searchTitle}>{activeTab === "add-ons" ? "Search and review add-ons" : "Search and manage menu inventory"}</Text>
                  <Text style={s.searchSub}>
                    {activeTab === "add-ons"
                      ? `${filteredAddons.length} add-on${filteredAddons.length !== 1 ? "s" : ""} in this view`
                      : `${listToRender.length} categor${listToRender.length !== 1 ? "ies" : "y"} and ${activeFilterCount} item${activeFilterCount !== 1 ? "s" : ""} in focus`}
                  </Text>
                </View>
                {hasActiveTools ? (
                  <Pressable
                    onPress={() => {
                      setSearchQuery("")
                      setSelectedFilter("all")
                    }}
                    style={({ pressed }) => [s.clearAll, pressed && { borderColor: "#d5bdd0", backgroundColor: "#f9f0f7" }]}
                  >
                    <Text style={s.clearAllText}>Clear all</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={s.toolsRow}>
                <View style={s.searchBox}>
                  <View pointerEvents="none" style={s.searchIcon}>
                    <Search size={16} color={colors.slate[400]} />
                  </View>
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder={activeTab === "add-ons" ? "Search add-ons by name or status" : "Search categories or menu items"}
                    placeholderTextColor={colors.slate[400]}
                    returnKeyType="search"
                    style={[s.searchInput, searchFocused && { borderColor: restaurantTheme.focusBorder, backgroundColor: colors.white }]}
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery("")} accessibilityLabel="Clear search" style={s.searchClear} hitSlop={6}>
                      <X size={16} color={colors.slate[400]} />
                    </Pressable>
                  ) : null}
                </View>

                <Pressable
                  onPress={() => setFilterOpen(true)}
                  style={({ pressed }) => [s.filterBtn, pressed && { borderColor: "#d5bdd0", backgroundColor: "#f9f0f7" }]}
                >
                  <SlidersHorizontal size={16} color={BRAND_COLOR} />
                  <Text style={s.filterBtnText}>Filters</Text>
                  {selectedFilter !== "all" && (
                    <View style={s.filterDot}>
                      <Gradient round={5} />
                    </View>
                  )}
                </Pressable>

                {activeTab === "add-ons" && (
                  <Pressable onPress={() => setIsAddAddonOpen((v) => !v)} style={s.addAddonBtn}>
                    <Gradient round={20} />
                    <Text style={s.addAddonText}>{isAddAddonOpen ? "Close" : "Add Add-on"}</Text>
                  </Pressable>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[s.chipsScroll, { flexGrow: 0 }]}
                contentContainerStyle={s.chipsRow}
                onTouchStart={() => {
                  noSwipeTouchRef.current = true
                }}
                keyboardShouldPersistTaps="handled"
              >
                {activeFilterOptions.map((option) => {
                  const count = activeTab === "add-ons" ? addonFilterCounts[option.value] || 0 : menuFilterCounts[option.value] || 0
                  const isActive = selectedFilter === option.value
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setSelectedFilter(option.value)}
                      style={[s.chip, isActive ? { borderColor: BRAND_COLOR } : { borderColor: "#e7d5e0", backgroundColor: "#fcf7fb" }]}
                    >
                      {isActive ? <Gradient round={radius.full} /> : null}
                      <Text style={[s.chipText, { color: isActive ? colors.white : restaurantTheme.muted }]}>{option.label}</Text>
                      <View style={[s.chipCount, { backgroundColor: isActive ? alpha(colors.white, 0.2) : colors.white }]}>
                        <Text style={[s.chipCountText, { color: isActive ? colors.white : "#8a7a89" }]}>{count}</Text>
                      </View>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>
          </View>

          {/* Categories Accordions */}
          <View
            style={s.list}
            onLayout={(e) => {
              listYRef.current = e.nativeEvent.layout.y
            }}
          >
            {activeTab === "add-ons" && renderAddonsSection()}
            {activeTab !== "add-ons" && !loadingInventory && listToRender.length === 0 && (
              <View style={[s.emptyCard, { paddingHorizontal: sp(6), paddingVertical: sp(16) }]}>
                <Text style={s.emptyTitle}>{hasActiveTools ? "No matching categories or items found" : "No menu categories available"}</Text>
                <Text style={s.emptyText}>
                  {hasActiveTools ? "Try adjusting your search or filters." : "Your menu categories will appear here once items are added."}
                </Text>
              </View>
            )}
            {listToRender.map(renderCategory)}
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* Floating Menu Button & Popup (hidden on Add-ons tab) */}
      {activeTab !== "add-ons" && (
        <>
          <View style={[s.fabCol, { bottom: navBarOffset(navSpace, 18) }]} pointerEvents="box-none">
            <Pressable
              onPress={() => navigate(`/food/restaurant/hub-menu/item/new`, { state: { backTo: "/food/restaurant/inventory" } })}
              style={({ pressed }) => [s.fabAdd, pressed && { transform: [{ scale: 0.96 }] }]}
            >
              <Gradient round={radius.full} />
              <Text style={s.fabAddText}>+ Add item</Text>
            </Pressable>
            <Pressable
              onPress={() => setIsMenuOpen((prev) => !prev)}
              style={({ pressed }) => [s.fabMenu, pressed && { transform: [{ scale: 0.96 }] }]}
            >
              <View style={s.fabMenuIcon}>
                {isMenuOpen ? <X size={16} color={restaurantTheme.brandDark} /> : <Utensils size={16} color={BRAND_COLOR} />}
              </View>
              <Text style={s.fabMenuText}>{isMenuOpen ? "Close" : "Menu"}</Text>
            </Pressable>
          </View>

          {isMenuOpen && tabActive ? (
            <>
              {/* Backdrop (web: an invalid bg class, so it only catches the tap) */}
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsMenuOpen(false)} />
              <FadeIn
                y={20}
                duration={200}
                style={[
                  s.menuPopup,
                  {
                    bottom: navBarOffset(navSpace, 66),
                    height: windowHeight * 0.45,
                    width: Math.min(windowWidth * 0.6, 384),
                  },
                ]}
              >
                <LinearGradient colors={["#fcf4f9", "#f6e8f1"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.menuHead}>
                  <Text style={s.menuHeadText}>Jump to category</Text>
                </LinearGradient>
                <View style={s.menuDivider} />
                <ScrollView style={s.flex1} contentContainerStyle={s.menuList}>
                  {categories.map((category, index) => {
                    const itemCount = category.itemCount || category.items?.length || 0
                    const isLast = index === categories.length - 1

                    return (
                      <Pressable
                        key={category.id}
                        onPress={() => {
                          setIsMenuOpen(false)
                          setTimeout(() => scrollToCategory(category.id), 200)
                        }}
                        style={s.menuRow}
                      >
                        <View style={s.menuRowInner}>
                          <Text style={s.menuRowName} numberOfLines={2}>
                            {category.name}
                          </Text>
                          <View style={s.menuCount}>
                            <Text style={s.menuCountText}>{itemCount}</Text>
                          </View>
                        </View>
                        {!isLast && <View style={s.menuRowDivider} />}
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </FadeIn>
            </>
          ) : null}
        </>
      )}

      {/* Filter Popup */}
      <Sheet open={filterOpen && tabActive} onClose={() => setFilterOpen(false)} style={s.sheet}>
        <View style={{ padding: sp(6) }}>
          <View style={s.sheetHead}>
            <View style={s.flex1}>
              <Text style={s.sheetTitle}>Filters</Text>
              <Text style={s.sheetSub}>
                {activeTab === "add-ons"
                  ? "Refine the add-ons list by availability or approval status."
                  : "Refine your inventory by stock state, recommendation, or food type."}
              </Text>
            </View>
            {selectedFilter !== "all" ? (
              <View style={s.activeTag}>
                <Text style={s.activeTagText}>Active</Text>
              </View>
            ) : null}
          </View>

          <View style={{ gap: sp(4), marginBottom: sp(6) }}>
            {activeFilterOptions.map((option) => {
              const count = activeTab === "add-ons" ? addonFilterCounts[option.value] || 0 : menuFilterCounts[option.value] || 0
              return (
                <Pressable key={option.value} onPress={() => setSelectedFilter(option.value)} style={s.filterRow}>
                  <View style={[s.rowGap2, { gap: sp(3) }]}>
                    <Radio checked={selectedFilter === option.value} />
                    <Text style={s.filterRowText}>{option.label}</Text>
                  </View>
                  <View style={s.filterCount}>
                    <Text style={s.filterCountText}>{count}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>

          <View style={[s.rowGap2, { gap: sp(3) }]}>
            {selectedFilter !== "all" && (
              <Pressable onPress={handleFilterClear} style={s.outlineBtn}>
                <Text style={s.outlineBtnText}>Clear</Text>
              </Pressable>
            )}
            <Pressable onPress={handleFilterApply} style={s.primaryBtn}>
              <Gradient round={radius.lg} />
              <Text style={s.primaryBtnText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>

      {/* Toggle Popup */}
      <Sheet open={togglePopupOpen && Boolean(toggleTarget) && tabActive} onClose={() => setTogglePopupOpen(false)} style={[s.sheet, { maxHeight: "90%" }]}>
        <ScrollView contentContainerStyle={{ padding: sp(6), paddingBottom: sp(6) }}>
          <Text style={s.toggleTitle}>{toggleTarget?.type === "category" ? "Mark sub category out of stock" : "Mark item out of stock"}</Text>

          {/* Category Info - Only show for category toggles */}
          {toggleCategoryData ? (
            <View>
              <Text style={s.toggleCatName}>{toggleCategoryData.name}</Text>
              <View style={{ gap: sp(1) }}>
                <Text style={s.toggleCatLine}>{`• ${toggleCategoryData.name}`}</Text>
                <Text style={s.toggleCatLine}>{`• Includes ${toggleCategoryData.itemCount} item${toggleCategoryData.itemCount !== 1 ? "s" : ""}`}</Text>
              </View>
              <View style={s.toggleCatDivider} />
            </View>
          ) : null}

          <View style={{ marginBottom: sp(6) }}>
            {/* Option 1: For specific time */}
            <Pressable onPress={() => setSelectedOption("specific-time")} style={[s.optionRow, s.optionBorder]}>
              <Text style={s.optionText}>For specific time</Text>
              {selectedOption === "specific-time" && (
                <View style={s.stepper}>
                  <Pressable onPress={() => setHours(Math.max(1, hours - 1))} style={s.stepBtn}>
                    <Minus size={16} color={colors.gray[700]} />
                  </Pressable>
                  <Text style={s.stepValue}>{`${hours} hour${hours !== 1 ? "s" : ""}`}</Text>
                  <Pressable onPress={() => setHours(hours + 1)} style={s.stepBtn}>
                    <Plus size={16} color={colors.gray[700]} />
                  </Pressable>
                </View>
              )}
              <View style={s.optionRadio}>
                <Radio checked={selectedOption === "specific-time"} />
              </View>
            </Pressable>

            {/* Option 2: Next business day */}
            <Pressable onPress={() => setSelectedOption("next-business-day")} style={[s.optionRow, s.optionBorder]}>
              <Text style={[s.optionText, s.flex1]}>Next business day - Opening time</Text>
              <View style={s.optionRadio}>
                <Radio checked={selectedOption === "next-business-day"} />
              </View>
            </Pressable>

            {/* Option 3: Custom date & time */}
            <Pressable onPress={() => setSelectedOption("custom-date-time")} style={[s.optionRow, s.optionBorder]}>
              <Text style={[s.optionText, s.flex1]}>Custom date & time</Text>
              <View style={s.optionRadio}>
                <Radio checked={selectedOption === "custom-date-time"} />
              </View>
            </Pressable>
            {selectedOption === "custom-date-time" && (
              <View style={s.customRow}>
                <Pressable onPress={() => setShowCalendar(true)} style={s.customBtn}>
                  <Text style={s.customBtnText}>{selectedDate ? formatDate(selectedDate) : "15 Dec 2025"}</Text>
                  <ChevronDown size={16} color={colors.gray[500]} />
                </Pressable>
                <Pressable onPress={() => setShowTimePicker(true)} style={s.customBtn}>
                  <Text style={s.customBtnText}>{formatTime(selectedTime)}</Text>
                  <ChevronDown size={16} color={colors.gray[500]} />
                </Pressable>
              </View>
            )}

            {/* Option 4: Manual */}
            <Pressable onPress={() => setSelectedOption("manual")} style={[s.optionRow, { flexDirection: "column", alignItems: "stretch", gap: sp(1) }]}>
              <View style={[s.rowGap2, { gap: sp(3) }]}>
                <Text style={[s.optionText, s.flex1]}>I will turn it on manually</Text>
                <Radio checked={selectedOption === "manual"} />
              </View>
              <Text style={s.optionHint}>Item won&apos;t be visible to customers on app till you mark it back in stock</Text>
            </Pressable>
          </View>

          {/* Action Buttons */}
          <View style={[s.rowGap2, { gap: sp(3), marginTop: sp(6) }]}>
            <Pressable onPress={() => setTogglePopupOpen(false)} style={s.outlineBtn}>
              <Text style={s.outlineBtnText}>Back</Text>
            </Pressable>
            <Pressable onPress={handleToggleConfirm} disabled={isConfirming} style={[s.primaryBtn, isConfirming && { opacity: 0.6 }]}>
              <Gradient round={radius.lg} />
              <Text style={s.primaryBtnText}>{isConfirming ? "Confirming..." : "Confirm"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>

      {/* Calendar Popup */}
      <SimpleCalendar
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        isOpen={showCalendar && tabActive}
        onClose={() => setShowCalendar(false)}
      />

      {/* Time Picker Popup */}
      <TimePickerWheel
        isOpen={showTimePicker && tabActive}
        onClose={() => setShowTimePicker(false)}
        initialHour={selectedTime.hour}
        initialMinute={selectedTime.minute}
        initialPeriod={selectedTime.period}
        onConfirm={handleTimePickerConfirm}
      />
    </View>
  )
}

// fixed bottom-24 / bottom-36 above the web's bottom bar -> the same gap above the native bar
// the floating "+ Add item" / "Menu" pair (two 44 px pills, 8 px apart) + a gap above it
const FAB_COLUMN_SPACE = 44 + 8 + 46 + 16

function navBarOffset(navSpace, extraOverDefault) {
  return navSpace - 16 + extraOverDefault
}

const CARD_SHADOW = {
  elevation: 3,
  shadowColor: "#0f172a",
  shadowOpacity: 0.12,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  flex1: { flex: 1, minWidth: 0 },
  fill: { width: "100%", height: "100%" },
  rowGap2: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  navWrap: { backgroundColor: colors.white, zIndex: 50 },
  // tabs
  tabsWrap: { backgroundColor: PAGE_BG, paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(4) },
  tabsRow: { flexDirection: "row", gap: sp(3) },
  tabBtn: { flex: 1, borderRadius: 24, borderWidth: 1, paddingHorizontal: sp(4), paddingVertical: sp(3), overflow: "hidden" },
  tabBtnOn: { borderColor: BRAND_COLOR, ...CARD_SHADOW, shadowColor: "#7e3866" },
  tabBtnOff: { borderColor: restaurantTheme.border, backgroundColor: alpha(colors.white, 0.9) },
  tabInner: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(2) },
  tabText: { ...fontSize.sm, fontWeight: "600" },
  tabCount: { minHeight: 20, minWidth: 24, borderRadius: radius.full, paddingHorizontal: sp(2), paddingVertical: 2, alignItems: "center", justifyContent: "center" },
  tabCountText: { ...fontSize.xs, fontWeight: "600" },
  // content
  content: { paddingHorizontal: sp(4) },
  searchWrap: { paddingBottom: sp(4), backgroundColor: alpha(PAGE_BG, 0.95), marginHorizontal: -sp(4), paddingHorizontal: sp(4) },
  searchCard: { borderRadius: 28, borderWidth: 1, borderColor: alpha(colors.white, 0.8), backgroundColor: alpha(colors.white, 0.9), padding: sp(4), ...CARD_SHADOW },
  searchHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(3) },
  searchTitle: { ...fontSize.sm, fontWeight: "600", color: colors.slate[950] },
  searchSub: { marginTop: sp(1), ...fontSize.xs, color: colors.slate[500] },
  clearAll: { borderRadius: radius.full, borderWidth: 1, borderColor: "#e7d5e0", paddingHorizontal: sp(3), paddingVertical: 6 },
  clearAllText: { ...fontSize.xs, fontWeight: "600", color: "#6b4d62" },
  toolsRow: { marginTop: sp(4), flexDirection: "row", flexWrap: "wrap", gap: sp(2) },
  searchBox: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 220 },
  searchIcon: { position: "absolute", left: 16, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 },
  searchInput: {
    height: 48,
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e7d5e0",
    backgroundColor: "#fcf7fb",
    paddingLeft: 44,
    paddingRight: 40,
    ...fontSize.sm,
    color: colors.slate[900],
  },
  searchClear: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center", padding: 4 },
  filterBtn: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(2),
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e7d5e0",
    backgroundColor: colors.white,
    paddingHorizontal: sp(4),
  },
  filterBtnText: { ...fontSize.sm, fontWeight: "600", color: restaurantTheme.brandDark },
  filterDot: { position: "absolute", right: 6, top: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.white, overflow: "hidden" },
  addAddonBtn: { height: 48, minWidth: 128, borderRadius: 20, paddingHorizontal: sp(4), alignItems: "center", justifyContent: "center", overflow: "hidden" },
  addAddonText: { ...fontSize.sm, fontWeight: "600", color: colors.white },
  chipsScroll: { marginTop: sp(4) },
  chipsRow: { gap: sp(2), paddingBottom: sp(1) },
  chip: { flexDirection: "row", alignItems: "center", borderRadius: radius.full, borderWidth: 1, paddingHorizontal: sp(3.5), paddingVertical: sp(2), overflow: "hidden" },
  chipText: { ...fontSize.xs, fontWeight: "600" },
  chipCount: { marginLeft: sp(2), minWidth: 20, borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2, alignItems: "center", justifyContent: "center" },
  chipCountText: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  list: { gap: sp(4), marginBottom: sp(6) },
  emptyCard: { borderRadius: 28, borderWidth: 1, borderStyle: "dashed", borderColor: colors.slate[200], backgroundColor: alpha(colors.white, 0.7), alignItems: "center" },
  emptyTitle: { ...fontSize.lg, fontWeight: "600", color: colors.slate[700], textAlign: "center" },
  emptyText: { marginTop: sp(2), ...fontSize.sm, color: colors.slate[500], textAlign: "center" },
  // add-ons
  addonForm: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], borderRadius: radius.lg, padding: sp(4), marginBottom: sp(4), gap: sp(4), ...shadow.sm },
  addonLabel: { ...fontSize.sm, fontWeight: "500", color: colors.gray[700], marginBottom: sp(1) },
  addonInput: {
    width: "100%",
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.md,
    ...fontSize.base,
    color: restaurantTheme.text,
    backgroundColor: colors.white,
  },
  addonPreview: { width: 96, height: 96, borderRadius: radius.DEFAULT, borderWidth: 1, borderColor: colors.gray[200] },
  addonUpload: { width: "100%", borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray[300], backgroundColor: colors.gray[50], paddingHorizontal: sp(3), paddingVertical: sp(3) },
  addonUploadTitle: { ...fontSize.sm, fontWeight: "500", color: colors.gray[900], flexShrink: 1 },
  addonUploadSub: { marginTop: sp(1), ...fontSize.xs, color: colors.gray[500] },
  addonCancel: { paddingHorizontal: sp(4), paddingVertical: sp(2), borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md },
  addonCancelText: { ...fontSize.sm, fontWeight: "500", color: colors.gray[700] },
  addonSubmit: { flexDirection: "row", alignItems: "center", gap: sp(2), paddingHorizontal: sp(4), paddingVertical: sp(2), borderRadius: radius.md, overflow: "hidden" },
  addonSubmitText: { ...fontSize.sm, fontWeight: "500", color: colors.white },
  addonLoading: { alignItems: "center", justifyContent: "center", paddingVertical: sp(20) },
  addonCard: { borderRadius: 28, borderWidth: 1, borderColor: alpha(colors.white, 0.8), backgroundColor: colors.white, padding: sp(4), ...CARD_SHADOW },
  addonCardRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(4) },
  addonBadges: { marginBottom: sp(2), flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: sp(2) },
  addonName: { ...fontSize.base, fontWeight: "600", color: colors.slate[950] },
  smallPill: { borderRadius: radius.full, paddingHorizontal: sp(2.5), paddingVertical: sp(1) },
  smallPillText: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  addonDesc: { marginBottom: sp(2), fontSize: 14, lineHeight: 24, color: colors.slate[600] },
  addonPrice: { ...fontSize.base, fontWeight: "700", color: colors.slate[950] },
  addonReason: { marginTop: sp(2), ...fontSize.xs, fontWeight: "500", color: BRAND_COLOR },
  addonRight: { flexDirection: "row", alignItems: "flex-start", gap: sp(3) },
  addonImage: { width: 80, height: 80, borderRadius: radius["2xl"], borderWidth: 1, borderColor: colors.slate[200] },
  addonSwitchWrap: { flexDirection: "row", alignItems: "center", borderRadius: radius.full, backgroundColor: colors.slate[100], paddingHorizontal: sp(2), paddingVertical: sp(1) },
  // categories
  categoryCard: { borderRadius: 30, borderWidth: 1, borderColor: alpha(colors.white, 0.8), backgroundColor: colors.white, overflow: "hidden", ...CARD_SHADOW },
  categoryHead: { backgroundColor: colors.white, paddingHorizontal: sp(6), paddingVertical: sp(5) },
  categoryHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(4) },
  categoryTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: sp(3), marginBottom: sp(2) },
  categoryTitle: { ...fontSize.xl, fontWeight: "900", letterSpacing: -0.5, color: colors.slate[950] },
  countPill: { borderRadius: radius.full, backgroundColor: colors.slate[100], paddingHorizontal: sp(3), paddingVertical: sp(1) },
  countPillText: { fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.5, color: colors.slate[500] },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp(3), marginTop: sp(4) },
  summaryChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: radius.xl, borderWidth: 1 },
  summaryDot: { width: 6, height: 6, borderRadius: 3 },
  summaryText: { fontSize: 10, lineHeight: 14, fontWeight: "700" },
  expandBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.xl, borderWidth: 1, overflow: "hidden" },
  categoryItems: { backgroundColor: alpha(colors.slate[50], 0.3), paddingHorizontal: sp(6), paddingBottom: sp(6), paddingTop: sp(2), gap: sp(4) },
  cardLoading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, alignItems: "center", justifyContent: "center", borderRadius: 30, backgroundColor: alpha(colors.white, 0.8) },
  // items
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: sp(3),
    borderRadius: 28,
    borderWidth: 1,
    borderColor: alpha(colors.slate[100], 0.8),
    backgroundColor: colors.white,
    padding: sp(3),
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  itemLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: sp(3) },
  itemThumb: { width: 64, height: 64, borderRadius: 20, overflow: "hidden", borderWidth: 2, borderColor: colors.white, backgroundColor: colors.slate[100], ...shadow.md },
  itemName: { ...fontSize.sm, lineHeight: 18, fontWeight: "900", letterSpacing: -0.35, color: colors.slate[950], marginBottom: 6 },
  itemBadges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: sp(2.5) },
  vegPill: { flexDirection: "row", alignItems: "center", gap: sp(1), borderRadius: radius.full, paddingHorizontal: sp(2), paddingVertical: 2, backgroundColor: colors.white, borderWidth: 1, ...shadow.sm },
  vegBox: { width: 10, height: 10, borderRadius: 2, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  vegDot: { width: 4, height: 4, borderRadius: 2 },
  approvalPill: { borderRadius: radius.full, paddingHorizontal: sp(2), paddingVertical: 2, backgroundColor: colors.white, borderWidth: 1, ...shadow.sm },
  badgeText: { fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 0.45 },
  itemActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: sp(3), marginTop: sp(1) },
  liveText: { fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 0.9, flexShrink: 1 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.lg, paddingHorizontal: sp(2.5), paddingVertical: 6, overflow: "hidden", ...shadow.sm },
  editText: { fontSize: 9, lineHeight: 13, fontWeight: "900", letterSpacing: 0.9 },
  recommendedPill: { flexDirection: "row", alignItems: "center", gap: sp(1), borderRadius: radius.full, paddingHorizontal: sp(2.5), paddingVertical: sp(1), backgroundColor: colors.blue[50], borderWidth: 1, borderColor: colors.blue[100], ...shadow.sm },
  itemReason: {
    marginTop: sp(2),
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "700",
    fontStyle: "italic",
    color: BRAND_COLOR,
    backgroundColor: alpha(colors.red[50], 0.5),
    borderWidth: 1,
    borderColor: alpha(colors.red[100], 0.5),
    paddingHorizontal: sp(2.5),
    paddingVertical: sp(1),
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  itemSwitchCol: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
  // floating buttons
  fabCol: { position: "absolute", right: sp(4), zIndex: 30, alignItems: "flex-end", gap: sp(2) },
  fabAdd: { borderRadius: radius.full, paddingHorizontal: sp(5), paddingVertical: sp(3), overflow: "hidden", ...CARD_SHADOW, shadowColor: "#7e3866" },
  fabAddText: { ...fontSize.sm, fontWeight: "600", color: colors.white },
  fabMenu: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2),
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: restaurantTheme.border,
    backgroundColor: alpha(colors.white, 0.95),
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    ...CARD_SHADOW,
    shadowColor: "#7e3866",
  },
  fabMenuIcon: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  fabMenuText: { ...fontSize.sm, fontWeight: "600", color: restaurantTheme.brandDark },
  menuPopup: {
    position: "absolute",
    right: sp(4),
    zIndex: 31,
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: restaurantTheme.border,
    backgroundColor: colors.white,
    ...CARD_SHADOW,
    shadowColor: "#7e3866",
  },
  menuHead: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(3) },
  menuHeadText: { ...fontSize.sm, fontWeight: "600", color: restaurantTheme.brandDark },
  menuDivider: { marginHorizontal: sp(4), height: 1, backgroundColor: colors.slate[200] },
  menuList: { paddingHorizontal: sp(4), paddingVertical: sp(2), gap: sp(1) },
  menuRow: { width: "100%", paddingVertical: sp(3) },
  menuRowInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(2) },
  menuRowName: { ...fontSize.sm, fontWeight: "500", color: colors.slate[900], flex: 1 },
  menuCount: { height: 28, minWidth: 28, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: radius.full, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50] },
  menuCountText: { ...fontSize.xs, fontWeight: "600", color: colors.slate[700] },
  menuRowDivider: { marginTop: sp(3), borderTopWidth: 1, borderStyle: "dashed", borderColor: colors.slate[200] },
  // sheets
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius["2xl"], borderTopRightRadius: radius["2xl"], ...shadow["2xl"] },
  sheetHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(4), marginBottom: sp(6) },
  sheetTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900] },
  sheetSub: { ...fontSize.sm, color: colors.gray[500], marginTop: sp(1) },
  activeTag: { borderRadius: radius.full, backgroundColor: colors.gray[100], paddingHorizontal: sp(3), paddingVertical: sp(1) },
  activeTagText: { ...fontSize.xs, fontWeight: "500", color: colors.gray[700] },
  filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(3), borderRadius: radius.xl, borderWidth: 1, borderColor: colors.gray[200], paddingHorizontal: sp(4), paddingVertical: sp(3) },
  filterRowText: { ...fontSize.base, color: colors.gray[900] },
  filterCount: { minWidth: 28, height: 28, paddingHorizontal: 4, borderRadius: radius.full, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center" },
  filterCountText: { ...fontSize.xs, fontWeight: "500", color: colors.gray[700] },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.gray[300], alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND_COLOR },
  outlineBtn: { flex: 1, borderWidth: 1, borderColor: colors.gray[300], paddingVertical: sp(3), borderRadius: radius.lg, alignItems: "center" },
  outlineBtnText: { ...fontSize.base, fontWeight: "500", color: colors.gray[900] },
  primaryBtn: { flex: 1, paddingVertical: sp(3), borderRadius: radius.lg, alignItems: "center", overflow: "hidden" },
  primaryBtnText: { ...fontSize.base, fontWeight: "500", color: colors.white },
  toggleTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900], textAlign: "center", marginBottom: sp(6) },
  toggleCatName: { ...fontSize.base, fontWeight: "700", color: colors.gray[900], marginBottom: sp(3) },
  toggleCatLine: { ...fontSize.sm, color: colors.gray[600] },
  toggleCatDivider: { borderTopWidth: 1, borderTopColor: colors.gray[200], marginTop: sp(4) },
  optionRow: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingVertical: sp(4) },
  optionBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  optionText: { ...fontSize.base, color: colors.gray[900] },
  optionRadio: { marginLeft: "auto" },
  optionHint: { ...fontSize.sm, color: colors.gray[500] },
  stepper: { marginLeft: "auto", paddingVertical: sp(3), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(4) },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.gray[200], alignItems: "center", justifyContent: "center" },
  stepValue: { ...fontSize.base, fontWeight: "500", color: colors.gray[900], minWidth: 60, textAlign: "center" },
  customRow: { paddingVertical: sp(3), flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(4) },
  customBtn: {
    flex: 1,
    paddingHorizontal: sp(4),
    paddingVertical: sp(2.5),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customBtnText: { ...fontSize.sm, color: colors.gray[900] },
  // time wheel
  wheelCard: { maxWidth: 320, borderRadius: radius.lg, backgroundColor: colors.white, ...shadow["2xl"] },
  wheelBody: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: sp(8), paddingHorizontal: sp(4) },
  wheelCol: { flex: 1, alignItems: "center" },
  wheelColon: { paddingHorizontal: sp(2) },
  wheelColonText: { ...fontSize["2xl"], fontWeight: "700", color: colors.gray[900] },
  wheelItem: { height: WHEEL_ITEM, alignItems: "center", justifyContent: "center" },
  wheelItemOn: { ...fontSize.xl, fontWeight: "700", color: colors.gray[900] },
  wheelItemOff: { ...fontSize.base, color: colors.gray[400] },
  wheelLines: { position: "absolute", left: 0, right: 0, top: sp(8) + WHEEL_PAD },
  wheelLine: { borderTopWidth: 1, borderTopColor: colors.gray[300], marginHorizontal: sp(4) },
  wheelFooter: { borderTopWidth: 1, borderTopColor: colors.gray[200], paddingHorizontal: sp(4), paddingVertical: sp(4), alignItems: "center" },
  wheelOkay: { ...fontSize.base, fontWeight: "500", color: BRAND_COLOR },
  // calendar
  calendarCard: { maxWidth: 384, borderRadius: radius.lg, backgroundColor: colors.white, ...shadow["2xl"] },
  calendarHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: sp(4) },
  calendarNav: { padding: sp(1), borderRadius: radius.DEFAULT },
  calendarTitle: { ...fontSize.lg, fontWeight: "600", color: restaurantTheme.text },
  calendarRow: { flexDirection: "row", gap: 4 },
  calendarCell: { flex: 1, alignItems: "center", paddingVertical: sp(2) },
  calendarDayName: { ...fontSize.xs, fontWeight: "500", color: colors.gray[500] },
  calendarDay: { flex: 1, height: 40, borderRadius: radius.DEFAULT, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  calendarDayText: { ...fontSize.sm },
})
