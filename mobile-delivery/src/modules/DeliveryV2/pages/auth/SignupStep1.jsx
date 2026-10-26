import React, { useState, useEffect, useCallback } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { ArrowLeft, Check, ChevronDown } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { KeyboardAwareScrollView, Screen, Sheet, Text, TextInput } from "@/native/ui"
import { colors, fonts } from "@/theme"
import useDeliveryOnboardingExitGuard from "../../hooks/useDeliveryOnboardingExitGuard"
import OnboardingExitModal from "@/shared/components/OnboardingExitModal"
import { hasDeliveryStep1Progress, getAllSignupDocumentsFromDB } from "../../utils/deliveryOnboardingStorage"
import { EMAIL_REGEX } from "@/shared/utils/emailValidation"
import { prefetchModuleFcmToken } from "@food/utils/firebaseMessaging"
const debugError = () => {}

const VEHICLE_OPTIONS = [
  { value: "bike", label: "Bike" },
  { value: "scooter", label: "Scooter" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
]

function Field({ label, required, error, children }) {
  return (
    <View>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.red[500] }}>{" *"}</Text> : null}
      </Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

export default function SignupStep1() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("deliverySignupDetails")
    const base = {
      name: "",
      phone: "",
      countryCode: "+91",
      ref: "",
      email: "",
      address: "",
      city: "",
      state: "",
      vehicleType: "bike",
      vehicleName: "",
      vehicleNumber: "",
      drivingLicenseNumber: "",
      panNumber: "",
      aadharNumber: ""
    }
    if (saved) {
      try {
        return { ...base, ...JSON.parse(saved) }
      } catch (e) {
        debugError("Error parsing saved details:", e)
      }
    }
    return base
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [focused, setFocused] = useState(null)
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false)

  const hasUnsavedProgress = useCallback(
    () => hasDeliveryStep1Progress(formData),
    [formData],
  )

  const { showExitModal, handleBack, handleStay, handleExit } = useDeliveryOnboardingExitGuard(
    "details",
    hasUnsavedProgress,
  )

  useEffect(() => {
    prefetchModuleFcmToken("delivery")
    void getAllSignupDocumentsFromDB().catch(() => {})
  }, [])

  const sanitizeLocationValue = (value) =>
    value.replace(/[^A-Za-z\s.-]/g, "").replace(/\s{2,}/g, " ")

  const sanitizeNameValue = (value) =>
    value.replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ")

  const isValidLocationValue = (value) =>
    /^[A-Za-z][A-Za-z\s.-]*[A-Za-z.]$/.test(value.trim())

  const isValidNameValue = (value) =>
    /^[A-Za-z][A-Za-z\s]*[A-Za-z]$/.test(value.trim())

  const isValidEmailValue = (value) => {
    const normalizedValue = value.trim()
    return EMAIL_REGEX.test(normalizedValue)
  }

  const sanitizeEmailValue = (value) =>
    value.replace(/\s/g, "").toLowerCase()

  // Save data to session storage whenever formData changes
  useEffect(() => {
    sessionStorage.setItem("deliverySignupDetails", JSON.stringify(formData))
  }, [formData])

  const handleChange = (name, value) => {
    let updatedValue = value

    // Auto-uppercase for Vehicle, DL and PAN numbers
    if (name === "vehicleNumber" || name === "panNumber" || name === "drivingLicenseNumber") {
      updatedValue = value.toUpperCase()
    }

    if (name === "name") {
      updatedValue = sanitizeNameValue(value)
    }

    if (name === "vehicleNumber") {
      updatedValue = updatedValue.slice(0, 10)
    }

    if (name === "drivingLicenseNumber") {
      updatedValue = updatedValue.replace(/[^A-Z0-9]/g, "").slice(0, 15)
    }

    // Restrict Aadhaar to numeric only
    if (name === "aadharNumber") {
      updatedValue = value.replace(/\D/g, "").slice(0, 12)
    }

    if (name === "city" || name === "state") {
      updatedValue = sanitizeLocationValue(value)
    }

    if (name === "email") {
      updatedValue = sanitizeEmailValue(value)
      // Real-time validation for email
      if (updatedValue && !isValidEmailValue(updatedValue)) {
        setErrors(prev => ({ ...prev, email: "Please enter a valid email address (e.g., aaa@gmail.com)" }))
      } else if (!updatedValue) {
        setErrors(prev => ({ ...prev, email: "Email is required" }))
      } else {
        setErrors(prev => ({ ...prev, email: "" }))
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: updatedValue
    }))
    // Clear error for this field (except email which we handled above)
    if (name !== "email" && errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ""
      }))
    }
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = "Name is required"
    } else if (!isValidNameValue(formData.name)) {
      newErrors.name = "Name can contain letters only"
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!isValidEmailValue(formData.email)) {
      newErrors.email = "Please enter a valid email address (e.g., aaa@gmail.com)"
    }

    if (!formData.address.trim()) {
      newErrors.address = "Address is required"
    }

    if (!formData.city.trim()) {
      newErrors.city = "City is required"
    } else if (!isValidLocationValue(formData.city)) {
      newErrors.city = "City can contain letters only"
    }

    if (!formData.state.trim()) {
      newErrors.state = "State is required"
    } else if (!isValidLocationValue(formData.state)) {
      newErrors.state = "State can contain letters only"
    }

    if (!formData.vehicleNumber.trim()) {
      newErrors.vehicleNumber = "Vehicle number is required"
    } else if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/.test(formData.vehicleNumber)) {
      newErrors.vehicleNumber = "Invalid Indian vehicle number format (e.g., MH12AB1234)"
    }

    if (!formData.drivingLicenseNumber.trim()) {
      newErrors.drivingLicenseNumber = "Driving license number is required"
    } else if (!/^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/.test(formData.drivingLicenseNumber)) {
      newErrors.drivingLicenseNumber = "Invalid DL format (e.g., MH1220110012345)"
    }

    if (!formData.panNumber.trim()) {
      newErrors.panNumber = "PAN number is required"
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber)) {
      newErrors.panNumber = "Invalid PAN format (e.g., ABCDE1234F)"
    }

    if (!formData.aadharNumber.trim()) {
      newErrors.aadharNumber = "Aadhar number is required"
    } else if (!/^\d{12}$/.test(formData.aadharNumber.replace(/\s/g, ""))) {
      newErrors.aadharNumber = "Aadhar number must be 12 digits"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) {
      return
    }

    setIsSubmitting(true)

    try {
      const details = {
        name: formData.name.trim(),
        phone: String(formData.phone || "").replace(/\D/g, "").slice(0, 15),
        countryCode: formData.countryCode || "+91",
        ref: String(formData.ref || "").trim() || "",
        email: formData.email?.trim() || "",
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        vehicleType: formData.vehicleType || "bike",
        vehicleName: formData.vehicleName?.trim() || "",
        vehicleNumber: formData.vehicleNumber.trim(),
        drivingLicenseNumber: formData.drivingLicenseNumber.trim().toUpperCase(),
        panNumber: formData.panNumber.trim().toUpperCase(),
        aadharNumber: formData.aadharNumber.replace(/\s/g, "")
      }
      sessionStorage.setItem("deliverySignupDetails", JSON.stringify(details))
      navigate("/food/delivery/signup/documents")
    } catch (error) {
      debugError("Error saving details:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = (name, extra) => [
    styles.input,
    errors[name] ? styles.inputError : null,
    focused === name ? styles.inputFocused : null,
    extra,
  ]

  const inputProps = (name) => ({
    value: formData[name],
    onChangeText: (value) => handleChange(name, value),
    onFocus: () => setFocused(name),
    onBlur: () => setFocused((cur) => (cur === name ? null : cur)),
    placeholderTextColor: colors.gray[400],
    style: inputStyle(name),
  })

  const submitDisabled = isSubmitting || !formData.email || !isValidEmailValue(formData.email) || Object.values(errors).some(error => error !== "")
  const vehicleLabel = VEHICLE_OPTIONS.find((o) => o.value === formData.vehicleType)?.label || formData.vehicleType

  return (
    <Screen bg={colors.gray[100]} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.headerTitle}>Complete Your Profile</Text>
      </View>

      {/* Content */}
      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        <View style={{ marginBottom: 24 }}>
          <Text style={styles.h2}>Basic Details</Text>
          <Text style={styles.sub}>Please provide your information to continue</Text>
        </View>

        <View style={{ gap: 16 }}>
          {/* Name */}
          <Field label="Full Name" required error={errors.name}>
            <TextInput {...inputProps("name")} autoCapitalize="words" placeholder="Enter your full name" />
          </Field>

          {/* Email */}
          <Field label="Email" required error={errors.email}>
            <TextInput
              {...inputProps("email")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              placeholder="Enter your email"
            />
          </Field>

          {/* Address */}
          <Field label="Address" required error={errors.address}>
            <TextInput
              {...inputProps("address")}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={inputStyle("address", { minHeight: 96 })}
              placeholder="Enter your address"
            />
          </Field>

          {/* City and State */}
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Field label="City" required error={errors.city}>
                <TextInput {...inputProps("city")} placeholder="City" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="State" required error={errors.state}>
                <TextInput {...inputProps("state")} placeholder="State" />
              </Field>
            </View>
          </View>

          {/* Vehicle Type */}
          <Field label="Vehicle Type" required>
            <Pressable onPress={() => setVehicleSheetOpen(true)} style={[styles.input, styles.select]}>
              <Text style={styles.selectText}>{vehicleLabel}</Text>
              <ChevronDown size={18} color={colors.gray[500]} />
            </Pressable>
          </Field>

          {/* Vehicle Name */}
          <Field label="Vehicle Name/Model (Optional)">
            <TextInput {...inputProps("vehicleName")} placeholder="e.g., Honda Activa" />
          </Field>

          {/* Vehicle Number */}
          <Field label="Vehicle Number" required error={errors.vehicleNumber}>
            <TextInput {...inputProps("vehicleNumber")} maxLength={10} autoCapitalize="characters" placeholder="e.g., MH12AB1234" />
          </Field>

          {/* Driving License Number */}
          <Field label="Driving License Number" required error={errors.drivingLicenseNumber}>
            <TextInput {...inputProps("drivingLicenseNumber")} maxLength={15} autoCapitalize="characters" placeholder="e.g., MH1220110012345" />
          </Field>

          {/* PAN Number */}
          <Field label="PAN Number" required error={errors.panNumber}>
            <TextInput {...inputProps("panNumber")} maxLength={10} autoCapitalize="characters" placeholder="ABCDE1234F" />
          </Field>

          {/* Aadhar Number */}
          <Field label="Aadhar Number" required error={errors.aadharNumber}>
            <TextInput {...inputProps("aadharNumber")} maxLength={12} keyboardType="number-pad" placeholder="123456789012" />
          </Field>

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitDisabled}
            style={({ pressed }) => [styles.submitShell, !submitDisabled && styles.submitShadow, pressed && !submitDisabled && { transform: [{ scale: 0.98 }] }]}
          >
            {submitDisabled ? (
              <View style={[styles.submit, { backgroundColor: colors.gray[400] }]}>
                <Text style={styles.submitText}>{isSubmitting ? "Saving..." : "Continue"}</Text>
              </View>
            ) : (
              <LinearGradient colors={["#0E4B9C", "#021024"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submit}>
                <Text style={styles.submitText}>{isSubmitting ? "Saving..." : "Continue"}</Text>
              </LinearGradient>
            )}
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      {/* <select name="vehicleType"> */}
      <Sheet open={vehicleSheetOpen} onClose={() => setVehicleSheetOpen(false)} style={{ backgroundColor: colors.white }}>
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>Vehicle Type</Text>
          {VEHICLE_OPTIONS.map((opt) => {
            const selected = formData.vehicleType === opt.value
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  handleChange("vehicleType", opt.value)
                  setVehicleSheetOpen(false)
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <Text style={[styles.optionText, selected && { color: "#15498B", fontWeight: "700" }]}>{opt.label}</Text>
                {selected ? <Check size={18} color="#15498B" /> : null}
              </Pressable>
            )
          })}
        </View>
      </Sheet>

      <OnboardingExitModal
        open={showExitModal}
        onStay={handleStay}
        onExit={handleExit}
        theme="delivery"
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    zIndex: 30,
  },
  backBtn: { padding: 8, borderRadius: 9999 },
  headerTitle: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 28, fontWeight: "500", color: "#0F1724", letterSpacing: 0.2 },
  content: { paddingHorizontal: 16, paddingVertical: 24 },
  h2: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: "700", color: colors.gray[900], marginBottom: 8, letterSpacing: 0.2 },
  sub: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.gray[700], marginBottom: 4 },
  input: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E8DEE7",
    borderRadius: 10,
    backgroundColor: colors.white,
    color: "#0F1724",
    fontSize: 16,
  },
  inputFocused: { borderColor: "#8AA4C5" },
  inputError: { borderColor: colors.red[500] },
  error: { color: colors.red[500], fontSize: 14, lineHeight: 20, marginTop: 4 },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { fontSize: 16, lineHeight: 22, color: "#0F1724" },
  submitShell: { width: "100%", marginTop: 24, borderRadius: 10 },
  submitShadow: { elevation: 6, shadowColor: "#0E4B9C", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  submit: { width: "100%", paddingVertical: 16, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  submitText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: "700" },
  sheetBody: { paddingTop: 16, paddingBottom: 12 },
  sheetTitle: { fontFamily: fonts.sora, fontSize: 16, fontWeight: "700", color: colors.gray[900], paddingHorizontal: 20, paddingBottom: 8 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  optionText: { fontSize: 16, color: colors.gray[800] },
})
