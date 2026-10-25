// Web: modules/Food/pages/user/profile/DeliverySafety.jsx — static safety points + link to the report page.
import { Pressable, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, Shield, KeyRound, MapPin, PhoneCall, AlertTriangle } from "lucide-react-native"
import { useLocation, useNavigate } from "@/lib/router"
import { Text } from "@/native/ui"
import { colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"

// What the app really does to keep an order and its delivery partner safe (only features that exist in the app).
const POINTS = [
  {
    icon: KeyRound,
    title: "Delivery code (OTP)",
    text: "Your order is handed over only against the delivery code shown in your order screen. Share it with the partner at the door and with nobody else.",
  },
  {
    icon: MapPin,
    title: "Live tracking",
    text: "Once a partner picks up your order you can follow the route on the map until it reaches you.",
  },
  {
    icon: PhoneCall,
    title: "Contact your partner",
    text: "Call or message your delivery partner from the order screen if you need to explain the address or a landmark.",
  },
  {
    icon: AlertTriangle,
    title: "Something feels wrong?",
    text: "Report a safety concern at any time. Our team is notified and follows up with you.",
  },
]

export default function DeliverySafety() {
  const goBack = useAppBackNavigation()
  const location = useLocation()
  const navigate = useNavigate()
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <AnimatedPage style={s.page}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(6), paddingBottom: insets.bottom + sp(16) }]}>
        <View style={s.header}>
          <Pressable
            onPress={goBack}
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.backButton, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.white }]}
          >
            <ArrowLeft size={20} color={t.dark ? colors.white : colors.gray[900]} />
          </Pressable>
          <Text style={s.title}>Delivery partner safety</Text>
        </View>

        <View style={s.intro}>
          <Shield size={24} color="#DC2626" />
          <Text style={s.introText}>How we keep your delivery safe</Text>
        </View>

        <View style={{ gap: sp(3) }}>
          {POINTS.map(({ icon: Icon, title, text }) => (
            <Card key={title} style={s.card}>
              <CardContent style={s.cardContent}>
                <Icon size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.pointTitle}>{title}</Text>
                  <Text style={s.pointText}>{text}</Text>
                </View>
              </CardContent>
            </Card>
          ))}
        </View>

        <Button
          onPress={() => navigate("/food/user/profile/report-safety-emergency", { state: { returnTo: location.pathname } })}
          style={({ pressed }) => [s.reportButton, pressed && { backgroundColor: "#B91C1C" }]}
          textStyle={{ color: colors.white }}
        >
          Report a safety concern
        </Button>
      </ScrollView>
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
  content: { paddingHorizontal: sp(4) },
  header: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(6) },
  backButton: { padding: sp(2), borderRadius: 9999 },
  title: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  intro: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(5) },
  introText: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.gray[300] : colors.gray[700] },
  card: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderWidth: 0, ...shadow.sm },
  cardContent: { padding: sp(4), flexDirection: "row", gap: sp(3) },
  pointTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  pointText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600], marginTop: sp(1) },
  reportButton: { width: "100%", marginTop: sp(6), backgroundColor: "#DC2626" },
}))
