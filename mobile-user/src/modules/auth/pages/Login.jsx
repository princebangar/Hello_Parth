import React, { useEffect, useState, useRef, useMemo } from "react"
import { Animated, BackHandler, Dimensions, Easing, Keyboard, Pressable, StyleSheet, View } from "react-native"
import { StatusBar } from "expo-status-bar"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg"
import { Loader2, ChevronRight, UserRound, Pencil } from "lucide-react-native"
import { toast } from "@/lib/toast"
import { Link, useNavigate, useLocation, useSearchParams } from "@/lib/router"
import { getNativeFcmToken } from "@/lib/push"
import { AppImage, FontScope, Text, TextInput } from "@/native/ui"
import { ForceLight, colors, fonts } from "@/theme"
import { Spin } from "@/shared/components/Loader"
import apiClient, { authAPI } from "@food/api"
import { setUnifiedAuthData, isUnifiedAuthenticated } from "@/shared/utils/moduleAuth"
import { rememberLoginReturnTo, ensureFoodGuestSession, resolveConsumerPostLoginRoute, consumeLoginReturnTo, CONSUMER_GUEST_HOME, prefetchConsumerAppsWhenIdle } from "@/shared/utils/activeModule.js"
import { prefetchPolicyContentWhenIdle, warmPolicyPage, USER_POLICY_ENDPOINTS } from "@/shared/utils/policyPages"
import { requestPhoneFocus, usePhoneFocusRequest } from '@/shared/utils/loginFocus'

const BRAND_RED = "#2563EB"
const HERO_ART = require("../../../assets/public/auth_assets/login-hero-food-taxi.webp")

// The blue hero (wordmark, skyline, food & taxi). On the web it was drawn by window.__loginHeroHtml in index.html
// (the .lg-* styles there); the same drawing, sizes and colours here.

// City skyline behind the food & taxi: [x, width, height, roof].
const SKYLINE = [
  [0, 16, 46, 'flat'], [14, 20, 74, 'dome'], [36, 12, 56, 'spire'], [50, 24, 92, 'dome'],
  [76, 16, 60, 'flat'], [94, 30, 70, 'bigdome'], [126, 12, 50, 'spire'], [140, 22, 84, 'dome'],
  [164, 18, 58, 'flat'], [184, 34, 76, 'bigdome'], [220, 14, 54, 'spire'], [236, 22, 88, 'dome'],
  [260, 18, 62, 'flat'], [280, 30, 72, 'bigdome'], [312, 12, 52, 'spire'], [326, 22, 80, 'dome'],
  [350, 16, 58, 'flat'], [368, 20, 70, 'dome'], [390, 14, 48, 'flat'],
]
// arched window: bottom-left corner (x, y), width w, height h
const arch = (x, y, w, h) => `M${x} ${y} V${y - h + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y - h + w / 2} V${y}`

function Skyline() {
  const out = []
  SKYLINE.forEach((b, bi) => {
    const [x, w, h, roof] = b
    const top = 120 - h
    const cx = x + w / 2
    const cols = w >= 20 ? [x + w * 0.22, x + w * 0.58] : [cx - w * 0.15]
    const winW = w >= 20 ? w * 0.2 : w * 0.3
    out.push(<Rect key={`r${bi}`} x={x} y={top} width={w} height={h} fill="rgba(8,30,110,0.18)" />)
    out.push(<Path key={`c${bi}`} d={`M${x} ${top + 5} H${x + w}`} />)
    for (let y = top + 16; y <= 112; y += 16) cols.forEach((wx, wi) => out.push(<Path key={`w${bi}-${y}-${wi}`} d={arch(wx, y, winW, 9)} />))
    if (roof === 'dome') out.push(<Path key={`d${bi}`} d={`M${x} ${top} Q${cx} ${top - w * 0.9} ${x + w} ${top} M${cx} ${top - w * 0.45} V${top - w * 0.45 - 8}`} />)
    if (roof === 'bigdome') out.push(<Path key={`b${bi}`} d={`M${x + 3} ${top} Q${cx} ${top - w * 0.8} ${x + w - 3} ${top} M${cx} ${top - w * 0.4} V${top - w * 0.4 - 10} M${x} ${top} V${top - 14} M${x + w} ${top} V${top - 14} M${x - 1.5} ${top - 14} h3 M${x + w - 1.5} ${top - 14} h3`} />)
    if (roof === 'spire') out.push(<Path key={`s${bi}`} d={`M${x} ${top} L${cx} ${top - 18} L${x + w} ${top}`} />)
    if (roof === 'flat') out.push(<Rect key={`f${bi}`} x={x - 2} y={top - 4} width={w + 4} height={4} />)
  })
  return (
    <Svg width="100%" height="100%" viewBox="0 0 404 120" preserveAspectRatio="xMidYMax slice" fill="none" stroke="rgba(170,205,255,0.5)" strokeWidth={0.8}>
      {out}
    </Svg>
  )
}

