// Web: modules/Food/pages/user/profile/Logout.jsx — confirm page, then logoutWithTransition -> /login.
import { useEffect, useRef, useState } from "react"
import { Animated, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ArrowLeft, Power, AlertCircle } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import { performUserLogout } from "@/shared/utils/userSession.js"
import { logoutWithTransition } from "@/shared/utils/logoutTransition.js"

// Tailwind animate-pulse: opacity 1 -> 0.5 -> 1 every 2s
function Pulse({ children }) {
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [v])
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>
}

export default function Logout() {
  const navigate = useNavigate()
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [error, setError] = useState("")
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setError("")

    try {
      await logoutWithTransition({ navigate, signOut: performUserLogout })
    } catch {
      setError("An error occurred during logout, but you have been signed out locally.")
      timerRef.current = setTimeout(() => {
        navigate("/login", { replace: true })
      }, 2000)
    }
  }

  const iconColor = t.dark ? colors.gray[300] : colors.gray[700]

  return (
    <AnimatedPage style={s.page}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(4) }]}>
        {/* Header */}
        <View style={s.header}>
          <Button variant="ghost" size="icon" onPress={() => navigate("/food/user/profile")} style={s.backButton} accessibilityLabel="Go back">
            <ArrowLeft size={16} color={t.dark ? colors.white : colors.black} />
          </Button>
          <Text style={s.title}>Log out</Text>
        </View>

        {!isLoggingOut ? (
          <>
            {/* Warning Card */}
            <Card style={[s.whiteCard, { marginBottom: sp(4) }]}>
              <CardContent style={s.centerContent}>
                <View style={s.powerCircle}>
                  <Power size={32} color={iconColor} />
                </View>
                <Text style={s.bigTitle}>Log out?</Text>
                <Text style={[s.bodyText, { marginBottom: sp(4) }]}>
                  Are you sure you want to log out? You'll need to sign in again to access your account.
                </Text>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card style={s.infoCard}>
              <CardContent style={{ padding: sp(4) }}>
                <View style={s.infoRow}>
                  <View style={s.infoIcon}>
                    <AlertCircle size={20} color={t.dark ? colors.yellow[400] : colors.yellow[600]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.infoTitle}>Before you go</Text>
                    <Text style={s.infoText}>
                      Make sure you've saved any important information. Your cart and preferences will be saved for next time.
                    </Text>
                  </View>
                </View>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <View style={{ gap: sp(3) }}>
              <Button
                onPress={handleLogout}
                style={({ pressed }) => [s.fullButton, { backgroundColor: pressed ? colors.red[700] : colors.red[600] }]}
                textStyle={{ color: colors.white }}
              >
                Yes, Log out
              </Button>
              <Button variant="outline" onPress={() => navigate("/food/user/profile")} style={s.fullButton}>
                Cancel
              </Button>
            </View>
          </>
        ) : (
          /* Logging Out State */
          <Card style={[s.whiteCard, { borderRadius: 16, overflow: "hidden", ...shadow.md }]}>
            <CardContent style={s.centerContent}>
              <View style={s.powerCircle}>
                <Pulse>
                  <Power size={32} color={iconColor} />
                </Pulse>
              </View>
              <Text style={s.bigTitle}>Logging out...</Text>
              <Text style={[s.bodyText, { marginBottom: sp(3) }]}>Please wait while we sign you out.</Text>
              {error ? (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              ) : null}
            </CardContent>
          </Card>
        )}
      </ScrollView>
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => ({
  // web: bg-[#f5f5f5] with no dark variant
  page: { flex: 1, backgroundColor: "#f5f5f5" },
  content: { paddingHorizontal: sp(4) },
  header: { flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(4) },
  backButton: { height: 32, width: 32, padding: 0 },
  title: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.black },
  whiteCard: { backgroundColor: t.dark ? colors.gray[800] : colors.white, borderRadius: 14, borderWidth: 0, ...shadow.sm },
  centerContent: { padding: sp(6), alignItems: "center" },
  powerCircle: {
    width: 64,
    height: 64,
    backgroundColor: t.dark ? colors.gray[700] : colors.gray[100],
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sp(4),
  },
  bigTitle: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(2), textAlign: "center" },
  bodyText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600], textAlign: "center" },
  infoCard: {
    backgroundColor: t.dark ? alpha(colors.yellow[900], 0.2) : colors.yellow[50],
    borderColor: t.dark ? colors.yellow[800] : colors.yellow[200],
    borderRadius: 14,
    marginBottom: sp(4),
    ...shadow.sm,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: sp(3) },
  infoIcon: { backgroundColor: t.dark ? alpha(colors.yellow[900], 0.4) : colors.yellow[100], borderRadius: 9999, padding: sp(2), marginTop: 2 },
  infoTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.yellow[200] : colors.yellow[900], marginBottom: sp(1) },
  infoText: { ...fontSize.sm, color: t.dark ? colors.yellow[300] : colors.yellow[700] },
  fullButton: { width: "100%", height: 40 },
  errorBox: {
    marginTop: sp(4),
    padding: sp(3),
    backgroundColor: t.dark ? alpha(colors.yellow[900], 0.2) : colors.yellow[50],
    borderWidth: 1,
    borderColor: t.dark ? colors.yellow[800] : colors.yellow[200],
    borderRadius: 10,
    alignSelf: "stretch",
  },
  errorText: { ...fontSize.xs, color: t.dark ? colors.yellow[200] : colors.yellow[800] },
}))
