import React, { useState, useEffect, useRef, useCallback } from "react"
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
import { alpha, colors, fonts, shadow } from "@/theme"
import { deliveryAPI } from "@food/api"
import { setAuthData as storeAuthData, clearModuleAuth, setPendingTicket, clearPendingTicket } from "@food/utils/auth"
import { collectFcmTokenFast, persistModuleFcmToken, finalizeDeliveryPendingSubmission, prefetchModuleFcmToken } from "@food/utils/firebaseMessaging"
import { getUserFacingApiError, showUserFacingApiError } from "@/shared/utils/apiError"
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo"
import { prefetchPolicyContentWhenIdle } from "@/shared/utils/policyPages"
import { requestPhoneFocus, usePhoneFocusRequest } from "@/shared/utils/loginFocus"

const DEFAULT_COUNTRY_CODE = "+91"
const BLUE = "#0E4B9C"
const NAVY = "#021024"

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

/** bg-gradient-to-r from-[#0E4B9C] to-[#021024] rounded-full button (disabled:opacity-50) */
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
        colors={[BLUE, NAVY]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.btnInner, { borderRadius: radius }, height ? { height, paddingVertical: 0 } : null]}
      >
        {children}
      </LinearGradient>
    </Pressable>
  )
}

/** h2 (web: bg-gradient-to-r from-[#0E4B9C] to-[#06336B] bg-clip-text). Plain blue text: an SVG text with a gradient
 * fill drew the D and P filled in on Android (Prince, 26 Oct). */
function GradientTitle({ text }) {
  return <Text style={styles.title}>{text}</Text>
}

// Drawn inside the scrolling content (not fixed behind it): when the keyboard opens and the form scrolls up, the blue
// design moves up with the logo like a native pan, instead of the logo sliding over the fixed blue wave (Prince, 26 Oct).
// The bottom wave sits at the bottom of the first screen (the keyboard room added below the content does not move it).
function Waves({ height }) {
  const { width } = useWindowDimensions()
  const topH = height * 0.4
  const botH = height * 0.5
  return (
    <>
      <View pointerEvents="none" style={[styles.wave, { top: 0, height: topH, transform: [{ scale: 1.05 }] }]}>
        <Svg width={width} height={topH} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <Defs>
            <SvgGradient id="topBlueGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={BLUE} />
              <Stop offset="1" stopColor={NAVY} />
            </SvgGradient>
          </Defs>
          <Path fill="url(#topBlueGrad)" d="M -50,-50 L -50,280 C 200,100 800,100 1490,100 L 1490,-50 Z" />
        </Svg>
      </View>
      <View pointerEvents="none" style={[styles.wave, { top: height - botH, height: botH, transform: [{ scale: 1.05 }] }]}>
        <Svg width={width} height={botH} viewBox="0 0 1440 320" preserveAspectRatio="none">
          <Defs>
            <SvgGradient id="botBlueGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={BLUE} />
              <Stop offset="1" stopColor={NAVY} />
            </SvgGradient>
          </Defs>
          <Path fill="url(#botBlueGrad)" d="M -50,370 L -50,220 C 640,220 1240,220 1490,40 L 1490,370 Z" />
        </Svg>
      </View>
    </>
  )
}

