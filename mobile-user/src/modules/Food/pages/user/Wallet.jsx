// Web: modules/Food/pages/user/Wallet.jsx — My Wallet (balance, add money, transaction history with filters).
import React, { useState, useMemo, useEffect } from "react"
import { FlatList, Pressable, ScrollView, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { ArrowLeft, IndianRupee, Plus, ArrowDownCircle, ArrowUpCircle, RefreshCw, History, Gift, ChevronRight } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { Screen, Text } from "@/native/ui"
import { alpha, colors, makeStyles, shadow, useTheme } from "@/theme"
import { Button } from "@food/components/ui/button"
import { Card, CardContent } from "@food/components/ui/card"
import AnimatedPage from "@food/components/user/AnimatedPage"
import AddMoneyModal from "@food/components/user/AddMoneyModal"
import { userAPI } from "@food/api"
import { toast } from "@/lib/toast"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { WalletSkeleton } from "@food/components/ui/loading-skeletons"
import useReferralEnabled from "@/shared/hooks/useReferralEnabled"
import { getPageCache, setPageCache, userScopedCacheKey } from "@/shared/utils/pageCache"
import { recallLastKnown, rememberLastKnown } from "@/shared/utils/lastKnown"

const debugError = (..._args) => {}

const TRANSACTION_TYPES = {
  ALL: "all",
  ADDITIONS: "additions",
  DEDUCTIONS: "deductions",
  REFUNDS: "refunds",
}

const FILTERS = [
  { id: TRANSACTION_TYPES.ALL, label: "All Transactions" },
  { id: TRANSACTION_TYPES.ADDITIONS, label: "Additions" },
  { id: TRANSACTION_TYPES.DEDUCTIONS, label: "Deductions" },
  { id: TRANSACTION_TYPES.REFUNDS, label: "Refunds" },
]

export default function Wallet() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const referralEnabled = useReferralEnabled()
  const t = useTheme()
  const s = useStyles()
  const cacheKey = useMemo(() => userScopedCacheKey("food_wallet"), [])
  const cachedWallet = useMemo(() => getPageCache(cacheKey) || recallLastKnown("food:wallet") || null, [cacheKey])
  const [selectedFilter, setSelectedFilter] = useState(TRANSACTION_TYPES.ALL)
  const [wallet, setWallet] = useState(cachedWallet || null)
  const [transactions, setTransactions] = useState(cachedWallet?.transactions || [])
  const [loading, setLoading] = useState(!cachedWallet)
  const [error, setError] = useState(null)
  const [addMoneyModalOpen, setAddMoneyModalOpen] = useState(false)

  const fetchWalletData = async () => {
    try {
      setError(null)

      const response = await userAPI.getWallet()
      const walletData = response?.data?.data?.wallet || response?.data?.wallet

      if (walletData) {
        setWallet(walletData)
        setTransactions(walletData.transactions || [])
        setPageCache(cacheKey, walletData)
        rememberLastKnown("food:wallet", walletData)
      }
    } catch (err) {
      debugError("Error fetching wallet:", err)
      if (!cachedWallet && !getPageCache(cacheKey)) {
        setError(err?.response?.data?.message || "Failed to load wallet")
      }
      toast.error("Failed to load wallet data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWalletData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentBalance = wallet?.balance || 0

  const filteredTransactions = useMemo(() => {
    if (selectedFilter === TRANSACTION_TYPES.ALL) {
      return transactions
    }
    return transactions.filter((transaction) => {
      if (selectedFilter === TRANSACTION_TYPES.ADDITIONS) return transaction.type === "addition"
      if (selectedFilter === TRANSACTION_TYPES.DEDUCTIONS) return transaction.type === "deduction"
      if (selectedFilter === TRANSACTION_TYPES.REFUNDS) return transaction.type === "refund"
      return true
    })
  }, [selectedFilter, transactions])

  const formatAmount = (amount) => {
    const numeric = Number(amount ?? 0)
    const safe = Number.isFinite(numeric) ? numeric : 0
    return `${"₹"}${safe.toLocaleString("en-IN")}`
  }

  const formatDate = (dateString) => {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    const formattedDate = date.toLocaleDateString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit" })
    const formattedTime = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    return `${formattedDate} | ${formattedTime}`
  }

  const typeColor = (type) => {
    switch (type) {
      case "addition":
        return t.dark ? colors.green[400] : colors.green[600]
      case "deduction":
        return t.dark ? colors.red[400] : colors.red[600]
      case "refund":
        return t.dark ? colors.blue[400] : colors.blue[600]
      default:
        return t.dark ? colors.gray[400] : colors.gray[600]
    }
  }

  const getTransactionIcon = (type) => {
    switch (type) {
      case "addition":
        return <ArrowDownCircle size={24} color={typeColor(type)} />
      case "deduction":
        return <ArrowUpCircle size={24} color={typeColor(type)} />
      case "refund":
        return <RefreshCw size={24} color={typeColor(type)} />
      default:
        return null
    }
  }

  const header = (
    <View style={{ gap: 24 }}>
      {/* Balance block */}
      <View style={{ gap: 24 }}>
        <View style={{ gap: 16, alignItems: "center" }}>
          <View style={s.iconWrap}>
            <View style={s.iconShadow} />
            <LinearGradient colors={[colors.red[500], colors.red[600], colors.red[700]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.iconCard}>
              <View style={s.iconInner}>
                <IndianRupee size={40} color={colors.white} strokeWidth={2.5} />
              </View>
            </LinearGradient>
          </View>

          <View style={{ alignItems: "center" }}>
            <Text style={s.walletTitle}>My Wallet</Text>
            <View style={{ marginBottom: 8, alignItems: "center" }}>
              <Text style={s.balanceLabel}>Current Balance</Text>
              <Text style={s.balance}>{formatAmount(currentBalance)}</Text>
            </View>
            <Text style={s.balanceHint}>Add money to enjoy one-tap, seamless payments</Text>
          </View>
        </View>

        <Button
          style={({ pressed }) => [s.addBtn, pressed && { backgroundColor: colors.green[700] }]}
          textStyle={s.addText}
          onPress={() => setAddMoneyModalOpen(true)}
        >
          <Plus size={16} color={colors.white} />
          Add money
        </Button>
      </View>

      {referralEnabled && (
        <Pressable onPress={() => navigate("/food/user/profile/refer-earn")} style={({ pressed }) => [s.refer, pressed && shadow.md]}>
          <View style={s.referIcon}>
            <Gift size={20} color={t.dark ? colors.red[400] : colors.red[600]} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.referTitle}>Refer & Earn</Text>
            <Text style={s.referText}>Invite friends and get money in your wallet</Text>
          </View>
          <ChevronRight size={20} color={colors.gray[400]} />
        </Pressable>
      )}

      <View style={{ gap: 16 }}>
        <Text style={s.historyTitle}>TRANSACTION HISTORY</Text>
        <ScrollView style={{ flexGrow: 0 }} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          {FILTERS.map((filter) => {
            const isSelected = selectedFilter === filter.id
            return (
              <Pressable key={filter.id} onPress={() => setSelectedFilter(filter.id)} style={[s.chip, isSelected ? s.chipOn : s.chipOff]}>
                <Text style={[s.chipText, { color: isSelected ? (t.dark ? colors.green[400] : colors.green[600]) : t.dark ? colors.gray[300] : colors.gray[600] }]}>
                  {filter.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )

  const renderTransaction = ({ item: transaction }) => (
    <Card style={s.txCard}>
      <CardContent style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
            <View style={s.txIcon}>{getTransactionIcon(transaction.type)}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.txDesc} numberOfLines={1}>
                {transaction.description}
              </Text>
              <Text style={s.txDate}>{formatDate(transaction.date || transaction.createdAt)}</Text>
            </View>
          </View>
          <Text style={[s.txAmount, { color: typeColor(transaction.type) }]}>
            {transaction.type === "deduction" ? "-" : "+"}
            {formatAmount(transaction.amount)}
          </Text>
        </View>
      </CardContent>
    </Card>
  )

  return (
    <Screen edges={["top", "bottom"]} bg={t.dark ? "#0a0a0a" : colors.white} statusBarStyle={t.dark ? "light" : "dark"}>
      <AnimatedPage style={{ flex: 1 }}>
        <View style={s.topBar}>
          <Pressable onPress={goBack} style={({ pressed }) => [s.backBtn, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}>
            <ArrowLeft size={20} color={t.dark ? colors.white : colors.gray[700]} />
          </Pressable>
          <Text style={s.topTitle}>My Wallet</Text>
        </View>

        {loading ? (
          <ScrollView contentContainerStyle={s.content}>
            <WalletSkeleton />
          </ScrollView>
        ) : error ? (
          <View style={s.content}>
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          </View>
        ) : (
          <FlatList
            data={filteredTransactions}
            keyExtractor={(item, index) => String(item.id ?? item._id ?? index)}
            renderItem={renderTransaction}
            ListHeaderComponent={header}
            ListHeaderComponentStyle={{ marginBottom: 16 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            contentContainerStyle={s.content}
            ListEmptyComponent={
              <View style={s.empty}>
                <View style={s.emptyIcon}>
                  <History size={32} color={t.dark ? colors.gray[600] : colors.gray[300]} />
                </View>
                <Text style={s.emptyTitle}>No Transaction History</Text>
                <Text style={s.emptyText}>Your transactions will appear here when you add money or make a purchase.</Text>
              </View>
            }
          />
        )}

        <AddMoneyModal open={addMoneyModalOpen} onOpenChange={setAddMoneyModalOpen} onSuccess={fetchWalletData} />
      </AnimatedPage>
    </Screen>
  )
}

const useStyles = makeStyles((t) => ({
  topBar: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100],
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999 },
  topTitle: { fontSize: 18, lineHeight: 28, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  content: { paddingHorizontal: 16, paddingVertical: 24 },
  errorBox: {
    backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[50],
    borderWidth: 1,
    borderColor: t.dark ? colors.red[800] : colors.red[200],
    borderRadius: 10,
    padding: 16,
  },
  errorText: { color: t.dark ? colors.red[400] : colors.red[600], fontSize: 14, lineHeight: 20 },
  iconWrap: { width: 80, height: 80 },
  iconShadow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.red[800],
    borderRadius: 14,
    opacity: 0.25,
    transform: [{ rotate: "-5deg" }, { translateY: 4 }],
  },
  iconCard: {
    width: 80,
    height: 80,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-5deg" }],
    ...shadow.lg,
  },
  iconInner: {
    width: 64,
    height: 64,
    backgroundColor: alpha(colors.white, 0.1),
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
  },
  walletTitle: { fontSize: 20, lineHeight: 28, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900], marginBottom: 8 },
  balanceLabel: { color: t.dark ? colors.gray[400] : colors.gray[500], fontSize: 12, lineHeight: 16, marginBottom: 4 },
  balance: { fontSize: 24, lineHeight: 32, fontWeight: "700", color: t.dark ? colors.white : colors.gray[900] },
  balanceHint: { color: t.dark ? colors.gray[400] : colors.gray[500], fontSize: 12, lineHeight: 16, textAlign: "center", maxWidth: 448 },
  addBtn: { width: "100%", height: 48, backgroundColor: colors.green[600], borderRadius: 14, gap: 8 },
  addText: { color: colors.white, fontWeight: "600", fontSize: 14, lineHeight: 20 },
  refer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[100],
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    padding: 16,
    ...shadow.sm,
  },
  referIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: t.dark ? alpha(colors.red[900], 0.2) : colors.red[50],
    alignItems: "center",
    justifyContent: "center",
  },
  referTitle: { fontWeight: "600", fontSize: 14, lineHeight: 20, color: t.dark ? colors.white : colors.gray[900] },
  referText: { fontSize: 12, lineHeight: 16, color: t.dark ? colors.gray[400] : colors.gray[500] },
  historyTitle: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: t.dark ? colors.gray[500] : colors.gray[400], letterSpacing: 1.2, textTransform: "uppercase" },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: t.dark ? "#1a1a1a" : colors.white },
  chipOn: { borderWidth: 2, borderColor: t.dark ? colors.green[500] : colors.green[600], ...shadow.sm },
  chipOff: { borderWidth: 1, borderColor: t.dark ? colors.gray[800] : colors.gray[200] },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  txCard: {
    paddingVertical: 0,
    gap: 0,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[100],
    ...shadow.sm,
    ...(t.dark ? { backgroundColor: "#1a1a1a" } : null),
  },
  txIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9999,
    backgroundColor: t.dark ? alpha(colors.gray[800], 0.5) : colors.gray[50],
  },
  txDesc: { color: t.dark ? colors.white : colors.gray[900], fontWeight: "600", fontSize: 14, lineHeight: 20, marginBottom: 4 },
  txDate: { color: t.dark ? colors.gray[400] : colors.gray[500], fontSize: 12, lineHeight: 16 },
  txAmount: { fontWeight: "700", fontSize: 18, lineHeight: 28 },
  empty: { paddingVertical: 64, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: t.dark ? "#1a1a1a" : colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : colors.gray[100],
    ...shadow.sm,
  },
  emptyTitle: { color: t.dark ? colors.white : colors.gray[900], fontWeight: "700", fontSize: 16, lineHeight: 24, marginBottom: 8 },
  emptyText: { color: t.dark ? colors.gray[400] : colors.gray[500], fontSize: 12, lineHeight: 19.5, maxWidth: 320, textAlign: "center" },
}))
