// Web: modules/Food/pages/restaurant/auth/Login.jsx — phone + OTP login of the restaurant partner (both the /login and
// the /otp route render this screen; the step is read from the path). Native fixes from the delivery app's login
// (mobile-delivery DeliveryV2/pages/auth/SignIn.jsx): keyboard-closed page height + KeyboardAwareScrollView, the red
// waves scroll with the form, plain #B80B3D title, LoginExitGuard, OTP boxes kept in a ref, keyboard closed after the
// last digit / on unmount, first box refocused after a wrong code.
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Animated, Easing, Keyboard, Pressable, StyleSheet, View, useWindowDimensions } from "react-native"
import { useFocusEffect } from "expo-router"
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg"
import { LinearGradient } from "expo-linear-gradient"
import { Loader2, Pencil, X, ShieldCheck } from "lucide-react-native"
import { useNavigate, Link, useLocation, router } from "@/lib/router"
import { toast } from "@/lib/toast"
import { AppImage, Dialog, KeyboardAwareScrollView, Text, TextInput } from "@/native/ui"
import { StatusBar } from "@/native/ui/SectionStatusBar"
import { LoginExitGuard } from "@/native/ui/LoginExitGuard"
import { alpha, colors, fonts, restaurantTheme, shadow } from "@/theme"
import { restaurantAPI } from "@food/api"
import {
  setAuthData as setRestaurantAuthData,
  setRestaurantPendingPhone,
  setPendingTicket,
  clearPendingTicket,
  readLastPartnerRole,
  rememberPartnerRole,
  setPendingPartnerType,
} from "@food/utils/auth"
import PartnerRolePicker from "@food/components/restaurant/PartnerRolePicker"
import NewRoleConfirmDialog from "@food/components/restaurant/NewRoleConfirmDialog"
import useMyStoreEnabled from "@/shared/hooks/useMyStoreEnabled.js"
import { clearOnboardingFromLocalStorage, clearAllFilesFromDB, checkOnboardingStatus, isRestaurantOnboardingComplete } from "@/modules/Food/utils/onboardingUtils"
import { collectFcmTokenFast, persistModuleFcmToken } from "@food/utils/firebaseMessaging"
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo"
import { prefetchPolicyContentWhenIdle } from "@/shared/utils/policyPages"
import { hardNavigate } from "@/shared/utils/nativeShell"
import { requestPhoneFocus, usePhoneFocusRequest } from "@/shared/utils/loginFocus"

const DEFAULT_COUNTRY_CODE = "+91"
const RED = restaurantTheme.brand // #B80B3D
const RED_DARK = restaurantTheme.brandDark // #66001D

// The onboarding screen keeps picked photos under this sessionStorage prefix (the web's IndexedDB
// "RestaurantOnboardingFiles", which clearAllFilesFromDB deletes on the web): cleared together here.
const ONBOARDING_FILE_STORE_PREFIX = "RestaurantOnboardingFiles:"
const clearOnboardingFileStore = () => {
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(ONBOARDING_FILE_STORE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    // ignore
  }
}

/** Loader2 + animate-spin */
function Spinner({ color = "#ffffff", size = 20 }) {
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [spin])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  )
}

/** bg-gradient-to-r from-[#B80B3D] to-[#66001D] rounded-full button (disabled:opacity-50) */
function GradientButton({ onPress, disabled, children, style, radius = 9999, height }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btnShell,
        { borderRadius: radius },
        !disabled && styles.btnShadow,
        disabled && { opacity: 0.5 },
        pressed && !disabled && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <LinearGradient
        colors={[RED, RED_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.btnInner, { borderRadius: radius }, height ? { height, paddingVertical: 0 } : null]}
      >
        {children}
      </LinearGradient>
    </Pressable>
  )
}

// Drawn inside the scrolling content (not fixed behind it): when the keyboard opens and the form scrolls up, the red
// design moves up with the logo instead of the logo sliding over a fixed wave (delivery app fix, Prince 26 Oct).
// Web: top wave h-[40vh], bottom wave h-[50vh], both scale 1.05, gradient 135deg #B80B3D -> #66001D.
function Waves({ height }) {
  const { width } = useWindowDimensions()
  const topH = height * 0.4
  const botH = height * 0.5
  return (
    <>
      <View pointerEvents="none" style={[styles.wave, { top: 0, height: topH, transform: [{ scale: 1.05 }] }]}>
        <Svg width={width} height={topH} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <Defs>
            <SvgGradient id="topRedGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={RED} />
              <Stop offset="1" stopColor={RED_DARK} />
            </SvgGradient>
          </Defs>
          <Path fill="url(#topRedGrad)" d="M -50,-50 L -50,280 C 200,100 800,100 1490,100 L 1490,-50 Z" />
        </Svg>
      </View>
      <View pointerEvents="none" style={[styles.wave, { top: height - botH, height: botH, transform: [{ scale: 1.05 }] }]}>
        <Svg width={width} height={botH} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <Defs>
            <SvgGradient id="botRedGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={RED} />
              <Stop offset="1" stopColor={RED_DARK} />
            </SvgGradient>
          </Defs>
          <Path fill="url(#botRedGrad)" d="M -50,370 L -50,220 C 640,220 1240,220 1490,40 L 1490,370 Z" />
        </Svg>
      </View>
    </>
  )
}

