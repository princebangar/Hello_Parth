// Web: modules/Food/pages/user/profile/Cancellation.jsx (Refund.jsx and Shipping.jsx are the same page with another
// endpoint, title and icon; they render the named export FoodPolicyPage below).
// dangerouslySetInnerHTML + Tailwind "prose" -> react-native-render-html with the same prose colours;
// window.history.length > 2 -> router.canGoBack(); the sticky blurred header sits above the ScrollView.
import { useEffect, useRef, useState } from "react"
import { Animated, Linking, ScrollView, View, useWindowDimensions } from "react-native"
import { BlurView } from "expo-blur"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import RenderHTML from "react-native-render-html"
import { ArrowLeft, XCircle, Loader2 } from "lucide-react-native"
import { router, useLocation, useNavigate } from "@/lib/router"
import { Text } from "@/native/ui"
import { dropEmptyParagraphs } from "@/lib/cmsHtml"
import { alpha, colors, fonts, makeStyles, shadow, sp, useTheme } from "@/theme"
import { fontAssets, resolveFont } from "@/theme/fonts"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import api from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { API_ENDPOINTS } from "@food/api/config"
import { Spin } from "@/shared/components/Loader"

const SYSTEM_FONTS = Object.keys(fontAssets)

/** motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} */
function FadeUp({ style, children }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true })
    a.start()
    return () => a.stop()
  }, [v])
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }] }]}>
      {children}
    </Animated.View>
  )
}

/**
 * The shared body of the Cancellation / Refund / Shipping policy pages.
 * `useReturnTo`: only the Cancellation page honours location.state.returnTo (as on the web).
 */