const Cloud = ({ style, width }) => (
  <View pointerEvents="none" style={[{ position: 'absolute', width, height: (width * 22) / 48 }, style]}>
    <Svg width="100%" height="100%" viewBox="0 0 48 22" fill="none" stroke="rgba(190,215,255,0.75)" strokeWidth={1.2}>
      <Path d="M6 20h36a5 5 0 0 0 0-10 9 9 0 0 0-16-4 7 7 0 0 0-12 4A5 5 0 0 0 6 20z" />
    </Svg>
  </View>
)

function LoginHero({ m }) {
  const [artH, setArtH] = useState(0)
  const W = m.width
  // .lg-art-box: aspect-ratio 1000/412; height: min(100%, 200px, calc(min(94vw, 440px) * 0.412)); translate(-50%, 8%)
  const boxH = Math.max(0, Math.min(artH, 200, Math.min(W * 0.94, 440) * 0.412))
  const boxW = (boxH * 1000) / 412

  return (
    <LinearGradient
      colors={["#3B7BF2", "#2563EB", "#1D4ED8"]}
      locations={[0, 0.4, 1]}
      style={{ position: 'relative', flex: 1, minHeight: m.safeTop + (m.short ? 200 : 250), flexDirection: 'column' }}
    >
      {/* .lg-glow */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' }}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="lgGlow" cx="50" cy="100" rx="70" ry="70" fx="50" fy="100" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="rgb(8,30,110)" stopOpacity={0.38} />
              <Stop offset="1" stopColor="rgb(8,30,110)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#lgGlow)" />
        </Svg>
      </View>
      {/* .lg-skyline */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 40, height: '36%' }}>
        <Skyline />
      </View>
      <Cloud width={48} style={{ left: '7%', top: '40%' }} />
      <Cloud width={40} style={{ right: '24%', top: '46%' }} />

      {/* .lg-word */}
      <View style={{ position: 'relative', zIndex: 10, flexShrink: 0, paddingTop: m.wordPadTop, alignItems: 'center' }}>
        <View style={{ position: 'relative' }}>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fonts.pacifico,
              fontWeight: '400',
              fontSize: m.titleSize,
              lineHeight: Math.round(m.titleSize * 1.15),
              letterSpacing: -0.025 * m.titleSize,
              color: '#fff',
              includeFontPadding: false,
              textShadowColor: 'rgba(0,0,0,0.15)',
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 6,
            }}
          >
            Hello Parth
          </Text>
          <View pointerEvents="none" style={{ position: 'absolute', right: -20, top: -4, width: 24, height: 20 }}>
            <Svg width="100%" height="100%" viewBox="0 0 24 20">
              <Path d="M4 12 L12 3" stroke="#FFC21A" strokeWidth={3} strokeLinecap="round" />
              <Path d="M9 16 L21 13" stroke="#FFC21A" strokeWidth={3} strokeLinecap="round" />
            </Svg>
          </View>
        </View>
        <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: m.tagSize, fontWeight: '600', letterSpacing: 0.025 * m.tagSize, color: '#fff' }}>Food</Text>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#93C5FD' }} />
          <Text style={{ fontSize: m.tagSize, fontWeight: '600', letterSpacing: 0.025 * m.tagSize, color: '#fff' }}>Taxi</Text>
        </View>
      </View>

      {/* white dome the food & taxi sit on - same white as the card below, so the two read as one sheet */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: m.domeH }}>
        <Svg width="100%" height="100%" viewBox="0 0 400 80" preserveAspectRatio="none">
          <Path d="M0 80 V34 Q200 -22 400 34 V80 Z" fill="#FFFFFF" />
        </Svg>
      </View>

      {/* .lg-art: food & taxi in a box with the art's exact aspect ratio; the pin route lands on the taxi's roof */}
      <View style={{ position: 'relative', zIndex: 20, flex: 1, minHeight: 0, marginTop: 8 }} onLayout={(e) => setArtH(e.nativeEvent.layout.height)} pointerEvents="none">
        {boxH > 0 ? (
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: (W - boxW) / 2,
              width: boxW,
              height: boxH,
              transform: [{ translateY: boxH * 0.08 }],
            }}
          >
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: boxH * 1.728 }}>
              <Svg width="100%" height="100%" viewBox="0 -300 1000 712" preserveAspectRatio="none" fill="none">
                <Path d="M930 -95 C930 -45 862 -45 868 5 S886 45 884 70" stroke="rgba(170,205,255,0.9)" strokeWidth={5} strokeLinecap="round" strokeDasharray="12 13" />
                <Path d="M930 -228c-26 0-45 20-45 44 0 33 45 73 45 73s45-40 45-73c0-24-19-44-45-44z" fill="#60A5FA" />
                <Circle cx={930} cy={-184} r={16} fill="#1D4ED8" />
              </Svg>
            </View>
            <AppImage src={HERO_ART} accessibilityLabel="Food and taxi" style={{ width: '100%', height: '100%' }} contentFit="fill" transition={0} priority="high" />
          </View>
        ) : null}
      </View>
    </LinearGradient>
  )
}

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

