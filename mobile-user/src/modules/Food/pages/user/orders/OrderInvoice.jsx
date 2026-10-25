// Web: modules/Food/pages/user/orders/OrderInvoice.jsx — invoice of one order (OrdersContext, else GET order details).
// Print / Download PDF: the web printed the card's HTML in a new window; here the same markup + the web's print CSS is
// rendered with @/lib/media printHtml (Print -> system print dialog, PDF -> PDF file in the share sheet).
import React, { useState, useEffect } from "react"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Download, ArrowLeft, FileText, Printer } from "lucide-react-native"
import { useParams, useNavigate, Link } from "@/lib/router"
import { AppImage, Screen, Text } from "@/native/ui"
import { alpha, colors, makeStyles, useTheme } from "@/theme"
import { printHtml } from "@/lib/media"
import { Spin } from "@/shared/components/Loader"
import { toast } from "@/lib/toast"
import AnimatedPage from "@food/components/user/AnimatedPage"
import ScrollReveal from "@food/components/user/ScrollReveal"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Badge } from "@food/components/ui/badge"
import { tokensFor } from "@food/components/ui/tokens"
import { useOrders } from "@food/context/OrdersContext"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { orderAPI } from "@food/api"

const RED = "#DC2626"

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const PRINT_CSS = `
  body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
  .invoice-header { border-bottom: 2px solid #DC2626; padding-bottom: 20px; margin-bottom: 30px; }
  .invoice-title { font-size: 32px; font-weight: bold; color: #DC2626; margin-bottom: 10px; }
  .invoice-details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 30px 0; }
  .invoice-items { margin: 30px 0; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
  th { background-color: #fed7aa; font-weight: bold; }
  .total-section { margin-top: 30px; text-align: right; }
  .total-row { padding: 10px 0; font-size: 18px; display: flex; justify-content: space-between; }
  .grand-total { font-size: 24px; font-weight: bold; color: #DC2626; border-top: 2px solid #DC2626; padding-top: 10px; display: flex; justify-content: space-between; }
  .row { display: flex; align-items: center; justify-content: space-between; }
  .muted { color: #7b5b4a; font-size: 14px; }
  .badge { background: #DC2626; color: #fff; padding: 6px 12px; border-radius: 8px; font-size: 14px; font-weight: 600; }
  .item-img { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; vertical-align: middle; margin-right: 12px; }
  .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #ddd; text-align: center; color: #7b5b4a; font-size: 14px; }
  @media print { body { margin: 0; padding: 20px; } }
`

