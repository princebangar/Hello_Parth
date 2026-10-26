// Web: modules/Taxi/modules/driver/pages/DriverIncentives.jsx — the "Milestone" tab: bonus earned, progress (trips,
// streak, weekly trips, rating), milestone quests and bonus boosters with Claim, and the referral offer card.
// Native: a kept-alive bottom-bar tab (driverTabPages.js). The web loaded the progress on every visit (mount); here it is
// loaded again each time the tab becomes active, showing the last progress meanwhile. Pull-to-refresh reloads it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Flame,
  Gift,
  Star,
  Trophy,
  Zap,
} from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Text, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import TaxiPageSkeleton from '@/shared/components/TaxiPageSkeleton';
import { alpha, colors, shadow } from '@/theme';
import { claimDriverIncentiveReward, getCurrentDriver, getDriverIncentives, readDriverCache, writeDriverCache } from '../services/registrationService';
import { useDriverTabActive } from '../driverTabPages';

const unwrap = (response) => response?.data?.data || response?.data || response || {};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const progressPercent = (current, target) => {
  const safeTarget = Math.max(1, Number(target || 0));
  const safeCurrent = Math.max(0, Number(current || 0));
  return Math.min(100, Math.round((safeCurrent / safeTarget) * 100));
};

const DriverIncentives = () => {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const tabActive = useDriverTabActive();
  // The progress from the last visit shows at once; the fresh one replaces it.
  const [data, setData] = useState(() => readDriverCache('incentives')?.data ?? null);
  const [loading, setLoading] = useState(() => !readDriverCache('incentives'));
  // the load error is kept like the web, which never shows it
  const [, setError] = useState('');
  const [claimingKey, setClaimingKey] = useState('');
  const [driverRating, setDriverRating] = useState(() => readDriverCache('incentives')?.rating ?? 0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchIncentives = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');

    try {
      const [incentiveResponse, driverResponse] = await Promise.all([
        getDriverIncentives(),
        getCurrentDriver(),
      ]);
      const nextData = unwrap(incentiveResponse);
      const nextRating = Number(unwrap(driverResponse)?.rating || 0);
      setData(nextData);
      setDriverRating(nextRating);
      writeDriverCache('incentives', { data: nextData, rating: nextRating });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load milestone progress');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // web: on mount (every visit) -> here: every time the tab is shown
  useEffect(() => {
    if (!tabActive) return;
    fetchIncentives({ quiet: Boolean(readDriverCache('incentives')) });
  }, [tabActive, fetchIncentives]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchIncentives({ quiet: true });
    } finally {
      setRefreshing(false);
    }
  };

  const handleClaim = async (rewardType, rewardKey) => {
    setClaimingKey(`${rewardType}:${rewardKey}`);
    try {
      const response = await claimDriverIncentiveReward({ rewardType, rewardKey });
      const claimedReward = unwrap(response)?.claimedReward;
      toast.success(`${formatCurrency(claimedReward?.amount || 0)} added to your pocket!`);
      await fetchIncentives({ quiet: true });
    } catch (requestError) {
      toast.error(requestError?.response?.data?.message || requestError?.message || 'Unable to claim reward');
    } finally {
      setClaimingKey('');
    }
  };

  const summary = useMemo(() => data?.summary || {}, [data]);
  const milestones = useMemo(() => data?.milestones || [], [data]);
  const features = useMemo(() => data?.features || [], [data]);
  const claimedRewards = useMemo(() => data?.claimedRewards || [], [data]);
  const bonusEarnings = useMemo(
    () => claimedRewards.reduce((sum, item) => sum + Number(item?.amount || 0), 0),
    [claimedRewards],
  );

  const referralOffer = data?.referral && data.referral.enabled && Number(data.referral.amount) > 0 ? Number(data.referral.amount) : 0;
  const enabledFeatures = features.filter((feature) => feature.enabled);

  if (loading) {
    // same skeleton as any screen still loading (no spinner page in between)
    return (
      <View style={[styles.skeletonPage, { paddingTop: insets.top }]}>
        {tabActive ? <StatusBar style="dark" /> : null}
        <TaxiPageSkeleton variant="page" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {tabActive ? <StatusBar style="dark" /> : null}
      {/* Clean Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => navigate('/taxi/driver/profile')} accessibilityLabel="Back to account" style={styles.back}>
              <ArrowLeft size={18} color={colors.gray[900]} />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>Incentives</Text>
              <Text style={styles.headerSub}>Driver Earnings</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.bonusLabel}>Bonus earned</Text>
            <Text style={styles.bonusValue}>{formatCurrency(bonusEarnings)}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.main, { paddingBottom: bottomSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.blue[600]]} tintColor={colors.blue[600]} />}
      >
        {/* Level Overview */}
        <LinearGradient colors={['#12348c', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.level}>
          <View style={styles.levelHead}>
            <View style={styles.levelIcon}>
              <Trophy size={24} color={colors.white} />
            </View>
            <View>
              <Text style={styles.levelTitle}>Your progress</Text>
              <Text style={styles.levelSub}>{Number(summary.totalTrips || 0)} trips completed</Text>
            </View>
          </View>

          <View style={styles.levelStats}>
            <View style={styles.levelStat}>
              <Text style={styles.levelStatLabel}>Streak</Text>
              <View style={styles.levelStatRow}>
                <Text style={styles.levelStatValue}>{summary.streakDays || 0}</Text>
                <Flame size={14} color={colors.orange[500]} />
              </View>
            </View>
            <View style={styles.levelStat}>
              <Text style={styles.levelStatLabel}>Weekly</Text>
              <Text style={styles.levelStatValue}>{summary.currentWeekTrips || 0} trips</Text>
            </View>
            <View style={styles.levelStat}>
              <Text style={styles.levelStatLabel}>Rating</Text>
              <View style={styles.levelStatRow}>
                <Text style={styles.levelStatValue}>{driverRating > 0 ? driverRating.toFixed(1) : 'New'}</Text>
                <Star size={14} color={colors.yellow[500]} fill={colors.yellow[500]} />
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Active Quests */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Quests</Text>

          <View style={styles.cardList}>
            {milestones.length === 0 && enabledFeatures.length === 0 ? (
              <View style={styles.emptyBox}>
                <Trophy size={26} color={colors.gray[300]} />
                <Text style={styles.emptyTitle}>No milestone offers right now</Text>
                <Text style={styles.emptyText}>When the admin starts a milestone or bonus programme it shows up here with your progress and a Claim button.</Text>
              </View>
            ) : null}
            {milestones.map((milestone) => {
              const claimKey = `milestone:${milestone.id}`;
              const progress = progressPercent(milestone.progress?.qualifyingDays, milestone.progress?.targetDays);
              const canClaim = milestone.isEligible && !milestone.isClaimed;

              return (
                <View key={milestone.id} style={styles.questCard}>
                  <View style={styles.questHead}>
                    <View style={styles.questTitles}>
                      <Text style={styles.questName}>{milestone.name}</Text>
                      <Text style={styles.questSub}>{milestone.required_weeks} weeks consistency challenge</Text>
                    </View>
                    <View style={styles.alignEnd}>
                      <Text style={styles.rewardLabel}>Reward</Text>
                      <Text style={styles.rewardValue}>{formatCurrency(milestone.payout_amount)}</Text>
                    </View>
                  </View>

                  <View style={styles.progressBlock}>
                    <View style={styles.progressRow}>
                      <Text style={styles.progressText}>Progress</Text>
                      <Text style={styles.progressText}>{milestone.progress?.qualifyingDays || 0}/{milestone.progress?.targetDays || 0} days</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    </View>
                  </View>

                  <Pressable
                    disabled={!canClaim || claimingKey === claimKey}
                    onPress={() => handleClaim('milestone', milestone.id)}
                    style={[
                      styles.claimBtn,
                      canClaim ? styles.claimOn : milestone.isClaimed ? styles.claimDone : styles.claimIdle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.claimText,
                        { color: canClaim ? colors.white : milestone.isClaimed ? colors.green[600] : colors.gray[400] },
                      ]}
                    >
                      {claimingKey === claimKey ? 'Claiming...' : milestone.isClaimed ? 'Reward claimed' : canClaim ? `Claim ${formatCurrency(milestone.payout_amount)}` : 'In progress'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>

        {/* Referral Card */}
        {referralOffer > 0 ? (
          <View style={styles.referral}>
            <View style={styles.referralInner}>
              <Text style={styles.referralTitle}>Invite a Friend</Text>
              <Text style={styles.referralText}>Earn {formatCurrency(referralOffer)} for every new driver you refer.</Text>
              <Pressable onPress={() => navigate('/taxi/driver/referral')} style={styles.inviteBtn}>
                <Text style={styles.inviteText}>Invite Now</Text>
              </Pressable>
            </View>
            <View pointerEvents="none" style={styles.referralGift}>
              <Gift size={120} color={alpha(colors.white, 0.1)} />
            </View>
          </View>
        ) : null}

        {/* Boosters */}
        <View style={[styles.section, styles.boosters]}>
          <Text style={styles.sectionTitle}>Bonus Boosters</Text>
          <View style={styles.cardList}>
            {enabledFeatures.map((feature) => {
              const claimKey = `feature:${feature.key}`;
              const canClaim = feature.isEligible && !feature.isClaimed;

              return (
                <View key={feature.key} style={styles.boosterCard}>
                  <View style={styles.boosterLeft}>
                    <View style={styles.boosterIcon}>
                      {String(feature.key || '').includes('streak') ? <Flame size={18} color={colors.gray[400]} /> : <Zap size={18} color={colors.gray[400]} />}
                    </View>
                    <View style={styles.boosterText}>
                      <Text style={styles.boosterLabel}>{feature.label}</Text>
                      <Text style={styles.boosterSub}>{feature.currentValue}/{feature.targetValue} {feature.unit}</Text>
                    </View>
                  </View>
                  <View style={styles.boosterRight}>
                    <Text style={styles.boosterReward}>{formatCurrency(feature.reward_amount)}</Text>
                    <Pressable
                      disabled={!canClaim || claimingKey === claimKey}
                      onPress={() => handleClaim('feature', feature.key)}
                      style={[styles.boosterBtn, canClaim && { backgroundColor: colors.blue[600] }]}
                    >
                      <Text style={[styles.boosterBtnText, { color: canClaim ? colors.white : colors.gray[300] }]}>
                        {feature.isClaimed ? 'Done' : 'Claim'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default DriverIncentives;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex1: { flex: 1 },
  skeletonPage: { flex: 1, backgroundColor: '#f1f4f9' },
  header: {
    zIndex: 30,
    backgroundColor: alpha(colors.white, 0.9),
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gray[100],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  headerSub: { fontSize: 11, lineHeight: 16, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.gray[400] },
  headerRight: { alignItems: 'flex-end' },
  bonusLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.gray[400] },
  bonusValue: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.blue[700] },
  main: { paddingHorizontal: 24, paddingTop: 24, gap: 32 },
  level: { borderRadius: 24, padding: 24 },
  levelHead: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  levelIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: alpha(colors.white, 0.15), alignItems: 'center', justifyContent: 'center' },
  levelTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.white },
  levelSub: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: alpha(colors.white, 0.7) },
  levelStats: { marginTop: 24, flexDirection: 'row', gap: 16, paddingTop: 24, borderTopWidth: 1, borderTopColor: alpha(colors.white, 0.2) },
  levelStat: { flex: 1 },
  levelStatLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: alpha(colors.white, 0.6), marginBottom: 4 },
  levelStatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  levelStatValue: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.white },
  section: { gap: 16 },
  boosters: { paddingBottom: 40 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4, color: colors.gray[900] },
  cardList: { gap: 12 },
  emptyBox: {
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray[200],
    backgroundColor: colors.gray[50],
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyTitle: { marginTop: 12, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[700], textAlign: 'center' },
  emptyText: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.gray[500], textAlign: 'center' },
  questCard: { borderWidth: 1, borderColor: colors.gray[100], borderRadius: 24, padding: 20 },
  questHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 8 },
  questTitles: { flexShrink: 1, gap: 4 },
  questName: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  questSub: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  alignEnd: { alignItems: 'flex-end' },
  rewardLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.gray[400] },
  rewardValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.green[600] },
  progressBlock: { gap: 6, marginBottom: 20 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400] },
  progressTrack: { height: 6, width: '100%', backgroundColor: colors.gray[100], borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.blue[600], borderRadius: 999 },
  claimBtn: { width: '100%', paddingVertical: 12, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  claimOn: {
    backgroundColor: colors.blue[600],
    elevation: 6,
    shadowColor: colors.blue[200],
    shadowOpacity: 1,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  claimDone: { backgroundColor: colors.green[50], borderColor: colors.green[100] },
  claimIdle: { backgroundColor: colors.gray[50], borderColor: colors.gray[100] },
  claimText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  referral: { backgroundColor: colors.blue[600], borderRadius: 24, padding: 24, overflow: 'hidden' },
  referralInner: { zIndex: 10, alignItems: 'flex-start' },
  referralTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.white, marginBottom: 8 },
  referralText: { fontSize: 14, lineHeight: 20, color: alpha(colors.white, 0.8), marginBottom: 24 },
  inviteBtn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.white, borderRadius: 16 },
  inviteText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, color: colors.blue[700] },
  referralGift: { position: 'absolute', right: -16, bottom: -16 },
  boosterCard: { borderWidth: 1, borderColor: colors.gray[100], borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boosterLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1 },
  boosterIcon: { width: 40, height: 40, borderRadius: 16, backgroundColor: colors.gray[50], alignItems: 'center', justifyContent: 'center' },
  boosterText: { flexShrink: 1 },
  boosterLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[900] },
  boosterSub: { fontSize: 10, lineHeight: 14, fontWeight: '500', color: colors.gray[400] },
  boosterRight: { alignItems: 'flex-end', gap: 8 },
  boosterReward: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.black },
  boosterBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 14 },
  boosterBtnText: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
});
