// Web: modules/Food/pages/user/auth/AuthCallback.jsx — OAuth return page (/food/user/auth/callback?token=&user=...).
// Same states and logic (token in the URL -> setAuthData + userAuthChanged -> /food/user). The icons' tw-animate
// "fade-in zoom-in duration-500" entrance is an Animated opacity + scale.
import { useEffect, useRef, useState } from "react"
import { Animated, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react-native"
import { useNavigate, useSearchParams } from "@/lib/router"
import { Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { tokensFor } from "@food/components/ui/tokens"
import { setAuthData } from "@food/utils/auth"
import { Spin } from "@/shared/components/Loader"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

function ZoomIn({ children }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: 500, useNativeDriver: true })
    a.start()
    return () => a.stop()
  }, [v])
  return <Animated.View style={{ opacity: v, transform: [{ scale: v }] }}>{children}</Animated.View>
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const s = useStyles()
  const t = useTheme()
  const k = tokensFor(t)
  const insets = useSafeAreaInsets()
  const [status, setStatus] = useState("loading") // "loading", "success", "error"
  const [error, setError] = useState("")
  const [provider, setProvider] = useState("")
  const timersRef = useRef([])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  useEffect(() => {
    const later = (fn, ms) => {
      timersRef.current.push(setTimeout(fn, ms))
    }
    const wait = (ms) => new Promise((resolve) => later(resolve, ms))

    const handleAuthCallback = async () => {
      try {
        // Get provider from URL params
        const providerParam = searchParams.get("provider") || "google"
        setProvider(providerParam)

        // Get OAuth parameters from URL
        const code = searchParams.get("code")
        const errorParam = searchParams.get("error")
        const state = searchParams.get("state")

        // Check for OAuth errors
        if (errorParam) {
          setStatus("error")
          setError(
            errorParam === "access_denied"
              ? "You denied access to your account. Please try again."
              : "Authentication failed. Please try again."
          )
          return
        }

        // Check for direct token from backend (Backend OAuth flow)
        const token = searchParams.get("token")
        const userStr = searchParams.get("user")

        if (token) {
          try {
            const user = userStr ? JSON.parse(userStr) : null

            // Save auth data
            setAuthData("user", token, user)

            // Notify app of auth change
            window.dispatchEvent(new Event("userAuthChanged"))

            setStatus("success")

            // Redirect to home after short delay
            later(() => {
              navigate("/food/user", { replace: true })
            }, 1000)
            return
          } catch (err) {
            debugError("Error processing token from URL:", err)
            throw new Error("Invalid user data received from server")
          }
        }

        // If no code and no token, it might be a direct redirect
        if (!code) {
          await wait(2000)

          // Store auth success in sessionStorage
          sessionStorage.setItem("oauthSuccess", JSON.stringify({
            provider: providerParam,
            timestamp: Date.now(),
          }))

          // Redirect to home after short delay
          later(() => {
            navigate("/food/user")
          }, 1500)
          return
        }

        // Backend disconnected - new backend in progress. OAuth callback disabled.
        setStatus("error")
        setError("OAuth is temporarily disabled. Backend is being rebuilt.")
      } catch (err) {
        setStatus("error")
        setError(
          err.message || "An error occurred during authentication. Please try again."
        )
      }
    }

    handleAuthCallback()
  }, [navigate, searchParams])

  const handleRetry = () => {
    navigate("/login")
  }

  const handleGoHome = () => {
    navigate("/food/user")
  }

  return (
    <AnimatedPage style={s.page}>
      <LinearGradient
        colors={t.dark ? [colors.gray[900], "#0a0a0a", colors.gray[900]] : [alpha(colors.orange[50], 0.3), colors.white, alpha(colors.orange[100], 0.2)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.fill}
        pointerEvents="none"
      />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(4) }]}>
        <Card style={s.card}>
          <CardHeader style={s.cardHeader}>
            <CardTitle style={s.title}>
              {status === "loading" ? "Authenticating..." : status === "success" ? "Authentication Successful!" : "Authentication Failed"}
            </CardTitle>
            <CardDescription style={s.description}>
              {status === "loading"
                ? `Signing you in with ${provider || "your account"}...`
                : status === "success"
                  ? "You've been successfully signed in."
                  : "We couldn't complete the authentication process."}
            </CardDescription>
          </CardHeader>
          <CardContent style={s.cardContent}>
            {status === "loading" && (
              <View style={s.stateBox}>
                <Spin>
                  <Loader2 size={48} color="#DC2626" />
                </Spin>
                <Text style={s.mutedCenter}>Please wait while we verify your credentials...</Text>
              </View>
            )}

            {status === "success" && (
              <View style={s.stateBox}>
                <ZoomIn>
                  <CheckCircle2 size={64} color="#DC2626" />
                </ZoomIn>
                <View style={{ alignItems: "center", gap: sp(2) }}>
                  <Text style={s.welcome}>Welcome!</Text>
                  <Text style={s.mutedCenter}>Redirecting you to the home page...</Text>
                </View>
              </View>
            )}

            {status === "error" && (
              <View style={s.stateBox}>
                <ZoomIn>
                  <XCircle size={64} color={colors.red[500]} />
                </ZoomIn>
                <View style={{ alignItems: "center", gap: sp(2), width: "100%" }}>
                  <Text style={s.wrong}>Something went wrong</Text>
                  {error ? (
                    <View style={s.errorBox}>
                      <AlertCircle size={16} color={t.dark ? colors.red[400] : colors.red[700]} style={{ marginTop: 2 }} />
                      <Text style={s.errorText}>{error}</Text>
                    </View>
                  ) : null}
                  <Text style={s.mutedCenter}>Please try signing in again or use a different method.</Text>
                </View>
                <View style={s.actions}>
                  <Button variant="outline" onPress={handleGoHome} style={s.homeButton} textStyle={{ ...fontSize.base }}>
                    Go Home
                  </Button>
                  <Button
                    onPress={handleRetry}
                    style={({ pressed }) => [s.retryButton, pressed && { backgroundColor: "#991B1B", transform: [{ scale: 0.98 }] }]}
                    textStyle={{ ...fontSize.base, color: colors.white }}
                  >
                    Try Again
                  </Button>
                </View>
              </View>
            )}

            {status === "loading" && (
              <View style={s.footer}>
                <Text style={[s.mutedCenter, { ...fontSize.xs, color: k.mutedForeground }]}>This may take a few seconds...</Text>
              </View>
            )}
          </CardContent>
        </Card>
      </ScrollView>
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => {
  const k = tokensFor(t)
  return {
    page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : colors.white },
    fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    content: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: sp(4) },
    card: { width: "100%", maxWidth: 448, borderWidth: 0, ...shadow[t.dark ? "2xl" : "xl"] },
    cardHeader: { alignItems: "center", padding: sp(6) },
    title: { ...fontSize["2xl"], fontWeight: "700", color: t.dark ? colors.white : colors.black, textAlign: "center" },
    description: { ...fontSize.base, color: t.dark ? colors.gray[400] : colors.gray[600], textAlign: "center" },
    cardContent: { padding: sp(6), paddingTop: 0, gap: sp(6) },
    stateBox: { alignItems: "center", justifyContent: "center", paddingVertical: sp(8), gap: sp(4) },
    mutedCenter: { ...fontSize.sm, color: k.mutedForeground, textAlign: "center" },
    welcome: { ...fontSize.xl, fontWeight: "600", color: "#DC2626", textAlign: "center" },
    wrong: { ...fontSize.xl, fontWeight: "600", color: t.dark ? colors.red[400] : colors.red[600], textAlign: "center" },
    errorBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: sp(2),
      backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[50],
      padding: sp(4),
      borderRadius: 10,
      maxWidth: 384,
      borderWidth: 1,
      borderColor: t.dark ? colors.red[800] : colors.red[200],
    },
    errorText: { ...fontSize.sm, color: t.dark ? colors.red[400] : colors.red[700], flexShrink: 1, textAlign: "left" },
    actions: { gap: sp(3), width: "100%", paddingTop: sp(4) },
    homeButton: { height: 44, borderWidth: 2 },
    retryButton: { height: 44, backgroundColor: "#DC2626" },
    footer: { paddingTop: sp(4), borderTopWidth: 1, borderTopColor: t.dark ? colors.gray[800] : colors.gray[200] },
  }
})