export default function RestaurantLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const isOtpStep = location.pathname.endsWith("/otp")
  // The page keeps the height it had with the keyboard closed (no re-centring when the window shrinks: the logo must
  // not jump); only as much scrolls as the number box and the button need.
  const { height: liveWindowHeight } = useWindowDimensions()
  const fullHeightRef = useRef(liveWindowHeight)
  if (liveWindowHeight > fullHeightRef.current) fullHeightRef.current = liveWindowHeight
  const windowHeight = fullHeightRef.current

  // Cleanup onboarding on initial mount only
  useEffect(() => {
    clearOnboardingFromLocalStorage()
    clearAllFilesFromDB()
    clearOnboardingFileStore()
  }, [])

  // Terms / Privacy / Support load in the background so tapping one opens it straight away.
  useEffect(() => prefetchPolicyContentWhenIdle("restaurant"), [])

  // Close the keyboard when the screen goes away
  useEffect(() => () => Keyboard.dismiss(), [])

  // Step 1 States
  const phoneInputRef = useRef(null)
  // The login screen stays mounted under the code screen: the pencil's "focus the number box" note is read each time
  // the login screen is shown again (web: the page mounted again).
  const [screenFocused, setScreenFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true)
      return () => setScreenFocused(false)
    }, []),
  )
  // cursor into the number box only when coming back with the pencil (not after a logout / plain visit)
  usePhoneFocusRequest(() => phoneInputRef.current, !isOtpStep && screenFocused)

  // Never prefill a number (the old dev "default test phone" leaked into
  // builds). Only what the restaurant typed is kept — saved on every change so
  // a trip to Terms / Privacy / Support and back doesn't wipe it.
  const [phone, setPhoneState] = useState(() => {
    try {
      if (sessionStorage.getItem("restaurantClearLoginPhone") === "1") {
        sessionStorage.removeItem("restaurantClearLoginPhone")
        sessionStorage.removeItem("restaurantLoginPhone")
        return ""
      }
      return sessionStorage.getItem("restaurantLoginPhone") || ""
    } catch {
      return ""
    }
  })
  const setPhone = (value) => {
    setPhoneState(value)
    try {
      if (value) sessionStorage.setItem("restaurantLoginPhone", value)
      else sessionStorage.removeItem("restaurantLoginPhone")
    } catch {
      // ignore
    }
  }
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  // Restaurant Partner or My Store — chosen before the OTP is sent; a number
  // belongs to one of them only. Last choice is remembered across logins.
  // Global admin can switch My Store off: then the login is the plain Restaurant Partner login again.
  const myStoreEnabled = useMyStoreEnabled()
  const [chosenPartnerType, setPartnerTypeState] = useState(readLastPartnerRole)
  const partnerType = myStoreEnabled ? chosenPartnerType : "restaurant"
  const setPartnerType = (value) => {
    setPartnerTypeState(value)
    rememberPartnerRole(value)
  }
  // The number already has an account for the OTHER role: ask before creating a second one.
  const [roleConfirm, setRoleConfirm] = useState(null)

  // Step 2 States
  const [otp, setOtpState] = useState(["", "", "", ""])
  // Latest boxes for the key / change handlers (two quick key presses must not read a stale array).
  const otpRef = useRef(["", "", "", ""])
  const setOtp = (next) => {
    otpRef.current = next
    setOtpState(next)
  }
  const [otpError, setOtpError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [blockTimer, setBlockTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const [showRestorePopup, setShowRestorePopup] = useState(false)
  const [, setDeletedAccountData] = useState(null)
  const [focusedField, setFocusedField] = useState(null)
  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)
  const isSuccessRef = useRef(false)

  const getBlockKey = (phoneStr) => {
    const clean = phoneStr?.replace(/\D/g, "") || ""
    return clean ? `restaurant_block_expires_at_${clean}` : "restaurant_block_expires_at"
  }

  const getResendKey = (phoneStr) => {
    const clean = phoneStr?.replace(/\D/g, "") || ""
    return clean ? `restaurant_resend_expires_at_${clean}` : "restaurant_resend_expires_at"
  }

  // Web: navigate("/food/restaurant/login"). The login screen is the one under this code screen in the native stack,
  // so going back to it returns there (a push would leave a second login screen in the stack).
  const goToLoginScreen = () => {
    Keyboard.dismiss()
    if (isOtpStep && router.canGoBack()) navigate(-1)
    else navigate("/food/restaurant/login", { replace: true })
  }

  // Handle route changes between /login and /otp
  useEffect(() => {
    if (!isOtpStep) {
      setOtp(["", "", "", ""])
      setOtpError("")
      return
    }

    const stored = sessionStorage.getItem("restaurantAuthData")
    let currentPhone = ""
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)

      if (data.method === "email" && data.email) {
        setContactInfo(data.email)
        currentPhone = data.email
      } else if (data.phone) {
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        let formatted = ""
        if (phoneMatch) {
          formatted = `${phoneMatch[1]} ${phoneMatch[2].replace(/\D/g, "")}`
        } else {
          formatted = data.phone || ""
        }
        setContactInfo(formatted)
        currentPhone = formatted
      }
    } else {
      navigate("/food/restaurant/login", { replace: true })
      return
    }

    const blockKey = getBlockKey(currentPhone)
    const resendKey = getResendKey(currentPhone)

    // Resume block timer
    const savedBlockExpiry = sessionStorage.getItem(blockKey)
    if (savedBlockExpiry) {
      const remaining = Math.max(0, Math.floor((parseInt(savedBlockExpiry) - Date.now()) / 1000))
      if (remaining > 0) {
        setBlockTimer(remaining)
      } else {
        sessionStorage.removeItem(blockKey)
      }
    } else if (location.state?.initialBlockMins) {
      const seconds = Math.ceil(location.state.initialBlockMins * 60)
      setBlockTimer(seconds)
      sessionStorage.setItem(blockKey, (Date.now() + (seconds * 1000)).toString())
    }

    // Resume resend timer
    const savedResendExpiry = sessionStorage.getItem(resendKey)
    if (savedResendExpiry) {
      const remaining = Math.max(0, Math.floor((parseInt(savedResendExpiry) - Date.now()) / 1000))
      if (remaining > 0) {
        setResendTimer(remaining)
      } else {
        sessionStorage.removeItem(resendKey)
      }
    } else {
      setResendTimer(59)
      sessionStorage.setItem(resendKey, (Date.now() + (59 * 1000)).toString())
    }
     
  }, [isOtpStep, navigate, location.state])

  // OTP Timers
  useEffect(() => {
    if (resendTimer <= 0) return undefined
    const timer = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendTimer])

  useEffect(() => {
    if (blockTimer <= 0) return undefined
    const timer = setInterval(() => {
      setBlockTimer((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [blockTimer])

  // Put the cursor in a box and open the keyboard (blur first: Android treats it as a new focus and shows the keyboard
  // even right after the phone screen's keyboard closed).
  const focusOtpBox = (index, delay = 0) => {
    setTimeout(() => {
      const el = inputRefs.current[index]
      el?.blur()
      el?.focus()
    }, delay)
  }

  // Autofocus first OTP box + open the keyboard automatically
  useEffect(() => {
    if (!isOtpStep) return undefined
    const timer = setTimeout(() => {
      const el = inputRefs.current[0]
      el?.blur()
      el?.focus()
    }, 300)
    return () => clearTimeout(timer)
  }, [isOtpStep])

  const validatePhone = (num) => {
    const digits = num.replace(/\D/g, "")
    if (digits.length !== 10) return false
    return ["6", "7", "8", "9"].includes(digits[0])
  }

  // Action Step 1: Send OTP
  const handleSendOTP = async (e, confirmNewRole = false) => {
    if (!validatePhone(phone)) {
      toast.error("Please enter a valid 10-digit mobile number")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    const fullPhone = `${DEFAULT_COUNTRY_CODE} ${phone}`.trim()

    try {
      const sendRes = await restaurantAPI.sendOTP(fullPhone, "login", null, partnerType, confirmNewRole)
      const sendData = sendRes?.data?.data || sendRes?.data || {}
      if (sendData.requiresRoleConfirmation) {
        // No OTP was sent yet — show the "create a new account for this role?" popup first.
        Keyboard.dismiss()
        setRoleConfirm({ existing: sendData.existingPartnerType === "store" ? "store" : "restaurant" })
        return
      }
      setRoleConfirm(null)
      const nextAuthData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        module: "restaurant",
        partnerType,
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(nextAuthData))
      sessionStorage.setItem("restaurantLoginPhone", phone)

      // Web: navigate to /otp (both routes render this screen)
      navigate("/food/restaurant/otp")
    } catch (apiErr) {
      const msg = apiErr?.response?.data?.error || apiErr?.response?.data?.message || apiErr?.message || "Failed to send OTP."
      const lowerMsg = msg.toLowerCase()
      const isBlocked = lowerMsg.includes("blocked") ||
                        lowerMsg.includes("too many attempts") ||
                        lowerMsg.includes("try again after")

      if (isBlocked) {
        let totalMins = 3
        const timeMatch = msg.match(/(\d+)(?::(\d+))?/)
        if (timeMatch) {
          const mins = parseInt(timeMatch[1])
          const secs = timeMatch[2] ? parseInt(timeMatch[2]) / 60 : 0
          totalMins = mins + secs
        }

        const nextAuthData = {
          method: "phone",
          phone: fullPhone,
          isSignUp: false,
          module: "restaurant",
          partnerType,
        }
        sessionStorage.setItem("restaurantAuthData", JSON.stringify(nextAuthData))
        sessionStorage.setItem("restaurantLoginPhone", phone)
        navigate("/food/restaurant/otp", { state: { initialBlockMins: totalMins } })
        return
      }
      setRoleConfirm(null)
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  // Action Step 2: Verify OTP
  const handleVerify = async (otpValue = null, confirmAction = null) => {
    const code = otpValue || otpRef.current.join("")

    if (code.length !== 4) {
      toast.error("Please enter the complete 4-digit code")
      hasSubmittedRef.current = false
      return
    }

    if (isSuccessRef.current || loading || blockTimer > 0) return
    if (!confirmAction && hasSubmittedRef.current) return

    setLoading(true)
    if (!confirmAction) hasSubmittedRef.current = true

    try {
      if (!authData) throw new Error("Session expired. Please login again.")

      const phoneVal = authData.phone
      const purpose = authData.isSignUp ? "register" : "login"
      const verifyPartnerType = authData.partnerType === "store" ? "store" : "restaurant"

      const { fcmToken, platform } = await collectFcmTokenFast("restaurant")

      const response = await restaurantAPI.verifyOTP(
        phoneVal,
        code,
        purpose,
        null,
        authData.email,
        fcmToken,
        platform,
        confirmAction,
        verifyPartnerType,
      )
      const data = response?.data?.data || response?.data

      // Lets the "under review" screen log in by itself once admin approves.
      if (data?.pendingTicket) setPendingTicket("restaurant", data.pendingTicket)
      else if (data?.accessToken) clearPendingTicket("restaurant")

      if (data.deletedAccountFound) {
        Keyboard.dismiss()
        setDeletedAccountData(data)
        setShowRestorePopup(true)
        setLoading(false)
      } else if (data.pendingApproval === true) {
        isSuccessRef.current = true
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        sessionStorage.removeItem(getBlockKey(phoneVal))
        sessionStorage.removeItem(getResendKey(phoneVal))
        setRestaurantPendingPhone(phoneVal)
        const isRejected = Boolean(data.isRejected)
        setPendingPartnerType(verifyPartnerType)
        const statusVal = isRejected ? "rejected" : "pending"
        localStorage.setItem("restaurant_pendingStatus", statusVal)
        localStorage.setItem("restaurant_pendingMessage", data.message || "")
        setShowRestorePopup(false)
        setLoading(false)
        Keyboard.dismiss()
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: {
            phone: phoneVal || "",
            isRejected,
            isDisabled: false,
            message: data.message,
          },
        })
      } else if (data.needsRegistration === true) {
        isSuccessRef.current = true
        setRestaurantPendingPhone(phoneVal)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        sessionStorage.removeItem(getBlockKey(phoneVal))
        sessionStorage.removeItem(getResendKey(phoneVal))
        setShowRestorePopup(false)
        Keyboard.dismiss()
        hardNavigate(
          verifyPartnerType === "store"
            ? "/food/restaurant/onboarding?type=store"
            : "/food/restaurant/onboarding",
        )
      } else {
        isSuccessRef.current = true
        const accessToken = data.accessToken
        const restaurant = data.restaurant || data.user
        const status = String(restaurant?.status || "").toLowerCase()

        if (status && status !== "approved") {
          setPendingPartnerType(restaurant?.partnerType === "store" ? "store" : verifyPartnerType)
          sessionStorage.removeItem("restaurantAuthData")
          sessionStorage.removeItem("restaurantLoginPhone")
          sessionStorage.removeItem(getBlockKey(phoneVal))
          sessionStorage.removeItem(getResendKey(phoneVal))
          setRestaurantPendingPhone(phoneVal)
          const isRejected = status === "rejected"
          const isDisabled = status === "banned" || status === "deleted"
          const statusVal = isDisabled ? "banned" : (isRejected ? "rejected" : "pending")
          localStorage.setItem("restaurant_pendingStatus", statusVal)
          localStorage.setItem(
            "restaurant_pendingMessage",
            isRejected
              ? (restaurant?.rejectionReason
                  ? `Your restaurant registration has been rejected. Reason: ${restaurant.rejectionReason}`
                  : "Your restaurant registration has been rejected. Please contact support.")
              : "Your restaurant registration is pending approval.",
          )
          setShowRestorePopup(false)
          setLoading(false)
          Keyboard.dismiss()
          navigate("/food/restaurant/pending-verification", {
            replace: true,
            state: {
              phone: phoneVal || "",
              isRejected,
              isDisabled,
            },
          })
          return
        }

        setRestaurantAuthData("restaurant", accessToken, restaurant, data?.refreshToken)
        window.dispatchEvent(new Event("restaurantAuthChanged"))
        try {
          await persistModuleFcmToken("restaurant", { fcmToken, platform })
        } catch {
          // ignore
        }
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        sessionStorage.removeItem(getBlockKey(phoneVal))
        sessionStorage.removeItem(getResendKey(phoneVal))
        setShowRestorePopup(false)
        Keyboard.dismiss()

        if (authData?.isSignUp) {
          hardNavigate("/food/restaurant/onboarding")
        } else {
          const onboardingComplete = isRestaurantOnboardingComplete(restaurant)
          if (!onboardingComplete) {
            const incompleteStep = await checkOnboardingStatus()
            if (incompleteStep) {
              hardNavigate(`/food/restaurant/onboarding?step=${incompleteStep}`)
              return
            }
          }
          hardNavigate("/food/restaurant")
        }
      }
    } catch (err) {
      const message = err?.response?.data?.error || err?.response?.data?.message || "Invalid OTP. Please try again."
      setOtp(["", "", "", ""])

      const isBlocked = message.toLowerCase().includes("blocked") ||
                        message.toLowerCase().includes("too many attempts") ||
                        message.toLowerCase().includes("try again after")

      if (isBlocked) {
        let totalSeconds = 180
        const timeMatch = message.match(/(\d+)(?::(\d+))?/)
        if (timeMatch) {
          const mins = parseInt(timeMatch[1])
          const secs = timeMatch[2] ? parseInt(timeMatch[2]) : 0
          totalSeconds = (mins * 60) + secs
        }
        setBlockTimer(totalSeconds)
        sessionStorage.setItem(getBlockKey(authData?.phone || ""), (Date.now() + (totalSeconds * 1000)).toString())
      } else {
        if (/pending approval|rejected|disabled|banned/i.test(message)) {
          const pendingPhone = authData?.phone || authData?.email || contactInfo
          setRestaurantPendingPhone(pendingPhone)

          const isRejected = /rejected/i.test(message)
          const isDisabled = /disabled|banned/i.test(message)
          const statusVal = isDisabled ? "banned" : (isRejected ? "rejected" : "pending")

          localStorage.setItem("restaurant_pendingStatus", statusVal)
          localStorage.setItem("restaurant_pendingMessage", message)

          Keyboard.dismiss()
          navigate("/food/restaurant/pending-verification", {
            replace: true,
            state: {
              phone: pendingPhone || "",
              isRejected: isRejected,
              isDisabled: isDisabled,
              message: message,
            },
          })
          return
        }

        if (/invalid/i.test(message)) {
          setOtpError("Invalid OTP")
        } else {
          toast.error(message)
        }
      }
      hasSubmittedRef.current = false
      setLoading(false)
      // wrong code: boxes emptied, cursor back in the first box with the keyboard open
      focusOtpBox(0, 150)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || blockTimer > 0) return
    setLoading(true)
    try {
      const purpose = authData.isSignUp ? "register" : "login"
      await restaurantAPI.sendOTP(authData.phone, purpose, authData.email, authData.partnerType)
      setResendTimer(59)
      sessionStorage.setItem(getResendKey(authData.phone), (Date.now() + (59 * 1000)).toString())
      // Clear the old code from the boxes — only the new one should be entered.
      setOtp(["", "", "", ""])
      setOtpError("")
      hasSubmittedRef.current = false
      focusOtpBox(0, 50)
      toast.success("OTP resent successfully.", { duration: 3000 })
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to resend code")
    } finally {
      setLoading(false)
    }
  }

  const handleRestoreAction = async (action) => {
    const code = otpRef.current.join("")
    await handleVerify(code, action)
  }

  const afterOtpUpdate = (newOtp, nextIndex) => {
    if (newOtp.every((digit) => digit !== "")) {
      // last digit in: put the keyboard away so "Verify & Continue" is in view
      Keyboard.dismiss()
    } else if (nextIndex != null) {
      inputRefs.current[nextIndex]?.focus()
    }
  }

  const handleChange = (index, rawValue) => {
    let value = String(rawValue ?? "")
    if (index === 0 && value) {
      setOtpError("")
    }

    const current = otpRef.current
    // a box keeps its digit selected on focus; typing over it on a keyboard that does not replace the selection gives
    // "old+new": keep the new digit only
    if (value.length === 2 && current[index] && value.startsWith(current[index])) {
      value = value.slice(1)
    }

    if (value.length > 1) {
      // pasted / auto-filled code (web: onPaste + multi-char change)
      const digits = value.replace(/\D/g, "").slice(0, 4 - index).split("")
      if (digits.length > 0) {
        const newOtp = [...current]
        digits.forEach((digit, i) => {
          if (index + i < 4) {
            newOtp[index + i] = digit
          }
        })
        setOtp(newOtp)
        afterOtpUpdate(newOtp, Math.min(3, index + digits.length))
      }
      return
    }

    if (value && !/^\d$/.test(value)) return

    const newOtp = [...current]
    newOtp[index] = value
    setOtp(newOtp)

    if (value) afterOtpUpdate(newOtp, index < 3 ? index + 1 : null)
  }

  const handleKeyDown = (index, e) => {
    if (e?.nativeEvent?.key === "Backspace") {
      const current = otpRef.current
      if (!current[index] && index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...current]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
  }

  const formatResendTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const isOtpComplete = otp.every((digit) => digit !== "")

  // On the OTP step the role comes from what was chosen when the code was sent.
  const activePartnerType = isOtpStep && authData?.partnerType ? authData.partnerType : partnerType
  const isStoreLogin = activePartnerType === "store"

  const showLoginStep = !isOtpStep

  // step change slide (web: framer-motion opacity 0 -> 1, x ±20, 0.3 s). Not on the first open: after a log-out the
  // form is there at once (Prince, 27 Oct: the fade-in read as a blink).
  const stepAnim = useRef(new Animated.Value(1)).current
  const stepAnimFirst = useRef(true)
  useEffect(() => {
    if (stepAnimFirst.current) {
      stepAnimFirst.current = false
      return
    }
    stepAnim.setValue(0)
    Animated.timing(stepAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [stepAnim, showLoginStep])
  const stepStyle = {
    opacity: stepAnim,
    transform: [{ translateX: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [showLoginStep ? -20 : 20, 0] }) }],
  }

  // web: motion.div opacity 0 -> 1, y -6 -> 0 for the error line
  const errorAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!otpError) return
    errorAnim.setValue(0)
    Animated.timing(errorAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start()
  }, [otpError, errorAnim])

  const closeRestorePopup = () => {
    setShowRestorePopup(false)
    goToLoginScreen()
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LoginExitGuard enabled={showLoginStep} dirty={phone.length > 0} accent={RED} />

      {/* Main Content (the focused field and the button under it stay above the keyboard) */}
      <KeyboardAwareScrollView
        style={styles.fill}
        extraOffset={showLoginStep ? 96 : 120}
        contentContainerStyle={[styles.main, { minHeight: windowHeight }]}
        showsVerticalScrollIndicator={false}
      >
        <Waves height={windowHeight} />
        <View style={styles.column}>
          {/* Logo & Header */}
          <View style={styles.header}>
            <AppImage src={DEFAULT_BRAND_LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="Hello Parth" />
            <Text style={styles.title}>{isStoreLogin ? "My Store" : "Restaurant Partner"}</Text>
            <View style={styles.subtitleWrap}>
              {showLoginStep ? (
                <Text style={styles.subtitle}>
                  {isStoreLogin
                    ? "Enter your registered mobile number to manage your store"
                    : "Enter your registered mobile number to manage your restaurant"}
                </Text>
              ) : (
                <View style={styles.sentRow}>
                  <Text style={styles.sentText} numberOfLines={1}>{`We've sent a code to ${contactInfo}`}</Text>
                  <Pressable
                    onPress={() => {
                      requestPhoneFocus()
                      goToLoginScreen()
                    }}
                    accessibilityLabel="Edit phone number"
                    style={({ pressed }) => [styles.pencilBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    <LinearGradient colors={[RED, RED_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pencilInner}>
                      <Pencil size={14} color="#ffffff" strokeWidth={2.5} />
                    </LinearGradient>
                  </Pressable>
                </View>
              )}
            </View>
          </View>

          <Animated.View style={stepStyle}>
            {showLoginStep ? (
              // Step 1: Mobile Form
              <View style={{ gap: 24 }}>
                {myStoreEnabled ? (
                  <PartnerRolePicker value={partnerType} onValueChange={setPartnerType} disabled={loading} />
                ) : null}
                <View style={[styles.phoneField, focusedField === "phone" && styles.fieldFocused]}>
                  <View style={styles.ccWrap} pointerEvents="none">
                    <Text style={styles.cc}>+91</Text>
                  </View>
                  <TextInput
                    ref={phoneInputRef}
                    keyboardType="phone-pad"
                    inputMode="tel"
                    autoComplete="tel-national"
                    textContentType="telephoneNumber"
                    value={phone}
                    onChangeText={(value) => setPhone(String(value).replace(/\D/g, "").slice(0, 10))}
                    maxLength={10}
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                    onSubmitEditing={() => !(loading || phone.length < 10) && handleSendOTP()}
                    returnKeyType="done"
                    style={styles.phoneInput}
                    placeholder="Mobile number"
                    placeholderTextColor={colors.gray[400]}
                  />
                </View>

                <GradientButton onPress={() => handleSendOTP()} disabled={loading || phone.length < 10}>
                  {loading ? <Spinner /> : <Text style={styles.btnText}>Log in</Text>}
                </GradientButton>
              </View>
            ) : (
              // Step 2: OTP Verification Form
              <View style={{ gap: 24 }}>
                {otpError ? (
                  <Animated.View
                    style={{ opacity: errorAnim, transform: [{ translateY: errorAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}
                  >
                    <Text style={styles.error}>{otpError}</Text>
                  </Animated.View>
                ) : null}

                <View style={styles.otpRow}>
                  {[0, 1, 2, 3].map((index) => (
                    <TextInput
                      key={index}
                      ref={(el) => {
                        inputRefs.current[index] = el
                      }}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "sms-otp" : "off"}
                      textContentType={index === 0 ? "oneTimeCode" : "none"}
                      editable={!(loading || blockTimer > 0)}
                      value={otp[index]}
                      onChangeText={(text) => handleChange(index, text)}
                      onKeyPress={(e) => handleKeyDown(index, e)}
                      onFocus={() => setFocusedField(`otp-${index}`)}
                      onBlur={() => setFocusedField(null)}
                      selectTextOnFocus
                      style={[
                        styles.otpBox,
                        focusedField === `otp-${index}` && styles.fieldFocused,
                        blockTimer > 0 && styles.otpBlocked,
                      ]}
                      placeholder="•"
                      placeholderTextColor={colors.gray[400]}
                    />
                  ))}
                </View>

                <View style={{ alignItems: "center", gap: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {blockTimer > 0 ? (
                      <Text style={[styles.resendMuted, { letterSpacing: 0.6 }]}>RESEND SMS</Text>
                    ) : resendTimer > 0 ? (
                      <Text style={styles.resendMuted}>
                        {"Resend SMS in "}
                        <Text style={styles.resendTime}>{formatResendTimer(resendTimer)}</Text>
                      </Text>
                    ) : (
                      <Pressable onPress={handleResend} hitSlop={8}>
                        <Text style={styles.resendLink}>Didn&apos;t receive SMS? Resend SMS</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                <GradientButton
                  onPress={() => handleVerify()}
                  disabled={loading || !isOtpComplete || blockTimer > 0}
                  style={{ marginTop: 16 }}
                >
                  {loading ? (
                    <View style={styles.rowCenter}>
                      <Spinner />
                      <Text style={styles.btnText}>Verifying...</Text>
                    </View>
                  ) : (
                    <Text style={styles.btnText}>Verify & Continue</Text>
                  )}
                </GradientButton>

                {blockTimer > 0 ? (
                  <View style={styles.blockBox}>
                    <Text style={styles.blockTitle}>TOO MANY FAILED ATTEMPTS</Text>
                    <Text style={styles.blockTime}>
                      {`Try again after ${Math.floor((blockTimer - 1) / 60)}:${String((blockTimer - 1) % 60).padStart(2, "0")}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </Animated.View>

          {/* Footer Info - only on login step, not OTP */}
          {!isOtpStep ? (
            <View style={{ marginTop: 32, alignItems: "center" }}>
              <Text style={styles.legal}>By continuing, you agree to our</Text>
              <View style={styles.legalRow}>
                <Link to="/food/restaurant/terms" state={{ from: "/food/restaurant/login" }}>
                  <Text style={styles.legalLink}>TERMS</Text>
                </Link>
                <Text style={styles.legalDot}>•</Text>
                <Link to="/food/restaurant/privacy" state={{ from: "/food/restaurant/login" }}>
                  <Text style={styles.legalLink}>PRIVACY</Text>
                </Link>
                <Text style={styles.legalDot}>•</Text>
                <Link to="/food/restaurant/help-content" state={{ from: "/food/restaurant/login" }}>
                  <Text style={styles.legalLink}>SUPPORT</Text>
                </Link>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollView>

      <NewRoleConfirmDialog
        open={Boolean(roleConfirm)}
        requestedPartnerType={partnerType}
        existingPartnerType={roleConfirm?.existing}
        busy={loading}
        onConfirm={() => handleSendOTP(null, true)}
        onClose={() => setRoleConfirm(null)}
      />

      {/* Restore/New Account Popup */}
      <Dialog open={showRestorePopup} onClose={closeRestorePopup} backdropOpacity={0.6} style={styles.restoreCard}>
        <Pressable
          onPress={closeRestorePopup}
          accessibilityLabel="Close and return to login"
          style={({ pressed }) => [styles.restoreClose, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.gray[100] }]}
        >
          <X size={20} color={colors.gray[400]} />
        </Pressable>

        <View style={styles.restoreIcon}>
          <ShieldCheck size={40} color={RED} />
        </View>

        <Text style={styles.restoreTitle}>Restaurant Found!</Text>
        <Text style={styles.restoreText}>
          {"An existing deleted restaurant for "}
          <Text style={{ fontWeight: "700", color: colors.gray[900] }}>{contactInfo}</Text>
          {" was found. Do you want to restore your old data or start fresh with a new account?"}
        </Text>

        <View style={{ gap: 16 }}>
          <GradientButton onPress={() => handleRestoreAction("restore")} radius={16} height={56}>
            <Text style={[styles.btnText, { fontWeight: "700" }]}>Restore My Account</Text>
          </GradientButton>
          <Pressable
            onPress={() => handleRestoreAction("new")}
            style={({ pressed }) => [styles.newAccountBtn, pressed && { transform: [{ scale: 0.98 }], backgroundColor: colors.gray[50] }]}
          >
            <Text style={styles.newAccountText}>Create New Account</Text>
          </Pressable>
        </View>
      </Dialog>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white, overflow: "hidden" },
  fill: { flex: 1 },
  wave: { position: "absolute", left: 0, right: 0 },
  main: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingTop: 48, paddingBottom: 96 },
  column: { width: "100%", maxWidth: 384, top: -40 },
  header: { marginBottom: 20, alignItems: "center" },
  logo: { height: 112, width: 220, marginBottom: -14 },
  // web: text-[25px] font-extrabold text-[#B80B3D] tracking-tight font-['Outfit']
  title: { fontFamily: fonts.outfit, fontWeight: "800", fontSize: 25, lineHeight: 34, letterSpacing: -0.6, color: RED, textAlign: "center" },
  subtitleWrap: { maxWidth: 310, paddingHorizontal: 16, marginTop: 12, alignItems: "center" },
  subtitle: { fontFamily: fonts.outfit, fontWeight: "500", fontSize: 13.5, lineHeight: 22, letterSpacing: 0.3, color: colors.slate[600], textAlign: "center" },
  sentRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
  sentText: { fontFamily: fonts.outfit, fontWeight: "600", fontSize: 13, lineHeight: 21, letterSpacing: 0.2, color: alpha(colors.slate[500], 0.9), flexShrink: 1 },
  pencilBtn: { marginLeft: 4, borderRadius: 10, ...shadow.md, shadowColor: RED },
  pencilInner: { padding: 6, borderRadius: 10 },
  phoneField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.gray[50],
    borderWidth: 2,
    borderColor: colors.gray[300],
    borderRadius: 9999,
    ...shadow.sm,
  },
  ccWrap: { paddingLeft: 24, paddingRight: 0 },
  cc: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.gray[500], paddingRight: 12, borderRightWidth: 1, borderRightColor: colors.gray[300] },
  phoneInput: { flex: 1, paddingLeft: 12, paddingRight: 24, paddingVertical: 14, fontSize: 16, fontWeight: "500", color: colors.gray[900] },
  fieldFocused: { backgroundColor: colors.white, borderColor: RED },
  btnShell: { width: "100%" },
  btnShadow: { elevation: 6, shadowColor: RED, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  btnInner: { width: "100%", paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  btnText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: "500" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  error: { color: colors.red[600], fontSize: 15, fontWeight: "700", textAlign: "center", letterSpacing: 0.4, marginBottom: 16, marginTop: 8 },
  otpRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  otpBox: {
    width: 56,
    height: 56,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    backgroundColor: colors.gray[50],
    borderWidth: 2,
    borderColor: colors.gray[300],
    borderRadius: 20,
    color: colors.gray[900],
    padding: 0,
    ...shadow.sm,
  },
  otpBlocked: { opacity: 0.5, borderColor: colors.red[400], backgroundColor: colors.red[50], color: colors.red[800] },
  resendMuted: { fontSize: 12, lineHeight: 16, color: colors.gray[400], fontWeight: "800" },
  resendTime: { color: colors.slate[800], fontWeight: "900" },
  resendLink: { fontSize: 12, lineHeight: 16, color: colors.slate[800], fontWeight: "800" },
  blockBox: {
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.red[50],
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.red[100],
    marginTop: 16,
    alignItems: "center",
  },
  blockTitle: { fontSize: 11, fontWeight: "700", color: RED, letterSpacing: 0.6 },
  blockTime: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: RED },
  legal: { fontSize: 11, lineHeight: 18, fontWeight: "500", color: alpha(colors.gray[400], 0.8), textAlign: "center" },
  legalRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  legalLink: { fontSize: 11, lineHeight: 18, fontWeight: "600", color: colors.gray[400], letterSpacing: 0.6 },
  legalDot: { fontSize: 11, lineHeight: 18, fontWeight: "700", color: alpha(colors.gray[400], 0.8), marginHorizontal: 8 },
  restoreCard: { maxWidth: 384, borderRadius: 24, padding: 32, alignItems: "stretch", borderWidth: 1, borderColor: colors.gray[100], backgroundColor: colors.white, ...shadow["2xl"] },
  restoreClose: { position: "absolute", top: 16, right: 16, padding: 8, borderRadius: 14, zIndex: 2 },
  restoreIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: alpha(RED, 0.1), alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 24 },
  restoreTitle: { fontSize: 24, lineHeight: 32, fontWeight: "700", color: colors.gray[900], marginBottom: 12, textAlign: "center" },
  restoreText: { fontSize: 16, lineHeight: 26, color: colors.gray[500], marginBottom: 32, textAlign: "center" },
  newAccountBtn: { height: 56, borderWidth: 2, borderColor: colors.gray[200], borderRadius: 16, alignItems: "center", justifyContent: "center" },
  newAccountText: { fontSize: 16, fontWeight: "700", color: colors.gray[700] },
})
