// Web: modules/Food/pages/user/complaints/SubmitComplaint.jsx — complaint form for one order.
// <select> -> a field that opens the option list in a dialog (what Android shows for a web <select>).
import React, { useState, useEffect } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { ArrowLeft, AlertCircle, FileText, ChevronDown, Check } from "lucide-react-native"
import { useNavigate, useParams } from "@/lib/router"
import { Dialog, Screen, Text, TextInput } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import { Spin } from "@/shared/components/Loader"
import { orderAPI } from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { toast } from "@/lib/toast"

const debugLog = (..._args) => {}
const debugError = (..._args) => {}

const COMPLAINT_TYPES = [
  { value: "Food Quality", label: "Food Quality Issue" },
  { value: "Wrong Item", label: "Wrong Item Received" },
  { value: "Missing Item", label: "Missing Item" },
  { value: "Packaging Issue", label: "Packaging Issue" },
  { value: "Late Delivery", label: "Late Delivery" },
  { value: "Other", label: "Other" },
]

export default function SubmitComplaint() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { orderId } = useParams()
  const t = useTheme()
  const s = useStyles()

  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [focused, setFocused] = useState(null)

  const [formData, setFormData] = useState({
    complaintType: "",
    subject: "",
    description: "",
  })

  useEffect(() => {
    let timer
    if (!orderId) {
      debugError("Order ID missing from URL params")
      toast.error("Order ID is required")
      timer = setTimeout(() => {
        navigate("/food/user/orders")
      }, 2000)
      return () => clearTimeout(timer)
    }

    const fetchOrder = async () => {
      try {
        setLoading(true)
        debugLog("Fetching order details for orderId:", orderId)
        const response = await orderAPI.getOrderDetails(orderId)

        let orderData = null
        if (response?.data?.success && response.data.data?.order) {
          orderData = response.data.data.order
        } else if (response?.data?.order) {
          orderData = response.data.order
        } else {
          debugError("Order not found in response:", response?.data)
          toast.error("Order not found")
          timer = setTimeout(() => {
            navigate("/food/user/orders")
          }, 2000)
          return
        }
        setOrder(orderData)
      } catch (error) {
        debugError("Error fetching order:", error)
        toast.error(error?.response?.data?.message || "Failed to load order details")
        timer = setTimeout(() => {
          navigate("/food/user/orders")
        }, 2000)
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
    return () => clearTimeout(timer)
  }, [orderId, navigate])

  const handleSubmit = async () => {
    if (!formData.complaintType) {
      toast.error("Please select a complaint type")
      return
    }
    if (!formData.subject.trim()) {
      toast.error("Please enter a subject")
      return
    }
    if (!formData.description.trim()) {
      toast.error("Please enter a description")
      return
    }

    try {
      setSubmitting(true)
      const orderMongoId = order?._id || orderId
      if (!orderMongoId) {
        toast.error("Order ID not available")
        setSubmitting(false)
        return
      }

      const orderIdString = typeof orderMongoId === "object" && orderMongoId.toString ? orderMongoId.toString() : String(orderMongoId)

      const response = await orderAPI.submitComplaint({
        orderId: orderIdString,
        complaintType: formData.complaintType,
        subject: formData.subject,
        description: formData.description,
      })

      if (response?.data?.success) {
        toast.success("Complaint submitted successfully")
        const orderIdForNav = order?._id || orderId
        // web: /user/orders/:id/details (redirected to /food/user/...)
        navigate(`/food/user/orders/${orderIdForNav}/details`)
      } else {
        toast.error(response?.data?.message || "Failed to submit complaint")
      }
    } catch (error) {
      debugError("Error submitting complaint:", error)
      toast.error(error?.response?.data?.message || "Failed to submit complaint")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : colors.gray[50]} style={{ alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: t.dark ? colors.gray[400] : colors.gray[600], fontSize: 14, lineHeight: 20 }}>Loading...</Text>
      </Screen>
    )
  }

  if (!order) {
    return null
  }

  const selectedType = COMPLAINT_TYPES.find((x) => x.value === formData.complaintType)
  const fieldStyle = (name) => [s.field, focused === name && s.fieldFocus]

  return (
    <Screen edges={["top", "bottom"]} bg={t.dark ? "#0a0a0a" : colors.gray[50]} keyboard>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={goBack} style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: t.dark ? alpha(colors.white, 0.1) : colors.gray[100] }]}>
          <ArrowLeft size={24} color={t.dark ? colors.gray[200] : colors.gray[700]} />
        </Pressable>
        <Text style={s.headerTitle}>Submit Complaint</Text>
        <Pressable onPress={() => navigate("/food/user/profile/support")} style={{ marginLeft: "auto" }}>
          <Text style={s.history}>View History</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
        {/* Order Info */}
        <View style={s.orderCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <View style={s.orderIcon}>
              <FileText size={20} color={t.dark ? colors.gray[300] : colors.gray[600]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.orderId}>Order #{order.orderId || order._id}</Text>
              <Text style={s.restaurant}>
                {order.restaurantName || order.restaurantId?.restaurantName || order.restaurantId?.name || order.restaurant?.name || "Restaurant"}
              </Text>
            </View>
          </View>
          <Text style={s.date}>
            {new Date(order.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {/* Form */}
        <View style={{ marginHorizontal: 16, marginTop: 16, gap: 16 }}>
          <View>
            <Text style={s.label}>
              Complaint Type <Text style={{ color: colors.red[500] }}>*</Text>
            </Text>
            <Pressable onPress={() => setTypeOpen(true)} style={[s.field, s.selectField, typeOpen && s.fieldFocus]}>
              <Text style={[s.fieldText, !selectedType && { color: t.dark ? colors.gray[500] : colors.gray[400] }]}>
                {selectedType ? selectedType.label : "Select complaint type"}
              </Text>
              <ChevronDown size={16} color={t.dark ? colors.gray[400] : colors.gray[500]} />
            </Pressable>
          </View>

          <View>
            <Text style={s.label}>
              Subject <Text style={{ color: colors.red[500] }}>*</Text>
            </Text>
            <TextInput
              value={formData.subject}
              onChangeText={(v) => setFormData({ ...formData, subject: v })}
              placeholder="Brief description of your complaint"
              placeholderTextColor={t.dark ? colors.gray[500] : colors.gray[400]}
              style={[...fieldStyle("subject"), s.fieldText]}
              maxLength={200}
              onFocus={() => setFocused("subject")}
              onBlur={() => setFocused(null)}
              cursorColor={t.dark ? "#ffffff" : "#0f172a"}
            />
          </View>

          <View>
            <Text style={s.label}>
              Description <Text style={{ color: colors.red[500] }}>*</Text>
            </Text>
            <TextInput
              value={formData.description}
              onChangeText={(v) => setFormData({ ...formData, description: v })}
              placeholder="Please provide detailed information about your complaint..."
              placeholderTextColor={t.dark ? colors.gray[500] : colors.gray[400]}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              style={[...fieldStyle("description"), s.fieldText, { minHeight: 6 * 24 + 26 }]}
              maxLength={1000}
              onFocus={() => setFocused("description")}
              onBlur={() => setFocused(null)}
              cursorColor={t.dark ? "#ffffff" : "#0f172a"}
            />
            <Text style={s.counter}>{formData.description.length}/1000 characters</Text>
          </View>

          <View style={s.info}>
            <AlertCircle size={20} color={colors.blue[600]} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.infoTitle}>What happens next?</Text>
              <Text style={s.infoText}>
                Your complaint will be sent to the restaurant. They will review and respond to your complaint. You can track the status in your complaints
                section.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Fixed submit bar */}
      <View style={s.bottomBar}>
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [s.submit, pressed && { backgroundColor: "#991B1B" }, submitting && { opacity: 0.5 }]}
        >
          {submitting ? (
            <>
              <Spin>
                <View style={s.spinner} />
              </Spin>
              <Text style={s.submitText}>Submitting...</Text>
            </>
          ) : (
            <Text style={s.submitText}>Submit Complaint</Text>
          )}
        </Pressable>
      </View>

      <Dialog open={typeOpen} onClose={() => setTypeOpen(false)} style={s.optionsDialog}>
        {[{ value: "", label: "Select complaint type" }, ...COMPLAINT_TYPES].map((type) => {
          const active = formData.complaintType === type.value
          return (
            <Pressable
              key={type.value || "none"}
              onPress={() => {
                setFormData({ ...formData, complaintType: type.value })
                setTypeOpen(false)
              }}
              style={({ pressed }) => [s.option, pressed && { backgroundColor: t.dark ? alpha(colors.white, 0.06) : colors.gray[100] }]}
            >
              <Text style={[s.optionText, !type.value && { color: colors.gray[400] }]}>{type.label}</Text>
              {active && type.value ? <Check size={18} color="#DC2626" /> : null}
            </Pressable>
          )
        })}
      </Dialog>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  header: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, padding: 16, flexDirection: "row", alignItems: "center", zIndex: 20, ...shadow.sm },
  backBtn: { padding: 4, borderRadius: 9999 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: "600", color: t.dark ? colors.white : colors.gray[800], marginLeft: 12 },
  history: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#DC2626" },
  orderCard: { backgroundColor: t.dark ? "#1a1a1a" : colors.white, marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 14, ...shadow.sm },
  orderIcon: { width: 40, height: 40, backgroundColor: t.dark ? alpha(colors.white, 0.1) : colors.gray[100], borderRadius: 10, alignItems: "center", justifyContent: "center" },
  orderId: { fontWeight: "600", color: t.dark ? colors.white : colors.gray[800], fontSize: 16, lineHeight: 24 },
  restaurant: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500] },
  date: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[400] : colors.gray[600] },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: t.dark ? colors.gray[200] : colors.gray[700], marginBottom: 8 },
  field: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[300],
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: 10,
  },
  fieldFocus: { borderColor: "#DC2626", borderWidth: 2, paddingHorizontal: 15, paddingVertical: 11 },
  selectField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldText: { fontSize: 16, lineHeight: 24, color: t.dark ? colors.white : colors.gray[900] },
  counter: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500], marginTop: 4 },
  info: {
    backgroundColor: t.dark ? alpha(colors.blue[950], 0.4) : colors.blue[50],
    borderWidth: 1,
    borderColor: t.dark ? colors.blue[900] : colors.blue[200],
    borderRadius: 10,
    padding: 16,
    flexDirection: "row",
    gap: 12,
  },
  infoTitle: { fontSize: 14, lineHeight: 20, fontWeight: "600", marginBottom: 4, color: t.dark ? colors.blue[200] : colors.blue[800] },
  infoText: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.blue[300] : colors.blue[700] },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderTopWidth: 1,
    borderTopColor: t.dark ? colors.gray[800] : colors.gray[200],
    padding: 16,
    zIndex: 20,
  },
  submit: { width: "100%", backgroundColor: "#DC2626", paddingVertical: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: colors.white, fontWeight: "600", fontSize: 16, lineHeight: 24 },
  spinner: { width: 16, height: 16, borderWidth: 2, borderColor: colors.white, borderTopColor: "transparent", borderRadius: 9999 },
  optionsDialog: { paddingVertical: 8, backgroundColor: t.dark ? "#1a1a1a" : colors.white },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  optionText: { fontSize: 16, lineHeight: 24, color: t.dark ? colors.white : colors.gray[900] },
}))
