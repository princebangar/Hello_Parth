// Web: modules/Food/pages/user/profile/EditPayment.jsx — same form as AddPayment (PaymentMethodForm), prefilled from the
// saved card; "Payment method not found" card when the id is unknown.
import { useState, useEffect } from "react"
import { ScrollView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useParams, useNavigate } from "@/lib/router"
import { Text } from "@/native/ui"
import { fontSize, makeStyles, sp } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { tokensFor } from "@food/components/ui/tokens"
import { useProfile } from "@food/context/ProfileContext"
import { EMPTY_PAYMENT_FORM, PaymentMethodForm, usePaymentFormChange, validatePaymentForm } from "./AddPayment"

export default function EditPayment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const s = useStyles()
  const insets = useSafeAreaInsets()
  const { getPaymentMethodById, updatePaymentMethod } = useProfile()
  const payment = getPaymentMethodById(id)

  const [formData, setFormData] = useState(EMPTY_PAYMENT_FORM)

  useEffect(() => {
    if (payment) {
      setFormData({
        cardNumber: payment.cardNumber || "",
        cardHolder: payment.cardHolder || "",
        expiryMonth: payment.expiryMonth || "",
        expiryYear: payment.expiryYear || "",
        cvv: payment.cvv || "",
        type: payment.type || "visa",
      })
    }
  }, [payment])

  const handleChange = usePaymentFormChange(formData, setFormData)

  const handleSubmit = () => {
    if (!validatePaymentForm(formData)) return

    updatePaymentMethod(id, formData)
    navigate("/food/user/profile/payments")
  }

  if (!payment) {
    return (
      <AnimatedPage style={s.page}>
        <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4) }]}>
          <Card>
            <CardContent style={s.notFound}>
              <Text style={s.muted}>Payment method not found</Text>
              <Button onPress={() => navigate("/food/user/profile/payments")} style={{ marginTop: sp(4) }}>
                Back to Payment Methods
              </Button>
            </CardContent>
          </Card>
        </ScrollView>
      </AnimatedPage>
    )
  }

  return (
    <PaymentMethodForm
      title="Edit Payment Method"
      submitLabel="Update Payment Method"
      formData={formData}
      handleChange={handleChange}
      onSubmit={handleSubmit}
      onCancel={() => navigate("/food/user/profile/payments")}
    />
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
  content: { paddingHorizontal: sp(4) },
  notFound: { paddingVertical: sp(8), alignItems: "center" },
  muted: { ...fontSize.base, color: tokensFor(t).mutedForeground, textAlign: "center" },
}))
