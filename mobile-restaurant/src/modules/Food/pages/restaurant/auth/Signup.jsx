// Web: modules/Food/pages/restaurant/auth/Signup.jsx — "Register Your Restaurant" (name + phone -> register OTP, then
// the shared /food/restaurant/otp screen). Phone layout only (the lg: banner half is desktop).
// Not reproduced: the web's static "Demo Credentials" box (+91 9876543210 / OTP 1234) — sample data with a hard-coded
// OTP, which the app must not show (CONVERSION_GUIDE section 7: never hard-code an OTP; no sample data).
import React, { useEffect, useRef, useState } from "react"
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Phone, User, AlertCircle, Loader2 } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { AppImage, KeyboardAwareScrollView, Screen, Text, TextInput } from "@/native/ui"
import { brand, colors, restaurantTheme, shadow } from "@/theme"
import { restaurantAPI } from "@food/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@food/components/ui/select"
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo"

const countryCodes = [
  { code: "+91", country: "IN", flag: "🇮🇳" },
]

const RED = restaurantTheme.brand
const RED_DARK = restaurantTheme.brandDark

function Spinner({ color = "#ffffff", size = 16 }) {
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

/** web keyframes fadeInDown / fadeInUp (opacity + translateY, ease-out) */
function FadeIn({ from, duration, delay = 0, style, children }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true })
    a.start()
    return () => a.stop()
  }, [anim, duration, delay])
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>
      {children}
    </Animated.View>
  )
}

function FieldError({ text, style }) {
  return (
    <View style={[styles.errorRow, style]}>
      <AlertCircle size={12} color={RED} />
      <Text style={styles.errorText}>{text}</Text>
    </View>
  )
}

