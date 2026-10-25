// Web: modules/Food/components/user/CMSPage.jsx — shared CMS display (Help & Support and the legal pages).
// Same props: endpoint, title, module, goBack, fallbackPath. HTML content -> react-native-render-html with the
// web's `prose` look; mailto:/tel: links -> Linking.
import React, { useEffect, useMemo, useRef, useState } from "react"
import { Animated, Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native"
import RenderHTML from "react-native-render-html"
import { ArrowLeft, Lock, Mail, Phone, MessageSquare, Clock, ShieldCheck, MapPin, Ticket } from "lucide-react-native"
import { router } from "expo-router"
import { useNavigate } from "@/lib/router"
import { Screen, Text } from "@/native/ui"
import { alpha, colors, fonts, makeStyles, useTheme } from "@/theme"
import { resolveFont } from "@/theme/fonts"
import { dropEmptyParagraphs } from "@/lib/cmsHtml"
import AnimatedPage from "@food/components/user/AnimatedPage"
import PolicyPageLoader from "@/shared/components/PolicyPageLoader"
import { fetchPolicyPage, readPolicyPage } from "@/shared/utils/policyPages"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { loadBusinessSettings, getCachedSettings } from "@food/utils/businessSettings"
import { isModuleAuthenticated } from "@food/utils/auth"

const RED = "#CB202D"

const toPageData = (page, defaultTitle) => ({
  title: page?.title || defaultTitle,
  content: page?.content || "",
  email: page?.email || "",
  mobile: page?.mobile || "",
  faq: page?.faq || "",
})

const formatBusinessPhone = (phone) => {
  if (!phone) return ""
  if (typeof phone === "string") return phone.trim()
  const number = String(phone.number || "").trim()
  if (!number) return ""
  return `${String(phone.countryCode || "").trim()} ${number}`.trim()
}

function FadeUp({ children, style }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 120 })
    a.start()
    return () => a.stop()
  }, [anim])
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }] }]}>
      {children}
    </Animated.View>
  )
}

/**
 * Shared CMS display component for Help & Support (and other legal pages).
 * Props:
 *   endpoint    - API endpoint to fetch the page data from
 *   title       - Default page title (fallback if API doesn't return one)
 *   module      - "USER" | "RESTAURANT" | "DELIVERY" (default: "USER")
 *   goBack      - Optional override for back navigation (for restaurant/delivery portals)
 *   fallbackPath - Where to navigate when there's no history (the web's "/user" redirects to "/food/user")
 */
