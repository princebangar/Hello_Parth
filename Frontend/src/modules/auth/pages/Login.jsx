import React, { useEffect, useLayoutEffect, useState, useRef, useMemo } from "react"
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom"
import { Loader2, ChevronRight, UserRound, Pencil } from "lucide-react"
import { toast } from "sonner"
import apiClient, { authAPI } from "@food/api"
import { setUnifiedAuthData, isUnifiedAuthenticated } from "@/shared/utils/moduleAuth"
import { rememberLoginReturnTo, ensureFoodGuestSession, resolveConsumerPostLoginRoute, consumeLoginReturnTo, CONSUMER_GUEST_HOME, prefetchConsumerAppsWhenIdle } from "@/shared/utils/activeModule.js"
import { prefetchPolicyContentWhenIdle, warmPolicyPage, USER_POLICY_ENDPOINTS } from "@/shared/utils/policyPages"
import { buildMessagingServiceWorkerUrl } from "@/shared/utils/firebaseServiceWorkerUrl"

const BRAND_RED = "#C8161D"

// The red hero (wordmark, skyline, food & taxi) is drawn by window.__loginHeroHtml in index.html: the same HTML the
// page paints before this code arrives (#boot-login), so the hand-over from the static screen to this one is invisible.
// Its styles are the .lg-* rules there.
const LOGIN_HERO_HTML = { __html: typeof window !== "undefined" && window.__loginHeroHtml ? window.__loginHeroHtml() : "" }

// Typed number survives a trip to Terms / Privacy / Support and back.
const PHONE_DRAFT_KEY = "login_phone_draft"
const readPhoneDraft = () => {
  try {
    return String(sessionStorage.getItem(PHONE_DRAFT_KEY) || "").replace(/\D/g, "").slice(0, 10)
  } catch {
    return ""
  }
}
const writePhoneDraft = (value) => {
  try {
    if (value) sessionStorage.setItem(PHONE_DRAFT_KEY, value)
    else sessionStorage.removeItem(PHONE_DRAFT_KEY)
  } catch {
    // ignore
  }
}

