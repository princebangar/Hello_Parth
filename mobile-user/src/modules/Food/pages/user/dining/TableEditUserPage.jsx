// Web: modules/Food/pages/user/dining/TableEditUserPage.jsx — edit the booking contact (name / phone) and return to
// the confirmation with the updated user in route state.
import React, { useEffect, useRef, useState } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { ArrowLeft, User, Phone, CheckCircle2, Loader2 } from "lucide-react-native"
import { useNavigate, useLocation } from "@/lib/router"
import { Screen, Text, TextInput } from "@/native/ui"
import { alpha, colors, makeStyles, useTheme } from "@/theme"
import { Spin } from "@/shared/components/Loader"
import AnimatedPage from "@food/components/user/AnimatedPage"

export default function TableEditUserPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const t = useTheme()
  const s = useStyles()
  const { user, restaurant, guests, date, timeSlot, discount, specialRequest } = location.state || {}

  const initialName = user?.name || ""
  const initialPhone = user?.phone || ""

  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [saving, setSaving] = useState(false)
  const [focused, setFocused] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const hasChanged = name !== initialName || phone !== initialPhone

  const handleSave = () => {
    if (saving || !hasChanged) return
    setSaving(true)
    timerRef.current = setTimeout(() => {
      navigate("/food/user/dining/book-confirmation", {
        state: {
          restaurant,
          guests,
          date,
          timeSlot,
          discount,
          specialRequest,
          user: { ...user, name, phone },
        },
        replace: true,
      })
    }, 600)
  }

  const enabled = hasChanged && !saving
  const iconMuted = t.dark ? colors.slate[500] : colors.slate[400]

  const field = (key, Icon, props) => (
    <View style={{ justifyContent: "center" }}>
      <View style={s.fieldIcon} pointerEvents="none">
        <Icon size={20} color={iconMuted} />
      </View>
      <TextInput
        {...props}
        onFocus={() => setFocused(key)}
        onBlur={() => setFocused(null)}
        placeholderTextColor={t.dark ? colors.slate[600] : colors.slate[300]}
        cursorColor={t.dark ? "#ffffff" : "#0f172a"}
        style={[s.input, focused === key && s.inputFocus]}
      />
    </View>
  )

  const btnContent = (
    <>
      {saving ? (
        <Spin>
          <Loader2 size={20} color={enabled ? colors.white : "#7a4040"} />
        </Spin>
      ) : (
        <CheckCircle2 size={20} color={enabled ? colors.white : "#7a4040"} />
      )}
      <Text style={[s.btnText, { color: enabled ? colors.white : "#7a4040" }]}>{saving ? "Saving..." : "Save Changes"}</Text>
    </>
  )

  return (
    <Screen bg={t.dark ? "#0d0d0d" : "#f8f9fa"} keyboard>
      <AnimatedPage style={{ flex: 1 }}>
        <View style={s.header}>
          <Pressable onPress={() => navigate(-1)} style={({ pressed }) => [s.backBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
            <ArrowLeft size={24} color={t.dark ? colors.white : colors.slate[900]} />
          </Pressable>
          <Text style={s.headerTitle}>Edit Details</Text>
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: 8 }}>
            <View style={s.avatar}>
              <User size={40} color={colors.red[500]} />
            </View>
            <Text style={s.title}>Personalize Booking</Text>
            <Text style={s.subtitle}>Contact details for the restaurant</Text>
          </View>

          <View style={{ gap: 24 }}>
            <View style={{ gap: 12 }}>
              <Text style={s.label}>Full Name</Text>
              {field("name", User, {
                value: name,
                onChangeText: (v) => setName(v.replace(/[^a-zA-Z\s]/g, "")),
                placeholder: "Enter your full name",
              })}
            </View>
            <View style={{ gap: 12 }}>
              <Text style={s.label}>Mobile Number</Text>
              {field("phone", Phone, {
                value: phone,
                onChangeText: setPhone,
                placeholder: "Enter mobile number",
                keyboardType: "phone-pad",
              })}
            </View>
          </View>

          <View style={{ paddingTop: 40 }}>
            <Pressable onPress={handleSave} disabled={!enabled} style={({ pressed }) => [enabled && pressed && { transform: [{ scale: 0.95 }] }]}>
              {enabled ? (
                <LinearGradient colors={["#DC2626", "#7f1010"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btn, s.btnShadow]}>
                  {btnContent}
                </LinearGradient>
              ) : (
                <View style={[s.btn, { backgroundColor: t.dark ? "#1e1414" : "#2a1a1a" }]}>{btnContent}</View>
              )}
            </Pressable>
            <Pressable onPress={() => navigate(-1)} style={({ pressed }) => [s.btn, s.cancel, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Text style={[s.btnText, { color: t.dark ? colors.slate[400] : colors.slate[500] }]}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  header: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: t.dark ? alpha("#0d0d0d", 0.8) : alpha(colors.white, 0.8),
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? alpha(colors.white, 0.05) : colors.slate[100],
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 9999, backgroundColor: t.dark ? "#1e1e1e" : colors.slate[50] },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: "900", color: t.dark ? colors.white : colors.slate[900], letterSpacing: -0.5, textTransform: "uppercase" },
  content: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32 + 80, gap: 32 },
  avatar: {
    width: 80,
    height: 80,
    backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[50],
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 4,
    borderColor: t.dark ? "#1a1a1a" : colors.white,
    ...(t.dark ? {} : { elevation: 12, shadowColor: colors.red[100], shadowOpacity: 1, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } }),
  },
  title: { fontSize: 24, lineHeight: 32, fontWeight: "900", color: t.dark ? colors.white : colors.slate[900], textAlign: "center" },
  subtitle: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.slate[500] : colors.slate[400], fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.8, textAlign: "center" },
  label: { fontSize: 10, lineHeight: 14, fontWeight: "900", color: t.dark ? colors.slate[500] : colors.slate[400], textTransform: "uppercase", letterSpacing: 2, marginLeft: 8 },
  fieldIcon: { position: "absolute", left: 16, zIndex: 1 },
  input: {
    width: "100%",
    height: 56,
    paddingLeft: 48,
    paddingRight: 16,
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.white, 0.1) : colors.slate[100],
    borderRadius: 16,
    fontWeight: "700",
    fontSize: 16,
    color: t.dark ? colors.white : colors.slate[900],
  },
  inputFocus: { borderColor: "#DC2626" },
  btn: { width: "100%", height: 56, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  btnShadow: { elevation: 6, shadowColor: "#DC2626", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } },
  cancel: { marginTop: 16, backgroundColor: t.dark ? "#1e1e1e" : colors.slate[100] },
  btnText: { fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.4, fontSize: 14, lineHeight: 20 },
}))
