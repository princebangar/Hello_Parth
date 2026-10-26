// Web: modules/Food/pages/restaurant/auth/ForgotPassword.jsx — 3 steps in one card: email -> 6-digit OTP -> new
// password. Phone layout only (the lg: banner half is desktop). The card sits in a KeyboardAwareScrollView so every
// field and its button stay above the keyboard.
import React, { useEffect, useRef, useState } from "react"
import { Keyboard, Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Mail, ArrowLeft, Lock, Eye, EyeOff } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { KeyboardAwareScrollView, Screen, Text, TextInput } from "@/native/ui"
import { brand, colors, restaurantTheme, shadow } from "@/theme"
import { restaurantAPI } from "@food/api"

const RED = restaurantTheme.brand
const RED_DARK = restaurantTheme.brandDark

/** bg-gradient-to-br from-[#B80B3D] to-[#66001D] h-11 w-full button */
function SubmitButton({ onPress, disabled, label }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.submitShell, disabled && { opacity: 0.5 }, pressed && !disabled && { opacity: 0.9 }]}
    >
      <LinearGradient colors={[RED, RED_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submit}>
        <Text style={styles.submitText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  )
}

export default function RestaurantForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1: email, 2: OTP, 3: new password
  const [email, setEmail] = useState("")
  const [otp, setOtpState] = useState(["", "", "", "", "", ""])
  // latest boxes for the change / key handlers (quick typing must not read a stale array)
  const otpRef = useRef(["", "", "", "", "", ""])
  const setOtp = (next) => {
    otpRef.current = next
    setOtpState(next)
  }
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [focused, setFocused] = useState(null)
  const inputRefs = useRef(Array(6).fill(null).map(() => null))
  const timerRef = useRef(null)

  // the web's setInterval countdowns are cleared when the screen goes away
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    Keyboard.dismiss()
  }, [])

  const startResendTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setResendTimer(60)
    timerRef.current = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handleEmailSubmit = async () => {
    setError("")

    if (!email.trim()) {
      setError("Email is required")
      return
    }

    setIsLoading(true)
    try {
      await restaurantAPI.sendOTP(null, "reset-password", email)
      setStep(2)
      startResendTimer()
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpChange = (index, rawValue) => {
    const value = String(rawValue ?? "")
    if (!/^\d*$/.test(value)) return

    // pasted / auto-filled code (web: onPaste on the first box)
    if (value.length > 1 && !(value.length === 2 && otpRef.current[index] && value.startsWith(otpRef.current[index]))) {
      const digits = value.replace(/\D/g, "").slice(0, 6).split("")
      const newOtp = [...otpRef.current]
      digits.forEach((digit, i) => {
        if (index + i < 6) newOtp[index + i] = digit
      })
      setOtp(newOtp)
      const next = Math.min(5, index + digits.length)
      if (newOtp.every((d) => d !== "")) Keyboard.dismiss()
      else inputRefs.current[next]?.focus()
      return
    }

    const newOtp = [...otpRef.current]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)

    if (value && newOtp.every((d) => d !== "")) {
      // last digit in: put the keyboard away so "Verify Code" is in view
      Keyboard.dismiss()
    } else if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index, e) => {
    if (e?.nativeEvent?.key === "Backspace" && !otpRef.current[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpSubmit = async () => {
    setError("")

    const otpCode = otpRef.current.join("")
    if (otpCode.length !== 6) {
      setError("Please enter the complete OTP")
      return
    }

    setIsLoading(true)
    try {
      await restaurantAPI.verifyOTP(null, otpCode, "reset-password", null, email)
      setStep(3)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP. Please try again."
      setError(message)
      setOtp(["", "", "", "", "", ""])
      setTimeout(() => {
        const el = inputRefs.current[0]
        el?.blur()
        el?.focus()
      }, 150)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")
    try {
      await restaurantAPI.sendOTP(null, "reset-password", email)
      startResendTimer()
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordSubmit = async () => {
    setError("")

    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields")
      return
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setIsLoading(true)
    try {
      // Same call as the web (restaurantAPI has no resetPassword there either: the error is shown in the card).
      const response = await restaurantAPI.resetPassword(email, otpRef.current.join(""), newPassword)

      const data = response?.data || {}
      if (!data.success) {
        throw new Error(data.message || "Failed to reset password")
      }

      navigate("/food/restaurant/login", {
        state: { message: "Password reset successfully. Please login with your new password." },
      })
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to reset password. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const passwordField = ({ id, label, value, onChange, show, toggle, placeholder, onSubmit }) => (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <View style={styles.inputIcon} pointerEvents="none">
          <Lock size={16} color={colors.gray[400]} />
        </View>
        <TextInput
          secureTextEntry={!show}
          placeholder={placeholder}
          placeholderTextColor={colors.gray[400]}
          value={value}
          onChangeText={onChange}
          editable={!isLoading}
          autoComplete="new-password"
          textContentType="newPassword"
          autoCapitalize="none"
          onFocus={() => setFocused(id)}
          onBlur={() => setFocused(null)}
          returnKeyType={onSubmit ? "done" : "next"}
          onSubmitEditing={onSubmit}
          style={[styles.input, { paddingRight: 40 }, focused === id && styles.inputFocused]}
        />
        <Pressable onPress={toggle} disabled={isLoading} hitSlop={8} style={styles.eyeBtn}>
          {show ? <EyeOff size={16} color={colors.gray[500]} /> : <Eye size={16} color={colors.gray[500]} />}
        </Pressable>
      </View>
    </View>
  )

  return (
    <Screen bg={colors.white}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} extraOffset={72} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {/* CardHeader */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {step === 1 ? "Forgot Password" : step === 2 ? "Verify OTP" : "Reset Password"}
            </Text>
            <Text style={styles.cardDescription}>
              {step === 1
                ? "Enter your email to receive a verification code"
                : step === 2
                  ? "Enter the 6-digit code sent to your email"
                  : "Enter your new password"}
            </Text>
          </View>

          {/* CardContent */}
          <View style={styles.cardContent}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {step === 1 ? (
              <View style={{ gap: 20 }}>
                <View style={{ gap: 6 }}>
                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputWrap}>
                    <View style={styles.inputIcon} pointerEvents="none">
                      <Mail size={16} color={colors.gray[400]} />
                    </View>
                    <TextInput
                      keyboardType="email-address"
                      inputMode="email"
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                      placeholder="restaurant@example.com"
                      placeholderTextColor={colors.gray[400]}
                      value={email}
                      onChangeText={setEmail}
                      editable={!isLoading}
                      onFocus={() => setFocused("email")}
                      onBlur={() => setFocused(null)}
                      returnKeyType="done"
                      onSubmitEditing={() => !isLoading && handleEmailSubmit()}
                      style={[styles.input, focused === "email" && styles.inputFocused]}
                    />
                  </View>
                </View>

                <SubmitButton onPress={handleEmailSubmit} disabled={isLoading} label={isLoading ? "Sending..." : "Send Verification Code"} />
              </View>
            ) : null}

            {step === 2 ? (
              <View style={{ gap: 20 }}>
                <View style={{ gap: 16 }}>
                  <Text style={[styles.label, { textAlign: "center" }]}>Enter Verification Code</Text>
                  <View style={styles.otpRow}>
                    {otp.map((digit, index) => (
                      <TextInput
                         
                        key={index}
                        ref={(el) => {
                          if (inputRefs.current) {
                            inputRefs.current[index] = el
                          }
                        }}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        autoComplete={index === 0 ? "sms-otp" : "off"}
                        textContentType={index === 0 ? "oneTimeCode" : "none"}
                        value={digit}
                        onChangeText={(text) => handleOtpChange(index, text)}
                        onKeyPress={(e) => handleOtpKeyDown(index, e)}
                        onFocus={() => setFocused(`otp-${index}`)}
                        onBlur={() => setFocused(null)}
                        selectTextOnFocus
                        editable={!isLoading}
                        style={[styles.otpBox, focused === `otp-${index}` && styles.inputFocused, isLoading && { opacity: 0.5 }]}
                      />
                    ))}
                  </View>
                  <Text style={styles.sentTo}>
                    {"Code sent to "}
                    <Text style={{ fontWeight: "500" }}>{email}</Text>
                  </Text>
                </View>

                <View style={styles.linkRow}>
                  <Pressable
                    onPress={() => setStep(1)}
                    disabled={isLoading}
                    style={({ pressed }) => [styles.inlineLink, pressed && { opacity: 0.8 }]}
                  >
                    <ArrowLeft size={16} color={brand.primaryOrange} />
                    <Text style={styles.linkText}>Change email</Text>
                  </Pressable>
                  <Pressable onPress={handleResendOtp} disabled={resendTimer > 0 || isLoading} hitSlop={6}>
                    <Text style={[styles.linkText, { fontWeight: "500" }, (resendTimer > 0 || isLoading) && { color: colors.gray[400] }]}>
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
                    </Text>
                  </Pressable>
                </View>

                <SubmitButton onPress={handleOtpSubmit} disabled={isLoading} label={isLoading ? "Verifying..." : "Verify Code"} />
              </View>
            ) : null}

            {step === 3 ? (
              <View style={{ gap: 20 }}>
                {passwordField({
                  id: "newPassword",
                  label: "New Password",
                  value: newPassword,
                  onChange: setNewPassword,
                  show: showPassword,
                  toggle: () => setShowPassword(!showPassword),
                  placeholder: "Enter new password",
                })}
                {passwordField({
                  id: "confirmPassword",
                  label: "Confirm Password",
                  value: confirmPassword,
                  onChange: setConfirmPassword,
                  show: showConfirmPassword,
                  toggle: () => setShowConfirmPassword(!showConfirmPassword),
                  placeholder: "Confirm new password",
                  onSubmit: () => !isLoading && handlePasswordSubmit(),
                })}

                <SubmitButton onPress={handlePasswordSubmit} disabled={isLoading} label={isLoading ? "Resetting..." : "Reset Password"} />
              </View>
            ) : null}

            <View style={styles.footer}>
              <Pressable
                onPress={() => navigate("/food/restaurant/login")}
                style={({ pressed }) => [styles.inlineLink, pressed && { opacity: 0.8 }]}
              >
                <ArrowLeft size={16} color={brand.primaryOrange} />
                <Text style={styles.linkText}>Back to login</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
  card: {
    width: "100%",
    maxWidth: 512,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 14,
    ...shadow.xl,
  },
  cardHeader: { paddingHorizontal: 24, paddingTop: 24, gap: 6 },
  cardTitle: { fontSize: 24, lineHeight: 32, fontWeight: "600", color: colors.gray[900] },
  cardDescription: { fontSize: 14, lineHeight: 20, color: colors.gray[500] },
  cardContent: { padding: 24, gap: 24 },
  errorBox: { borderRadius: 8, borderWidth: 1, borderColor: colors.red[200], backgroundColor: colors.red[50], paddingHorizontal: 16, paddingVertical: 12 },
  // text-red-700 stays red (not a green/emerald/orange/amber-700 class)
  errorText: { fontSize: 14, lineHeight: 20, color: colors.red[700] },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.gray[700] },
  inputWrap: { justifyContent: "center" },
  inputIcon: { position: "absolute", left: 12, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 },
  input: {
    height: 44,
    paddingLeft: 36,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 8,
    backgroundColor: colors.white,
    fontSize: 14,
    color: colors.gray[900],
    ...shadow.xs,
  },
  inputFocused: { borderColor: restaurantTheme.focusBorder },
  eyeBtn: { position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" },
  otpRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  otpBox: {
    // web w-14 boxes shrink in the flex row on a phone-width card
    flex: 1,
    maxWidth: 56,
    height: 56,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "600",
    borderWidth: 2,
    borderColor: colors.gray[200],
    borderRadius: 8,
    backgroundColor: colors.white,
    color: colors.gray[900],
    padding: 0,
  },
  sentTo: { fontSize: 14, lineHeight: 20, color: colors.gray[500], textAlign: "center" },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inlineLink: { flexDirection: "row", alignItems: "center", gap: 8 },
  linkText: { fontSize: 14, lineHeight: 20, color: brand.primaryOrange },
  submitShell: { borderRadius: 8 },
  submit: { height: 44, width: "100%", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  submitText: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  footer: { paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.gray[200] },
})
