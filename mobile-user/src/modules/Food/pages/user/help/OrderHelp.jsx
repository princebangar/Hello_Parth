// Web: modules/Food/pages/user/help/OrderHelp.jsx — help for one order of OrdersContext (static issue list, contact
// block). Texts, contact rows and the alert() messages are the web's own content, unchanged.
// "Contact support" scrollIntoView -> scrollTo the section's measured offset.
import React, { useRef } from "react"
import { Alert, Linking, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import {
  ArrowLeft,
  Package,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Truck,
  MessageCircle,
  Phone,
  Mail,
  FileText,
  RefreshCw,
  CreditCard,
  MapPin,
  HelpCircle,
} from "lucide-react-native"
import { useParams, Link, useNavigate } from "@/lib/router"
import { Screen, Text } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import AnimatedPage from "@food/components/user/AnimatedPage"
import ScrollReveal from "@food/components/user/ScrollReveal"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Badge } from "@food/components/ui/badge"
import { tokensFor } from "@food/components/ui/tokens"
import { useOrders } from "@food/context/OrdersContext"

const RED = "#DC2626"

const commonIssues = [
  {
    id: "late-delivery",
    title: "Order is Late",
    icon: Clock,
    description: "Your order hasn't arrived within the estimated time",
    solutions: [
      "Check the order tracking page for real-time updates",
      "Contact the delivery driver if contact information is available",
      "Wait an additional 15-20 minutes as delays can occur",
      "Contact support if the order is more than 30 minutes late",
    ],
    actions: [
      { label: "Track Order", path: "track" },
      { label: "Contact Support", path: "support" },
    ],
  },
  {
    id: "missing-items",
    title: "Missing Items",
    icon: Package,
    description: "Some items from your order are missing",
    solutions: [
      "Check your order receipt to verify what was ordered",
      "Check if items were delivered separately",
      "Contact support immediately with your order number",
      "Take photos if possible to help with the investigation",
    ],
    actions: [
      { label: "View Invoice", path: "invoice" },
      { label: "Report Issue", path: "support" },
    ],
  },
  {
    id: "wrong-order",
    title: "Wrong Order Received",
    icon: XCircle,
    description: "You received items different from what you ordered",
    solutions: [
      "Keep the incorrect order - you won't be charged for it",
      "Contact support immediately with your order number",
      "We'll arrange a replacement or full refund",
      "You may be eligible for a discount on your next order",
    ],
    actions: [
      { label: "View Order Details", path: "track" },
      { label: "Report Issue", path: "support" },
    ],
  },
  {
    id: "quality-issue",
    title: "Quality Issue",
    icon: AlertCircle,
    description: "Food quality doesn't meet expectations",
    solutions: ["Contact support within 24 hours of delivery", "Describe the issue in detail", "Take photos if possible", "We'll process a full refund or replacement"],
    actions: [
      { label: "Report Issue", path: "support" },
      { label: "Request Refund", path: "refund" },
    ],
  },
  {
    id: "payment-issue",
    title: "Payment Problem",
    icon: CreditCard,
    description: "Issues with payment or billing",
    solutions: [
      "Check your payment method in your profile",
      "Verify the charge on your bank statement",
      "Contact support if you were charged incorrectly",
      "We'll investigate and process a refund if needed",
    ],
    actions: [
      { label: "View Invoice", path: "invoice" },
      { label: "Contact Support", path: "support" },
    ],
  },
  {
    id: "cancel-order",
    title: "Cancel Order",
    icon: RefreshCw,
    description: "Need to cancel your order",
    solutions: [
      "Orders can be cancelled within 5 minutes of placement",
      "After 5 minutes, contact support for cancellation",
      "If the order is already being prepared, cancellation may not be possible",
      "Refunds are processed automatically for cancelled orders",
    ],
    actions: [
      { label: "Contact Support", path: "support" },
      { label: "View Order", path: "track" },
    ],
  },
]

