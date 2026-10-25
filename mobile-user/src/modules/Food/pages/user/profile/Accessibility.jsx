// Web: modules/Food/pages/user/profile/Accessibility.jsx — four local switches (screen state only, as on the web).
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, Accessibility as AccessibilityIcon, Eye, Volume2, MousePointerClick } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { Text } from "@/native/ui"
import { colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import { Switch } from "@food/components/ui/switch"
import { Label } from "@food/components/ui/label"

function OptionCard({ icon: Icon, title, text, checked, onCheckedChange }) {
  const s = useStyles()
  const t = useTheme()
  return (
    <Card style={s.card}>
      <CardContent style={{ padding: sp(4) }}>
        <View style={s.optionRow}>
          <View style={s.optionLeft}>
            <View style={s.iconCircle}>
              <Icon size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
            </View>
            <View style={{ flex: 1 }}>
              <Label style={s.optionTitle}>{title}</Label>
              <Text style={s.optionText}>{text}</Text>
            </View>
          </View>
          <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </View>
      </CardContent>
    </Card>
  )
}

export default function Accessibility() {
  const navigate = useNavigate()
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [largeText, setLargeText] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [screenReader, setScreenReader] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  return (
    <AnimatedPage style={s.page}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(4) }]}>
        {/* Header */}
        <View style={s.header}>
          <Button variant="ghost" size="icon" onPress={() => navigate("/food/user/profile")} style={s.backButton} accessibilityLabel="Go back">
            <ArrowLeft size={16} color={t.dark ? colors.white : colors.black} />
          </Button>
          <Text style={s.title}>Accessibility</Text>
        </View>

        {/* Info Card */}
        <Card style={[s.card, { marginBottom: sp(4) }]}>
          <CardContent style={{ padding: sp(4) }}>
            <View style={s.infoRow}>
              <View style={[s.iconCircle, { marginTop: 2 }]}>
                <AccessibilityIcon size={20} color={t.dark ? colors.gray[300] : colors.gray[700]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoTitle}>Make the app more accessible</Text>
                <Text style={s.infoText}>Customize your experience to better suit your needs and preferences.</Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Accessibility Options */}
        <View style={{ gap: sp(3) }}>
          <OptionCard icon={Eye} title="Large Text" text="Increase text size for better readability" checked={largeText} onCheckedChange={setLargeText} />
          <OptionCard icon={Eye} title="High Contrast" text="Enhance contrast for better visibility" checked={highContrast} onCheckedChange={setHighContrast} />
          <OptionCard icon={Volume2} title="Screen Reader Support" text="Optimize for screen readers" checked={screenReader} onCheckedChange={setScreenReader} />
          <OptionCard icon={MousePointerClick} title="Reduce Motion" text="Minimize animations and transitions" checked={reduceMotion} onCheckedChange={setReduceMotion} />
        </View>

        {/* Additional Info */}
        <Card style={[s.card, { marginTop: sp(4) }]}>
          <CardContent style={{ padding: sp(4) }}>
            <Text style={[s.infoTitle, { marginBottom: sp(2) }]}>Need more help?</Text>
            <Text style={[s.infoText, { marginBottom: sp(3) }]}>
              If you need additional accessibility features or have suggestions, please contact our support team.
            </Text>
            <Button variant="outline" onPress={() => navigate("/food/user/help")} style={{ width: "100%", height: 40 }}>
              Contact Support
            </Button>
          </CardContent>
        </Card>
      </ScrollView>
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
  content: { paddingHorizontal: sp(4) },
  header: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(4) },
  backButton: { height: 32, width: 32, padding: 0 },
  title: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.black },
  card: { paddingVertical: 0, backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderRadius: 14, borderWidth: 0, ...shadow.sm },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: sp(3) },
  iconCircle: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], borderRadius: 9999, padding: sp(2) },
  infoTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(1) },
  infoText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600] },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionLeft: { flexDirection: "row", alignItems: "center", gap: sp(3), flex: 1 },
  optionTitle: { ...fontSize.base, fontWeight: "500", color: t.dark ? colors.white : colors.gray[900] },
  optionText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500] },
}))
