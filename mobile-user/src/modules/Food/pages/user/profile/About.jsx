// Web: modules/Food/pages/user/profile/About.jsx — GET ADMIN.ABOUT_PUBLIC + business-settings logo.
// framer-motion entrances (fade + slide / scale with the same delays) -> Animated (FadeIn below).
import { StatusBarScrim } from '@/native/ui/StatusBarScrim';
import { useState, useEffect, useRef } from "react"
import { Animated, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, ArrowRight, Heart, Users, Shield, Clock, Star, Award, FileText, Lock, Loader2, Receipt, Truck, XCircle } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { AppImage, Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Card, CardContent } from "@food/components/ui/card"
import { DEFAULT_BRAND_LOGO } from "@/shared/constants/brandLogo"
import { Spin } from "@/shared/components/Loader"
import api from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


// Icon mapping
const iconMap = {
  Heart,
  Users,
  Shield,
  Clock,
  Star,
  Award
}

/** motion.div initial -> animate: opacity 0 -> 1, translateY y -> 0, scale -> 1 over `duration` after `delay` (s). */
function FadeIn({ delay = 0, duration = 0.5, y = 0, scale = 1, style, children }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: duration * 1000, delay: delay * 1000, useNativeDriver: true })
    a.start()
    return () => a.stop()
  }, [v, delay, duration])
  const transform = []
  if (y) transform.push({ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) })
  if (scale !== 1) transform.push({ scale: v.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) })
  return <Animated.View style={[style, { opacity: v, transform }]}>{children}</Animated.View>
}

function LegalLink({ to, icon: Icon, title, subtitle }) {
  const navigate = useNavigate()
  const s = useStyles()
  const t = useTheme()
  return (
    <Pressable onPress={() => navigate(to)} style={({ pressed }) => [s.legalRow, pressed && s.legalRowPressed]}>
      {({ pressed }) => (
        <>
          <View style={[s.legalIcon, pressed && { backgroundColor: t.dark ? colors.gray[700] : colors.gray[200] }]}>
            <Icon size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.legalTitle, pressed && { color: "#DC2626" }]}>{title}</Text>
            <Text style={s.legalSub}>{subtitle}</Text>
          </View>
          <ArrowRight size={20} color={pressed ? "#DC2626" : colors.slate[400]} />
        </>
      )}
    </Pressable>
  )
}