export default function RestaurantSignup() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
    name: "",
  })
  const [errors, setErrors] = useState({
    phone: "",
    name: "",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState("")
  const [focused, setFocused] = useState(null)

  const validatePhone = (phone) => {
    if (!phone.trim()) {
      return "Phone number is required"
    }
    const cleanPhone = phone.replace(/[\s\-()]/g, "")
    const phoneRegex = /^\d{7,15}$/
    if (!phoneRegex.test(cleanPhone)) {
      return "Phone number must be 7-15 digits"
    }
    return ""
  }

  const validateName = (name) => {
    if (!name.trim()) {
      return "Restaurant name is required"
    }
    if (name.trim().length < 2) {
      return "Restaurant name must be at least 2 characters"
    }
    if (name.trim().length > 50) {
      return "Restaurant name must be less than 50 characters"
    }
    return ""
  }

  const handleChange = (name, value) => {
    setFormData({
      ...formData,
      [name]: value,
    })

    // Real-time validation
    if (name === "phone") {
      setErrors({ ...errors, phone: validatePhone(value) })
    } else if (name === "name") {
      setErrors({ ...errors, name: validateName(value) })
    }
  }

  const handleCountryCodeChange = (value) => {
    setFormData({
      ...formData,
      countryCode: value,
    })
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setApiError("")

    // Validate
    let hasErrors = false
    const newErrors = { phone: "", name: "" }

    const phoneError = validatePhone(formData.phone)
    newErrors.phone = phoneError
    if (phoneError) hasErrors = true

    const nameError = validateName(formData.name)
    newErrors.name = nameError
    if (nameError) hasErrors = true

    setErrors(newErrors)

    if (hasErrors) {
      setIsLoading(false)
      return
    }

    // Build full phone number
    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      // Send OTP with purpose 'register'
      await restaurantAPI.sendOTP(fullPhone, "register")

      // Store auth data in sessionStorage for OTP page
      const authData = {
        method: "phone",
        phone: fullPhone,
        name: formData.name,
        isSignUp: true,
        module: "restaurant",
      }
      sessionStorage.setItem("restaurantAuthData", JSON.stringify(authData))

      navigate("/food/restaurant/otp")
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to send OTP. Please try again."
      setApiError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Screen bg={colors.white}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} extraOffset={72} showsVerticalScrollIndicator={false}>
        {/* Top logo and version */}
        <View style={styles.topRow}>
          <FadeIn from={-16} duration={700} style={styles.logoRow}>
            <AppImage src={DEFAULT_BRAND_LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="Hello Parth" />
            <View style={{ alignItems: "flex-start" }}>
              <Text style={styles.panelText}>Restaurant Panel</Text>
            </View>
          </FadeIn>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>Software Version : 1.0.0</Text>
          </View>
        </View>

        {/* Centered content (title + form + info) */}
        <FadeIn from={20} duration={800} delay={150} style={styles.content}>
          {/* Title */}
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Register Your Restaurant</Text>
            <Text style={styles.subtitle}>Enter your details to get started.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Restaurant name input */}
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Restaurant Name</Text>
              <View style={styles.inputWrap}>
                <View style={styles.inputIcon} pointerEvents="none">
                  <User size={16} color={colors.gray[400]} />
                </View>
                <TextInput
                  value={formData.name}
                  onChangeText={(value) => handleChange("name", value)}
                  placeholder="Enter restaurant name"
                  placeholderTextColor={colors.gray[400]}
                  onFocus={() => setFocused("name")}
                  onBlur={() => setFocused(null)}
                  returnKeyType="next"
                  style={[styles.input, focused === "name" && styles.inputFocused, errors.name ? { borderColor: colors.red[500] } : null]}
                />
              </View>
              {errors.name ? <FieldError text={errors.name} /> : null}
            </View>

            {/* Phone input */}
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Select value={formData.countryCode} onValueChange={handleCountryCodeChange}>
                  <SelectTrigger style={styles.codeTrigger} textStyle={{ fontSize: 12 }}>
                    <SelectValue placeholder="Code" />
                  </SelectTrigger>
                  <SelectContent>
                    {countryCodes.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {`${country.flag}  ${country.code}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.inputWrap}>
                    <View style={styles.inputIcon} pointerEvents="none">
                      <Phone size={16} color={colors.gray[400]} />
                    </View>
                    <TextInput
                      value={formData.phone}
                      onChangeText={(value) => handleChange("phone", value)}
                      keyboardType="phone-pad"
                      inputMode="tel"
                      placeholder="Enter phone number"
                      placeholderTextColor={colors.gray[400]}
                      onFocus={() => setFocused("phone")}
                      onBlur={() => setFocused(null)}
                      returnKeyType="done"
                      onSubmitEditing={() => !isLoading && handleSubmit()}
                      style={[styles.input, focused === "phone" && styles.inputFocused, errors.phone ? { borderColor: colors.red[500] } : null]}
                    />
                  </View>
                </View>
              </View>
              {errors.phone ? <FieldError text={errors.phone} /> : null}
              {apiError && !errors.phone ? <FieldError text={apiError} style={{ marginTop: 4 }} /> : null}
            </View>

            {/* Sign up button */}
            <Pressable
              onPress={handleSubmit}
              disabled={isLoading}
              style={({ pressed }) => [styles.submitShell, isLoading && { opacity: 0.5 }, pressed && !isLoading && { opacity: 0.9 }]}
            >
              <LinearGradient colors={[RED, RED_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submit}>
                {isLoading ? (
                  <>
                    <Spinner />
                    <Text style={styles.submitText}>Sending OTP...</Text>
                  </>
                ) : (
                  <Text style={styles.submitText}>Send OTP</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginMuted}>Already have an account? </Text>
            <Pressable onPress={() => navigate("/food/restaurant/login")} hitSlop={6}>
              <Text style={styles.loginLink}>Login</Text>
            </Pressable>
          </View>
        </FadeIn>
      </KeyboardAwareScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  topRow: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { height: 48, width: 120, maxWidth: 160 },
  panelText: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.gray[500] },
  versionBadge: {
    position: "absolute",
    right: 24,
    top: 24,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: colors.emerald[50],
    borderWidth: 1,
    borderColor: colors.emerald[200],
    ...shadow.sm,
  },
  // text-emerald-700 -> restaurant primary strong
  versionText: { fontSize: 11, lineHeight: 16, fontWeight: "500", color: restaurantTheme.primaryStrong },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 32 },
  titleWrap: { marginBottom: 32, alignItems: "center" },
  title: { fontSize: 24, lineHeight: 32, fontWeight: "600", color: colors.gray[900], marginBottom: 8, textAlign: "center" },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.gray[500], textAlign: "center" },
  form: { width: "100%", maxWidth: 512, gap: 20, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.8)", padding: 4 },
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
    ...shadow.sm,
  },
  inputFocused: { borderColor: restaurantTheme.focusBorder, borderWidth: 2, paddingLeft: 35 },
  codeTrigger: { width: 80, height: 44 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  errorText: { fontSize: 12, lineHeight: 16, color: RED, flexShrink: 1 },
  submitShell: { marginTop: 8, borderRadius: 8, ...shadow.md },
  submit: { height: 44, width: "100%", borderRadius: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: "600" },
  loginRow: { marginTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  loginMuted: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  loginLink: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: brand.primaryOrange },
})
