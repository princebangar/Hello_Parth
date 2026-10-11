import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Flame,
  Gift,
  Loader2,
  Star,
  Trophy,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import TaxiPageSkeleton from '@/shared/components/TaxiPageSkeleton';
import { claimDriverIncentiveReward, getCurrentDriver, getDriverIncentives, readDriverCache, writeDriverCache } from '../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response || {};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const progressPercent = (current, target) => {
  const safeTarget = Math.max(1, Number(target || 0));
  const safeCurrent = Math.max(0, Number(current || 0));
  return Math.min(100, Math.round((safeCurrent / safeTarget) * 100));
};

const DriverIncentives = () => {
  const navigate = useNavigate();
  // The progress from the last visit shows at once; the fresh one replaces it.
  const [data, setData] = useState(() => readDriverCache('incentives')?.data ?? null);
  const [loading, setLoading] = useState(() => !readDriverCache('incentives'));
  const [error, setError] = useState('');
  const [claimingKey, setClaimingKey] = useState('');
  const [driverRating, setDriverRating] = useState(() => readDriverCache('incentives')?.rating ?? 0);

  const fetchIncentives = async ({ quiet = false } = {}) => {
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
  };

  useEffect(() => {
    fetchIncentives({ quiet: Boolean(readDriverCache('incentives')) });
  }, []);

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

  if (loading) {
    // same skeleton as any screen still loading (no spinner page in between)
    return <TaxiPageSkeleton variant="page" />;
  }

  return (
    <div className="min-h-screen bg-white font-sans pb-32">
      {/* Clean Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md px-6 pt-4 pb-5 border-b border-gray-100">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/taxi/driver/profile')}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm"
              aria-label="Back to account"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Incentives</h1>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Driver Earnings</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bonus earned</p>
            <p className="text-lg font-bold text-blue-700">{formatCurrency(bonusEarnings)}</p>
          </div>
        </div>
      </header>

      <main className="px-6 pt-6 space-y-8">
        {/* Level Overview */}
        <section className="bg-gradient-to-br from-[#12348c] to-[#3b82f6] rounded-3xl p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <Trophy size={24} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Your progress</h2>
              <p className="text-sm font-medium text-white/70">{Number(summary.totalTrips || 0)} trips completed</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-white/20 [&_p]:!text-white [&_.text-gray-400]:!text-white/60">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Streak</p>
              <p className="text-base font-bold text-gray-900 flex items-center gap-1">
                {summary.streakDays || 0} <Flame size={14} className="text-orange-500" />
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Weekly</p>
              <p className="text-base font-bold text-gray-900">{summary.currentWeekTrips || 0} trips</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rating</p>
              <p className="text-base font-bold text-gray-900 flex items-center gap-1">
                {driverRating > 0 ? driverRating.toFixed(1) : 'New'} <Star size={14} className="text-yellow-500 fill-yellow-500" />
              </p>
            </div>
          </div>
        </section>

        {/* Active Quests */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Active Quests</h3>
          
          <div className="space-y-3">
            {milestones.length === 0 && features.filter((feature) => feature.enabled).length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center">
                <Trophy size={26} className="mx-auto text-gray-300" />
                <p className="mt-3 text-sm font-bold text-gray-700">No milestone offers right now</p>
                <p className="mt-1 text-xs font-medium text-gray-500">When the admin starts a milestone or bonus programme it shows up here with your progress and a Claim button.</p>
              </div>
            ) : null}
            {milestones.map((milestone) => {
              const claimKey = `milestone:${milestone.id}`;
              const progress = progressPercent(milestone.progress?.qualifyingDays, milestone.progress?.targetDays);
              const canClaim = milestone.isEligible && !milestone.isClaimed;

              return (
                <div key={milestone.id} className="border border-gray-100 rounded-3xl p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      <h4 className="font-bold text-gray-900">{milestone.name}</h4>
                      <p className="text-xs text-gray-500">{milestone.required_weeks} weeks consistency challenge</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reward</p>
                      <p className="text-sm font-bold text-green-600">{formatCurrency(milestone.payout_amount)}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 mb-5">
                    <div className="flex justify-between text-[10px] font-bold text-gray-400">
                      <span>Progress</span>
                      <span>{milestone.progress?.qualifyingDays || 0}/{milestone.progress?.targetDays || 0} days</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <button
                    disabled={!canClaim || claimingKey === claimKey}
                    onClick={() => handleClaim('milestone', milestone.id)}
                    className={`w-full py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${
                      canClaim 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                        : milestone.isClaimed 
                        ? 'bg-green-50 text-green-600 border border-green-100' 
                        : 'bg-gray-50 text-gray-400 border border-gray-100'
                    }`}
                  >
                    {claimingKey === claimKey ? 'Claiming...' : milestone.isClaimed ? 'Reward claimed' : canClaim ? `Claim ${formatCurrency(milestone.payout_amount)}` : 'In progress'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Referral Card */}
        {referralOffer > 0 ? (
        <section className="bg-blue-600 rounded-3xl p-6 text-white overflow-hidden relative">
          <div className="relative z-10">
            <h3 className="text-lg font-bold mb-2">Invite a Friend</h3>
            <p className="text-sm text-white/80 mb-6">Earn {formatCurrency(referralOffer)} for every new driver you refer.</p>
            <button
              onClick={() => navigate('/taxi/driver/referral')}
              className="px-6 py-3 bg-white text-blue-700 rounded-2xl text-xs font-bold uppercase tracking-widest"
            >
              Invite Now
            </button>
          </div>
          <Gift className="absolute -right-4 -bottom-4 text-white/10" size={120} />
        </section>
        ) : null}

        {/* Boosters */}
        <section className="space-y-4 pb-10">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Bonus Boosters</h3>
          <div className="grid grid-cols-1 gap-3">
            {features.filter(f => f.enabled).map((feature) => {
              const claimKey = `feature:${feature.key}`;
              const progress = progressPercent(feature.currentValue, feature.targetValue);
              const canClaim = feature.isEligible && !feature.isClaimed;

              return (
                <div key={feature.key} className="border border-gray-100 rounded-3xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400">
                      {feature.key.includes('streak') ? <Flame size={18} /> : <Zap size={18} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{feature.label}</h4>
                      <p className="text-[10px] font-medium text-gray-400">{feature.currentValue}/{feature.targetValue} {feature.unit}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <p className="text-sm font-bold text-black">{formatCurrency(feature.reward_amount)}</p>
                    <button
                      disabled={!canClaim || claimingKey === claimKey}
                      onClick={() => handleClaim('feature', feature.key)}
                      className={`px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest ${
                        canClaim ? 'bg-blue-600 text-white' : 'text-gray-300'
                      }`}
                    >
                      {feature.isClaimed ? 'Done' : 'Claim'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

    </div>
  );
};

export default DriverIncentives;
