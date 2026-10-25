// Web: modules/Food/components/user/AddMoneyModal.jsx — wallet top-up dialog. Same props (open, onOpenChange,
// onSuccess), same API calls and Razorpay flow (@food/utils/razorpay -> the app's payment host).
import React, { useState } from "react"
import { Pressable, View } from "react-native"
import { IndianRupee, Loader2, X } from "lucide-react-native"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Text } from "@/native/ui"
import { Spin } from "@/shared/components/Loader"
import { colors, makeStyles, useTheme } from "@/theme"
import { userAPI } from "@food/api"
import { initRazorpayPayment } from "@food/utils/razorpay"
import { toast } from "@/lib/toast"
import { getCompanyNameAsync } from "@food/utils/businessSettings"

const debugLog = (..._args) => {}
const debugWarn = (..._args) => {}
const debugError = (..._args) => {}

export default function AddMoneyModal({ open, onOpenChange, onSuccess }) {
  const t = useTheme()
  const s = useStyles()
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  const quickAmounts = [100, 250, 500, 1000, 2000, 5000]

  const handleAmountSelect = (selectedAmount) => {
    setAmount(selectedAmount.toString())
  }

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, "")
    if (value === "" || (parseFloat(value) >= 1 && parseFloat(value) <= 50000)) {
      setAmount(value)
    }
  }

  const handleAddMoney = async () => {
    const amountNum = parseFloat(amount)

    if (!amount || isNaN(amountNum) || amountNum < 1) {
      toast.error("Please enter a valid amount (minimum ₹1)")
      return
    }

    if (amountNum > 50000) {
      toast.error("Maximum amount is ₹50,000")
      return
    }

    try {
      setLoading(true)

      debugLog("Creating wallet top-up order for amount:", amountNum)
      const orderResponse = await userAPI.createWalletTopupOrder(amountNum)
      debugLog("Order response:", orderResponse)

      const { razorpay } = orderResponse.data.data

      if (!razorpay || !razorpay.orderId || !razorpay.key) {
        debugError("Invalid Razorpay response:", { razorpay, orderResponse })
        throw new Error("Failed to initialize payment gateway")
      }

      setLoading(false)
      onOpenChange(false)

      await new Promise((resolve) => setTimeout(resolve, 100))

      setProcessing(true)

      let userInfo = {}
      try {
        const userResponse = await userAPI.getProfile()
        userInfo = userResponse?.data?.data?.user || userResponse?.data?.user || {}
      } catch (err) {
        debugWarn("Could not fetch user profile for Razorpay prefill:", err)
      }

      const userPhone = userInfo.phone || ""
      const userEmail = userInfo.email || ""
      const userName = userInfo.name || ""
      const formattedPhone = userPhone.replace(/\D/g, "").slice(-10)
      const companyName = await getCompanyNameAsync()

      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount,
        currency: razorpay.currency || "INR",
        order_id: razorpay.orderId,
        name: companyName,
        description: `Wallet Top-up - ₹${amountNum.toFixed(2)}`,
        prefill: {
          name: userName,
          email: userEmail,
          contact: formattedPhone,
        },
        notes: {
          type: "wallet_topup",
          amount: amountNum.toString(),
        },
        handler: async (response) => {
          try {
            await userAPI.verifyWalletTopupPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              amount: amountNum,
            })

            toast.success(`₹${amountNum} added to wallet successfully!`)
            setAmount("")
            setProcessing(false)
            onOpenChange(false)

            if (onSuccess) {
              onSuccess()
            }
          } catch (error) {
            debugError("Payment verification error:", error)
            toast.error(error?.response?.data?.message || "Payment verification failed. Please contact support.")
            setProcessing(false)
          }
        },
        onError: (error) => {
          debugError("Razorpay payment error:", error)
          toast.error(error?.description || "Payment failed. Please try again.")
          setProcessing(false)
        },
        onClose: () => {
          setProcessing(false)
        },
      })
    } catch (error) {
      debugError("Error creating payment order:", error)

      let errorMessage = "Failed to initialize payment. Please try again."

      if (error?.response?.data) {
        if (error.response.data.message) {
          errorMessage = error.response.data.message
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error
        } else if (typeof error.response.data === "string") {
          errorMessage = error.response.data
        }
      } else if (error?.message) {
        errorMessage = error.message
      }

      toast.error(errorMessage)
      setLoading(false)
      setProcessing(false)
    }
  }

  const handleClose = () => {
    if (!loading && !processing) {
      setAmount("")
      onOpenChange(false)
    }
  }

  const busy = loading || processing
  const addDisabled = !amount || busy || parseFloat(amount) < 1

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent showCloseButton={false} style={s.content}>
        <View style={s.inner}>
          <Pressable
            onPress={handleClose}
            disabled={busy}
            accessibilityLabel="Close add money modal"
            style={({ pressed }) => [s.closeBtn, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }, busy && { opacity: 0.5 }]}
          >
            <X size={20} color={colors.gray[400]} />
          </Pressable>

          <DialogHeader style={{ paddingRight: 40 }}>
            <DialogTitle style={s.title}>Add Money to Wallet</DialogTitle>
            <DialogDescription style={s.desc}>Enter the amount you want to add to your wallet</DialogDescription>
          </DialogHeader>

          <View style={{ gap: 24, paddingTop: 20 }}>
            <View style={{ gap: 8 }}>
              <Text style={s.label}>Enter Amount</Text>
              <View style={{ position: "relative", justifyContent: "center" }}>
                <View style={s.rupeeIcon} pointerEvents="none">
                  <IndianRupee size={20} color={colors.gray[400]} />
                </View>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChangeText={(text) => handleAmountChange({ target: { value: text } })}
                  placeholder="Enter amount"
                  style={s.input}
                  disabled={busy}
                />
              </View>
              <Text style={s.hint}>
                Minimum: {"₹"}1 | Maximum: {"₹"}50,000
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={s.label}>Quick Select</Text>
              <View style={s.grid}>
                {quickAmounts.map((quickAmount) => (
                  <View key={quickAmount} style={s.gridCell}>
                    <Button
                      variant={amount === quickAmount.toString() ? "default" : "outline"}
                      style={{ height: 40 }}
                      onPress={() => handleAmountSelect(quickAmount)}
                      disabled={busy}
                    >
                      {`₹${quickAmount}`}
                    </Button>
                  </View>
                ))}
              </View>
            </View>

            <Button
              onPress={handleAddMoney}
              disabled={addDisabled}
              style={({ pressed }) => [s.addBtn, pressed && { backgroundColor: colors.green[700] }]}
              textStyle={s.addText}
            >
              {busy ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Spin style={{ marginRight: 8 }}>
                    <Loader2 size={16} color={colors.white} />
                  </Spin>
                  <Text style={s.addText}>{loading ? "Processing..." : "Opening Payment Gateway..."}</Text>
                </View>
              ) : (
                `Add ₹${amount || "0"}`
              )}
            </Button>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  )
}

const useStyles = makeStyles((t) => ({
  content: { maxWidth: 352, borderRadius: 24, overflow: "hidden", padding: 0, gap: 0 },
  inner: { position: "relative", paddingHorizontal: 20, paddingBottom: 20, paddingTop: 20 },
  closeBtn: { position: "absolute", right: 16, top: 16, borderRadius: 9999, padding: 8, zIndex: 2 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  desc: { fontSize: 14, lineHeight: 20, color: t.dark ? colors.gray[400] : colors.gray[600] },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: t.dark ? colors.gray[300] : colors.gray[700] },
  rupeeIcon: { position: "absolute", left: 12, zIndex: 1 },
  input: { paddingLeft: 40, height: 48, fontSize: 18, lineHeight: 28 },
  hint: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500] },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, rowGap: 8 },
  gridCell: { width: "33.333%", paddingHorizontal: 4 },
  addBtn: { width: "100%", height: 48, backgroundColor: colors.green[600] },
  addText: { color: colors.white, fontWeight: "600", fontSize: 16, lineHeight: 24 },
}))