export function FoodPolicyPage({ endpoint, defaultTitle, icon: EmptyIcon, useReturnTo = false, logLabel }) {
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = useAppBackNavigation()
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [loading, setLoading] = useState(true)
  const [pageData, setPageData] = useState({
    title: defaultTitle,
    content: ''
  })

  useEffect(() => {
    fetchPageData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchPageData = async () => {
    try {
      setLoading(true)
      const response = await api.get(endpoint)
      if (response.data.success) {
        setPageData(response.data.data || { title: defaultTitle, content: '' })
      }
    } catch (error) {
      console.error(`Error fetching ${logLabel} data:`, error)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (useReturnTo && location.state?.returnTo) {
      navigate(location.state.returnTo, {
        state: location.state?.originalState,
        replace: true
      })
    } else if (router.canGoBack()) {
      goBack()
    } else {
      navigate('/food/user')
    }
  }

  if (loading) {
    return (
      <View style={s.loadingPage}>
        <View style={s.loadingInner}>
          <Spin>
            <Loader2 size={40} color="#CB202D" />
          </Spin>
          <Text style={s.loadingText}>Loading...</Text>
        </View>
      </View>
    )
  }

  const font = (w) => resolveFont(fonts.poppins, w)
  const heading = t.dark ? colors.white : colors.gray[900]
  const body = t.dark ? colors.gray[400] : colors.gray[600]
  const htmlBase = { color: t.dark ? colors.slate[300] : colors.slate[700], fontSize: 16, lineHeight: 28, fontFamily: font(400) }
  const htmlTags = {
    // RN adds up block margins that CSS collapses (and the CMS puts <p><br></p> between lines): bottom margins only
    p: { color: body, lineHeight: 28, marginTop: 0, marginBottom: 20 },
    li: { color: body },
    ul: { marginTop: 0, marginBottom: 20, paddingLeft: 26 },
    ol: { marginTop: 0, marginBottom: 20, paddingLeft: 26 },
    h1: { fontSize: 36, lineHeight: 40, fontFamily: font(800), color: heading, marginTop: 0, marginBottom: 32 },
    h2: { fontSize: 24, lineHeight: 32, fontFamily: font(800), color: heading, marginTop: 28, marginBottom: 24 },
    h3: { fontSize: 20, lineHeight: 32, fontFamily: font(800), color: heading, marginTop: 12, marginBottom: 12 },
    h4: { fontSize: 16, lineHeight: 24, fontFamily: font(800), color: heading, marginTop: 4, marginBottom: 8 },
    h5: { fontFamily: font(800), color: heading },
    h6: { fontFamily: font(800), color: heading },
    strong: { fontFamily: font(600), color: heading },
    b: { fontFamily: font(600), color: heading },
    a: { color: t.dark ? "#DC2626" : "#CB202D", textDecorationLine: "underline", fontFamily: font(500) },
    hr: { marginTop: 28, marginBottom: 48, backgroundColor: t.dark ? colors.slate[700] : colors.slate[200], height: 1 },
    blockquote: { borderLeftWidth: 4, borderLeftColor: t.dark ? colors.slate[700] : colors.slate[200], paddingLeft: 16, fontStyle: "italic" },
  }

  const headerHeight = 64

  return (
    <AnimatedPage style={s.page}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + headerHeight, paddingBottom: insets.bottom + sp(10) }}>
        <View style={s.content}>
          <FadeUp style={s.card}>
            {pageData.content ? (
              <RenderHTML
                contentWidth={Math.max(0, width - 32 - 48)}
                source={{ html: dropEmptyParagraphs(pageData.content) }}
                baseStyle={htmlBase}
                tagsStyles={htmlTags}
                systemFonts={SYSTEM_FONTS}
                renderersProps={{ a: { onPress: (_e, href) => href && Linking.openURL(href).catch(() => {}) } }}
              />
            ) : (
              <View style={s.empty}>
                <EmptyIcon size={64} color={t.dark ? colors.gray[800] : colors.gray[100]} style={{ marginBottom: sp(4) }} />
                <Text style={s.emptyText}>No content available at the moment.</Text>
              </View>
            )}
          </FadeUp>

          <Text style={s.footer}>
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            {"\n"}© {new Date().getFullYear()} Hello Parth. All Rights Reserved.
          </Text>
        </View>
      </ScrollView>

      {/* Premium Sticky Header */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <BlurView intensity={40} tint={t.dark ? "dark" : "light"} style={s.fill} />
        <View style={[s.fill, { backgroundColor: t.dark ? alpha("#0a0a0a", 0.8) : alpha(colors.white, 0.8) }]} />
        <View style={s.headerInner}>
          <Button
            variant="ghost"
            size="icon"
            onPress={handleBack}
            style={({ pressed }) => [s.backButton, pressed && { backgroundColor: t.dark ? colors.gray[900] : colors.gray[100], transform: [{ scale: 0.95 }] }]}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={24} color={t.dark ? colors.white : colors.gray[900]} />
          </Button>
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>
              {pageData.title || defaultTitle}
            </Text>
            <Text style={s.subtitle}>Hello Parth Food Ecosystem</Text>
          </View>
        </View>
      </View>
    </AnimatedPage>
  )
}

export default function Cancellation() {
  return (
    <FoodPolicyPage
      endpoint={API_ENDPOINTS.ADMIN.CANCELLATION_PUBLIC}
      defaultTitle="Cancellation Policy"
      icon={XCircle}
      useReturnTo
      logLabel="cancellation"
    />
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  loadingPage: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white, alignItems: "center", justifyContent: "center", padding: sp(6) },
  loadingInner: { alignItems: "center", gap: sp(4) },
  loadingText: { fontSize: 12, lineHeight: 16, color: colors.gray[500], fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[900] : colors.gray[100],
  },
  headerInner: { height: 64, paddingHorizontal: sp(4), flexDirection: "row", alignItems: "center", gap: sp(4) },
  backButton: { height: 40, width: 40, borderRadius: 9999 },
  title: { fontSize: 20, lineHeight: 22, fontWeight: "900", letterSpacing: -0.5, color: t.dark ? colors.white : colors.gray[900] },
  subtitle: { fontSize: 10, lineHeight: 14, color: colors.gray[400], fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginTop: sp(1) },
  content: { paddingHorizontal: sp(4), paddingVertical: sp(8) },
  card: {
    backgroundColor: t.dark ? "#111111" : colors.white,
    borderRadius: 32,
    padding: sp(6),
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[900] : colors.gray[50],
    ...shadow.sm,
  },
  empty: { alignItems: "center", paddingVertical: sp(20) },
  emptyText: { fontSize: 16, lineHeight: 24, color: colors.gray[400], fontWeight: "500", textAlign: "center" },
  footer: {
    textAlign: "center",
    marginTop: sp(10),
    fontSize: 10,
    lineHeight: 16,
    color: colors.gray[400],
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
}))
