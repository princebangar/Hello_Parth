// Web: pages/restaurant/PhoneNumbersPage.jsx — "Important contacts" (/phone): Order reminder numbers #1 / #2 and the
// Restaurant page number, each with an edit button -> "Edit phone number" sheet (country code picker sheet + number)
// -> Save. The web then showed a "Verify OTP" sheet that accepted any 6 digits and saved nothing; here (Prince, 27 Oct)
// Save stores the number on the server (PATCH /food/restaurant/profile: orderReminderNumbers / primaryContactNumber)
// and the OTP sheet is not opened.
// Native:
// - the web started the three numbers with a hard-coded sample number ("+91-9981127415"). The app shows no sample
//   data, so the three rows start from the restaurant's real contact number (GET /food/restaurant/current:
//   primaryContactNumber, else ownerPhone) as "+91-XXXXXXXXXX", and stay empty when there is none;
// - the bottom sheets are native Sheets; their inputs sit in a KeyboardAwareScrollView with the Cancel / Save
//   buttons at its end, so the focused field and the buttons stay above the keyboard;
// - OTP boxes (login rules): each box's value is kept in a ref (fast typing never loses a digit), typing moves to
//   the next box, Backspace on an empty box goes back, a pasted / auto-filled code fills every box, the keyboard
//   closes after the last digit, Resend clears the boxes and focuses the first one; the keyboard is closed on unmount.
import React, { useEffect, useRef, useState } from "react"
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { ArrowLeft, ChevronDown, Edit, Phone, Users, X } from "lucide-react-native"
import { KeyboardAwareScrollView, Screen, Sheet, StatusBarSpacer, Text, TextInput } from "@/native/ui"
import { colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { restaurantAPI } from "@food/api"
import { toast } from "@/lib/toast"

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]
const EMPTY_OTP = ["", "", "", "", "", ""]

/** "+91-XXXXXXXXXX" from the restaurant profile (the web's display format), "" when there is no number */
const toDisplayNumber = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "").slice(-10)
  return digits ? `+91-${digits}` : ""
}

function GradientFill() {
  return <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
}

function SheetHeader({ title, onClose }) {
  return (
    <View style={s.sheetHeader}>
      <Text style={s.sheetTitle}>{title}</Text>
      <Pressable onPress={onClose} style={({ pressed }) => [s.closeBtn, pressed && { backgroundColor: colors.gray[100] }]} hitSlop={6}>
        <X size={20} color={colors.gray[600]} />
      </Pressable>
    </View>
  )
}

function FooterButtons({ onCancel, onConfirm, confirmLabel, enabled }) {
  return (
    <View style={s.sheetFooter}>
      <Pressable onPress={onCancel} style={({ pressed }) => [s.cancelBtn, pressed && { backgroundColor: colors.gray[50] }]}>
        <Text style={s.cancelText}>Cancel</Text>
      </Pressable>
      <Pressable onPress={onConfirm} disabled={!enabled} style={[s.confirmBtn, !enabled && { backgroundColor: colors.gray[300] }]}>
        {enabled ? <GradientFill /> : null}
        <Text style={[s.confirmText, { color: enabled ? colors.white : colors.gray[500] }]}>{confirmLabel}</Text>
      </Pressable>
    </View>
  )
}