const clamp = (min, v, max) => Math.min(max, Math.max(min, v))

// index.html's --lg-vh / html.lg-short: measured once, and only ever taller (or after a rotation) - a shrunk height is
// the keyboard, also while it is closing.
function useLoginMetrics() {
  const insets = useSafeAreaInsets()
  const [win, setWin] = useState(() => Dimensions.get("window"))
  const focusedRef = useRef(false)
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setWin((cur) => {
        if (window.width !== cur.width) return window
        if (focusedRef.current || window.height <= cur.height) return cur
        return window
      })
    })
    return () => sub?.remove?.()
  }, [])
  const h = win.height
  const vh = h * 0.01
  const short = h <= 700
  const safeTop = Math.max(short ? 10 : 14, insets.top)
  return {
    focusedRef,
    width: win.width,
    height: h,
    short,
    safeTop,
    insetBottom: insets.bottom,
    wordPadTop: safeTop + (short ? 8 : clamp(6, vh * 4.5, 44)),
    titleSize: short ? 36 : clamp(38, vh * 5.8, 48),
    tagSize: short ? 18 : 21,
    domeH: short ? 66 : 82,
    cardPadTop: short ? 4 : 8,
    cardPadBottom: insets.bottom + (short ? 22 : clamp(20, vh * 6, 64)),
    h2Size: short ? 23 : 26,
    formTop: short ? 16 : 20,
    orMargin: short ? 12 : 16,
    agreeTop: short ? 12 : 20,
  }
}

function FieldShell({ focused, style, children }) {
  return (
    <View style={[styles.inputShell, focused && { borderColor: BRAND_RED }, style]}>
      {focused ? <View pointerEvents="none" style={styles.ring} /> : null}
      {children}
    </View>
  )
}