export default function CMSPage({
  endpoint,
  title: defaultTitle,
  module = "USER",
  goBack: externalGoBack,
  fallbackPath = "/food/user",
}) {
  const navigate = useNavigate()
  const appGoBack = useAppBackNavigation()
  const t = useTheme()
  const s = useStyles()
  const { width } = useWindowDimensions()
  const [loading, setLoading] = useState(() => !readPolicyPage(endpoint))
  const [pageData, setPageData] = useState(() => toPageData(readPolicyPage(endpoint), defaultTitle))

  // Real company contact (admin > Business settings), used when the CMS page
  // itself has no email/phone — never show placeholder contact details.
  const [business, setBusiness] = useState(() => getCachedSettings())

  const shownEndpointRef = useRef(endpoint)
  useEffect(() => {
    let active = true

    if (shownEndpointRef.current !== endpoint) {
      shownEndpointRef.current = endpoint
      const cachedPage = readPolicyPage(endpoint)
      setPageData(toPageData(cachedPage, defaultTitle))
      setLoading(!cachedPage)
    }

    fetchPolicyPage(endpoint).then((page) => {
      if (!active) return
      if (page) setPageData(toPageData(page, defaultTitle))
      setLoading(false)
    })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint])

  useEffect(() => {
    let active = true
    loadBusinessSettings().then((settings) => {
      if (active && settings) setBusiness(settings)
    })
    return () => {
      active = false
    }
  }, [])

  const handleBack = () => {
    if (externalGoBack) {
      externalGoBack()
      return
    }
    // web: window.history.length > 2 -> app back, else fallback path
    if (router.canGoBack()) {
      appGoBack()
    } else {
      navigate(fallbackPath)
    }
  }

  const isSupport = endpoint?.includes("support") || defaultTitle?.toLowerCase().includes("support")
  const hasActualContent = pageData.content && pageData.content.replace(/<[^>]*>/g, "").trim().length > 0
  const contactEmail = String(pageData.email || business?.email || "").trim()
  const contactPhone = String(pageData.mobile || formatBusinessPhone(business?.phone) || "").trim()
  const contactAddress = [business?.address, business?.state, business?.pincode]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(", ")
  const canRaiseTicket = isSupport && module === "USER"
  const handleRaiseTicket = () => {
    if (isModuleAuthenticated("user")) {
      navigate("/food/user/profile/support")
    } else {
      navigate("/login", { state: { from: "/food/user/profile/support" } })
    }
  }

  const faqLines = useMemo(
    () => (pageData.faq?.trim() ? pageData.faq.split("\n").map((l) => l.trim()).filter(Boolean) : []),
    [pageData.faq],
  )

  const faqsToRender = useMemo(() => {
    const defaultFaqs = [
      { q: "How do I track my order?", a: "You can track your order in real-time through the 'My Orders' section in your profile." },
      { q: "What if I receive a wrong item?", a: "Please contact our support immediately via call or email with your order ID for a quick resolution." },
      { q: "Can I cancel my order?", a: "Orders can only be cancelled before the restaurant starts preparing your food." },
    ]
    if (!faqLines.length) return defaultFaqs
    const parsed = []
    let currentQ = null
    for (const line of faqLines) {
      if (line.startsWith("Q:")) {
        currentQ = line.substring(2).trim()
      } else if (line.startsWith("A:") && currentQ) {
        parsed.push({ q: currentQ, a: line.substring(2).trim() })
        currentQ = null
      }
    }
    return parsed.length > 0 ? parsed : defaultFaqs
  }, [faqLines])

  let hoursText = "Available 24/7 for emergency support. General inquiries: 9 AM - 11 PM."
  let privacyText = "Your conversations with our support team are encrypted and secure."
  for (const line of faqLines) {
    if (line.startsWith("HOURS:")) hoursText = line.substring(6).trim()
    else if (line.startsWith("PRIVACY:")) privacyText = line.substring(8).trim()
  }

  // prose prose-slate dark:prose-invert + the web's prose-* overrides
  const htmlStyles = useMemo(() => {
    const body = t.dark ? colors.gray[300] : colors.gray[600]
    const heading = t.dark ? colors.white : colors.gray[900]
    const font = (w) => resolveFont(fonts.poppins, w)
    return {
      base: { color: t.dark ? colors.slate[300] : colors.slate[700], fontSize: 16, lineHeight: 28, fontFamily: font(400) },
      tags: {
        // CSS collapses the margins between blocks (p 20 + p 20 = 20); React Native adds them up, which doubled every
        // gap (and the CMS puts an empty <p><br></p> between lines). Only bottom margins, and headings take off the 20.
        p: { fontSize: 16, lineHeight: 26, fontFamily: font(500), color: body, marginTop: 0, marginBottom: 20 },
        li: { fontSize: 16, lineHeight: 26, fontFamily: font(500), color: body },
        ul: { marginTop: 0, marginBottom: 20, paddingLeft: 26 },
        ol: { marginTop: 0, marginBottom: 20, paddingLeft: 26 },
        h1: { fontSize: 36, lineHeight: 40, fontFamily: font(800), color: heading, marginTop: 0, marginBottom: 32 },
        h2: { fontSize: 24, lineHeight: 32, fontFamily: font(800), color: heading, marginTop: 28, marginBottom: 24 },
        h3: { fontSize: 20, lineHeight: 32, fontFamily: font(800), color: heading, marginTop: 12, marginBottom: 12 },
        h4: { fontSize: 16, lineHeight: 24, fontFamily: font(800), color: heading, marginTop: 4, marginBottom: 8 },
        h5: { fontFamily: font(800), color: heading },
        h6: { fontFamily: font(800), color: heading },
        strong: { fontFamily: font(800), color: heading },
        b: { fontFamily: font(800), color: heading },
        a: { color: t.dark ? "#DC2626" : RED, textDecorationLine: "underline", fontFamily: font(500) },
        hr: { marginTop: 28, marginBottom: 48, backgroundColor: t.dark ? colors.slate[700] : colors.slate[200], height: 1 },
        blockquote: { borderLeftWidth: 4, borderLeftColor: t.dark ? colors.slate[700] : colors.slate[200], paddingLeft: 16, fontStyle: "italic" },
      },
    }
  }, [t.dark])

  if (loading) {
    return <PolicyPageLoader />
  }

  const moduleLabel =
    module === "DRIVER"
      ? "Hello Parth Captain"
      : module === "RESTAURANT"
        ? "Hello Parth Restaurant Partner"
        : module === "DELIVERY"
          ? "Hello Parth Delivery Partner"
          : "Hello Parth"

  const ContactCard = ({ icon: Icon, title, text, link, linkLabel, onPress, breakAll }) => {
    const inner = (
      <>
        <View style={s.contactIcon}>
          <Icon size={24} color={RED} />
        </View>
        <Text style={s.contactTitle}>{title}</Text>
        <Text style={s.contactText}>{text}</Text>
        {linkLabel ? (
          link ? (
            <Text style={s.contactLink} onPress={() => Linking.openURL(link).catch(() => {})} suppressHighlighting>
              {linkLabel}
            </Text>
          ) : (
            <Text style={s.contactLink}>{linkLabel}</Text>
          )
        ) : null}
      </>
    )
    if (onPress) {
      return (
        <Pressable accessibilityRole="button" onPress={onPress} style={s.contactCard}>
          {inner}
        </Pressable>
      )
    }
    return <View style={s.contactCard}>{inner}</View>
  }

  const now = new Date()

  return (
    <Screen edges={["top", "bottom"]} bg={t.dark ? "#0a0a0a" : colors.white}>
      <AnimatedPage style={s.page}>
        {/* Sticky header */}
        <View style={s.header}>
          <Pressable
            onPress={handleBack}
            accessibilityLabel="Back"
            style={({ pressed }) => [s.backBtn, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={24} color={t.dark ? colors.gray[200] : colors.gray[800]} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{pageData.title || defaultTitle}</Text>
            <Text style={s.subtitle}>{moduleLabel}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.scroll}>
          <FadeUp style={s.card}>
            {isSupport && (
              <View style={{ marginBottom: hasActualContent ? 40 : 0 }}>
                <Text style={s.sectionTitle}>Contact us</Text>
                <View style={{ gap: 16 }}>
                  {!!contactEmail && (
                    <ContactCard icon={Mail} title="Email Us" text={contactEmail} breakAll link={`mailto:${contactEmail}`} linkLabel="Send Message" />
                  )}
                  {!!contactPhone && (
                    <ContactCard icon={Phone} title="Call Us" text={contactPhone} link={`tel:${contactPhone.replace(/\s+/g, "")}`} linkLabel="Call Now" />
                  )}
                  {!!contactAddress && <ContactCard icon={MapPin} title="Office" text={contactAddress} />}
                  {canRaiseTicket && (
                    <ContactCard
                      icon={Ticket}
                      title="Raise a support ticket"
                      text="Report an order, restaurant or app issue and track the reply."
                      linkLabel="Raise ticket"
                      onPress={handleRaiseTicket}
                    />
                  )}
                </View>
              </View>
            )}

            {hasActualContent ? (
              <RenderHTML
                contentWidth={Math.max(0, width - 32 - 48)}
                source={{ html: dropEmptyParagraphs(pageData.content) }}
                baseStyle={htmlStyles.base}
                tagsStyles={htmlStyles.tags}
                renderersProps={{ a: { onPress: (_e, href) => href && Linking.openURL(href).catch(() => {}) } }}
              />
            ) : (
              !isSupport && (
                <View style={s.empty}>
                  <Lock size={64} color={t.dark ? colors.gray[800] : colors.gray[100]} />
                  <Text style={s.emptyText}>No additional content available at the moment.</Text>
                </View>
              )
            )}

            {isSupport && (
              <View style={[s.faqWrap, { marginTop: hasActualContent ? 48 : 0 }]}>
                <Text style={[s.sectionTitle, { marginBottom: 32 }]}>Frequently Asked Questions</Text>
                <View style={{ gap: 16 }}>
                  {faqsToRender.map((faq, idx) => (
                    <View key={idx} style={s.infoRow}>
                      <MessageSquare size={20} color={RED} style={{ marginTop: 2 }} />
                      <View style={s.infoBody}>
                        <Text style={s.infoTitle}>{faq.q}</Text>
                        <Text style={s.infoText}>{faq.a}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={{ marginTop: 24, gap: 16 }}>
                  <View style={s.infoRow}>
                    <Clock size={20} color={RED} style={{ marginTop: 2 }} />
                    <View style={s.infoBody}>
                      <Text style={s.infoTitle}>Operational Hours</Text>
                      <Text style={s.infoText}>{hoursText}</Text>
                    </View>
                  </View>
                  <View style={s.infoRow}>
                    <ShieldCheck size={20} color={RED} style={{ marginTop: 2 }} />
                    <View style={s.infoBody}>
                      <Text style={s.infoTitle}>Data Privacy</Text>
                      <Text style={s.infoText}>{privacyText}</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </FadeUp>

          <Text style={s.footer}>
            Last updated: {now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            {"\n"}© {now.getFullYear()} Hello Parth. All Rights Reserved.
          </Text>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
  header: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: t.dark ? alpha("#0a0a0a", 0.8) : alpha(colors.white, 0.8),
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[900] : colors.gray[100],
  },
  backBtn: { height: 40, width: 40, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, lineHeight: 20, fontWeight: "800", color: t.dark ? colors.white : colors.gray[900], letterSpacing: -0.5 },
  subtitle: { fontSize: 10, lineHeight: 14, color: colors.gray[400], fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 },
  scroll: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32 + 40 },
  card: {
    backgroundColor: t.dark ? "#111111" : colors.white,
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[900] : colors.gray[50],
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  sectionTitle: { fontSize: 20, lineHeight: 28, fontWeight: "800", color: t.dark ? colors.white : colors.gray[900], marginBottom: 16, letterSpacing: -0.5 },
  contactCard: {
    backgroundColor: t.dark ? alpha(colors.gray[900], 0.5) : colors.gray[50],
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[100],
    alignItems: "center",
  },
  contactIcon: {
    width: 48,
    height: 48,
    backgroundColor: t.dark ? colors.gray[800] : colors.white,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  contactTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: t.dark ? colors.white : colors.gray[900], textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8, textAlign: "center" },
  contactText: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[500], textAlign: "center" },
  contactLink: { marginTop: 16, fontSize: 12, lineHeight: 16, fontWeight: "800", color: RED, textTransform: "uppercase", letterSpacing: 1.2 },
  empty: { alignItems: "center", paddingVertical: 80 },
  emptyText: { color: colors.gray[400], fontWeight: "500", marginTop: 16, textAlign: "center" },
  faqWrap: { paddingTop: 40, borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[900] : colors.gray[100] },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    padding: 20,
    borderRadius: 24,
    backgroundColor: t.dark ? alpha(colors.gray[900], 0.3) : colors.gray[50],
    borderWidth: 1,
    borderColor: t.dark ? alpha(colors.gray[800], 0.5) : alpha(colors.gray[100], 0.5),
  },
  infoBody: { flex: 1, gap: 4 },
  infoTitle: { fontSize: 12, lineHeight: 16, fontWeight: "800", color: t.dark ? colors.white : colors.gray[900], textTransform: "uppercase", letterSpacing: 0.6 },
  infoText: { fontSize: 12, lineHeight: 19.5, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[500] },
  footer: { textAlign: "center", marginTop: 40, fontSize: 10, lineHeight: 16, color: colors.gray[400], fontWeight: "800", textTransform: "uppercase", letterSpacing: 2 },
}))