export default function OrderInvoice() {
  const companyName = useCompanyName()
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { getOrderById } = useOrders()
  const t = useTheme()
  const k = tokensFor(t)
  const s = useStyles()
  const [order, setOrder] = useState(() => getOrderById(orderId))
  const [loading, setLoading] = useState(!order)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (order) return

    const fetchOrder = async () => {
      try {
        setLoading(true)
        const response = await orderAPI.getOrderDetails(orderId)
        if (response.data?.success && response.data.data?.order) {
          setOrder(response.data.data.order)
        } else {
          setError("Order not found")
        }
      } catch {
        setError("Failed to load invoice details")
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [orderId, order])

  const pageBg = !t.dark ? (
    <LinearGradient colors={[alpha(colors.yellow[50], 0.3), colors.white, alpha(colors.orange[50], 0.2)]} style={StyleSheet.absoluteFill} pointerEvents="none" />
  ) : (
    <LinearGradient colors={["#0a0a0a", "#1a1a1a", "#0a0a0a"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
  )

  if (loading) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : "#f5f5f5"}>
        <AnimatedPage style={{ flex: 1, padding: 16 }}>
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <View style={s.spinnerWrap}>
              <SpinRing />
            </View>
            <Text style={{ color: k.mutedForeground }}>Generating invoice...</Text>
          </View>
        </AnimatedPage>
      </Screen>
    )
  }

  if (error || !order) {
    return (
      <Screen bg={t.dark ? "#0a0a0a" : "#f5f5f5"}>
        <AnimatedPage style={{ flex: 1, padding: 16 }}>
          <View style={{ alignItems: "center", paddingVertical: 80 }}>
            <Text style={{ fontSize: 18, lineHeight: 28, fontWeight: "700", marginBottom: 16, color: k.foreground }}>{error || "Order Not Found"}</Text>
            <Button onPress={() => navigate("/food/user/orders")}>Back to Orders</Button>
          </View>
        </AnimatedPage>
      </Screen>
    )
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  // h("td", ' style="..."', inner) -> the tag as an HTML string
  const h = (name, attrs, ...children) => `<${name}${attrs || ""}>${children.join("")}</${name}>`
  const buildInvoiceHtml = () => {
    const a = order.address || {}
    const rows = (order.items || [])
      .map((item) =>
        h(
          "tr",
          "",
          h(
            "td",
            "",
            item.image ? `<${"img"} class="item-img" src="${esc(item.image)}" />` : "",
            h("b", "", esc(item.name)),
            item.variantName ? `<${"br"}/>` + h("span", ' class="muted" style="font-size:12px"', esc(item.variantName)) : "",
          ),
          h("td", ' style="text-align:center"', esc(item.quantity)),
          h("td", ' style="text-align:right"', `₹${Number(item.price).toFixed(2)}`),
          h("td", ' style="text-align:right"', `₹${(item.price * item.quantity).toFixed(2)}`),
        ),
      )
      .join("")
    const feeRow = (label, v, style = "") => h("div", ` class="total-row"${style}`, h("span", "", label), h("span", "", `₹${Number(v).toFixed(2)}`))
    const body = [
      h(
        "div",
        ' class="invoice-header"',
        h("div", ' class="invoice-title"', "INVOICE"),
        h(
          "div",
          ' class="row"',
          h("div", "", h("div", ' class="muted"', esc(companyName)), h("div", ' class="muted"', "Food Delivery Platform")),
          h("span", ' class="badge"', esc(String(order.status || "").toUpperCase())),
        ),
      ),
      h(
        "div",
        ' class="invoice-details"',
        h(
          "div",
          "",
          h("h3", "", "Bill To:"),
          h("div", "", esc(a.street)),
          a.additionalDetails ? h("div", "", esc(a.additionalDetails)) : "",
          h("div", "", `${esc(a.city)}, ${esc(a.state)} ${esc(a.zipCode)}`),
        ),
        h(
          "div",
          ' style="text-align:right"',
          h("h3", "", "Invoice Details:"),
          h("div", "", h("strong", "", "Invoice #:"), " ", esc(order.id)),
          h("div", "", h("strong", "", "Date:"), " ", esc(formatDate(order.createdAt))),
          h("div", "", h("strong", "", "Payment:"), " ", esc(order.paymentMethod?.type?.toUpperCase() || "Card")),
        ),
      ),
      h(
        "div",
        ' class="invoice-items"',
        h("h3", "", "Order Items:"),
        h(
          "table",
          "",
          h(
            "thead",
            "",
            h(
              "tr",
              "",
              h("th", "", "Item"),
              h("th", ' style="text-align:center"', "Quantity"),
              h("th", ' style="text-align:right"', "Unit Price"),
              h("th", ' style="text-align:right"', "Total"),
            ),
          ),
          h("tbody", "", rows),
        ),
      ),
      h(
        "div",
        ' class="total-section"',
        feeRow("Subtotal:", order.subtotal),
        order.packagingFee > 0 ? feeRow("Packaging Fee:", order.packagingFee) : "",
        order.platformFee > 0 ? feeRow("Platform Fee:", order.platformFee) : "",
        feeRow("Delivery Fee:", order.deliveryFee),
        feeRow("GST:", order.tax),
        feeRow("Discount:", Math.abs(order.discount), ' style="color:#16a34a"'),
        h("div", ' class="grand-total"', h("span", "", "Total:"), h("span", "", `₹${Number(order.total).toFixed(2)}`)),
      ),
      h("div", ' class="footer"', h("p", "", "Thank you for your order!"), h("p", "", "For any queries, please contact our support team.")),
    ].join("")
    return `<!DOCTYPE html>${h("html", "", h("head", "", '<meta charset="utf-8"/>', h("title", "", `Invoice - ${esc(order.id)}`), h("style", "", PRINT_CSS)), h("body", "", body))}`
  }

  const handlePrint = () => {
    printHtml(buildInvoiceHtml(), { share: false }).catch(() => toast.error("Could not open the print dialog"))
  }

  const handleDownloadPDF = () => {
    printHtml(buildInvoiceHtml(), { filename: `Invoice-${String(order.id || orderId).replace(/[^\w-]+/g, "_")}.pdf` }).catch(() =>
      toast.error("Could not create the PDF"),
    )
  }

  const bodyText = t.dark ? colors.gray[300] : k.cardForeground
  const strongText = t.dark ? colors.gray[100] : k.cardForeground

  const TotalRow = ({ label, value, color }) => (
    <View style={s.totalRow}>
      <Text style={[s.totalText, { color: color || bodyText }]}>{label}</Text>
      <Text style={[s.totalText, { color: color || bodyText }]}>{value}</Text>
    </View>
  )

  return (
    <Screen bg={t.dark ? "#0a0a0a" : colors.white}>
      {pageBg}
      <AnimatedPage style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 12, gap: 16 }}>
          <ScrollReveal>
            <View style={{ gap: 12, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {/* web: /user/orders/:id (redirected to /food/user/...) */}
                <Link to={`/food/user/orders/${orderId}`} style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: k.accent }]}>
                  <ArrowLeft size={16} color={k.foreground} />
                </Link>
                <View style={{ flex: 1 }}>
                  <Text style={[s.h1, { color: k.foreground }]}>Invoice</Text>
                  <Text style={{ color: k.mutedForeground, fontSize: 14, lineHeight: 20 }}>Order {order.id}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button variant="outline" onPress={handlePrint} style={{ height: 36, gap: 8 }} accessibilityLabel="Print">
                  <Printer size={12} color={k.foreground} />
                </Button>
                <Button onPress={handleDownloadPDF} style={({ pressed }) => [{ height: 36, gap: 8, backgroundColor: pressed ? "#991B1B" : RED }]}>
                  <Download size={12} color={colors.white} />
                  <Text style={{ color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: "500" }}>PDF</Text>
                </Button>
              </View>
            </View>
          </ScrollReveal>

          <ScrollReveal>
            <Card style={t.dark ? { backgroundColor: "#1a1a1a", borderColor: colors.gray[800] } : null}>
              <CardContent style={{ padding: 16 }}>
                {/* Invoice Header */}
                <View style={s.invoiceHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <FileText size={24} color={RED} />
                    <Text style={s.invoiceTitle}>INVOICE</Text>
                  </View>
                  <View style={{ gap: 12 }}>
                    <View>
                      <Text style={s.mutedXs}>{companyName}</Text>
                      <Text style={s.mutedXs}>Food Delivery Platform</Text>
                    </View>
                    <Badge style={{ backgroundColor: RED, borderColor: "transparent", paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start" }} textStyle={{ color: colors.white, fontSize: 14 }}>
                      {String(order.status || "").toUpperCase()}
                    </Badge>
                  </View>
                </View>

                {/* Invoice Details */}
                <View style={{ gap: 16, marginTop: 16 }}>
                  <View>
                    <Text style={[s.h3, { color: strongText }]}>Bill To:</Text>
                    <Text style={[s.xs, { color: bodyText }]}>{order.address?.street}</Text>
                    {!!order.address?.additionalDetails && <Text style={[s.xs, { color: bodyText }]}>{order.address.additionalDetails}</Text>}
                    <Text style={[s.xs, { color: bodyText }]}>
                      {order.address?.city}, {order.address?.state} {order.address?.zipCode}
                    </Text>
                  </View>
                  <View>
                    <Text style={[s.h3, { color: strongText }]}>Invoice Details:</Text>
                    <Text style={[s.xs, { color: bodyText }]}>
                      <Text style={{ fontWeight: "700" }}>Invoice #:</Text> {order.id}
                    </Text>
                    <Text style={[s.xs, { color: bodyText }]}>
                      <Text style={{ fontWeight: "700" }}>Date:</Text> {formatDate(order.createdAt)}
                    </Text>
                    <Text style={[s.xs, { color: bodyText }]}>
                      <Text style={{ fontWeight: "700" }}>Payment:</Text> {order.paymentMethod?.type?.toUpperCase() || "Card"}
                    </Text>
                  </View>
                </View>

                {/* Items Table (phone width: Item + Total columns, qty x price under the name) */}
                <View style={{ marginTop: 16 }}>
                  <Text style={[s.h3, { color: strongText, marginBottom: 12 }]}>Order Items:</Text>
                  <View style={[s.tr, { borderBottomColor: t.dark ? colors.gray[800] : k.border }]}>
                    <Text style={[s.th, { flex: 1, color: t.dark ? colors.gray[200] : k.cardForeground }]}>Item</Text>
                    <Text style={[s.th, { textAlign: "right", color: t.dark ? colors.gray[200] : k.cardForeground }]}>Total</Text>
                  </View>
                  {(order.items || []).map((item, idx) => (
                    <View key={item.id ?? idx} style={[s.tr, { borderBottomColor: t.dark ? colors.gray[800] : k.border, paddingVertical: 8 }]}>
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 }}>
                        <AppImage src={item.image} style={{ width: 32, height: 32, borderRadius: 4 }} contentFit="cover" accessibilityLabel={item.name} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.xs, { fontWeight: "500", color: t.dark ? colors.gray[100] : k.cardForeground }]}>{item.name}</Text>
                          {item.variantName ? <Text style={[s.xs, { color: t.dark ? colors.gray[400] : colors.gray[500] }]}>{item.variantName}</Text> : null}
                          <Text style={[s.xs, { color: k.mutedForeground }]}>
                            Qty: {item.quantity} × ₹{item.price.toFixed(2)}
                          </Text>
                        </View>
                      </View>
                      <Text style={[s.xs, { fontWeight: "500", textAlign: "right", paddingHorizontal: 8, color: t.dark ? colors.gray[100] : k.cardForeground }]}>
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Total Section */}
                <View style={{ marginTop: 16 }}>
                  <TotalRow label="Subtotal:" value={`₹${order.subtotal.toFixed(2)}`} />
                  {order.packagingFee > 0 && <TotalRow label="Packaging Fee:" value={`₹${order.packagingFee.toFixed(2)}`} />}
                  {order.platformFee > 0 && <TotalRow label="Platform Fee:" value={`₹${order.platformFee.toFixed(2)}`} />}
                  <TotalRow label="Delivery Fee:" value={`₹${order.deliveryFee.toFixed(2)}`} />
                  <TotalRow label="GST:" value={`₹${order.tax.toFixed(2)}`} />
                  <TotalRow label="Discount:" value={`₹${Math.abs(order.discount).toFixed(2)}`} color={t.dark ? colors.green[400] : colors.green[600]} />
                  <View style={s.grandTotal}>
                    <Text style={[s.grandText, { color: strongText }]}>Total:</Text>
                    <Text style={[s.grandText, { color: strongText }]}>₹{order.total.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Footer */}
                <View style={[s.footer, { borderTopColor: t.dark ? colors.gray[800] : k.border }]}>
                  <Text style={[s.xs, { textAlign: "center", color: t.dark ? colors.gray[400] : k.mutedForeground }]}>Thank you for your order!</Text>
                  <Text style={[s.xs, { textAlign: "center", marginTop: 4, color: t.dark ? colors.gray[400] : k.mutedForeground }]}>
                    For any queries, please contact our support team.
                  </Text>
                </View>
              </CardContent>
            </Card>
          </ScrollReveal>

          <ScrollReveal>
            <View style={{ gap: 8 }}>
              <Button variant="outline" style={{ width: "100%", height: 40 }} onPress={() => navigate(`/food/user/orders/${orderId}`)}>
                Track Order
              </Button>
              <Button variant="outline" style={{ width: "100%", height: 40 }} onPress={() => navigate("/food/user/orders")}>
                Back to Orders
              </Button>
            </View>
          </ScrollReveal>
        </ScrollView>
      </AnimatedPage>
    </Screen>
  )
}