export default function UnifiedOTPFastLogin() {
  const RESEND_COOLDOWN_SECONDS = 60
  const VERIFY_REQUEST_TIMEOUT_MS = 20000
  const FCM_FETCH_TIMEOUT_MS = 12000
  const [phoneNumber, setPhoneNumberState] = useState(readPhoneDraft)
  const setPhoneNumber = (value) => {
    setPhoneNumberState(value)
    writePhoneDraft(value)
  }
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState(1) // 1: Phone, 2: OTP, 3: Name (new user), 4: Recover choice, 5: Name (start fresh)
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [name, setName] = useState("")
  const [pendingAuthData, setPendingAuthData] = useState(null)
  const [deletedAccountRecovery, setDeletedAccountRecovery] = useState(null) // { recoveryToken, phone }
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const referralCode = useMemo(
    () => String(searchParams.get("ref") || location.state?.referralCode || "").trim(),
    [searchParams, location.state?.referralCode],
  )
  const submitting = useRef(false)

  // Each step after the phone screen gets its own history entry, so the
  // browser / Android back button returns to the phone screen instead of
  // leaving the login page (it used to jump to the home page).
  const goToStep = (next, { replace = false } = {}) => {
    setStep(next)
    navigate(`${location.pathname}${location.search}`, {
      replace,
      state: { ...(location.state || {}), authStep: next },
    })
  }

  const resetToPhoneStep = () => {
    setStep(1)
    setOtp("")
    setName("")
    setPendingAuthData(null)
    setDeletedAccountRecovery(null)
    setResendTimer(0)
  }

  const historyAuthStep = location.state?.authStep
  useEffect(() => {
    if (!historyAuthStep && step > 1) resetToPhoneStep()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyAuthStep])

  // A refresh keeps history state but not component state: drop the stale step.
  useEffect(() => {
    if (location.state?.authStep) {
      const { authStep, ...rest } = location.state
      navigate(`${location.pathname}${location.search}`, { replace: true, state: rest })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const leaveStepViaHistory = () => {
    if (location.state?.authStep) navigate(-1)
    else resetToPhoneStep()
  }

  // Dismiss soft keyboard on unmount & auto-redirect if already logged in
  useEffect(() => {
    const fromPath = location.state?.from
    if (fromPath) {
      rememberLoginReturnTo(fromPath)
    }

    if (isUnifiedAuthenticated()) {
      navigate(resolveConsumerPostLoginRoute(), { replace: true })
    }
    return () => {
      if (typeof document !== 'undefined') {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur()
        }
        document.querySelectorAll('input, textarea').forEach((el) => {
          if (el && typeof el.blur === 'function') el.blur()
        })
      }
    }
  }, [location.state?.from, navigate])

  // Terms / Privacy / Support: only their page code loads in the background (no API call); the text is fetched when a
  // link is touched. The app the login is about to open (Taxi, then Food) downloads too, so there is no skeleton wait
  // after the OTP.
  useEffect(() => prefetchPolicyContentWhenIdle("user", { text: false }), [])
  useEffect(() => prefetchConsumerAppsWhenIdle(), [])

  const handleSkipForNow = () => {
    ensureFoodGuestSession()
    consumeLoginReturnTo()
    // Guest browse is Food-only; Taxi requires login.
    navigate(CONSUMER_GUEST_HOME, { replace: true })
  }

  const getWebFcmTokenForLogin = async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      throw new Error("Browser environment not available for FCM token generation")
    }
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined") {
      throw new Error("This browser does not support push notifications")
    }

    const firebaseConfig = {
      apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || "").trim(),
      authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "").trim(),
      projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
      storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "").trim(),
      messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "").trim(),
      appId: String(import.meta.env.VITE_FIREBASE_APP_ID || "").trim(),
    }
    const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim()

    if (!Object.values(firebaseConfig).every(Boolean) || !vapidKey) {
      throw new Error("Firebase web push config missing in Frontend/.env")
    }

    if (Notification.permission === "denied") {
      throw new Error("Notification permission is blocked. Enable notifications and try again.")
    }
    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        throw new Error("Notification permission is required for login")
      }
    }

    const [{ getApps, initializeApp }, { getMessaging, getToken, isSupported }] = await Promise.all([
      import("firebase/app"),
      import("firebase/messaging"),
    ])

    const supported = await isSupported().catch(() => false)
    if (!supported) {
      throw new Error("Firebase messaging is not supported in this browser")
    }

    const app = getApps()[0] || initializeApp(firebaseConfig)
    const registration = await navigator.serviceWorker.register(buildMessagingServiceWorkerUrl(firebaseConfig))
    const messaging = getMessaging(app)
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })

    const normalizedToken = String(token || "").trim()
    if (!normalizedToken || normalizedToken.length < 20) {
      throw new Error("Failed to generate FCM token")
    }

    localStorage.setItem("fcm_web_registered_token_user", normalizedToken)
    return normalizedToken
  }

  // Check if already logged in on mount
  useEffect(() => {
    if (isUnifiedAuthenticated()) {
      navigate(resolveConsumerPostLoginRoute(), { replace: true })
    }
  }, [location.state?.from, navigate])

  const normalizedPhone = () => {
    const digits = String(phoneNumber).replace(/\D/g, "").slice(-10)
    return digits.length === 10 ? digits : ""
  }

  const withTimeout = async (promise, timeoutMs, label) => {
    let timeoutId
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out. Please try again.`))
      }, timeoutMs)
    })
    try {
      return await Promise.race([promise, timeoutPromise])
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const waitForFlutterBridge = async (timeoutMs = 6000) => {
    if (typeof window === "undefined") return false
    if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
      return true
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 120))
      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
        return true
      }
    }
    return false
  }

  const normalizeBridgeToken = (value) => {
    if (typeof value === "string") return value.trim()
    if (value && typeof value === "object") {
      const candidates = [value.token, value.fcmToken, value.data?.token, value.data?.fcmToken]
      for (const candidate of candidates) {
        const normalized = String(candidate || "").trim()
        if (normalized.length > 20) return normalized
      }
    }
    return String(value || "").trim()
  }

  const handleSendOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    if (phone.length !== 10) {
      toast.error("Phone number must be exactly 10 digits")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      const otpSendResponse = await authAPI.sendUnifiedOTP(phoneNumber)
      console.log("[Auth] OTP send response:", otpSendResponse?.data || otpSendResponse)
      setOtpSent(true)
      setOtp("")
      goToStep(2)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("OTP sent! Check your phone.")
    } catch (err) {
      console.log("[Auth] OTP send error:", err?.response?.data || err)
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleResendOTP = async () => {
    const phone = normalizedPhone()
    if (phone.length !== 10) {
      toast.error("Phone number must be exactly 10 digits")
      return
    }
    if (resendTimer > 0 || submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      const otpResendResponse = await authAPI.sendUnifiedOTP(phoneNumber)
      console.log("[Auth] OTP resend response:", otpResendResponse?.data || otpResendResponse)
      setOtp("")
      setOtpSent(true)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      document.getElementById("otp-0")?.focus()
      toast.success("OTP resent successfully.")
    } catch (err) {
      console.log("[Auth] OTP resend error:", err?.response?.data || err)
      const msg = err?.response?.data?.message || err?.message || "Failed to resend OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleEditNumber = () => {
    leaveStepViaHistory()
  }

  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    const phone = normalizedPhone()
    const otpDigits = String(otp).replace(/\D/g, "").slice(0, 4)
    if (phone.length !== 10) {
      toast.error("Phone number must be exactly 10 digits")
      return
    }
    if (otpDigits.length !== 4) {
      toast.error("Please enter the 4-digit OTP")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      let fcmToken = ""
      let platform = "web"
      if (typeof window !== "undefined" && window.flutter_inappwebview) {
        platform = "mobile"
        await waitForFlutterBridge()
        const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"]
        for (const handlerName of handlerNames) {
          try {
            const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "user" })
            const normalized = normalizeBridgeToken(t)
            if (normalized.length > 20) {
              fcmToken = normalized
              break
            }
          } catch (_) { }
        }
        if (!fcmToken) {
          console.warn("[Auth] Mobile FCM token not retrieved from Flutter app bridge during login.")
        }
      } else {
        try {
          fcmToken = await withTimeout(
            getWebFcmTokenForLogin(),
            FCM_FETCH_TIMEOUT_MS,
            "FCM token fetch",
          )
        } catch (webFcmErr) {
          console.warn("[Auth] Web FCM token fetch failed during login:", webFcmErr?.message || webFcmErr)
        }
      }

      console.log("[Auth] FCM token for login:", {
        platform,
        length: fcmToken.length,
        preview: `${fcmToken.slice(0, 12)}...`,
      })

      const response = await withTimeout(
        authAPI.verifyUnifiedOTP(phoneNumber, otpDigits, referralCode || null, null, fcmToken, platform),
        VERIFY_REQUEST_TIMEOUT_MS,
        "OTP verification request",
      )
      console.log("[Auth] OTP verify response:", response?.data || response)
      const data = response?.data?.data || response?.data || {}

      if (data.deletedAccountFound) {
        setDeletedAccountRecovery({ recoveryToken: data.recoveryToken, phone: data.phone || phoneNumber })
        goToStep(4, { replace: true })
        toast.success("We found a previous account on this number.")
        return
      }

      if (!data.accessToken || !data.user) {
        throw new Error("Invalid response from server")
      }

      const hasName =
        data.user?.name &&
        String(data.user.name).trim().length > 0 &&
        String(data.user.name).toLowerCase() !== "null"
      const needsName = data.isNewUser === true || data.needsNamePrompt === true || !hasName

      if (needsName) {
        setPendingAuthData({ ...data, fcmToken, platform })
        setName("")
        // Replace the OTP entry: back from "enter name" returns to the phone screen.
        goToStep(3, { replace: true })
        toast.success("OTP verified. Complete your profile to continue.")
        return
      }

      setUnifiedAuthData(data)
      writePhoneDraft("")
      try {
        await authAPI.saveLoginFcmToken(fcmToken, platform)
      } catch (fcmSaveError) {
        console.warn("[Auth] FCM save route failed after login:", fcmSaveError?.message || fcmSaveError)
      }
      consumeLoginReturnTo()
      const postLoginTo = String(location.state?.postLoginTo || "").split("?")[0]
      const fromHint = String(location.state?.from || "").split("?")[0]
      navigate(
        postLoginTo.startsWith("/taxi/")
          ? "/taxi/user"
          : fromHint.startsWith("/taxi/")
            ? "/taxi/user"
            : resolveConsumerPostLoginRoute(),
        { replace: true },
      )
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP. Please try again."
      if (status === 401) {
        if (/deactivat(ed|e)/i.test(String(msg))) {
          msg = "Your account is deactivated. Please contact support."
        } else {
          msg = "Invalid or expired code, or account not active."
        }
      }
      console.log("[Auth] OTP verify error:", err?.response?.data || err)
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleCompleteProfile = async (e) => {
    e.preventDefault()
    const trimmedName = String(name || "").trim()
    if (trimmedName.length < 2) {
      toast.error("Please enter your full name")
      return
    }
    if (!pendingAuthData?.accessToken || !pendingAuthData?.user) {
      toast.error("Session expired. Please verify OTP again.")
      leaveStepViaHistory()
      return
    }

    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      await apiClient.patch(
        "/food/user/profile",
        { name: trimmedName },
        {
          headers: {
            Authorization: `Bearer ${pendingAuthData.accessToken}`,
          },
        },
      )

      const nextData = {
        ...pendingAuthData,
        user: {
          ...pendingAuthData.user,
          name: trimmedName,
        },
      }

      setUnifiedAuthData(nextData)
      writePhoneDraft("")
      consumeLoginReturnTo()
      const postLoginTo = String(location.state?.postLoginTo || "").split("?")[0]
      const fromHint = String(location.state?.from || "").split("?")[0]
      navigate(
        postLoginTo.startsWith("/taxi/")
          ? "/taxi/user"
          : fromHint.startsWith("/taxi/")
            ? "/taxi/user"
            : resolveConsumerPostLoginRoute(),
        { replace: true },
      )
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save your name."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const goToPostLoginRoute = () => {
    writePhoneDraft("")
    consumeLoginReturnTo()
    const postLoginTo = String(location.state?.postLoginTo || "").split("?")[0]
    const fromHint = String(location.state?.from || "").split("?")[0]
    navigate(
      postLoginTo.startsWith("/taxi/") || fromHint.startsWith("/taxi/")
        ? "/taxi/user"
        : resolveConsumerPostLoginRoute(),
      { replace: true },
    )
  }

  const handleRecoverAccount = async () => {
    if (!deletedAccountRecovery?.recoveryToken || submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      const response = await authAPI.recoverAccount(deletedAccountRecovery.recoveryToken)
      const data = response?.data?.data || response?.data || {}
      setUnifiedAuthData(data)
      goToPostLoginRoute()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to recover account."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleStartFreshChoice = () => {
    setName("")
    goToStep(5, { replace: true })
  }

  const handleConfirmStartFresh = async (e) => {
    e.preventDefault()
    const trimmedName = String(name || "").trim()
    if (trimmedName.length < 2) {
      toast.error("Please enter your full name")
      return
    }
    if (!deletedAccountRecovery?.recoveryToken) {
      toast.error("Session expired. Please verify OTP again.")
      leaveStepViaHistory()
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      const response = await authAPI.startFreshAccount(deletedAccountRecovery.recoveryToken, trimmedName)
      const data = response?.data?.data || response?.data || {}
      setUnifiedAuthData(data)
      goToPostLoginRoute()
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to create account."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  useEffect(() => {
    if (step !== 2 || resendTimer <= 0) return
    const intervalId = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [step, resendTimer])

  const formatResendTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  // OTP auto-verify: the moment the 4th digit lands, submit (once per typed code; retyping re-arms it).
  const autoVerifiedOtpRef = useRef("")
  useEffect(() => {
    if (step !== 2) return
    if (otp.length < 4) {
      autoVerifiedOtpRef.current = ""
      return
    }
    if (!/^\d{4}$/.test(otp) || autoVerifiedOtpRef.current === otp || submitting.current) return
    autoVerifiedOtpRef.current = otp
    handleVerifyOTP({ preventDefault() {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step])

  // Keyboard handling (Zomato / Swiggy style): the page never scrolls. When a field is tapped the form card
  // slides up just enough to keep the field + its button above the keyboard, straight away (an estimate from the screen size), then settles on the
  // real keyboard height once the viewport reports it. Covers both Chrome (keyboard shrinks only the visual
  // viewport) and Android WebView adjustResize (the whole layout shrinks, so less lift is needed).
  const rootRef = useRef(null)

  // This screen is now on the page: drop the static copy index.html painted while the JS loaded (before the paint,
  // so there is no frame without either).
  useLayoutEffect(() => {
    document.getElementById("boot-login")?.remove()
  }, [])
  const cardRef = useRef(null)
  const [lift, setLift] = useState(0)
  const keyboardRef = useRef({ focused: false, estimate: 0, baseHeight: 0, settleTimer: null })

  const isTouchDevice = () =>
    typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches

  const estimateKeyboardHeight = () => {
    const screenH = window.screen?.height || window.innerHeight
    return Math.round(Math.min(360, Math.max(240, screenH * 0.38)))
  }

  // Lift just enough for the field and its Continue / Verify button to sit right above a keyboard of
  // `keyboardPx` - not the whole keyboard height - and never past the top safe area.
  const liftFor = (keyboardPx) => {
    const card = cardRef.current
    const root = rootRef.current
    if (!card || !root) return 0
    const anchor = card.querySelector('button[type="submit"]') || document.activeElement
    if (!anchor || !card.contains(anchor)) return 0
    // Undo the card's current (possibly mid-animation) translate to get its resting position.
    const transform = getComputedStyle(card).transform
    const shiftY = transform && transform !== "none" ? new DOMMatrixReadOnly(transform).m42 : 0
    const anchorBottom = anchor.getBoundingClientRect().bottom - shiftY
    const visibleBottom = root.getBoundingClientRect().bottom - keyboardPx
    const needed = anchorBottom + 16 - visibleBottom
    return Math.max(0, Math.min(Math.round(needed), card.offsetTop - 16))
  }

  // Part of the page hidden under the keyboard right now.
  const measureOverlap = () => {
    const vv = window.visualViewport
    const root = rootRef.current
    if (!vv || !root) return 0
    return Math.max(0, root.getBoundingClientRect().bottom - (vv.offsetTop + vv.height))
  }

  const handleFieldFocus = (e) => {
    if (e.target?.tagName !== "INPUT" || !isTouchDevice()) return
    const kb = keyboardRef.current
    if (!kb.focused) {
      kb.baseHeight = window.innerHeight
      kb.estimate = estimateKeyboardHeight()
    }
    kb.focused = true
    const overlap = measureOverlap()
    // Keyboard already up (moving between OTP boxes) -> keep the real value, else lift instantly by the estimate.
    setLift(liftFor(overlap > 100 ? overlap : kb.estimate))
  }

  const handleFieldBlur = () => {
    setTimeout(() => {
      const active = document.activeElement
      if (active?.tagName === "INPUT" && rootRef.current?.contains(active)) return
      keyboardRef.current.focused = false
      setLift(0)
    }, 120)
  }

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    if (!vv) return
    const kb = keyboardRef.current
    const settle = () => {
      if (!kb.focused) return
      const shrink = kb.baseHeight - window.innerHeight // adjustResize: layout already moved up by this much
      const overlap = measureOverlap()
      if (overlap > 100) setLift(liftFor(overlap))
      else if (shrink > 100) setLift(liftFor(0))
      else setLift(0) // no on-screen keyboard (hardware keyboard / desktop touch)
    }
    const onResize = () => {
      if (!kb.focused) return
      // While the keyboard animates, keep the card where the estimate put it.
      const shrink = kb.baseHeight - window.innerHeight
      setLift(liftFor(Math.max(measureOverlap(), kb.estimate - shrink)))
      clearTimeout(kb.settleTimer)
      kb.settleTimer = setTimeout(settle, 160)
    }
    vv.addEventListener("resize", onResize)
    vv.addEventListener("scroll", onResize)
    return () => {
      vv.removeEventListener("resize", onResize)
      vv.removeEventListener("scroll", onResize)
      clearTimeout(kb.settleTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Native feel: a tap anywhere outside a field closes the keyboard; a tap on a card button keeps it open
  // (so the card does not drop away under the finger before the tap registers).
  const handleRootPointerDown = (e) => {
    const target = e.target
    if (target.closest?.("input, textarea")) return
    if (target.closest?.("button, a")) {
      if (cardRef.current?.contains(target) && !target.closest("a")) e.preventDefault()
      return
    }
    const active = document.activeElement
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) active.blur()
  }

  const submitDisabled =
    loading ||
    (step === 1 && String(phoneNumber).length < 10) ||
    (step === 2 && otp.length !== 4) ||
    ((step === 3 || step === 5) && String(name).trim().length < 2)

  // Greyed out until the 10-digit number / code / name is complete.
  const submitLooksDisabled = submitDisabled && !loading

  const inputShell = "w-full h-[56px] rounded-2xl border border-gray-200 bg-white flex items-center px-4 transition-colors focus-within:border-[#C8161D] focus-within:ring-2 focus-within:ring-[#C8161D]/10"
  const numberChip = (label) => (
    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 pl-4 pr-2 py-2">
      <div>
        <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-[15px] font-bold text-[#1A1A1A] tracking-wide">+91 {phoneNumber}</p>
      </div>
      <button
        type="button"
        onClick={handleEditNumber}
        aria-label="Edit number"
        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-red-50 active:scale-95"
        style={{ color: BRAND_RED }}
      >
        <Pencil className="w-[18px] h-[18px]" strokeWidth={2.2} />
      </button>
    </div>
  )

  return (
    <div
      ref={rootRef}
      onPointerDown={handleRootPointerDown}
      className="fixed inset-0 overflow-hidden overscroll-none bg-[#ECECEE] font-['Inter',system-ui,sans-serif]"
    >
      <div className="relative mx-auto w-full max-w-[480px] h-full bg-white flex flex-col">
        {/* ── Red hero (takes whatever height the card leaves) ───────────── */}
        <div className="lg-hero" dangerouslySetInnerHTML={LOGIN_HERO_HTML} />

        {/* ── Form card (full width; at rest it continues the white dome, with the keyboard it slides up
            over the hero as a rounded sheet) ── */}
        <div
          ref={cardRef}
          className={`relative z-30 shrink-0 w-full bg-white px-6 pt-2 [@media(max-height:700px)]:pt-1 pb-[calc(env(safe-area-inset-bottom)+88px)] [@media(max-height:700px)]:pb-[calc(env(safe-area-inset-bottom)+22px)] will-change-transform ${lift ? "rounded-t-[28px] shadow-[0_-8px_30px_rgba(0,0,0,0.07)]" : ""}`}
          style={{ transform: `translateY(-${lift}px)`, transition: "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        >
          <h2 className="text-[26px] [@media(max-height:700px)]:text-[23px] leading-tight font-extrabold text-[#1A1A1A] tracking-tight">
            {step === 5
              ? "Start fresh"
              : step === 4
                ? "Welcome back"
                : step === 3
                  ? "Complete your profile"
                  : step === 2
                    ? "Verify OTP"
                    : "Login or Signup"}
          </h2>
          <p className="mt-2 text-[16px] leading-snug font-normal text-[#6B7280]">
            {step === 5
              ? "Enter your name to create a brand-new account."
              : step === 4
                ? "We found a previous account on this phone number."
                : step === 3
                  ? "Enter your name to finish signup for Food & Taxi."
                  : step === 2
                    ? "Enter the 4-digit code we sent to your phone."
                    : "Enter your mobile number to continue"}
          </p>

          <form
            onFocusCapture={handleFieldFocus}
            onBlurCapture={handleFieldBlur}
            onSubmit={
              step === 1
                ? handleSendOTP
                : step === 2
                  ? handleVerifyOTP
                  : step === 5
                    ? handleConfirmStartFresh
                    : step === 4
                      ? (e) => e.preventDefault()
                      : handleCompleteProfile
            }
            className="mt-5 [@media(max-height:700px)]:mt-4 w-full flex flex-col"
          >
            {step === 1 ? (
              <div className={inputShell}>
                <span className="text-[16px] font-semibold text-[#1A1A1A] shrink-0">+91</span>
                <div className="w-px h-6 bg-gray-200 mx-3 shrink-0" />
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  maxLength={10}
                  className="flex-1 min-w-0 h-full bg-transparent text-[16px] font-medium text-[#1A1A1A] outline-none placeholder:text-[#9CA3AF] placeholder:font-normal placeholder:tracking-normal tracking-wide"
                  placeholder="Enter mobile number"
                />
              </div>
            ) : step === 2 ? (
              <div className="space-y-4">
                {numberChip("Code sent to")}
                <div className="flex justify-between gap-3">
                  {[0, 1, 2, 3].map((index) => (
                    <input
                      key={index}
                      id={`otp-${index}`}
                      type="tel"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      required
                      autoFocus={index === 0}
                      value={otp[index] || ""}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        const current = (otp || "").split("");
                        while (current.length < 4) current.push("");

                        if (!digits) {
                          current[index] = "";
                          setOtp(current.join(""));
                          if (index > 0) document.getElementById(`otp-${index - 1}`)?.focus();
                          return;
                        }

                        if (digits.length >= 4) {
                          setOtp(digits.slice(0, 4));
                          document.getElementById(`otp-3`)?.focus();
                          return;
                        }

                        const newDigit = digits.slice(-1);
                        current[index] = newDigit;
                        setOtp(current.join(""));
                        if (index < 3 && newDigit) {
                          document.getElementById(`otp-${index + 1}`)?.focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace") {
                          if (!otp[index] && index > 0) {
                            e.preventDefault();
                            const current = (otp || "").split("");
                            while (current.length < 4) current.push("");
                            current[index - 1] = "";
                            setOtp(current.join(""));
                            document.getElementById(`otp-${index - 1}`)?.focus();
                          }
                        }
                      }}
                      className="w-full h-[56px] text-center text-[24px] font-bold bg-white border border-gray-200 focus:border-[#C8161D] focus:ring-2 focus:ring-[#C8161D]/10 rounded-2xl outline-none transition-all text-[#1A1A1A]"
                      placeholder="-"
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[14px] text-gray-500">Didn't receive it?</span>
                  {resendTimer > 0 ? (
                    <span className="text-[14px] font-semibold text-gray-400">
                      Resend in {formatResendTimer(resendTimer)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      className="text-[14px] font-bold"
                      style={{ color: BRAND_RED }}
                    >
                      Resend Code
                    </button>
                  )}
                </div>
              </div>
            ) : step === 4 ? (
              <div className="space-y-3 w-full">
                <p className="text-[14px] text-gray-600 pb-1">
                  +91 {deletedAccountRecovery?.phone || phoneNumber} had an account here before that was deleted.
                </p>
                <button
                  type="button"
                  onClick={handleRecoverAccount}
                  disabled={loading}
                  className="w-full h-[56px] rounded-2xl font-semibold text-[16px] text-white shadow-[0_8px_20px_rgba(200,22,29,0.25)] active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ backgroundColor: BRAND_RED }}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Recover my old account"}
                </button>
                <button
                  type="button"
                  onClick={handleStartFreshChoice}
                  disabled={loading}
                  className="w-full h-[56px] rounded-2xl font-semibold text-[16px] border border-gray-300 bg-white text-[#1A1A1A] disabled:opacity-60 active:scale-[0.98]"
                >
                  Start fresh (new account)
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {numberChip("New account")}
                <div className={inputShell}>
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 min-w-0 h-full bg-transparent text-[16px] font-medium text-[#1A1A1A] outline-none placeholder:text-gray-400 placeholder:font-normal"
                    placeholder="Enter your full name"
                  />
                </div>
                {referralCode ? (
                  <p className="text-center text-[12px] font-semibold text-gray-500">
                    Referral applied: <span style={{ color: BRAND_RED }}>{referralCode}</span>
                  </p>
                ) : null}
              </div>
            )}

            {step !== 4 && (
              <button
                type="submit"
                disabled={submitDisabled}
                className={`relative mt-5 w-full h-[56px] rounded-2xl font-semibold text-[17px] flex items-center justify-center transition-all ${
                  submitLooksDisabled
                    ? "bg-[#E5E7EB] text-gray-400 cursor-not-allowed"
                    : `text-white ${submitDisabled ? "cursor-not-allowed" : "shadow-[0_8px_20px_rgba(200,22,29,0.28)] active:scale-[0.98]"}`
                }`}
                style={submitLooksDisabled ? undefined : { backgroundColor: BRAND_RED }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {step === 1 ? "Continue" : step === 2 ? "Verify & Login" : step === 5 ? "Create Account" : "Complete Profile"}
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white flex items-center justify-center">
                      <ChevronRight className={`w-5 h-5 ${submitLooksDisabled ? "text-gray-300" : "text-[#1A1A1A]"}`} strokeWidth={2.5} />
                    </span>
                  </>
                )}
              </button>
            )}

            {step === 1 && (
              <>
                <div className="my-4 [@media(max-height:700px)]:my-3 flex items-center gap-4 px-6">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[15px] text-gray-500">or</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <button
                  type="button"
                  onClick={handleSkipForNow}
                  disabled={loading}
                  className="w-full h-[56px] rounded-2xl border border-gray-300 bg-white text-[#1A1A1A] text-[17px] font-semibold flex items-center justify-center gap-3 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  <UserRound className="w-5 h-5" strokeWidth={1.8} />
                  Continue as Guest
                </button>

                <p className="mt-5 [@media(max-height:700px)]:mt-3 text-center text-[13px] text-gray-500 leading-relaxed">
                  By continuing, you agree to our
                </p>
                <div className="mt-1.5 flex items-center justify-center gap-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[#6B7280]">
                  <Link to="/user/terms" onPointerDown={() => warmPolicyPage(USER_POLICY_ENDPOINTS.terms)} className="hover:text-[#1A1A1A] transition-colors">Terms</Link>
                  <span className="w-1 h-1 rounded-full bg-gray-400" />
                  <Link to="/user/privacy" onPointerDown={() => warmPolicyPage(USER_POLICY_ENDPOINTS.privacy)} className="hover:text-[#1A1A1A] transition-colors">Privacy</Link>
                  <span className="w-1 h-1 rounded-full bg-gray-400" />
                  <Link to="/user/support" onPointerDown={() => warmPolicyPage(USER_POLICY_ENDPOINTS.support)} className="hover:text-[#1A1A1A] transition-colors">Support</Link>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
