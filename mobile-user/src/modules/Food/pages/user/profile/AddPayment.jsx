// Web: modules/Food/pages/user/profile/AddPayment.jsx (card saved in ProfileContext / localStorage).
// <form onSubmit> -> the submit button calls handleSubmit; alert() -> Alert.alert. The form body (identical on the web's
// AddPayment and EditPayment pages) is the named export PaymentMethodForm, used by EditPayment.jsx too.
import { useState } from "react"
import { Alert, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useNavigate } from "@/lib/router"
import { colors, fontSize, makeStyles, sp } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Card, CardHeader, CardTitle, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { useProfile } from "@food/context/ProfileContext"

export const EMPTY_PAYMENT_FORM = {
  cardNumber: "",
  cardHolder: "",
  expiryMonth: "",
  expiryYear: "",
  cvv: "",
  type: "visa",
}

/** The web's handleChange(e) for these forms: sets the field and auto-detects the card type from the first digit. */
export function usePaymentFormChange(formData, setFormData) {
  return (e) => {
    const { name, value } = e.target
    setFormData({
      ...formData,
      [name]: value,
    })

    // Auto-detect card type based on first digit
    if (name === "cardNumber" && value.length > 0) {
      const firstDigit = value[0]
      if (firstDigit === "4") {
        setFormData((prev) => ({ ...prev, type: "visa" }))
      } else if (firstDigit === "5" || firstDigit === "2") {
        setFormData((prev) => ({ ...prev, type: "mastercard" }))
      }
    }
  }
}

/** The web's submit checks; returns false (after the alert) when the form is not valid. */
export function validatePaymentForm(formData) {
  if (
    !formData.cardNumber ||
    !formData.cardHolder ||
    !formData.expiryMonth ||
    !formData.expiryYear ||
    !formData.cvv
  ) {
    Alert.alert("Please fill in all required fields")
    return false
  }

  // Validate card number (should be 4 digits for last 4)
  if (formData.cardNumber.length !== 4 || !/^\d+$/.test(formData.cardNumber)) {
    Alert.alert("Please enter the last 4 digits of your card")
    return false
  }

  // Validate CVV
  if (formData.cvv.length < 3 || !/^\d+$/.test(formData.cvv)) {
    Alert.alert("Please enter a valid CVV")
    return false
  }
  return true
}

export function PaymentMethodForm({ title, submitLabel, formData, handleChange, onSubmit, onCancel }) {
  const s = useStyles()
  const insets = useSafeAreaInsets()
  // the web inputs fire onChange(e) with e.target.name / value
  const changeOf = (name) => (value) => handleChange({ target: { name, value } })
  return (
    <AnimatedPage style={s.page}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(4) }]}
      >
        <Card>
          <CardHeader>
            <CardTitle style={s.cardTitle}>{title}</CardTitle>
          </CardHeader>
          <CardContent style={s.cardContent}>
            <View style={s.form}>
              <View style={s.field}>
                <Label>Last 4 Digits of Card Number *</Label>
                <Input placeholder="1234" value={formData.cardNumber} onChangeText={changeOf("cardNumber")} maxLength={4} />
              </View>
              <View style={s.field}>
                <Label>Cardholder Name *</Label>
                <Input placeholder="John Doe" value={formData.cardHolder} onChangeText={changeOf("cardHolder")} />
              </View>
              <View style={s.grid}>
                <View style={s.field}>
                  <Label>Expiry Month *</Label>
                  <Input placeholder="12" value={formData.expiryMonth} onChangeText={changeOf("expiryMonth")} maxLength={2} />
                </View>
                <View style={s.field}>
                  <Label>Expiry Year *</Label>
                  <Input placeholder="2025" value={formData.expiryYear} onChangeText={changeOf("expiryYear")} maxLength={4} />
                </View>
                <View style={s.field}>
                  <Label>CVV *</Label>
                  <Input placeholder="123" value={formData.cvv} onChangeText={changeOf("cvv")} maxLength={4} type="password" />
                </View>
              </View>
              <View style={s.actions}>
                <Button onPress={onCancel} variant="outline">
                  Cancel
                </Button>
                <Button onPress={onSubmit} style={{ flex: 1 }}>
                  {submitLabel}
                </Button>
              </View>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </AnimatedPage>
  )
}

export default function AddPayment() {
  const navigate = useNavigate()
  const { addPaymentMethod } = useProfile()
  const [formData, setFormData] = useState(EMPTY_PAYMENT_FORM)

  const handleChange = usePaymentFormChange(formData, setFormData)

  const handleSubmit = () => {
    if (!validatePaymentForm(formData)) return

    addPaymentMethod(formData)
    navigate("/food/user/profile/payments")
  }

  return (
    <PaymentMethodForm
      title="Add Payment Method"
      submitLabel="Save Payment Method"
      formData={formData}
      handleChange={handleChange}
      onSubmit={handleSubmit}
      onCancel={() => navigate("/food/user/profile/payments")}
    />
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
  content: { paddingHorizontal: sp(4), gap: sp(6) },
  cardTitle: { ...fontSize.xl, lineHeight: 20 },
  cardContent: { padding: sp(4) },
  form: { gap: sp(4) },
  field: { gap: sp(2) },
  grid: { gap: sp(4) },
  actions: { flexDirection: "row", gap: sp(2), paddingTop: sp(4) },
  muted: { color: colors.gray[500] },
}))