export default function DeliverySignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const isOtpStep = location.pathname.endsWith("/otp")
  // The page keeps the height it had with the keyboard closed: the window shrinks while the keyboard is up, and the
  // centred page used to re-centre in the smaller window — logo and title jumped up over the blue design (Prince, 26 Oct).
  // Now only as much scrolls as the number box and the Log in button need to stay above the keyboard.
  const { height: liveWindowHeight } = useWindowDimensions()
  const fullHeightRef = useRef(liveWindowHeight)
  if (liveWindowHeight > fullHeightRef.current) fullHeightRef.current = liveWindowHeight
  const windowHeight = fullHeightRef.current

  // Terms / Privacy / Support load in the background so tapping one opens it straight away.
  useEffect(() => prefetchPolicyContentWhenIdle("delivery"), [])

  // Step 1 States
  // Never prefill a number (the old dev "default test phone" leaked into
  // builds). Only what the partner typed is kept, saved on every change.
  const [phone, setPhoneState] = useState(() => {
    try {
      if (sessionStorage.getItem("deliveryClearLoginPhone") === "1") {
        sessionStorage.removeItem("deliveryClearLoginPhone")
        sessionStorage.removeItem("deliveryAuthData")
        sessionStorage.removeItem("deliveryLoginPhone")
        return ""
      }
      const typed = sessionStorage.getItem("deliveryLoginPhone")
      if (typed) return typed
      const stored = sessionStorage.getItem("deliveryAuthData")
      if (stored) {
        const data = JSON.parse(stored)
        return data.phone ? data.phone.replace("+91", "").trim() : ""
      }
    } catch (e) {
      return ""
    }
    return ""
  })
  const setPhone = (value) => {
    setPhoneState(value)
    try {
      if (value) sessionStorage.setItem("deliveryLoginPhone", value)
      else sessionStorage.removeItem("deliveryLoginPhone")
    } catch {
      // ignore
    }
  }
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  // Step 2 States
  const [otp, setOtpState] = useState(["", "", "", ""])
  // Latest boxes for the key / change handlers (two quick key presses must not read a stale array).
  const otpRef = useRef(["", "", "", ""])
  const setOtp = (next) => {
    otpRef.current = next
    setOtpState(next)
  }
  const [error, setError] = useState("")
  const [, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [blockTimer, setBlockTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [verifiedOtp, setVerifiedOtp] = useState("")
  const [pendingMessage, setPendingMessage] = useState("")
  const [isRejected, setIsRejected] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [deviceToken, setDeviceToken] = useState(null)
  const [activePlatform, setActivePlatform] = useState("web")
  const [showRestorePopup, setShowRestorePopup] = useState(false)
  const [, setDeletedAccountData] = useState(null)
  const [focusedField, setFocusedField] = useState(null)
  const inputRefs = useRef([])
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

  const getBlockKey = (phoneStr) => {
    const clean = phoneStr?.replace(/\D/g, "") || ""
    return clean ? `delivery_block_expires_at_${clean}` : "delivery_block_expires_at"
  }

  const getResendKey = (phoneStr) => {
    const clean = phoneStr?.replace(/\D/g, "") || ""
    return clean ? `delivery_resend_expires_at_${clean}` : "delivery_resend_expires_at"
  }

  const resetPendingVerificationState = () => {
    setPendingMessage("")
    setIsRejected(false)
    setRejectionReason("")
  }

  // Web: replace to /food/delivery/login. The login screen is the one under this code screen in the native stack,
  // so going back to it returns there (a replace would leave a second login screen in the stack).
  const goToLoginScreen = () => {
    Keyboard.dismiss()
    if (isOtpStep && router.canGoBack()) navigate(-1)
    else navigate("/food/delivery/login", { replace: true })
  }

  const handleBackToLogin = () => {
    requestPhoneFocus()
    goToLoginScreen()
  }

  useEffect(() => {
    prefetchModuleFcmToken("delivery")
  }, [])

  // Close the keyboard when the screen goes away
  useEffect(() => () => Keyboard.dismiss(), [])

  // Handle route change transitions
  useEffect(() => {
    if (!isOtpStep) {
      setOtp(["", "", "", ""])
      setError("")
      setShowNameInput(false)
      resetPendingVerificationState()
      return
    }

    const stored = sessionStorage.getItem("deliveryAuthData")
    let currentPhone = ""
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
      currentPhone = data.phone || ""
    } else {
      navigate("/food/delivery/login", { replace: true })
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

  // Timers
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

  // Focus first OTP field + open the keyboard automatically
  useEffect(() => {
    if (isOtpStep && !showNameInput && !pendingMessage) {
      const timer = setTimeout(() => {
        const el = inputRefs.current[0]
        el?.blur()
        el?.focus()
      }, 300)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isOtpStep, showNameInput, pendingMessage])

  const validatePhone = (num) => {
    const digits = num.replace(/\D/g, "")
    return digits.length === 10 && ["6", "7", "8", "9"].includes(digits[0])
  }

  // Send OTP (Action Step 1)
  const handleSendOTP = async () => {
    if (!validatePhone(phone)) {
      toast.error("Please enter a valid 10-digit mobile number")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)

    const fullPhone = `${DEFAULT_COUNTRY_CODE} ${phone}`.trim()

    try {
      clearModuleAuth("delivery")
      await deliveryAPI.sendOTP(fullPhone, "login")

      const authData = {
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        purpose: "login",
        module: "delivery",
      }
      sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData))
      navigate("/food/delivery/otp")
    } catch (err) {
      const msg = getUserFacingApiError(err, "Failed to send OTP. Please try again.")
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

        const authData = {
          method: "phone",
          phone: fullPhone,
          isSignUp: false,
          purpose: "login",
          module: "delivery",
        }
        sessionStorage.setItem("deliveryAuthData", JSON.stringify(authData))
        navigate("/food/delivery/otp", { state: { initialBlockMins: totalMins } })
        return
      }
      showUserFacingApiError(err, "Failed to send OTP. Please try again.")
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  // Verify OTP (Action Step 2)
  const handleVerify = async (otpValue = null, confirmAction = null) => {
    if (showNameInput && !confirmAction) return

    const code = otpValue || otpRef.current.join("")

    if (code.length !== 4) {
      toast.error("Please enter the complete 4-digit code")
      return
    }

    if (loading || blockTimer > 0) return

    setLoading(true)
    setError("")

    try {
      const phoneVal = authData?.phone
      const purpose = authData?.purpose || "login"
      const providedName = authData?.isSignUp ? authData?.name || null : null
      if (!phoneVal) {
        setError("Phone number not found. Please try again.")
        setLoading(false)
        return
      }

      const { fcmToken, platform } = await collectFcmTokenFast("delivery")

      setDeviceToken(fcmToken)
      setActivePlatform(platform)

      const response = await deliveryAPI.verifyOTP(phoneVal, code, purpose, providedName, fcmToken, platform, confirmAction)
      const data = response?.data?.data || response?.data || {}

      // Lets the "under review" screen log in by itself once admin approves.
      if (data?.pendingTicket) setPendingTicket("delivery", data.pendingTicket)
      else if (data?.accessToken) clearPendingTicket("delivery")

      if (data?.deletedAccountFound) {
        setDeletedAccountData(data)
        setShowRestorePopup(true)
        setLoading(false)
        return
      }

      if (data.pendingApproval === true) {
        sessionStorage.removeItem("deliveryAuthData")
        sessionStorage.removeItem("deliveryLoginPhone")
        sessionStorage.removeItem(getBlockKey(phoneVal))
        sessionStorage.removeItem(getResendKey(phoneVal))
        const digits = String(phoneVal || "").replace(/\D/g, "").slice(-10)
        const rejected = Boolean(data.isRejected)
        setLoading(false)
        finalizeDeliveryPendingSubmission(
          navigate,
          digits,
          {
            fcmToken,
            platform,
            status: rejected ? "rejected" : "pending",
            message: data.message,
            rejectionReason: data.rejectionReason,
          },
        )
        return
      }

      const needsRegistration = data.needsRegistration === true

      if (needsRegistration) {
        sessionStorage.removeItem("deliveryAuthData")
        sessionStorage.removeItem("deliveryLoginPhone")
        sessionStorage.removeItem(getBlockKey(phoneVal))
        sessionStorage.removeItem(getResendKey(phoneVal))
        sessionStorage.setItem("deliveryNeedsRegistration", "true")
        const digits = String(phoneVal || "").replace(/\D/g, "")
        const details = {
          name: "",
          phone: digits.slice(-10),
          countryCode: "+91",
        }
        sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details))
        navigate("/food/delivery/signup/details", { replace: true })
        return
      }

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      sessionStorage.removeItem("deliveryAuthData")
      sessionStorage.removeItem("deliveryLoginPhone")
      sessionStorage.removeItem(getBlockKey(phoneVal))
      sessionStorage.removeItem(getResendKey(phoneVal))

      try {
        storeAuthData("delivery", accessToken, user, refreshToken)
      } catch (storageError) {
        setError("Failed to save authentication. Please try again.")
        setLoading(false)
        return
      }

      window.dispatchEvent(new Event("deliveryAuthChanged"))
      try {
        await persistModuleFcmToken("delivery", { maxAttempts: 8, delayMs: 400 })
      } catch {
        // ignore
      }
      setSuccess(true)

      let retryCount = 0
      const maxRetries = 10
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken")
        const storedAuth = localStorage.getItem("delivery_authenticated")

        if (storedToken && storedAuth === "true") {
          navigate("/food/delivery", { replace: true })
        } else if (retryCount < maxRetries) {
          retryCount++
          setTimeout(verifyAndNavigate, 100)
        } else {
          setError("Failed to save authentication. Please try again.")
          setLoading(false)
        }
      }
      setTimeout(verifyAndNavigate, 200)
    } catch (err) {
      const message = getUserFacingApiError(err, "Failed to verify OTP. Please try again.")

      // wrong code: boxes emptied, cursor back in the first box with the keyboard open
      setOtp(["", "", "", ""])
      focusOtpBox(0, 150)

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
        setError("")
      } else if (/invalid/i.test(message)) {
        setError("Invalid OTP")
        toast.error("Invalid OTP", { id: "user-facing-api-error" })
      } else {
        setError(message)
        showUserFacingApiError(err, message)
      }
      setLoading(false)
    }
  }

  // Name Submission (Action Step 3)
  const handleSubmitName = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name is required")
      return
    }

    if (!verifiedOtp) {
      setError("OTP verification step missing. Please request a new OTP.")
      return
    }

    setLoading(true)
    setError("")
    setNameError("")

    try {
      const phoneVal = authData?.phone
      const purpose = authData?.purpose || "login"
      if (!phoneVal) {
        setError("Phone number not found. Please try again.")
        return
      }

      const response = await deliveryAPI.verifyOTP(phoneVal, verifiedOtp, purpose, trimmedName, deviceToken, activePlatform)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      sessionStorage.removeItem("deliveryAuthData")
      sessionStorage.removeItem("deliveryLoginPhone")

      try {
        storeAuthData("delivery", accessToken, user, refreshToken)
      } catch (storageError) {
        setError("Failed to save authentication. Please try again.")
        setLoading(false)
        return
      }

      window.dispatchEvent(new Event("deliveryAuthChanged"))
      setSuccess(true)
      setLoading(false)

      let retryCount = 0
      const maxRetries = 10
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken")
        const storedAuth = localStorage.getItem("delivery_authenticated")

        if (storedToken && storedAuth === "true") {
          navigate("/food/delivery", { replace: true })
        } else if (retryCount < maxRetries) {
          retryCount++
          setTimeout(verifyAndNavigate, 100)
        } else {
          setError("Failed to save authentication. Please try again.")
          setLoading(false)
        }
      }
      setTimeout(verifyAndNavigate, 200)
    } catch (err) {
      const message = getUserFacingApiError(err, "Failed to complete registration. Please try again.")
      setError(message)
      showUserFacingApiError(err, "Failed to complete registration. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleRestoreAction = async (action) => {
    setShowRestorePopup(false)
    const code = otpRef.current.join("")
    await handleVerify(code, action)
  }

  const handleResend = async () => {
    if (resendTimer > 0 || blockTimer > 0) return

    setLoading(true)
    setError("")

    try {
      const phoneVal = authData?.phone
      const purpose = authData?.purpose || "login"
      if (!phoneVal) {
        setError("Phone number not found. Please go back and try again.")
        setLoading(false)
        return
      }

      await deliveryAPI.sendOTP(phoneVal, purpose)
      setResendTimer(59)
      sessionStorage.setItem(getResendKey(phoneVal), (Date.now() + (59 * 1000)).toString())
      setOtp(["", "", "", ""])
      setShowNameInput(false)
      setName("")
      setNameError("")
      setVerifiedOtp("")
      focusOtpBox(0, 50)
      toast.success("OTP resent successfully.", { duration: 3000 })
    } catch (err) {
      const message = getUserFacingApiError(err, "Failed to resend OTP. Please try again.")

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
        setError("")
      } else {
        setError(message)
        showUserFacingApiError(err, "Failed to resend OTP. Please try again.")
      }
    } finally {
      setLoading(false)
    }
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
      setError("")
    }

    const current = otpRef.current
    // a box keeps its digit selected on focus; typing over it on a keyboard that does not replace the selection gives
    // "old+new": keep the new digit only
    if (value.length === 2 && current[index] && value.startsWith(current[index])) {
      value = value.slice(1)
    }

    if (value.length > 1) {
      // pasted / auto-filled code
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
      } else if (current[index]) {
        const newOtp = [...current]
        newOtp[index] = ""
        setOtp(newOtp)
      }
    }
  }

  const formatResendTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  const getPhoneNumber = () => {
    const p = authData?.phone || `${DEFAULT_COUNTRY_CODE} ${phone}`
    const cleaned = p.replace(/\s/g, "")
    if (cleaned.startsWith("+91") && cleaned.length > 3) {
      return cleaned.slice(0, 3) + " " + cleaned.slice(3)
    }
    return cleaned
  }

  const isOtpComplete = otp.every((digit) => digit !== "")

  const showLoginStep = !isOtpStep

  // step change slide (web: framer-motion opacity 0 -> 1, x ±20, 0.3 s)
  const stepAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    stepAnim.setValue(0)
    Animated.timing(stepAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [stepAnim, showLoginStep])
  const stepStyle = {
    opacity: stepAnim,
    transform: [{ translateX: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [showLoginStep ? -20 : 20, 0] }) }],
  }

  const closeRestorePopup = () => {
    setShowRestorePopup(false)
    goToLoginScreen()
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LoginExitGuard enabled={showLoginStep} dirty={phone.length > 0} accent={BLUE} />

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
            <GradientTitle text="Delivery Partner" />
            <View style={styles.subtitleWrap}>
              {showLoginStep ? (
                <Text style={styles.subtitle}>Enter your registered mobile number to start earning</Text>
              ) : showNameInput ? (
                <Text style={styles.subtitle}>You&apos;re almost done! Please tell us your name to complete registration.</Text>
              ) : (
                <View style={styles.sentRow}>
                  <Text style={styles.sentText} numberOfLines={1}>{`We've sent a code to ${getPhoneNumber()}`}</Text>
                  <Pressable
                    onPress={handleBackToLogin}
                    accessibilityLabel="Edit phone number"
                    style={({ pressed }) => [styles.pencilBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    <LinearGradient colors={[BLUE, NAVY]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pencilInner}>
                      <Pencil size={14} color="#ffffff" strokeWidth={2.5} />
                    </LinearGradient>
                  </Pressable>
                </View>
              )}
            </View>
          </View>

          <Animated.View style={stepStyle}>
            {showLoginStep ? (
              <View style={{ gap: 24 }}>
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

                <GradientButton onPress={handleSendOTP} disabled={loading || phone.length < 10}>
                  {loading ? <Spinner /> : <Text style={styles.btnText}>Log in</Text>}
                </GradientButton>
              </View>
            ) : (
              <View style={{ width: "100%" }}>
                {/* Pending/Rejected Screen */}
                {pendingMessage ? (
                  <View style={[styles.pendingCard, isRejected ? styles.pendingRejected : styles.pendingAmber]}>
                    <View style={{ gap: 8 }}>
                      <Text style={[styles.pendingTitle, { color: isRejected ? colors.red[700] : colors.amber[700] }]}>
                        {isRejected ? "APPLICATION REJECTED" : "PENDING VERIFICATION"}
                      </Text>
                      <Text style={[styles.pendingMsg, { color: alpha(isRejected ? colors.red[600] : colors.amber[600], 0.9) }]}>
                        {pendingMessage}
                      </Text>
                      {isRejected && rejectionReason ? (
                        <View style={styles.reasonBox}>
                          <Text style={styles.reasonLabel}>REASON</Text>
                          <Text style={styles.reasonText}>{`"${rejectionReason}"`}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={{ gap: 12, paddingTop: 8 }}>
                      {isRejected ? (
                        <GradientButton
                          onPress={() => {
                            const pVal = authData?.phone || ""
                            const digits = String(pVal).replace(/\D/g, "")
                            sessionStorage.setItem("deliveryNeedsRegistration", "true")
                            const details = {
                              name: "",
                              phone: digits.slice(-10),
                              countryCode: "+91",
                            }
                            sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details))
                            navigate("/food/delivery/signup/details", { replace: true })
                          }}
                        >
                          <Text style={[styles.btnText, { fontWeight: "600" }]}>Re-apply Now</Text>
                        </GradientButton>
                      ) : null}

                      <GradientButton onPress={handleBackToLogin}>
                        <Text style={styles.btnText}>Back to login</Text>
                      </GradientButton>
                    </View>
                  </View>
                ) : null}

                {/* OTP fields */}
                {!showNameInput && !pendingMessage ? (
                  <View style={{ gap: 24 }}>
                    {error ? <Text style={styles.error}>{error}</Text> : null}

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
                          caretHidden={false}
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
                          <Text style={styles.resendMuted}>RESEND SMS</Text>
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
                ) : null}

                {/* Name field */}
                {showNameInput ? (
                  <View style={{ gap: 24 }}>
                    <View style={{ gap: 8 }}>
                      <Text style={styles.nameLabel}>Full name</Text>
                      <TextInput
                        value={name}
                        onChangeText={(value) => {
                          setName(value)
                          if (nameError) setNameError("")
                        }}
                        editable={!loading}
                        onFocus={() => setFocusedField("name")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="Enter your name"
                        placeholderTextColor={colors.gray[400]}
                        style={[
                          styles.nameInput,
                          focusedField === "name" && styles.fieldFocused,
                          nameError ? { borderColor: colors.red[500] } : null,
                        ]}
                      />
                      {nameError ? <Text style={styles.nameError}>{nameError}</Text> : null}
                    </View>

                    <GradientButton onPress={handleSubmitName} disabled={loading || !name.trim()} style={{ marginTop: 16 }}>
                      {loading ? (
                        <View style={styles.rowCenter}>
                          <Spinner />
                          <Text style={styles.btnText}>Continuing...</Text>
                        </View>
                      ) : (
                        <Text style={styles.btnText}>Continue</Text>
                      )}
                    </GradientButton>
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
                <Link to="/food/delivery/terms" state={{ from: "/food/delivery/login" }}>
                  <Text style={styles.legalLink}>TERMS</Text>
                </Link>
                <Text style={styles.legalDot}>•</Text>
                <Link to="/food/delivery/privacy" state={{ from: "/food/delivery/login" }}>
                  <Text style={styles.legalLink}>PRIVACY</Text>
                </Link>
                <Text style={styles.legalDot}>•</Text>
                <Link to="/food/delivery/help/content" state={{ from: "/food/delivery/login" }}>
                  <Text style={styles.legalLink}>SUPPORT</Text>
                </Link>
              </View>
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollView>

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
          <ShieldCheck size={40} color={BLUE} />
        </View>

        <Text style={styles.restoreTitle}>Account Found!</Text>
        <Text style={styles.restoreText}>
          {"An existing deleted delivery account for "}
          <Text style={{ fontWeight: "700", color: colors.gray[900] }}>{getPhoneNumber()}</Text>
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
  main: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 17.6, paddingTop: 48, paddingBottom: 96 },
  column: { width: "100%", maxWidth: 384, top: -40 },
  header: { marginBottom: 20, alignItems: "center" },
  logo: { height: 112, width: 220, marginBottom: -14 },
  title: { fontFamily: fonts.sora, fontWeight: "800", fontSize: 25, lineHeight: 34, letterSpacing: -0.4, color: BLUE, textAlign: "center" },
  subtitleWrap: { maxWidth: 310, paddingHorizontal: 16, marginTop: 12, alignItems: "center" },
  subtitle: { fontFamily: fonts.outfit, fontWeight: "500", fontSize: 13.5, lineHeight: 22, letterSpacing: 0.3, color: colors.slate[600], textAlign: "center" },
  sentRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
  sentText: { fontFamily: fonts.outfit, fontWeight: "600", fontSize: 13, lineHeight: 21, letterSpacing: 0.2, color: alpha(colors.slate[500], 0.9), flexShrink: 1 },
  pencilBtn: { marginLeft: 4, borderRadius: 10, ...shadow.md, shadowColor: BLUE },
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
  fieldFocused: { backgroundColor: colors.white, borderColor: BLUE },
  btnShell: { width: "100%" },
  btnShadow: { elevation: 6, shadowColor: BLUE, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
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
    ...shadow.sm,
  },
  otpBlocked: { opacity: 0.5, borderColor: colors.red[400], backgroundColor: colors.red[50], color: colors.red[800] },
  resendMuted: { fontSize: 12, lineHeight: 16, color: colors.gray[400], fontFamily: fonts.sora, fontWeight: "800", letterSpacing: 0.6 },
  resendTime: { color: colors.slate[800], fontFamily: fonts.sora, fontWeight: "900" },
  resendLink: { fontSize: 12, lineHeight: 16, color: colors.slate[800], fontFamily: fonts.sora, fontWeight: "800" },
  blockBox: {
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "#E7EFFA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#C3D0E1",
    marginTop: 16,
    alignItems: "center",
  },
  blockTitle: { fontSize: 11, fontWeight: "700", color: BLUE, letterSpacing: 0.6 },
  blockTime: { fontSize: 14, lineHeight: 20, fontWeight: "700", color: BLUE },
  nameLabel: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.gray[700], paddingLeft: 12 },
  nameInput: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: colors.gray[50],
    borderWidth: 2,
    borderColor: colors.gray[300],
    borderRadius: 9999,
    fontSize: 16,
    fontWeight: "500",
    color: colors.gray[900],
    ...shadow.sm,
  },
  nameError: { fontSize: 12, lineHeight: 16, color: colors.red[500], paddingLeft: 12 },
  pendingCard: { borderRadius: 24, borderWidth: 1, padding: 17.6, gap: 20, ...shadow.lg },
  pendingRejected: { backgroundColor: colors.red[50], borderColor: colors.red[200] },
  pendingAmber: { backgroundColor: colors.amber[50], borderColor: colors.amber[200] },
  pendingTitle: { fontSize: 16, lineHeight: 24, fontFamily: fonts.sora, fontWeight: "800", letterSpacing: 0.8, textAlign: "center" },
  pendingMsg: { fontSize: 14, lineHeight: 22, fontWeight: "500", textAlign: "center" },
  reasonBox: { marginTop: 12, padding: 16, backgroundColor: alpha("#ffffff", 0.7), borderRadius: 16, borderWidth: 1, borderColor: colors.red[100] },
  reasonLabel: { fontSize: 10, fontFamily: fonts.sora, fontWeight: "900", color: colors.red[600], letterSpacing: 1.5, marginBottom: 4, textAlign: "center" },
  reasonText: { fontSize: 14, lineHeight: 20, color: colors.red[800], fontStyle: "italic", fontWeight: "500", textAlign: "center" },
  legal: { fontFamily: fonts.poppins, fontSize: 11, lineHeight: 18, fontWeight: "500", color: alpha(colors.gray[400], 0.8), textAlign: "center" },
  legalRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  legalLink: { fontFamily: fonts.poppins, fontSize: 11, lineHeight: 18, fontWeight: "600", color: colors.gray[400], letterSpacing: 0.6 },
  legalDot: { fontFamily: fonts.poppins, fontSize: 11, lineHeight: 18, fontWeight: "700", color: alpha(colors.gray[400], 0.8), marginHorizontal: 8 },
  restoreCard: { maxWidth: 384, borderRadius: 24, padding: 32, alignItems: "stretch", borderWidth: 1, borderColor: colors.gray[100], backgroundColor: colors.white, ...shadow["2xl"] },
  restoreClose: { position: "absolute", top: 16, right: 16, padding: 8, borderRadius: 14, zIndex: 2 },
  restoreIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: alpha(BLUE, 0.1), alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 24 },
  restoreTitle: { fontSize: 24, lineHeight: 32, fontWeight: "700", color: colors.gray[900], marginBottom: 12, textAlign: "center", fontFamily: fonts.sora },
  restoreText: { fontSize: 16, lineHeight: 26, color: colors.gray[500], marginBottom: 32, textAlign: "center" },
  newAccountBtn: { height: 56, borderWidth: 2, borderColor: colors.gray[200], borderRadius: 16, alignItems: "center", justifyContent: "center" },
  newAccountText: { fontSize: 16, fontWeight: "700", color: colors.gray[700] },
})