export default function PhoneNumbersPage() {
  const goBack = useRestaurantBackNavigation()
  const [editingNumber, setEditingNumber] = useState(null) // 'orderReminder1' | 'orderReminder2' | 'restaurantPage'
  const [countryCode, setCountryCode] = useState("+91")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isCountryCodeOpen, setIsCountryCodeOpen] = useState(false)
  const [showOtpPopup, setShowOtpPopup] = useState(false)
  const [otp, setOtp] = useState(EMPTY_OTP)
  const otpRef = useRef([...EMPTY_OTP]) // the boxes' real values (state can lag behind fast typing)
  const otpInputsRef = useRef([])
  const [pendingPhoneData, setPendingPhoneData] = useState(null) // Store phone data to save after OTP verification
  const [phoneFocused, setPhoneFocused] = useState(false)
  const [focusedOtp, setFocusedOtp] = useState(-1)

  // Phone numbers data - only mobile now
  const [phoneData, setPhoneData] = useState({
    orderReminder1: "",
    orderReminder2: "",
    restaurantPage: "",
  })

  useEffect(() => {
    let cancelled = false
    restaurantAPI
      .getCurrentRestaurant()
      .then((response) => {
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (cancelled || !data) return
        // saved numbers (backend: orderReminderNumbers + primaryContactNumber); until a reminder number is saved it
        // shows the restaurant's contact number, like the web showed one number in all three rows
        const fallback = toDisplayNumber(data.primaryContactNumber || data.ownerPhone)
        const reminders = Array.isArray(data.orderReminderNumbers) ? data.orderReminderNumbers : []
        setPhoneData({
          orderReminder1: toDisplayNumber(reminders[0]) || fallback,
          orderReminder2: toDisplayNumber(reminders[1]) || fallback,
          restaurantPage: toDisplayNumber(data.primaryContactNumber) || fallback,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      Keyboard.dismiss()
    }
  }, [])

  // Country codes
  const countryCodes = [
    { code: "+91", country: "India", flag: "🇮🇳" },
    { code: "+1", country: "USA", flag: "🇺🇸" },
    { code: "+44", country: "UK", flag: "🇬🇧" },
    { code: "+971", country: "UAE", flag: "🇦🇪" },
    { code: "+65", country: "Singapore", flag: "🇸🇬" },
    { code: "+86", country: "China", flag: "🇨🇳" },
    { code: "+81", country: "Japan", flag: "🇯🇵" },
    { code: "+61", country: "Australia", flag: "🇦🇺" },
  ]

  const setOtpBoxes = (next) => {
    otpRef.current = next
    setOtp(next)
  }

  const focusOtpBox = (index) => {
    const input = otpInputsRef.current[index]
    if (input) input.focus()
  }

  const handleEditClick = (type) => {
    const currentNumber = phoneData[type] || ""
    const parts = currentNumber.split("-")
    setCountryCode(parts[0] || "+91")
    setPhoneNumber(parts[1] || "")
    setEditingNumber(type)
  }

  // Save writes the number to the backend at once (Prince, 27 Oct): the web's OTP step accepted any 6 digits and saved
  // nothing, so it is not shown; reminder numbers -> orderReminderNumbers, the page number -> primaryContactNumber.
  const [savingNumber, setSavingNumber] = useState(false)
  const handleSaveEdit = async () => {
    if (!editingNumber || !phoneNumber.trim() || savingNumber) return
    const digits = phoneNumber.replace(/D/g, "")
    if (digits.length < 10) {
      toast.error("Please enter a valid 10-digit phone number")
      return
    }
    const value = `${countryCode}-${digits}`
    const next = { ...phoneData, [editingNumber]: value }
    const toSaved = (display) => String(display || "").replace(/D/g, "").slice(-10)
    const body =
      editingNumber === "restaurantPage"
        ? { primaryContactNumber: digits.slice(-10) }
        : { orderReminderNumbers: [toSaved(next.orderReminder1), toSaved(next.orderReminder2)] }
    try {
      setSavingNumber(true)
      await restaurantAPI.updateProfile(body)
      setPhoneData(next)
      Keyboard.dismiss()
      setEditingNumber(null)
      setCountryCode("+91")
      setPhoneNumber("")
      toast.success("Phone number updated")
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || "Failed to update phone number")
    } finally {
      setSavingNumber(false)
    }
  }

  const handleCancelEdit = () => {
    Keyboard.dismiss()
    setEditingNumber(null)
    setCountryCode("+91")
    setPhoneNumber("")
  }

  const handleOtpChange = (index, value) => {
    const digits = String(value || "").replace(/\D/g, "")
    if (String(value || "") !== digits && digits === "") return // Only allow digits

    const newOtp = [...otpRef.current]

    if (digits.length > 1) {
      // pasted / auto-filled code: fill from this box on
      let last = index
      for (let i = 0; i < digits.length && index + i < 6; i += 1) {
        newOtp[index + i] = digits[i]
        last = index + i
      }
      setOtpBoxes(newOtp)
      if (newOtp.every(Boolean)) {
        Keyboard.dismiss()
      } else if (last < 5) {
        focusOtpBox(last + 1)
      }
      return
    }

    newOtp[index] = digits.slice(-1) // Only take last character
    setOtpBoxes(newOtp)

    // Auto-focus next input; the keyboard closes after the last digit
    if (digits && index < 5) {
      focusOtpBox(index + 1)
    } else if (digits && index === 5) {
      Keyboard.dismiss()
    }
  }

  const handleOtpKeyPress = (index, e) => {
    if (e?.nativeEvent?.key === "Backspace" && !otpRef.current[index] && index > 0) {
      focusOtpBox(index - 1)
    }
  }

  const handleVerifyOtp = () => {
    const otpString = otpRef.current.join("")

    // Like the web: any 6-digit OTP is accepted (no verification endpoint for these numbers)
    if (otpString.length === 6) {
      if (pendingPhoneData) {
        setPhoneData((prev) => ({
          ...prev,
          [pendingPhoneData.type]: pendingPhoneData.value,
        }))
      }

      Keyboard.dismiss()
      setShowOtpPopup(false)
      setPendingPhoneData(null)
      setOtpBoxes([...EMPTY_OTP])
      setCountryCode("+91")
      setPhoneNumber("")
    }
  }

  const handleResendOtp = () => {
    // Reset OTP input
    setOtpBoxes([...EMPTY_OTP])
    focusOtpBox(0)
  }

  const handleCancelOtp = () => {
    Keyboard.dismiss()
    setShowOtpPopup(false)
    setPendingPhoneData(null)
    setOtpBoxes([...EMPTY_OTP])
  }

  // web: autoFocus on the first box when the popup appears
  useEffect(() => {
    if (!showOtpPopup) return undefined
    const t = setTimeout(() => focusOtpBox(0), 350)
    return () => clearTimeout(t)
  }, [showOtpPopup])

  const getDisplayNumber = (type) => {
    return phoneData[type] || ""
  }

  const otpComplete = otp.join("").length === 6

  return (
    <Screen bg={colors.gray[100]} edges={["bottom"]}>
      {/* Header */}
      <View style={s.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={s.headerRow}>
          <Pressable onPress={goBack} style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: colors.gray[100] }]} accessibilityLabel="Go back">
            <ArrowLeft size={20} color={colors.gray[700]} />
          </Pressable>
          <Text style={s.headerTitle}>Important contacts</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        {/* Order reminder numbers */}
        <View style={[s.card, { marginBottom: sp(4) }]}>
          <View style={s.cardHead}>
            <View style={s.cardIcon}>
              <Users size={20} color={colors.gray[700]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Order reminder numbers</Text>
              <Text style={s.cardSub}>
                Should always be available for Hello Parth to reach out for live order support and order reminders.
              </Text>
            </View>
          </View>

          <View style={{ marginTop: sp(4), gap: sp(3) }}>
            {/* Order reminder number #1 */}
            <View style={s.numberRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.numberLabel}>Order reminder number #1</Text>
                <Text style={s.numberValue}>{getDisplayNumber("orderReminder1")}</Text>
              </View>
              <Pressable onPress={() => handleEditClick("orderReminder1")} style={({ pressed }) => [s.editBtn, pressed && { backgroundColor: colors.gray[100] }]}>
                <Edit size={16} color={restaurantTheme.brand} />
              </Pressable>
            </View>

            {/* Order reminder number #2 */}
            <View style={[s.numberRow, s.numberRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.numberLabel}>Order reminder number #2</Text>
                <Text style={s.numberValue}>{getDisplayNumber("orderReminder2")}</Text>
              </View>
              <Pressable onPress={() => handleEditClick("orderReminder2")} style={({ pressed }) => [s.editBtn, pressed && { backgroundColor: colors.gray[100] }]}>
                <Edit size={16} color={restaurantTheme.brand} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Restaurant page number */}
        <View style={[s.card, { marginBottom: sp(6) }]}>
          <View style={s.cardHead}>
            <View style={s.cardIcon}>
              <Phone size={20} color={colors.gray[700]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Restaurant page number</Text>
              <Text style={s.cardSub}>Number for Hello Parth customers to call your restaurant.</Text>
            </View>
          </View>

          <View style={{ marginTop: sp(4) }}>
            <View style={s.numberRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.numberValue}>{getDisplayNumber("restaurantPage")}</Text>
              </View>
              <Pressable onPress={() => handleEditClick("restaurantPage")} style={({ pressed }) => [s.editBtn, pressed && { backgroundColor: colors.gray[100] }]}>
                <Edit size={16} color={restaurantTheme.brand} />
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Edit Phone Number Popup */}
      <Sheet open={Boolean(editingNumber)} onClose={handleCancelEdit} style={s.sheet}>
        <View style={{ maxHeight: "100%" }}>
          <SheetHeader title="Edit phone number" onClose={handleCancelEdit} />
          <KeyboardAwareScrollView style={s.sheetScroll} contentContainerStyle={{ flexGrow: 0 }} extraOffset={90}>
            <View style={s.sheetBody}>
              {/* Country Code Selector */}
              <View>
                <Text style={s.fieldLabel}>Country code</Text>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss()
                    setIsCountryCodeOpen(true)
                  }}
                  style={({ pressed }) => [s.selectBtn, pressed && { backgroundColor: colors.gray[50] }]}
                >
                  <View style={s.selectLeft}>
                    <Text style={s.flag}>{countryCodes.find((c) => c.code === countryCode)?.flag || "🇮🇳"}</Text>
                    <Text style={s.selectText}>{countryCode}</Text>
                  </View>
                  <ChevronDown size={20} color={colors.gray[500]} />
                </Pressable>
              </View>

              {/* Phone Number Input */}
              <View>
                <Text style={s.fieldLabel}>Phone number</Text>
                <TextInput
                  value={phoneNumber}
                  onChangeText={(text) => setPhoneNumber(text.replace(/\D/g, ""))}
                  placeholder="Enter phone number"
                  placeholderTextColor={colors.gray[400]}
                  keyboardType="phone-pad"
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                  style={[s.textField, phoneFocused && s.textFieldFocused]}
                />
              </View>
            </View>
            <FooterButtons onCancel={handleCancelEdit} onConfirm={handleSaveEdit} confirmLabel="Save" enabled={Boolean(phoneNumber.trim())} />
          </KeyboardAwareScrollView>
        </View>
      </Sheet>

      {/* Country Code Selection Popup */}
      <Sheet open={isCountryCodeOpen} onClose={() => setIsCountryCodeOpen(false)} style={[s.sheet, { maxHeight: "60%" }]}>
        <SheetHeader title="Select country code" onClose={() => setIsCountryCodeOpen(false)} />
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={[s.sheetBody, { gap: sp(2) }]}>
          {countryCodes.map((country) => {
            const selected = countryCode === country.code
            return (
              <Pressable
                key={country.code}
                onPress={() => {
                  setCountryCode(country.code)
                  setIsCountryCodeOpen(false)
                }}
                style={({ pressed }) => [s.countryRow, !selected && { backgroundColor: pressed ? colors.gray[100] : colors.gray[50] }]}
              >
                {selected ? <GradientFill /> : null}
                <Text style={s.countryFlag}>{country.flag}</Text>
                <Text style={[s.countryName, { color: selected ? colors.white : colors.gray[900] }]}>{country.country}</Text>
                <Text style={[s.countryCode, { color: selected ? colors.white : colors.gray[600] }]}>{country.code}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </Sheet>

      {/* OTP Verification Popup */}
      <Sheet open={showOtpPopup} onClose={handleCancelOtp} style={s.sheet}>
        <View>
          <SheetHeader title="Verify OTP" onClose={handleCancelOtp} />
          <KeyboardAwareScrollView style={s.sheetScroll} extraOffset={140}>
            <View style={[s.sheetBody, { paddingVertical: sp(6), gap: sp(6) }]}>
              <View style={{ alignItems: "center" }}>
                <Text style={s.otpInfo}>We've sent a 6-digit OTP to</Text>
                <Text style={s.otpNumber}>
                  {pendingPhoneData ? `${pendingPhoneData.countryCode}-${pendingPhoneData.phoneNumber}` : ""}
                </Text>
              </View>

              {/* OTP Input Fields */}
              <View style={s.otpRow}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(el) => {
                      otpInputsRef.current[index] = el
                    }}
                    value={digit}
                    onChangeText={(text) => handleOtpChange(index, text)}
                    onKeyPress={(e) => handleOtpKeyPress(index, e)}
                    onFocus={() => setFocusedOtp(index)}
                    onBlur={() => setFocusedOtp((prev) => (prev === index ? -1 : prev))}
                    keyboardType="number-pad"
                    textContentType={index === 0 ? "oneTimeCode" : "none"}
                    autoComplete={index === 0 ? "sms-otp" : "off"}
                    selectTextOnFocus
                    textAlign="center"
                    style={[s.otpBox, focusedOtp === index && s.otpBoxFocused]}
                  />
                ))}
              </View>

              <View style={{ alignItems: "center" }}>
                <Pressable onPress={handleResendOtp} hitSlop={6}>
                  <Text style={s.resendText}>Resend OTP</Text>
                </Pressable>
              </View>
            </View>
            <FooterButtons onCancel={handleCancelOtp} onConfirm={handleVerifyOtp} confirmLabel="Verify" enabled={otpComplete} />
          </KeyboardAwareScrollView>
        </View>
      </Sheet>
    </Screen>
  )
}