export default function OrderHelp() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { getOrderById } = useOrders()
  const order = getOrderById(orderId)
  const t = useTheme()
  const k = tokensFor(t)
  const s = useStyles()
  const scrollRef = useRef(null)
  const supportY = useRef(0)

  const scrollToSupport = () => scrollRef.current?.scrollTo({ y: Math.max(0, supportY.current - 16), animated: true })

  const formatDate = (dateString) => {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "confirmed":
      case "preparing":
      case "outForDelivery":
      case "delivered":
        return RED
      default:
        return colors.gray[500]
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case "placed":
        return "Order Placed"
      case "confirmed":
        return "Confirmed"
      case "preparing":
        return "Preparing"
      case "outForDelivery":
        return "Out for Delivery"
      case "delivered":
        return "Delivered"
      default:
        return status
    }
  }

  // web: /user/orders/... (redirected to /food/user/...)
  const handleAction = (action) => {
    switch (action) {
      case "track":
        navigate(`/food/user/orders/${orderId}`)
        break
      case "invoice":
        navigate(`/food/user/orders/${orderId}/invoice`)
        break
      case "support":
        scrollToSupport()
        break
      case "refund":
        Alert.alert("", "Refund request would be processed here. Contact support for assistance.")
        break
      default:
        break
    }
  }

  const pageBg = (
    <>
      {!t.dark && (
        <LinearGradient colors={[alpha(colors.yellow[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      )}
    </>
  )

  if (!order) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
        {pageBg}
        <AnimatedPage style={{ flex: 1, padding: 16 }}>
          <Card>
            <CardContent style={{ paddingVertical: 48, alignItems: "center" }}>
              <AlertCircle size={64} color={k.mutedForeground} style={{ marginBottom: 16 }} />
              <Text style={[s.nfTitle, { color: k.foreground }]}>Order Not Found</Text>
              <Text style={{ color: k.mutedForeground, marginBottom: 24, textAlign: "center" }}>We couldn't find an order with ID: {orderId}</Text>
              <View style={{ flexDirection: "row", gap: 16, justifyContent: "center" }}>
                <Button variant="outline" onPress={() => navigate("/food/user/orders")}>
                  View All Orders
                </Button>
                <Button onPress={() => navigate("/food/user/help")}>Go to Help Center</Button>
              </View>
            </CardContent>
          </Card>
        </AnimatedPage>
      </Screen>
    )
  }

  const ContactRow = ({ icon: Icon, title, text, linkText, link }) => (
    <View style={[s.contactRow, { backgroundColor: alpha(t.dark ? "#262626" : "#f5f3ee", 0.5) }]}>
      <View style={{ padding: 8, backgroundColor: colors.orange[100], borderRadius: 10 }}>
        <Icon size={20} color={RED} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.contactTitle, { color: k.foreground }]}>{title}</Text>
        <Text style={[s.contactText, { color: k.mutedForeground }]}>{text}</Text>
        <Text style={[s.link, { color: k.primary }]} onPress={() => Linking.openURL(link).catch(() => {})}>
          {linkText}
        </Text>
      </View>
    </View>
  )

  const QuickBtn = ({ icon: Icon, title, text, onPress }) => (
    <Button variant="outline" style={{ width: "100%", justifyContent: "flex-start", gap: 8, height: undefined, paddingVertical: 12 }} onPress={onPress}>
      <Icon size={16} color={k.foreground} />
      <View>
        <Text style={{ fontWeight: "600", color: k.foreground, fontSize: 14, lineHeight: 20 }}>{title}</Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: k.mutedForeground }}>{text}</Text>
      </View>
    </Button>
  )

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
      {pageBg}
      <AnimatedPage style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={s.page}>
          {/* Header */}
          <ScrollReveal>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <Link to="/food/user/help" style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: k.accent }]}>
                <ArrowLeft size={16} color={k.foreground} />
              </Link>
              <View>
                <Text style={[s.h1, { color: k.foreground }]}>Order Help</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: k.mutedForeground }}>Order {order.id}</Text>
              </View>
            </View>
          </ScrollReveal>

          {/* Order Summary */}
          <ScrollReveal>
            <Card style={shadow.lg}>
              <CardHeader style={{ padding: 16, alignItems: "stretch" }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Package size={16} color={RED} />
                    <CardTitle style={{ fontSize: 18, lineHeight: 28 }}>Order Summary</CardTitle>
                  </View>
                  <Badge style={{ backgroundColor: getStatusColor(order.status), borderColor: "transparent" }} textStyle={{ color: colors.white, fontSize: 12 }}>
                    {getStatusLabel(order.status)}
                  </Badge>
                </View>
              </CardHeader>
              <CardContent style={{ padding: 16, gap: 16 }}>
                <View style={{ gap: 16 }}>
                  <View>
                    <Text style={[s.metaLabel, { color: k.mutedForeground }]}>Order ID</Text>
                    <Text style={[s.metaValue, { color: k.foreground }]}>{order.id}</Text>
                  </View>
                  <View>
                    <Text style={[s.metaLabel, { color: k.mutedForeground }]}>Placed On</Text>
                    <Text style={[s.metaValue, { color: k.foreground }]}>{formatDate(order.createdAt)}</Text>
                  </View>
                  <View>
                    <Text style={[s.metaLabel, { color: k.mutedForeground }]}>Total Amount</Text>
                    <Text style={[s.metaValue, { color: RED, fontSize: 20, lineHeight: 28 }]}>${order.total.toFixed(2)}</Text>
                  </View>
                  <View>
                    <Text style={[s.metaLabel, { color: k.mutedForeground }]}>Items</Text>
                    <Text style={[s.metaValue, { color: k.foreground }]}>{order.items?.length || 0} items</Text>
                  </View>
                </View>
                {order.address && (
                  <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: k.border }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <MapPin size={16} color={k.mutedForeground} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.metaLabel, { color: k.mutedForeground }]}>Delivery Address</Text>
                        <Text style={{ fontSize: 14, lineHeight: 20, color: k.foreground }}>
                          {order.address.street}
                          {order.address.additionalDetails && `, ${order.address.additionalDetails}`}
                          {"\n"}
                          {order.address.city}, {order.address.state} {order.address.zipCode}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Common Issues */}
          <ScrollReveal>
            <View style={{ gap: 16 }}>
              <Text style={[s.h2, { color: k.foreground }]}>What can we help you with?</Text>
              <View style={{ gap: 16 }}>
                {commonIssues.map((issue) => {
                  const Icon = issue.icon
                  return (
                    <Card key={issue.id}>
                      <CardHeader style={{ padding: 16, alignItems: "stretch" }}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                          <View style={{ padding: 8, backgroundColor: colors.yellow[100], borderRadius: 10 }}>
                            <Icon size={16} color={RED} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <CardTitle style={{ fontSize: 16, lineHeight: 24 }}>{issue.title}</CardTitle>
                            <CardDescription style={{ marginTop: 4, fontSize: 14 }}>{issue.description}</CardDescription>
                          </View>
                        </View>
                      </CardHeader>
                      <CardContent style={{ padding: 16, gap: 12 }}>
                        <View style={{ gap: 8 }}>
                          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "600", color: k.foreground }}>What to do:</Text>
                          <View style={{ gap: 4 }}>
                            {issue.solutions.map((solution, idx) => (
                              <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                                <CheckCircle size={16} color={colors.green[600]} style={{ marginTop: 2 }} />
                                <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: k.mutedForeground }}>{solution}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                        <View style={{ flexDirection: "row", gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: k.border }}>
                          {issue.actions.map((action, idx) => (
                            <Button
                              key={idx}
                              variant={idx === 0 ? "default" : "outline"}
                              size="sm"
                              style={idx === 0 ? ({ pressed }) => ({ backgroundColor: RED, opacity: pressed ? 0.9 : 1 }) : undefined}
                              textStyle={idx === 0 ? { color: t.dark ? "#171717" : "#170400" } : undefined}
                              onPress={() => handleAction(action.path)}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </View>
                      </CardContent>
                    </Card>
                  )
                })}
              </View>
            </View>
          </ScrollReveal>

          {/* Quick Actions */}
          <ScrollReveal>
            <Card style={[{ borderColor: colors.yellow[200], overflow: "hidden" }, shadow.lg]}>
              <LinearGradient colors={[colors.yellow[50], colors.orange[50]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <CardHeader style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <HelpCircle size={16} color={RED} />
                  <CardTitle style={{ fontSize: 18, lineHeight: 28 }}>Quick Actions</CardTitle>
                </View>
              </CardHeader>
              <CardContent style={{ padding: 16, gap: 16 }}>
                <QuickBtn icon={Truck} title="Track Order" text="View real-time status" onPress={() => navigate(`/food/user/orders/${orderId}`)} />
                <QuickBtn icon={FileText} title="View Invoice" text="Download receipt" onPress={() => navigate(`/food/user/orders/${orderId}/invoice`)} />
                <QuickBtn icon={MessageCircle} title="Contact Support" text="Get help now" onPress={scrollToSupport} />
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Contact Support Section */}
          <View
            onLayout={(e) => {
              supportY.current = e.nativeEvent.layout.y
            }}
          >
            <ScrollReveal>
              <Card style={shadow.lg}>
                <CardHeader style={{ padding: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <MessageCircle size={20} color={RED} />
                    <CardTitle style={{ fontSize: 20, lineHeight: 28, flexShrink: 1 }}>Contact Support for This Order</CardTitle>
                  </View>
                  <CardDescription style={{ fontSize: 14 }}>Our support team is ready to help you with order {order.id}</CardDescription>
                </CardHeader>
                <CardContent style={{ padding: 16, gap: 16 }}>
                  <View style={{ gap: 16 }}>
                    <ContactRow icon={Phone} title="Phone Support" text={`Mention order ${order.id}`} linkText="+1 (800) 123-4567" link="tel:+1-800-123-4567" />
                    <ContactRow
                      icon={Mail}
                      title="Email Support"
                      text={`Include order ${order.id} in subject`}
                      linkText="support@helloparth.com"
                      link={`mailto:support@helloparth.com?subject=${encodeURIComponent(`Help with Order ${order.id}`)}`}
                    />
                  </View>
                  <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: k.border }}>
                    <Button
                      style={({ pressed }) => ({ width: "100%", backgroundColor: RED, opacity: pressed ? 0.9 : 1 })}
                      onPress={() => Alert.alert("", "Live chat would open here with order context")}
                    >
                      <MessageCircle size={16} color={t.dark ? "#171717" : "#170400"} style={{ marginRight: 8 }} />
                      Start Live Chat
                    </Button>
                  </View>
                </CardContent>
              </Card>
            </ScrollReveal>
          </View>

          {/* Back to Orders */}
          <ScrollReveal>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Button variant="outline" style={{ width: "100%" }} onPress={() => navigate("/food/user/orders")}>
                  <ArrowLeft size={16} color={k.foreground} style={{ marginRight: 8 }} />
                  Back to All Orders
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button variant="outline" style={{ width: "100%" }} onPress={() => navigate("/food/user/help")}>
                  <HelpCircle size={16} color={k.foreground} style={{ marginRight: 8 }} />
                  Help Center
                </Button>
              </View>
            </View>
          </ScrollReveal>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  )
}

const useStyles = makeStyles(() => ({
  page: { padding: 16, gap: 16 },
  backBtn: { width: 32, height: 32, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: "700" },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: "700" },
  nfTitle: { fontSize: 24, lineHeight: 32, fontWeight: "700", marginBottom: 8 },
  metaLabel: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  metaValue: { fontWeight: "600" },
  contactRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderRadius: 10 },
  contactTitle: { fontWeight: "600", marginBottom: 4 },
  contactText: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  link: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
}))
