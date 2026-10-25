// Web: modules/Taxi/modules/user/pages/profile/Subscriptions.jsx — ride passes: wallet balance, active coverage,
// plans (buy with wallet) and history.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, PackageCheck, Wallet } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors } from '@/theme';
import { userAuthService } from '../../services/authService';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const safeArray = (value) => (Array.isArray(value) ? value : []);

const unwrapResults = (payload) =>
  safeArray(payload?.data?.results || payload?.results || payload?.data);

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const Subscriptions = () => {
  const navigate = useNavigate();
  const P = useUserPalette();
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState('');
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState({
    activeCount: 0,
    availableRideCredits: 0,
    hasUnlimitedPlan: false,
    activePlans: [],
    history: [],
  });
  const [walletBalance, setWalletBalance] = useState(0);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansResponse, subscriptionsResponse, walletResponse] = await Promise.all([
        userAuthService.getSubscriptionPlans(),
        userAuthService.getMySubscriptions(),
        userAuthService.getWallet(),
      ]);

      setPlans(unwrapResults(plansResponse));
      setSummary({
        activeCount: Number(subscriptionsResponse?.data?.activeCount || 0),
        availableRideCredits: Number(subscriptionsResponse?.data?.availableRideCredits || 0),
        hasUnlimitedPlan: Boolean(subscriptionsResponse?.data?.hasUnlimitedPlan),
        activePlans: safeArray(subscriptionsResponse?.data?.activePlans),
        history: safeArray(subscriptionsResponse?.data?.history),
      });
      setWalletBalance(Number(walletResponse?.data?.balance || 0));
    } catch (error) {
      toast.error(error?.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeVehicleIds = useMemo(
    () => new Set(safeArray(summary.activePlans).map((item) => String(item.vehicle_type_id || '')).filter(Boolean)),
    [summary.activePlans],
  );

  const handleBuy = async (planId) => {
    try {
      setBuyingId(planId);
      const response = await userAuthService.buySubscription(planId);
      toast.success(response?.message || 'Subscription purchased');
      await loadData();
    } catch (error) {
      toast.error(error?.message || 'Unable to purchase subscription');
    } finally {
      setBuyingId('');
    }
  };

  if (loading) {
    return (
      <Screen bg={P.bg}>
        <View style={styles.center}>
          <Spin>
            <Loader2 size={32} color={colors.indigo[600]} />
          </Spin>
        </View>
      </Screen>
    );
  }

  const card = [styles.card, USER_SHADOW, { backgroundColor: P.cardBg }];

  return (
    <Screen bg={P.bg} edges={['bottom']}>
      <StatusBarSpacer color={alpha(colors.slate[50], 0.95)} />
      <View style={[styles.header, { backgroundColor: alpha(colors.slate[50], 0.95) }]}>
        <Pressable
          onPress={() => navigate('/taxi/user/profile')}
          style={[styles.back, { borderColor: P.border, backgroundColor: P.cardBg }]}
        >
          <ArrowLeft size={18} color={P.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: P.textPrimary }]}>Subscriptions</Text>
          <Text style={[styles.sub, { color: P.textMuted }]}>Buy ride passes for specific vehicle categories.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 16, marginBottom: 24 }}>
          <View style={card}>
            <Text style={[styles.statLabel, { color: P.textSecondary }]}>WALLET BALANCE</Text>
            <Text style={[styles.statValue, { color: P.textPrimary }]}>{formatCurrency(walletBalance)}</Text>
          </View>
          <View style={card}>
            <Text style={[styles.statLabel, { color: P.textSecondary }]}>ACTIVE PLANS</Text>
            <Text style={[styles.statValue, { color: P.textPrimary }]}>{summary.activeCount}</Text>
          </View>
          <View style={card}>
            <Text style={[styles.statLabel, { color: P.textSecondary }]}>RIDE CREDITS</Text>
            <Text style={[styles.statValue, { color: P.textPrimary }]}>
              {summary.hasUnlimitedPlan ? 'Unlimited' : summary.availableRideCredits}
            </Text>
          </View>
        </View>

        <View style={[styles.coverage, USER_SHADOW, { backgroundColor: P.cardBg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <PackageCheck size={24} color={colors.emerald[300]} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.h2, { color: P.textPrimary }]}>Your Active Coverage</Text>
              {summary.activePlans.length === 0 ? (
                <Text style={[styles.coverageEmpty, { color: P.textSecondary }]}>No active subscription yet. Buy one below to start using included rides.</Text>
              ) : (
                <View style={{ marginTop: 12, gap: 12 }}>
                  {summary.activePlans.map((item) => (
                    <View key={item.id} style={[styles.activeItem, { borderColor: P.border, backgroundColor: alpha('#ffffff', 0.05) }]}>
                      <View style={[styles.rowBetween, { gap: 12 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.itemName, { color: P.textPrimary }]}>{item.name}</Text>
                          <Text style={[styles.itemSub, { color: P.textSecondary }]}>{item.vehicle_type?.name || 'Vehicle plan'}</Text>
                        </View>
                        <View style={styles.leftPill}>
                          <Text style={styles.leftPillText}>
                            {(item.isUnlimited ? 'Unlimited' : `${item.rides_remaining} rides left`).toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={{ gap: 16 }}>
          {plans.map((plan) => {
            const hasSameVehicleActivePlan = activeVehicleIds.has(String(plan.vehicle_type_id || ''));
            const isBuying = buyingId === plan.id;
            const disabled = isBuying || hasSameVehicleActivePlan || walletBalance < Number(plan.amount || 0);

            return (
              <View key={plan.id} style={[styles.plan, USER_SHADOW, { backgroundColor: P.cardBg }]}>
                <View>
                  <View style={styles.planHead}>
                    <Text style={[styles.planName, { color: P.textPrimary }]}>{plan.name}</Text>
                    {hasSameVehicleActivePlan ? (
                      <View style={[styles.activeBadge, { backgroundColor: P.cardSoft }]}>
                        <Text style={styles.activeBadgeText}>ACTIVE ON THIS CATEGORY</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.planDesc, { color: P.textMuted }]}>{plan.description || plan.how_it_works || 'Subscription ride plan'}</Text>
                  <View style={styles.chips}>
                    <View style={[styles.chip, { backgroundColor: P.cardSoft }]}>
                      <Text style={[styles.chipText, { color: P.textSecondary }]}>{plan.vehicle_type?.name || 'Vehicle category'}</Text>
                    </View>
                    <View style={[styles.chip, { backgroundColor: P.cardSoft }]}>
                      <Text style={[styles.chipText, { color: colors.indigo[700] }]}>{plan.duration} days</Text>
                    </View>
                    <View style={[styles.chip, { backgroundColor: P.cardSoft }]}>
                      <Text style={[styles.chipText, { color: colors.amber[700] }]}>
                        {plan.benefit_type === 'unlimited' ? 'Unlimited rides' : `${plan.ride_limit} rides included`}
                      </Text>
                    </View>
                  </View>
                </View>
                <View>
                  <Text style={[styles.price, { color: P.textPrimary }]}>{formatCurrency(plan.amount)}</Text>
                  <Pressable
                    disabled={disabled}
                    onPress={() => handleBuy(plan.id)}
                    style={({ pressed }) => [
                      styles.buy,
                      { backgroundColor: pressed && !disabled ? colors.indigo[700] : colors.indigo[600], opacity: disabled ? 0.5 : 1 },
                    ]}
                  >
                    {isBuying ? (
                      <Spin>
                        <Loader2 size={16} color={P.textPrimary} />
                      </Spin>
                    ) : (
                      <Wallet size={16} color={P.textPrimary} />
                    )}
                    <Text style={[styles.buyText, { color: P.textPrimary }]}>{hasSameVehicleActivePlan ? 'Already active' : 'Buy With Wallet'}</Text>
                  </Pressable>
                  {/* A plan already running on this category needs no top-up message. */}
                  {!hasSameVehicleActivePlan && walletBalance < Number(plan.amount || 0) ? (
                    <Text style={styles.lowBalance}>Not enough wallet balance for this plan.</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {summary.history.length > 0 ? (
          <View style={[styles.plan, USER_SHADOW, { backgroundColor: P.cardBg, marginTop: 32, gap: 0 }]}>
            <Text style={[styles.h2, { color: P.textPrimary }]}>Subscription History</Text>
            <View style={{ marginTop: 16, gap: 12 }}>
              {summary.history.map((item) => (
                <View key={item.id} style={[styles.historyRow, { borderColor: P.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemName, { color: P.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.historySub, { color: P.textMuted }]}>
                      {item.vehicle_type?.name || 'Vehicle plan'} • {item.isUnlimited ? 'Unlimited' : `${item.rides_used}/${item.ride_limit} used`}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {item.status === 'active' ? (
                        <CheckCircle2 size={16} color={colors.emerald[500]} />
                      ) : (
                        <AlertCircle size={16} color={colors.amber[500]} />
                      )}
                      <Text style={[styles.status, { color: P.textSecondary }]}>{String(item.status || '').toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.historySub, { color: P.textMuted, marginTop: 4 }]}>
                      {item.expiresAt ? `Ends ${new Date(item.expiresAt).toLocaleDateString()}` : 'No expiry'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 32, paddingBottom: 12, zIndex: 20 },
  back: { height: 40, width: 40, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  body: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { borderRadius: 24, padding: 20 },
  statLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 2.4 },
  statValue: { marginTop: 8, fontSize: 24, lineHeight: 32, fontWeight: '700' },
  coverage: { marginBottom: 24, borderRadius: 24, padding: 24 },
  h2: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  coverageEmpty: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  activeItem: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  itemName: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  itemSub: { fontSize: 12, lineHeight: 16 },
  leftPill: { borderRadius: 9999, backgroundColor: alpha(colors.emerald[400], 0.15), paddingHorizontal: 12, paddingVertical: 4 },
  leftPillText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.3, color: colors.emerald[200] },
  plan: { borderRadius: 24, padding: 24, gap: 16 },
  planHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  planName: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  activeBadge: { borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.28, color: colors.emerald[700] },
  planDesc: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  chips: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  price: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  buy: { marginTop: 16, alignSelf: 'flex-start', minWidth: 170, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12 },
  buyText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  lowBalance: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.rose[500] },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  historySub: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  status: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.3 },
});

export default Subscriptions;