const s = StyleSheet.create({
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: "row", alignItems: "center", gap: sp(3) },
  backBtn: { padding: sp(1), borderRadius: 9999 },
  headerTitle: { ...fontSize.xl, fontWeight: "700", color: colors.gray[900] },
  content: { paddingHorizontal: sp(4), paddingVertical: sp(6) },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: sp(4) },
  cardHead: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(2) },
  cardIcon: { width: 32, height: 32, backgroundColor: colors.gray[100], borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  cardTitle: { ...fontSize.base, fontWeight: "700", color: colors.gray[900] },
  cardSub: { ...fontSize.xs, color: colors.gray[600], marginTop: sp(1) },
  numberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: sp(2) },
  numberRowBorder: { borderTopWidth: 1, borderTopColor: colors.gray[100] },
  numberLabel: { ...fontSize.sm, color: colors.gray[700], marginBottom: sp(1) },
  numberValue: { ...fontSize.base, fontWeight: "600", color: colors.gray[900] },
  editBtn: { padding: sp(2), borderRadius: radius.lg },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius["2xl"], borderTopRightRadius: radius["2xl"], maxHeight: "70%", ...shadow["2xl"] },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: sp(4),
    paddingVertical: sp(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  sheetTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900] },
  closeBtn: { padding: sp(1), borderRadius: 9999 },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { paddingHorizontal: sp(4), paddingVertical: sp(4), gap: sp(4) },
  fieldLabel: { ...fontSize.sm, fontWeight: "500", color: colors.gray[900], marginBottom: sp(2) },
  selectBtn: {
    width: "100%",
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
  },
  selectLeft: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  flag: { ...fontSize.lg },
  selectText: { ...fontSize.sm, color: colors.gray[900] },
  textField: {
    width: "100%",
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    ...fontSize.sm,
    color: colors.gray[900],
    backgroundColor: colors.white,
  },
  textFieldFocused: { borderColor: restaurantTheme.focusBorder },
  sheetFooter: {
    paddingHorizontal: sp(4),
    paddingVertical: sp(4),
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    flexDirection: "row",
    gap: sp(3),
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: sp(3),
    paddingHorizontal: sp(4),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  cancelText: { ...fontSize.sm, fontWeight: "600", color: colors.gray[900] },
  confirmBtn: { flex: 1, paddingVertical: sp(3), paddingHorizontal: sp(4), borderRadius: radius.lg, alignItems: "center", overflow: "hidden" },
  confirmText: { ...fontSize.sm, fontWeight: "600" },
  countryRow: {
    width: "100%",
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: sp(3),
    overflow: "hidden",
  },
  countryFlag: { ...fontSize.xl },
  countryName: { flex: 1, ...fontSize.sm, fontWeight: "500" },
  countryCode: { ...fontSize.sm, fontWeight: "500" },
  otpInfo: { ...fontSize.sm, color: colors.gray[600], marginBottom: sp(2) },
  otpNumber: { ...fontSize.base, fontWeight: "600", color: colors.gray[900] },
  otpRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(2) },
  otpBox: {
    width: 48,
    height: 48,
    ...fontSize.lg,
    fontWeight: "600",
    color: colors.gray[900],
    borderWidth: 2,
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    textAlign: "center",
  },
  otpBoxFocused: { borderColor: colors.blue[500] },
  resendText: { ...fontSize.sm, fontWeight: "500", color: restaurantTheme.brand },
})
