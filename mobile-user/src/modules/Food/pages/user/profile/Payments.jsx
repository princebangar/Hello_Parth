// Web: modules/Food/pages/user/profile/Payments.jsx (saved cards kept in ProfileContext / localStorage).
// window.confirm -> Alert.alert (Cancel / OK). The page itself has no dark: classes (its gradient background stays light);
// the shadcn Card / Button / Badge follow the theme tokens, as on the web.
import { Alert, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CreditCard, Trash2, Edit, Check, Plus } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Card, CardHeader, CardTitle, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Badge } from "@food/components/ui/badge"
import { tokensFor } from "@food/components/ui/tokens"
import { useProfile } from "@food/context/ProfileContext"

// The web wraps the button in a <Link>; here the button navigates itself (no Pressable inside a Pressable).
function GradientButton({ children, onPress }) {
  const s = useStyles()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.gradientButton, pressed && { opacity: 0.9 }]}>
      <LinearGradient colors={[colors.yellow[500], "#DC2626"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.gradientFill} />
      <Plus size={16} color={colors.white} style={{ marginRight: sp(2) }} />
      <Text style={s.gradientButtonText}>{children}</Text>
    </Pressable>
  )
}

export default function Payments() {
  const { paymentMethods, deletePaymentMethod, setDefaultPaymentMethod } = useProfile()
  const s = useStyles()
  const k = tokensFor(useTheme())
  const navigate = useNavigate()
  const insets = useSafeAreaInsets()

  const formatCardNumber = (cardNumber) => {
    if (!cardNumber) return "****"
    return `**** **** **** ${cardNumber}`
  }

  const formatExpiry = (month, year) => {
    if (!month || !year) return ""
    return `${month.padStart(2, "0")}/${year.slice(-2)}`
  }

  const getCardTypeIcon = (type) => {
    if (type === "visa") return "??"
    if (type === "mastercard") return "??"
    return "??"
  }

  const getCardTypeName = (type) => {
    if (type === "visa") return "Visa"
    if (type === "mastercard") return "Mastercard"
    return "Card"
  }

  const handleDelete = (id) => {
    Alert.alert("", "Are you sure you want to delete this payment method?", [
      { text: "Cancel", style: "cancel" },
      { text: "OK", onPress: () => deletePaymentMethod(id) },
    ])
  }

  const handleSetDefault = (id) => {
    setDefaultPaymentMethod(id)
  }

  return (
    <AnimatedPage style={s.page}>
      <LinearGradient
        colors={[alpha(colors.yellow[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)]}
        style={s.bg}
        pointerEvents="none"
      />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(4) }]}>
        <View style={s.headerBlock}>
          <View>
            <Text style={s.title}>Payment Methods</Text>
            <Text style={s.subtitle}>Manage your payment methods</Text>
          </View>
          <GradientButton onPress={() => navigate("/food/user/profile/payments/new")}>Add Payment Method</GradientButton>
        </View>
        {paymentMethods.length === 0 ? (
          <Card style={s.cardShadow}>
            <CardContent style={s.emptyContent}>
              <CreditCard size={64} color={k.mutedForeground} style={{ marginBottom: sp(4) }} />
              <Text style={s.emptyTitle}>No payment methods saved yet</Text>
              <Text style={s.emptyText}>Add your first payment method to get started with orders</Text>
              <GradientButton onPress={() => navigate("/food/user/profile/payments/new")}>Add Your First Payment Method</GradientButton>
            </CardContent>
          </Card>
        ) : (
          <View style={s.list}>
            {paymentMethods.map((payment) => (
              <Card key={payment.id} style={[s.cardShadow, payment.isDefault && s.defaultCard]}>
                <CardHeader style={{ alignItems: "stretch" }}>
                  <View style={s.cardHeadRow}>
                    <View style={s.cardTitleRow}>
                      <CreditCard size={20} color={payment.isDefault ? colors.yellow[600] : k.mutedForeground} />
                      <CardTitle>{`${getCardTypeName(payment.type)} Card`}</CardTitle>
                    </View>
                    {payment.isDefault && (
                      <Badge style={{ backgroundColor: colors.yellow[500] }} textStyle={{ color: colors.white }}>
                        Default
                      </Badge>
                    )}
                  </View>
                </CardHeader>
                <CardContent style={{ gap: sp(4) }}>
                  <LinearGradient colors={[colors.yellow[50], colors.orange[50]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cardFace}>
                    <View style={s.cardFaceTop}>
                      <View style={s.cardFaceLeft}>
                        <Text style={s.cardIcon}>{getCardTypeIcon(payment.type)}</Text>
                        <View>
                          <Text style={s.cardNumber}>{formatCardNumber(payment.cardNumber)}</Text>
                          <Text style={s.cardHolder}>{payment.cardHolder}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.cardFaceBottom}>
                      <Text style={s.metaText}>
                        <Text style={s.metaMuted}>Expires: </Text>
                        <Text style={s.metaStrong}>{formatExpiry(payment.expiryMonth, payment.expiryYear)}</Text>
                      </Text>
                      <Text style={s.metaText}>
                        <Text style={s.metaMuted}>Type: </Text>
                        <Text style={[s.metaStrong, { textTransform: "capitalize" }]}>{getCardTypeName(payment.type)}</Text>
                      </Text>
                    </View>
                  </LinearGradient>
                  <View style={s.actions}>
                    {!payment.isDefault && (
                      <Button variant="outline" size="sm" onPress={() => handleSetDefault(payment.id)} style={{ gap: sp(1) }}>
                        <Check size={16} color={k.foreground} />
                        Set as Default
                      </Button>
                    )}
                    <Button variant="outline" size="sm" style={{ gap: sp(1) }} onPress={() => navigate(`/user/profile/payments/${payment.id}/edit`)}>
                      <Edit size={16} color={k.foreground} />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => handleDelete(payment.id)}
                      style={{ gap: sp(1) }}
                      textStyle={{ color: colors.red[600] }}
                    >
                      <Trash2 size={16} color={colors.red[600]} />
                      Delete
                    </Button>
                  </View>
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => {
  const k = tokensFor(t)
  return {
  page: { flex: 1, backgroundColor: k.background },
  bg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  content: { paddingHorizontal: sp(4), gap: sp(4) },
  headerBlock: { gap: sp(3) },
  title: { ...fontSize.lg, fontWeight: "700", color: k.foreground },
  subtitle: { ...fontSize.sm, color: k.mutedForeground, marginTop: sp(1) },
  gradientButton: {
    height: 36,
    paddingHorizontal: sp(4),
    borderRadius: 8,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.xs,
  },
  gradientFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  gradientButtonText: { ...fontSize.sm, fontWeight: "500", color: colors.white },
  cardShadow: { ...shadow.lg },
  defaultCard: { borderColor: colors.yellow[500], borderWidth: 2, backgroundColor: alpha(colors.yellow[50], 0.5) },
  emptyContent: { paddingVertical: sp(12), alignItems: "center" },
  emptyTitle: { ...fontSize.xl, fontWeight: "600", marginBottom: sp(2), color: k.cardForeground, textAlign: "center" },
  emptyText: { ...fontSize.base, color: k.mutedForeground, marginBottom: sp(6), textAlign: "center" },
  list: { gap: sp(4) },
  cardHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  cardFace: { padding: sp(4), borderRadius: 10, borderWidth: 1, borderColor: colors.yellow[200] },
  cardFaceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: sp(3) },
  cardFaceLeft: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  cardIcon: { ...fontSize["3xl"], color: k.foreground },
  cardNumber: { ...fontSize.xl, fontWeight: "700", color: k.foreground },
  cardHolder: { ...fontSize.sm, color: k.mutedForeground, marginTop: sp(1) },
  cardFaceBottom: { flexDirection: "row", alignItems: "center", gap: sp(6), paddingTop: sp(3), borderTopWidth: 1, borderTopColor: colors.yellow[200] },
  metaText: { ...fontSize.sm },
  metaMuted: { color: k.mutedForeground },
  metaStrong: { fontWeight: "600", color: k.foreground },
  actions: { flexDirection: "row", gap: sp(2), flexWrap: "wrap", paddingTop: sp(2), borderTopWidth: 1, borderTopColor: k.border },
  }
})