function UnifiedOTPFastLogin() {
  const RESEND_COOLDOWN_SECONDS = 60
  const VERIFY_REQUEST_TIMEOUT_MS = 20000
  const FCM_FETCH_TIMEOUT_MS = 12000
  const m = useLoginMetrics()
  const [phoneNumber, setPhoneNumberState] = useState(readPhoneDraft)
  const setPhoneNumber = (value) => {
    setPhoneNumberState(value)
    writePhoneDraft(value)
  }
  // The 4 OTP boxes are kept per box (a ref + state): on a phone the next digit arrives before React has re-rendered
  // with the previous one, so building it from the `otp` state lost or shifted digits (and the server said "Invalid OTP").
  const [otpCells, setOtpCellsState] = useState(["", "", "", ""])
  const otpCellsRef = useRef(["", "", "", ""])
  const setOtpCells = (cells) => {
    otpCellsRef.current = cells
    setOtpCellsState(cells)
  }
  // otp: the code typed so far (complete when it has 4 digits); setOtp(value) fills the boxes from a string
  const otp = otpCells.join("")
  const setOtp = (value) => {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 4).split("")
    while (digits.length < 4) digits.push("")
    setOtpCells(digits)
  }
  const [step, setStep] = useState(1) // 1: Phone, 2: OTP, 3: Name (new user), 4: Recover choice, 5: Name (start fresh)
  const [loading, setLoading] = useState(false)
  // eslint-disable-next-line no-unused-vars
  const [otpSent, setOtpSent] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [name, setName] = useState("")
  const [pendingAuthData, setPendingAuthData] = useState(null)
  const [deletedAccountRecovery, setDeletedAccountRecovery] = useState(null) // { recoveryToken, phone }
  const [focusedField, setFocusedField] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const referralCode = useMemo(
    () => String(searchParams.get("ref") || location.state?.referralCode || "").trim(),
    [searchParams, location.state?.referralCode],
  )
  const submitting = useRef(false)
  const phoneInputRef = useRef(null)
  const otpRefs = useRef([])
  const focusOtp = (index) => otpRefs.current[index]?.focus()

  // Android closes the keyboard when the phone field unmounts, and the OTP box's autoFocus lands in that same moment:
  // the box shows as focused but no keyboard opens. Once the OTP step is on screen, focus the first box again
  // (blur first, so Android treats it as a new focus and shows the keyboard).
  useEffect(() => {
    if (step !== 2) return undefined
    const t = setTimeout(() => {
      const first = otpRefs.current.find((el, i) => el && !otpCellsRef.current[i]) || otpRefs.current[0]
      first?.blur()
      first?.focus()
    }, 300)
    return () => clearTimeout(t)
  }, [step])

  // Each step after the phone screen is its own "page" for the back button: Android back returns to the phone screen
  // instead of leaving the login (the web pushed a history entry per step; a native stack would mount a second login).
  const goToStep = (next) => {
    setStep(next)
  }

  const resetToPhoneStep = () => {
    setStep(1)
    setOtp("")
    setName("")
    setPendingAuthData(null)
    setDeletedAccountRecovery(null)
    setResendTimer(0)
  }

  const leaveStepViaHistory = () => {
    resetToPhoneStep()
  }

  useEffect(() => {
    if (step <= 1) return undefined
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      resetToPhoneStep()
      return true
    })
    return () => sub.remove()
  }, [step])

  // back from the code screen with the pencil: cursor goes into the number box (never on a plain visit / after logout)
  usePhoneFocusRequest(() => phoneInputRef.current, step === 1)

  // Close the keyboard on unmount & auto-redirect if already logged in
  useEffect(() => {
    const fromPath = location.state?.from
    if (fromPath) {
      rememberLoginReturnTo(fromPath)
    }

    if (isUnifiedAuthenticated()) {
      navigate(resolveConsumerPostLoginRoute(), { replace: true })
    }
    return () => {
      Keyboard.dismiss()
    }
  }, [location.state?.from, navigate])

  // Terms / Privacy / Support: their text is fetched when a link is touched; the apps the login is about to open warm up.
  useEffect(() => prefetchPolicyContentWhenIdle("user", { text: false }), [])
  useEffect(() => prefetchConsumerAppsWhenIdle(), [])

  const handleSkipForNow = () => {
    ensureFoodGuestSession()
    consumeLoginReturnTo()
    // Guest browse is Food-only; Taxi requires login.
    navigate(CONSUMER_GUEST_HOME, { replace: true })
  }

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

  const handleSendOTP = async () => {
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
      focusOtp(0)
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
    requestPhoneFocus()
    leaveStepViaHistory()
  }

  const postLoginTarget = () => {
    const postLoginTo = String(location.state?.postLoginTo || "").split("?")[0]
    const fromHint = String(location.state?.from || "").split("?")[0]
    return postLoginTo.startsWith("/taxi/")
      ? "/taxi/user"
      : fromHint.startsWith("/taxi/")
        ? "/taxi/user"
        : resolveConsumerPostLoginRoute()
  }

  const handleVerifyOTP = async () => {
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
      // The web asked the Flutter wrapper for the device token (platform "mobile"); the app asks expo-notifications.
      let fcmToken = ""
      const platform = "mobile"
      try {
        const t = await withTimeout(getNativeFcmToken(), FCM_FETCH_TIMEOUT_MS, "FCM token fetch")
        fcmToken = String(t || "").trim()
      } catch (fcmErr) {
        console.warn("[Auth] Mobile FCM token fetch failed during login:", fcmErr?.message || fcmErr)
      }
      if (fcmToken.length <= 20) {
        if (fcmToken) fcmToken = ""
        console.warn("[Auth] Mobile FCM token not retrieved during login.")
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
        goToStep(4)
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
        // Replaces the OTP entry: back from "enter name" returns to the phone screen.
        goToStep(3)
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
      navigate(postLoginTarget(), { replace: true })
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP. Please try again."
      if (status === 401) {
        if (/deactivat(ed|e)/i.test(String(msg))) {
          msg = "Your account is deactivated. Please contact support."
        } else {
          msg = "Invalid OTP"
        }
      }
      console.log("[Auth] OTP verify error:", err?.response?.data || err)
      toast.error(msg)
      // A wrong code: empty the boxes and put the cursor back in the first one (keyboard stays up) to type again.
      setOtp("")
      refocusFirstOtpBox()
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleCompleteProfile = async () => {
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
      navigate(postLoginTarget(), { replace: true })
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
    goToStep(5)
  }

  const handleConfirmStartFresh = async () => {
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
    handleVerifyOTP()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step])

  // ---------------------------------------------------------------- keyboard: the card slides up, the page never moves
  // While a field is focused the screen keeps its full height (the hero is never squeezed) and only the form card slides
  // up - just enough for the field and its Continue / Verify button to sit above the keyboard - as a rounded sheet.
  // The first lift (an estimate from the screen size) decides where the card's top edge sits while the keyboard is up;
  // every later open, on any step, goes to exactly that position.
  const layoutRef = useRef({ cardY: 0, cardH: 0, formY: 0, btnY: 0, btnH: 0 })
  const targetTopRef = useRef(null)
  const NAME_STEP_EXTRA = 44
  const [cardMinH, setCardMinH] = useState(0)
  const lift = useRef(new Animated.Value(0)).current
  const [lifted, setLifted] = useState(false)
  const liftValueRef = useRef(0)
  const keyboardRef = useRef({ focused: false, unlockTimer: null, blurTimer: null })

  const setLift = (px) => {
    const v = Math.max(0, Math.round(px))
    liftValueRef.current = v
    setLifted(v > 0)
    Animated.timing(lift, { toValue: v, duration: 180, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start()
  }

  const estimateKeyboardHeight = () => Math.round(Math.min(380, Math.max(250, Dimensions.get("screen").height * 0.41)))

  const liftFor = (keyboardPx) => {
    const L = layoutRef.current
    if (!L.btnH) return 0
    const anchorBottom = L.cardY + L.formY + L.btnY + L.btnH
    const visibleBottom = m.height - keyboardPx
    const needed = anchorBottom + 16 - visibleBottom
    return Math.max(0, Math.min(Math.round(needed), L.cardY - 16))
  }
  const liftToTarget = (keyboardPx) => {
    const { cardY } = layoutRef.current
    if (!cardY) return 0
    if (targetTopRef.current == null) {
      const first = Math.min(liftFor(keyboardPx) + NAME_STEP_EXTRA, cardY - 16)
      if (first > 0) targetTopRef.current = cardY - first
      return Math.max(0, first)
    }
    return Math.max(0, Math.min(cardY - targetTopRef.current, cardY - 16))
  }

  const handleFieldFocus = (field) => {
    const kb = keyboardRef.current
    clearTimeout(kb.blurTimer)
    clearTimeout(kb.unlockTimer)
    kb.focused = true
    m.focusedRef.current = true
    setFocusedField(field)
    setLift(liftToTarget(estimateKeyboardHeight()))
  }

  const handleFieldBlur = () => {
    const kb = keyboardRef.current
    setFocusedField(null)
    clearTimeout(kb.blurTimer)
    kb.blurTimer = setTimeout(() => {
      // moving between the OTP boxes keeps the card where it is
      if (otpRefs.current.some((r) => r?.isFocused?.()) || phoneInputRef.current?.isFocused?.()) return
      kb.focused = false
      setLift(0)
      clearTimeout(kb.unlockTimer)
      kb.unlockTimer = setTimeout(() => {
        m.focusedRef.current = false
      }, 400)
    }, 120)
  }

  useEffect(() => {
    const kb = keyboardRef.current
    // keyboard closed with Back while a field keeps focus -> card down; tapped again (no new focus event) -> up again
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      if (kb.focused) setLift(0)
    })
    const show = Keyboard.addListener("keyboardDidShow", () => {
      if (kb.focused && liftValueRef.current === 0) setLift(liftToTarget(estimateKeyboardHeight()))
    })
    return () => {
      hide.remove()
      show.remove()
      clearTimeout(kb.unlockTimer)
      clearTimeout(kb.blurTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitDisabled =
    loading ||
    (step === 1 && String(phoneNumber).length < 10) ||
    (step === 2 && otp.length !== 4) ||
    ((step === 3 || step === 5) && String(name).trim().length < 2)

  // Greyed out until the 10-digit number / code / name is complete.
  const submitLooksDisabled = submitDisabled && !loading

  const handleSubmit =
    step === 1
      ? handleSendOTP
      : step === 2
        ? handleVerifyOTP
        : step === 5
          ? handleConfirmStartFresh
          : step === 4
            ? () => {}
            : handleCompleteProfile

  const numberChip = (label) => (
    <View style={styles.chip}>
      <View>
        <Text style={styles.chipLabel}>{label}</Text>
        <Text style={styles.chipNumber}>+91 {phoneNumber}</Text>
      </View>
      <Pressable
        onPress={handleEditNumber}
        accessibilityLabel="Edit number"
        style={({ pressed }) => [styles.chipEdit, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.blue[50] }]}
      >
        <Pencil size={18} strokeWidth={2.2} color={BRAND_RED} />
      </Pressable>
    </View>
  )

  const handleOtpChange = (index, text) => {
    const digits = String(text || "").replace(/\D/g, "")
    const current = [...otpCellsRef.current]

    if (!digits) {
      current[index] = ""
      setOtpCells(current)
      if (index > 0) focusOtp(index - 1)
      return
    }

    if (digits.length >= 4) {
      setOtp(digits.slice(0, 4))
      // full code pasted / auto-filled: it verifies by itself, so put the keyboard away
      Keyboard.dismiss()
      return
    }

    const newDigit = digits.slice(-1)
    current[index] = newDigit
    setOtpCells(current)
    if (current.every((c) => c)) {
      // last box filled: the code verifies by itself, so close the keyboard at once (like other apps)
      Keyboard.dismiss()
    } else if (index < 3 && newDigit) {
      focusOtp(index + 1)
    }
  }

  // After a wrong code the boxes are emptied: put the cursor back in the first one and open the keyboard again
  // (blur first, so Android treats it as a new focus after the keyboard was dismissed).
  const refocusFirstOtpBox = () => {
    setTimeout(() => {
      const first = otpRefs.current[0]
      first?.blur()
      first?.focus()
    }, 150)
  }

  const handleOtpKeyPress = (index, e) => {
    if (e?.nativeEvent?.key === "Backspace") {
      if (!otpCellsRef.current[index] && index > 0) {
        const current = [...otpCellsRef.current]
        current[index - 1] = ""
        setOtpCells(current)
        focusOtp(index - 1)
      }
    }
  }

  const title =
    step === 5 ? "Start fresh" : step === 4 ? "Welcome back" : step === 3 ? "Complete your profile" : step === 2 ? "Verify OTP" : "Login or Signup"
  const subtitle =
    step === 5
      ? "Enter your name to create a brand-new account."
      : step === 4
        ? "We found a previous account on this phone number."
        : step === 3
          ? "Enter your name to finish signup for Food & Taxi."
          : step === 2
            ? "Enter the 4-digit code we sent to your phone."
            : "Enter your mobile number to continue"

  return (
    // Native feel: a tap anywhere outside a field closes the keyboard; a tap on a card button keeps it open.
    <Pressable accessible={false} onPress={Keyboard.dismiss} style={[styles.root, { height: m.height }]}>
      <StatusBar style="light" />
      <View style={styles.page}>
        <LoginHero m={m} />

        {/* Form card (at rest it continues the white dome; with the keyboard it slides up over the hero as a sheet) */}
        <Animated.View
          onLayout={(e) => {
            const { y, height } = e.nativeEvent.layout
            layoutRef.current.cardY = y
            layoutRef.current.cardH = height
            if (step === 1 && !keyboardRef.current.focused) setCardMinH((cur) => (cur === height ? cur : height))
          }}
          style={[
            styles.card,
            {
              paddingTop: m.cardPadTop,
              paddingBottom: m.cardPadBottom,
              minHeight: step !== 1 && cardMinH ? cardMinH : undefined,
              transform: [{ translateY: Animated.multiply(lift, -1) }],
            },
            lifted && styles.cardLifted,
          ]}
        >
          <Text style={[styles.h2, { fontSize: m.h2Size }]}>{title}</Text>
          <Text style={styles.sub}>{subtitle}</Text>

          <View
            style={{ marginTop: m.formTop, width: "100%", flexDirection: "column" }}
            onLayout={(e) => {
              layoutRef.current.formY = e.nativeEvent.layout.y
            }}
          >
            {step === 1 ? (
              <FieldShell focused={focusedField === "phone"}>
                <Text style={styles.cc}>+91</Text>
                <View style={styles.sep} />
                <TextInput
                  ref={phoneInputRef}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  textContentType="telephoneNumber"
                  value={phoneNumber}
                  onChangeText={(value) => setPhoneNumber(String(value).replace(/\D/g, "").slice(0, 10))}
                  maxLength={10}
                  onFocus={() => handleFieldFocus("phone")}
                  onBlur={handleFieldBlur}
                  onSubmitEditing={() => !submitDisabled && handleSubmit()}
                  returnKeyType="done"
                  style={[styles.phoneInput, phoneNumber ? styles.phoneInputFilled : styles.phoneInputEmpty]}
                  placeholder="Enter mobile number"
                  placeholderTextColor="#9CA3AF"
                />
              </FieldShell>
            ) : step === 2 ? (
              <View style={{ gap: 16 }}>
                {numberChip("Code sent to")}
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  {[0, 1, 2, 3].map((index) => (
                    <FieldShell key={index} focused={focusedField === `otp-${index}`} style={styles.otpShell}>
                      <TextInput
                        ref={(el) => {
                          otpRefs.current[index] = el
                        }}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "sms-otp" : "off"}
                        textContentType={index === 0 ? "oneTimeCode" : "none"}
                        autoFocus={index === 0}
                        value={otpCells[index] || ""}
                        onChangeText={(text) => handleOtpChange(index, text)}
                        onKeyPress={(e) => handleOtpKeyPress(index, e)}
                        onFocus={() => handleFieldFocus(`otp-${index}`)}
                        onBlur={handleFieldBlur}
                        selectTextOnFocus
                        style={styles.otpInput}
                        placeholder="-"
                        placeholderTextColor="#9CA3AF"
                      />
                    </FieldShell>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: colors.gray[500] }}>Didn't receive it?</Text>
                  {resendTimer > 0 ? (
                    <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.gray[400] }}>
                      Resend in {formatResendTimer(resendTimer)}
                    </Text>
                  ) : (
                    <Pressable onPress={handleResendOTP} hitSlop={8}>
                      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: BRAND_RED }}>Resend Code</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : step === 4 ? (
              <View style={{ gap: 12, width: "100%" }}>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.gray[600], paddingBottom: 4 }}>
                  +91 {deletedAccountRecovery?.phone || phoneNumber} had an account here before that was deleted.
                </Text>
                <Pressable
                  onPress={handleRecoverAccount}
                  disabled={loading}
                  style={({ pressed }) => [styles.recoverBtn, loading && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  {loading ? (
                    <Spin>
                      <Loader2 size={20} color={colors.white} />
                    </Spin>
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: "600", color: colors.white }}>Recover my old account</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={handleStartFreshChoice}
                  disabled={loading}
                  style={({ pressed }) => [styles.freshBtn, loading && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <Text style={{ fontSize: 16, fontWeight: "600", color: "#1A1A1A" }}>Start fresh (new account)</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                {numberChip("New account")}
                <FieldShell focused={focusedField === "name"}>
                  <TextInput
                    autoFocus
                    autoComplete="name"
                    textContentType="name"
                    autoCapitalize="words"
                    value={name}
                    onChangeText={setName}
                    onFocus={() => handleFieldFocus("name")}
                    onBlur={handleFieldBlur}
                    onSubmitEditing={() => !submitDisabled && handleSubmit()}
                    returnKeyType="done"
                    style={[styles.nameInput, name ? { fontWeight: "500" } : { fontWeight: "400" }]}
                    placeholder="Enter your full name"
                    placeholderTextColor={colors.gray[400]}
                  />
                </FieldShell>
                {referralCode ? (
                  <Text style={{ textAlign: "center", fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.gray[500] }}>
                    Referral applied: <Text style={{ fontSize: 12, fontWeight: "600", color: BRAND_RED }}>{referralCode}</Text>
                  </Text>
                ) : null}
              </View>
            )}

            {step !== 4 && (
              <Pressable
                onLayout={(e) => {
                  layoutRef.current.btnY = e.nativeEvent.layout.y
                  layoutRef.current.btnH = e.nativeEvent.layout.height
                }}
                onPress={handleSubmit}
                disabled={submitDisabled}
                style={({ pressed }) => [
                  styles.submit,
                  submitLooksDisabled ? styles.submitOff : styles.submitOn,
                  !submitDisabled && pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                {loading ? (
                  <Spin>
                    <Loader2 size={20} color={colors.white} />
                  </Spin>
                ) : (
                  <>
                    <Text style={[styles.submitText, { color: submitLooksDisabled ? colors.gray[400] : colors.white }]}>
                      {step === 1 ? "Continue" : step === 2 ? "Verify & Login" : step === 5 ? "Create Account" : "Complete Profile"}
                    </Text>
                    <View style={styles.submitIcon}>
                      <ChevronRight size={20} strokeWidth={2.5} color={submitLooksDisabled ? colors.gray[300] : "#1A1A1A"} />
                    </View>
                  </>
                )}
              </Pressable>
            )}

            {step === 1 && (
              <>
                <View style={[styles.orRow, { marginVertical: m.orMargin }]}>
                  <View style={styles.orLine} />
                  <Text style={{ fontSize: 15, lineHeight: 22, color: colors.gray[500] }}>or</Text>
                  <View style={styles.orLine} />
                </View>

                <Pressable
                  onPress={handleSkipForNow}
                  disabled={loading}
                  style={({ pressed }) => [styles.guestBtn, loading && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }], backgroundColor: colors.gray[50] }]}
                >
                  <UserRound size={20} strokeWidth={1.8} color="#1A1A1A" />
                  <Text style={{ fontSize: 17, fontWeight: "600", color: "#1A1A1A" }}>Continue as Guest</Text>
                </Pressable>

                <Text style={[styles.agree, { marginTop: m.agreeTop }]}>By continuing, you agree to our</Text>
                <View style={styles.links}>
                  <Link to="/user/terms" onPressIn={() => warmPolicyPage(USER_POLICY_ENDPOINTS.terms)} hitSlop={6}>
                    <Text style={styles.linkText}>Terms</Text>
                  </Link>
                  <View style={styles.linkDot} />
                  <Link to="/user/privacy" onPressIn={() => warmPolicyPage(USER_POLICY_ENDPOINTS.privacy)} hitSlop={6}>
                    <Text style={styles.linkText}>Privacy</Text>
                  </Link>
                  <View style={styles.linkDot} />
                  <Link to="/user/support" onPressIn={() => warmPolicyPage(USER_POLICY_ENDPOINTS.support)} hitSlop={6}>
                    <Text style={styles.linkText}>Support</Text>
                  </Link>
                </View>
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Pressable>
  )
}

// The login is light only (the web's auth screens never follow the dark setting) and uses Inter.
export default function LoginScreen() {
  return (
    <ForceLight>
      <FontScope family={fonts.inter}>
        <UnifiedOTPFastLogin />
      </FontScope>
    </ForceLight>
  )
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden", backgroundColor: "#ECECEE" },
  page: { position: "relative", width: "100%", maxWidth: 480, alignSelf: "center", flex: 1, backgroundColor: colors.white, flexDirection: "column" },
  card: { position: "relative", zIndex: 30, flexShrink: 0, width: "100%", backgroundColor: colors.white, paddingHorizontal: 24 },
  cardLifted: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  h2: { lineHeight: 32, fontWeight: "800", color: "#1A1A1A", letterSpacing: -0.65 },
  sub: { marginTop: 8, fontSize: 16, lineHeight: 22, fontWeight: "400", color: "#6B7280" },
  inputShell: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  // focus-within:ring-2 ring-[#2563EB]/10
  ring: { position: "absolute", top: -3, left: -3, right: -3, bottom: -3, borderRadius: 19, borderWidth: 2, borderColor: "rgba(37,99,235,0.1)" },
  cc: { fontSize: 16, fontWeight: "600", color: "#1A1A1A" },
  sep: { width: 1, height: 24, backgroundColor: colors.gray[200], marginHorizontal: 12 },
  phoneInput: { flex: 1, minWidth: 0, height: "100%", fontSize: 16, color: "#1A1A1A" },
  phoneInputFilled: { fontWeight: "500", letterSpacing: 0.4 },
  phoneInputEmpty: { fontWeight: "400", letterSpacing: 0 },
  otpShell: { flex: 1, paddingHorizontal: 0, justifyContent: "center" },
  otpInput: { width: "100%", height: "100%", textAlign: "center", fontSize: 24, fontWeight: "700", color: "#1A1A1A" },
  nameInput: { flex: 1, minWidth: 0, height: "100%", fontSize: 16, color: "#1A1A1A" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.gray[50],
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
  },
  chipLabel: { fontSize: 11, lineHeight: 16, color: colors.gray[500], fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.55 },
  chipNumber: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: "#1A1A1A", letterSpacing: 0.375 },
  chipEdit: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  recoverBtn: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    backgroundColor: BRAND_RED,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "rgb(37,99,235)",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  freshBtn: { width: "100%", height: 56, borderRadius: 16, borderWidth: 1, borderColor: colors.gray[300], backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  submit: { position: "relative", marginTop: 20, width: "100%", height: 56, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  submitOff: { backgroundColor: "#E5E7EB" },
  submitOn: {
    backgroundColor: BRAND_RED,
    shadowColor: "rgb(37,99,235)",
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  submitText: { fontSize: 17, fontWeight: "600" },
  submitIcon: { position: "absolute", right: 10, top: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.gray[200] },
  guestBtn: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[300],
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  agree: { textAlign: "center", fontSize: 13, lineHeight: 21, color: colors.gray[500] },
  links: { marginTop: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  linkText: { fontSize: 12, lineHeight: 16, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.96, color: "#6B7280" },
  linkDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gray[400] },
})
