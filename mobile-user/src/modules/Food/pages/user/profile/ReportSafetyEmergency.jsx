// Web: modules/Food/pages/user/profile/ReportSafetyEmergency.jsx — create a safety report + own report history.
// <a href="tel:100"> -> Linking.openURL; the blurred decorative glow (blur-3xl) is a soft translucent circle.
import { useEffect, useMemo, useRef, useState } from "react"
import { Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { AlertTriangle, ArrowLeft, Phone, Shield, Loader2 } from "lucide-react-native"
import { toast } from "@/lib/toast"
import { Text } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, shadow, sp, useTheme } from "@/theme"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import { Textarea } from "@food/components/ui/textarea"
import { tokensFor } from "@food/components/ui/tokens"
import { userAPI } from "@food/api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Spin } from "@/shared/components/Loader"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const STATUS_PILL = {
  unread: { bg: colors.blue[100], fg: colors.blue[700] },
  read: { bg: colors.slate[100], fg: colors.slate[700] },
  urgent: { bg: colors.red[100], fg: colors.red[700] },
  resolved: { bg: colors.green[100], fg: colors.green[700] },
}
const PRIORITY_PILL = {
  low: { bg: colors.gray[100], fg: colors.gray[700] },
  medium: { bg: colors.yellow[100], fg: colors.yellow[700] },
  high: { bg: colors.orange[100], fg: colors.orange[700] },
  critical: { bg: colors.red[100], fg: colors.red[700], bold: true },
}

function Pill({ tone, label }) {
  const s = useStyles()
  return (
    <View style={[s.pill, { backgroundColor: tone.bg }]}>
      <Text style={[s.pillText, { color: tone.fg }, tone.bold && { fontWeight: "700" }]}>{label}</Text>
    </View>
  )
}