/** The web's w-8 h-8 border-2 border-[#DC2626] border-t-transparent animate-spin ring. */
function SpinRing() {
  return (
    <Spin>
      <View style={{ width: 32, height: 32, borderRadius: 9999, borderWidth: 2, borderColor: RED, borderTopColor: "transparent" }} />
    </Spin>
  )
}

const useStyles = makeStyles((t) => ({
  spinnerWrap: { marginBottom: 16 },
  backBtn: { width: 32, height: 32, borderRadius: 9999, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 18, lineHeight: 28, fontWeight: "700" },
  h3: { fontWeight: "700", marginBottom: 8, fontSize: 14, lineHeight: 20 },
  xs: { fontSize: 12, lineHeight: 16 },
  mutedXs: { fontSize: 12, lineHeight: 16, color: t.dark ? "#a1a1a1" : "#7b5b4a" },
  // .invoice-header / .grand-total styles exist only in the print CSS on the web
  invoiceHeader: {},
  invoiceTitle: { fontSize: 20, lineHeight: 28, color: RED, fontWeight: "700" },
  tr: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  th: { paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalText: { fontSize: 12, lineHeight: 16 },
  grandTotal: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 8, borderTopWidth: 2, borderTopColor: RED },
  grandText: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  footer: { marginTop: 24, paddingTop: 16, borderTopWidth: 1 },
}))