export default function About() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState(null)
  const [aboutData, setAboutData] = useState({
    appName: '',
    version: '',
    description: '',
    logo: '',
    features: [],
    stats: []
  })

  useEffect(() => {
    fetchAboutData()
    loadLogo()

    // Listen for business settings updates
    const handleSettingsUpdate = () => {
      const cached = getCachedSettings()
      if (cached?.logo?.url) {
        setLogoUrl(cached.logo.url)
      }
    }
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate)
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate)
  }, [])

  const loadLogo = async () => {
    const cached = getCachedSettings()
    if (cached?.logo?.url) {
      setLogoUrl(cached.logo.url)
    } else {
      const settings = await loadBusinessSettings()
      if (settings?.logo?.url) {
        setLogoUrl(settings.logo.url)
      }
    }
  }

  const fetchAboutData = async () => {
    try {
      setLoading(true)
      const response = await api.get(API_ENDPOINTS.ADMIN.ABOUT_PUBLIC)
      if (response.data.success) {
        setAboutData(response.data.data || {})
      }
    } catch (error) {
      debugError('Error fetching about data:', error)
    } finally {
      setLoading(false)
    }
  }

  const pageGradient = t.dark ? ["#0a0a0a", "#1a1a1a"] : [colors.gray[50], colors.white]

  if (loading) {
    return (
      <AnimatedPage style={s.page}>
        <LinearGradient colors={pageGradient} style={s.fill} pointerEvents="none" />
        <View style={s.loadingBox}>
          <Spin style={{ marginBottom: sp(4) }}>
            <Loader2 size={32} color={t.dark ? colors.gray[400] : colors.gray[600]} />
          </Spin>
          <Text style={s.loadingText}>Loading...</Text>
        </View>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage style={s.page}>
      <LinearGradient colors={pageGradient} style={s.fill} pointerEvents="none" />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(6), paddingBottom: insets.bottom + sp(6) }]}>
        {/* Header */}
        <View style={s.header}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [s.backButton, pressed && { transform: [{ scale: 0.95 }] }]}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={t.dark ? colors.white : colors.slate[800]} />
          </Pressable>
          <Text style={s.headerTitle}>About</Text>
        </View>

        {/* App Info Card */}
        <FadeIn y={20}>
          <Card style={s.infoCard}>
            <LinearGradient
              colors={t.dark ? [alpha(colors.blue[900], 0.2), alpha("#1a1a1a", 0.4)] : [alpha(colors.blue[50], 0.6), alpha(colors.white, 0.4)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.fill}
              pointerEvents="none"
            />
            <View style={s.infoBody}>
              <FadeIn delay={0.2} scale={0.8} style={s.logoRow}>
                <View style={s.logoCircle}>
                  <AppImage
                    src={logoUrl || DEFAULT_BRAND_LOGO}
                    fallback={DEFAULT_BRAND_LOGO}
                    style={s.logo}
                    contentFit="contain"
                    accessibilityLabel={`${aboutData.appName} Logo`}
                  />
                </View>
              </FadeIn>

              <FadeIn delay={0.3} y={10}>
                <Text style={s.appTitle}>Hello Parth Food</Text>
              </FadeIn>

              <FadeIn delay={0.4} y={10}>
                <Text style={s.appSubtitle}>Food & Takeaway</Text>
              </FadeIn>

              <FadeIn delay={0.4} y={10}>
                <Text style={s.version}>{aboutData.version ? `Version ${aboutData.version}` : " "}</Text>
              </FadeIn>

              <FadeIn delay={0.5} y={10}>
                <Text style={s.description}>
                  {aboutData.description
                    ? aboutData.description
                    : "This page will appear once the admin adds About content."}
                </Text>
              </FadeIn>
            </View>
          </Card>
        </FadeIn>

        {/* Legal Links */}
        <FadeIn delay={1.2} y={20}>
          <Card style={s.legalCard}>
            <CardContent style={{ padding: sp(5) }}>
              <View style={s.legalHead}>
                <FileText size={20} color={t.dark ? colors.gray[400] : colors.gray[600]} />
                <Text style={s.legalHeadText}>Legal Information</Text>
              </View>
              <View style={{ gap: sp(3) }}>
                <LegalLink to="/user/terms" icon={FileText} title="Terms and Conditions" subtitle="Read our terms and conditions" />
                <LegalLink to="/user/privacy" icon={Lock} title="Privacy Policy" subtitle="Learn how we protect your data" />
                <LegalLink to="/food/user/profile/refund" icon={Receipt} title="Refund Policy" subtitle="Read our refund terms and conditions" />
                <LegalLink to="/food/user/profile/shipping" icon={Truck} title="Shipping Policy" subtitle="Learn about our shipping terms" />
                <LegalLink to="/food/user/profile/cancellation" icon={XCircle} title="Cancellation Policy" subtitle="Read our cancellation terms" />
              </View>
            </CardContent>
          </Card>
        </FadeIn>

        {/* Footer Note */}
        <FadeIn delay={1.4} style={s.footer}>
          <Text style={s.footerText}>
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </Text>
        </FadeIn>
      </ScrollView>
      <StatusBarScrim color={t.dark ? "#0a0a0a" : colors.gray[50]} />
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.gray[50] },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  content: { paddingHorizontal: sp(4) },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: sp(4) },
  loadingText: { ...fontSize.base, color: t.dark ? colors.gray[400] : colors.gray[600] },
  header: { flexDirection: "row", alignItems: "center", marginBottom: sp(6) },
  backButton: {
    height: 40,
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.slate[100],
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  headerTitle: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.slate[900], marginLeft: sp(4) },
  infoCard: {
    backgroundColor: "transparent",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.blue[900], 0.3) : alpha(colors.blue[100], 0.5),
    marginBottom: sp(6),
    overflow: "hidden",
    elevation: 3,
    shadowColor: colors.blue[500],
    shadowOpacity: 0.08,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
  },
  infoBody: { padding: sp(8), alignItems: "center" },
  logoRow: { alignItems: "center", marginBottom: sp(6) },
  logoCircle: {
    backgroundColor: t.dark ? colors.gray[800] : colors.white,
    borderRadius: 9999,
    padding: sp(4),
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 8 },
  },
  logo: { height: 64, width: 64, borderRadius: 9999 },
  appTitle: { ...fontSize["3xl"], fontWeight: "700", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(2), textAlign: "center" },
  appSubtitle: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[600], marginBottom: sp(1), textAlign: "center" },
  version: { ...fontSize.xs, color: colors.gray[500], marginBottom: sp(4), textAlign: "center" },
  description: { ...fontSize.base, lineHeight: 26, color: t.dark ? colors.gray[300] : colors.gray[700], textAlign: "center", maxWidth: 672 },
  legalCard: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, borderRadius: 14, borderWidth: 0, paddingVertical: 24, ...shadow.md },
  legalHead: { flexDirection: "row", alignItems: "center", gap: sp(2), marginBottom: sp(4) },
  legalHeadText: { ...fontSize.lg, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  legalRow: { flexDirection: "row", alignItems: "center", gap: sp(3), padding: sp(3), borderRadius: 10 },
  legalRowPressed: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[50] },
  legalIcon: { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100], borderRadius: 10, padding: sp(2) },
  legalTitle: { ...fontSize.base, fontWeight: "500", color: t.dark ? colors.white : colors.gray[900] },
  legalSub: { ...fontSize.sm, color: t.dark ? colors.slate[400] : colors.slate[500] },
  footer: { alignItems: "center", marginTop: sp(8), marginBottom: sp(4) },
  footerText: { ...fontSize.sm, color: colors.gray[500], textAlign: "center" },
}))