export default function ReportSafetyEmergency() {
  const goBack = useAppBackNavigation()
  const s = useStyles()
  const t = useTheme()
  const k = tokensFor(t)
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [report, setReport] = useState("")
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const submittedTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(submittedTimerRef.current), [])

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true)
      const res = await userAPI.getMySafetyEmergencyReports({ page: 1, limit: 20 })
      const list = res?.data?.data?.safetyEmergencies ?? []
      setHistory(Array.isArray(list) ? list : [])
    } catch (err) {
      debugError("Error fetching safety emergency history:", err)
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const historySorted = useMemo(() => {
    const arr = Array.isArray(history) ? [...history] : []
    arr.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
    return arr
  }, [history])

  const getStatusPill = (status) => {
    const tone = STATUS_PILL[String(status)] || STATUS_PILL.unread
    const label = String(status || "unread").replace(/^\w/, (c) => c.toUpperCase())
    return <Pill tone={tone} label={label} />
  }

  const getPriorityPill = (priority) => {
    const tone = PRIORITY_PILL[String(priority)] || PRIORITY_PILL.medium
    const label = String(priority || "medium").replace(/^\w/, (c) => c.toUpperCase())
    return <Pill tone={tone} label={label} />
  }

  const formatDateTime = (iso) => {
    try {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ""
      return d.toLocaleString()
    } catch {
      return ""
    }
  }

  const handleSubmit = async () => {
    if (!report.trim()) {
      toast.error('Please describe the safety concern or emergency')
      return
    }

    if (report.trim().length < 10) {
      toast.error('Description must be at least 10 characters')
      return
    }

    try {
      setIsSubmitting(true)
      const response = await userAPI.createSafetyEmergencyReport(report.trim())

      if (response.data.success) {
        setIsSubmitted(true)
        setReport("")
        toast.success('Safety emergency report submitted successfully!')
        fetchHistory()
        clearTimeout(submittedTimerRef.current)
        submittedTimerRef.current = setTimeout(() => {
          setIsSubmitted(false)
        }, 5000)
      }
    } catch (error) {
      debugError('Error submitting safety emergency report:', error)
      const backendError = error.response?.data?.message || error.response?.data?.error
      toast.error(backendError || 'Failed to submit safety emergency report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenHistoryDetails = (item) => {
    setSelectedHistoryItem(item)
    setIsHistoryDialogOpen(true)
  }

  const tooShort = report.trim().length < 10

  return (
    <AnimatedPage style={s.page}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.content, { paddingTop: insets.top + sp(4), paddingBottom: insets.bottom + sp(24) }]}
      >
        {/* Header */}
        <View style={s.header}>
          <Pressable onPress={goBack} style={({ pressed }) => [s.backButton, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityLabel="Go back">
            <ArrowLeft size={20} color={t.dark ? colors.white : colors.slate[800]} />
          </Pressable>
          <Text style={s.headerTitle}>Report an Emergency</Text>
        </View>

        {/* Emergency Contact Card */}
        <Card style={s.emergencyCard}>
          <LinearGradient
            colors={t.dark ? [alpha(colors.red[950], 0.3), "#1a1a1a"] : [colors.red[50], colors.white]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.fill}
            pointerEvents="none"
          />
          <CardContent style={{ padding: sp(5) }}>
            <View style={s.glow} pointerEvents="none" />
            <View style={s.emergencyRow}>
              <View style={s.phoneCircle}>
                <Phone size={20} color={t.dark ? colors.red[400] : "#DC2626"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.emergencyTitle}>Emergency Contact</Text>
                <Text style={s.emergencyText}>
                  For immediate emergencies, please call your local emergency services directly for immediate assistance.
                </Text>
                <Pressable
                  onPress={() => Linking.openURL("tel:100").catch(() => {})}
                  style={({ pressed }) => [s.callButton, pressed && s.callButtonPressed]}
                >
                  <Phone size={16} color={t.dark ? colors.red[400] : "#DC2626"} style={{ marginRight: sp(2) }} />
                  <Text style={s.callText}>Call 100</Text>
                </Pressable>
              </View>
            </View>
          </CardContent>
        </Card>

        {!isSubmitted ? (
          <>
            {/* Info Card */}
            <Card style={s.plainCard}>
              <CardContent style={{ padding: sp(5) }}>
                <View style={s.emergencyRow}>
                  <View style={s.shieldCircle}>
                    <Shield size={20} color={t.dark ? colors.gray[300] : colors.slate[700]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.infoTitle}>Safety is our priority</Text>
                    <Text style={s.infoText}>
                      Report any safety concerns, incidents, or emergencies related to your order or delivery experience. We take these reports very seriously.
                    </Text>
                  </View>
                </View>
              </CardContent>
            </Card>

            {/* Report Form */}
            <Card style={s.plainCard}>
              <CardContent style={{ padding: sp(5) }}>
                <Text style={s.label}>Describe the safety concern or emergency</Text>
                <Textarea
                  placeholder="Please provide details about the safety issue..."
                  placeholderTextColor={t.dark ? colors.slate[500] : colors.slate[400]}
                  value={report}
                  onChangeText={setReport}
                  style={s.textarea}
                />
                <View style={s.counterRow}>
                  <Text style={[s.counterText, tooShort && { color: "#DC2626" }]}>{report.length} characters</Text>
                  <Text style={[s.counterText, tooShort && { color: "#DC2626" }]}>Min 10 characters</Text>
                </View>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Button
              onPress={handleSubmit}
              disabled={tooShort || isSubmitting}
              style={({ pressed }) => [s.submitButton, pressed && { backgroundColor: "#B91C1C", transform: [{ scale: 0.98 }] }]}
              textStyle={s.submitText}
            >
              {isSubmitting ? (
                <View style={s.inlineRow}>
                  <Spin style={{ marginRight: sp(2) }}>
                    <Loader2 size={20} color={colors.white} />
                  </Spin>
                  <Text style={s.submitText}>Submitting Report...</Text>
                </View>
              ) : (
                'Submit Safety Report'
              )}
            </Button>

            {/* History */}
            <Card style={s.historyCard}>
              <CardContent style={{ padding: sp(4) }}>
                <View style={s.historyHead}>
                  <Text style={s.historyTitle}>Your report history</Text>
                  <Button variant="outline" size="sm" onPress={fetchHistory} disabled={historyLoading} style={{ height: 32 }}>
                    {historyLoading ? (
                      <View style={s.inlineRow}>
                        <Spin style={{ marginRight: sp(2) }}>
                          <Loader2 size={16} color={k.foreground} />
                        </Spin>
                        <Text style={s.outlineText}>Loading</Text>
                      </View>
                    ) : (
                      "Refresh"
                    )}
                  </Button>
                </View>

                {historyLoading && historySorted.length === 0 ? (
                  <Text style={s.historyEmpty}>Loading your reports...</Text>
                ) : historySorted.length === 0 ? (
                  <Text style={s.historyEmpty}>No reports yet.</Text>
                ) : (
                  <View style={{ marginTop: sp(4), gap: sp(3) }}>
                    {historySorted.map((item, index) => (
                      <Pressable
                        key={String(item?._id || item?.id || `${item?.createdAt}-${item?.message?.slice?.(0, 12)}-${index}`)}
                        onPress={() => handleOpenHistoryDetails(item)}
                        style={({ pressed }) => [s.historyItem, pressed && { backgroundColor: t.dark ? "#141414" : colors.gray[100] }]}
                      >
                        <View style={s.historyRow}>
                          <View style={{ minWidth: 0, flex: 1 }}>
                            <Text style={s.historyMessage} numberOfLines={1}>
                              {item?.message || "—"}
                            </Text>
                            <Text style={s.historyDate}>{formatDateTime(item?.createdAt)}</Text>
                          </View>
                          <View style={{ flexShrink: 0 }}>{getStatusPill(item?.status)}</View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </CardContent>
            </Card>

            {/* History Details Dialog */}
            <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
              <DialogContent style={{ maxWidth: 576 }}>
                <ScrollView style={{ maxHeight: height * 0.85 }} contentContainerStyle={{ padding: sp(6), gap: sp(4) }}>
                  <DialogHeader>
                    <DialogTitle>
                      <AlertTriangle size={20} color={colors.red[600]} style={{ marginRight: sp(2) }} />
                      Report Details
                    </DialogTitle>
                    <DialogDescription>Full details of your safety emergency report.</DialogDescription>
                  </DialogHeader>

                  {selectedHistoryItem && (
                    <View style={{ gap: sp(4) }}>
                      <View style={s.pillsRow}>
                        {getStatusPill(selectedHistoryItem?.status)}
                        {selectedHistoryItem?.priority ? getPriorityPill(selectedHistoryItem?.priority) : null}
                        {selectedHistoryItem?.createdAt ? (
                          <Text style={s.dialogDate}>{formatDateTime(selectedHistoryItem.createdAt)}</Text>
                        ) : null}
                      </View>

                      <View style={s.messageBox}>
                        <Text style={s.messageText}>{selectedHistoryItem?.message || "—"}</Text>
                      </View>

                      {selectedHistoryItem?.adminResponse ? (
                        <View style={s.responseBox}>
                          <Text style={s.responseLabel}>Admin response</Text>
                          <Text style={s.responseText}>{selectedHistoryItem.adminResponse}</Text>
                          {selectedHistoryItem?.respondedAt ? (
                            <Text style={s.respondedAt}>Responded at: {formatDateTime(selectedHistoryItem.respondedAt)}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  )}
                </ScrollView>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          /* Success State */
          <Card style={[s.historyCard, { marginTop: 0, borderRadius: 16, overflow: "hidden", ...shadow.md }]}>
            <CardContent style={{ padding: sp(6), alignItems: "center" }}>
              <View style={s.successCircle}>
                <AlertTriangle size={32} color={t.dark ? colors.red[400] : colors.red[600]} />
              </View>
              <Text style={s.successTitle}>Report Submitted</Text>
              <Text style={s.successText}>
                Your safety report has been submitted. Our team will review it immediately and take appropriate action.
              </Text>
              <Text style={s.successWarn}>If this is a life-threatening emergency, please call 100 immediately.</Text>
            </CardContent>
          </Card>
        )}
      </ScrollView>
    </AnimatedPage>
  )
}

const useStyles = makeStyles((t) => {
  const k = tokensFor(t)
  const card = t.dark ? "#1a1a1a" : colors.white
  return {
    page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
    content: { paddingHorizontal: sp(4) },
    fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    header: { flexDirection: "row", alignItems: "center", marginBottom: sp(6) },
    backButton: {
      height: 40,
      width: 40,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: card,
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
    emergencyCard: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: t.dark ? alpha(colors.red[900], 0.5) : colors.red[100],
      borderRadius: 16,
      marginBottom: sp(5),
      overflow: "hidden",
      ...shadow.sm,
    },
    glow: {
      position: "absolute",
      top: -40,
      right: -40,
      width: 128,
      height: 128,
      borderRadius: 9999,
      backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[100],
      opacity: 0.6,
    },
    emergencyRow: { flexDirection: "row", alignItems: "flex-start", gap: sp(4) },
    phoneCircle: { backgroundColor: t.dark ? alpha(colors.red[900], 0.5) : colors.red[100], borderRadius: 9999, padding: sp(3), marginTop: 2, ...shadow.sm },
    emergencyTitle: { ...fontSize.lg, fontWeight: "700", color: t.dark ? colors.white : colors.slate[900], marginBottom: 6 },
    emergencyText: { ...fontSize.sm, lineHeight: 22, color: t.dark ? colors.gray[300] : colors.slate[600], marginBottom: sp(4) },
    callButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-start",
      backgroundColor: t.dark ? "#222222" : colors.white,
      borderWidth: 1,
      borderColor: t.dark ? alpha(colors.red[900], 0.3) : colors.red[100],
      paddingHorizontal: sp(6),
      paddingVertical: sp(2.5),
      borderRadius: 14,
      ...shadow.sm,
    },
    callButtonPressed: { transform: [{ scale: 0.95 }], backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[50] },
    callText: { ...fontSize.base, fontWeight: "700", color: t.dark ? colors.red[400] : "#DC2626" },
    plainCard: {
      backgroundColor: card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.slate[100],
      marginBottom: sp(5),
      ...shadow.sm,
    },
    shieldCircle: {
      backgroundColor: t.dark ? alpha(colors.gray[800], 0.8) : colors.slate[50],
      borderRadius: 9999,
      padding: sp(3),
      marginTop: 2,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[700] : colors.slate[100],
    },
    infoTitle: { ...fontSize.base, fontWeight: "700", color: t.dark ? colors.white : colors.slate[900], marginBottom: 6 },
    infoText: { ...fontSize.sm, lineHeight: 22, color: t.dark ? colors.gray[400] : colors.slate[500] },
    label: { ...fontSize.sm, fontWeight: "600", color: t.dark ? colors.white : colors.slate[900], marginBottom: sp(3) },
    textarea: {
      minHeight: 160,
      width: "100%",
      ...fontSize.sm,
      lineHeight: 22,
      backgroundColor: t.dark ? "#111111" : colors.slate[50],
      borderColor: t.dark ? colors.gray[800] : colors.slate[200],
      borderRadius: 14,
      padding: sp(4),
      color: t.dark ? colors.white : colors.slate[900],
      textAlign: "left",
      textAlignVertical: "top",
    },
    counterRow: { marginTop: sp(3), flexDirection: "row", justifyContent: "space-between" },
    counterText: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.slate[500] },
    submitButton: {
      width: "100%",
      backgroundColor: "#DC2626",
      height: 48,
      borderRadius: 14,
      elevation: 4,
      shadowColor: "#DC2626",
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
    submitText: { ...fontSize.base, fontWeight: "600", color: colors.white },
    inlineRow: { flexDirection: "row", alignItems: "center" },
    outlineText: { ...fontSize.sm, fontWeight: "500", color: k.foreground },
    historyCard: { backgroundColor: card, borderRadius: 14, borderWidth: 0, marginTop: sp(5), ...shadow.sm },
    historyHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(3) },
    historyTitle: { ...fontSize.base, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
    historyEmpty: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: sp(4) },
    historyItem: {
      width: "100%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.gray[200],
      padding: sp(3),
      backgroundColor: t.dark ? "#101010" : colors.gray[50],
    },
    historyRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: sp(3) },
    historyMessage: { ...fontSize.sm, fontWeight: "500", color: t.dark ? colors.white : colors.gray[900] },
    historyDate: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: sp(1) },
    pill: { paddingHorizontal: 10, paddingVertical: sp(1), borderRadius: 9999 },
    pillText: { fontSize: 11, lineHeight: 16, fontWeight: "600" },
    pillsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp(2) },
    dialogDate: { ...fontSize.xs, color: t.dark ? colors.gray[400] : colors.gray[500] },
    messageBox: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.dark ? colors.gray[800] : colors.gray[200],
      backgroundColor: t.dark ? "#0f0f0f" : colors.white,
      padding: sp(4),
    },
    messageText: { ...fontSize.sm, lineHeight: 22, color: t.dark ? colors.gray[200] : colors.gray[800] },
    responseBox: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.dark ? alpha(colors.emerald[900], 0.4) : colors.emerald[200],
      backgroundColor: t.dark ? alpha(colors.emerald[900], 0.1) : alpha(colors.emerald[50], 0.6),
      padding: sp(4),
    },
    responseLabel: { ...fontSize.xs, fontWeight: "600", color: t.dark ? colors.emerald[300] : colors.emerald[700], textTransform: "uppercase", letterSpacing: 0.6, marginBottom: sp(2) },
    responseText: { ...fontSize.sm, lineHeight: 22, color: t.dark ? colors.emerald[100] : colors.emerald[900] },
    respondedAt: { ...fontSize.xs, color: t.dark ? alpha(colors.emerald[300], 0.8) : alpha(colors.emerald[700], 0.8), marginTop: sp(2) },
    successCircle: {
      width: 64,
      height: 64,
      backgroundColor: t.dark ? alpha(colors.red[900], 0.4) : colors.red[100],
      borderRadius: 9999,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: sp(4),
    },
    successTitle: { ...fontSize.xl, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900], marginBottom: sp(2), textAlign: "center" },
    successText: { ...fontSize.sm, color: t.dark ? colors.gray[400] : colors.gray[600], marginBottom: sp(3), textAlign: "center" },
    successWarn: { ...fontSize.xs, fontWeight: "500", color: t.dark ? colors.red[400] : colors.red[600], textAlign: "center" },
  }
})
