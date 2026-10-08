import mongoose from 'mongoose';
import { User } from '../../modules/taxi/user/models/User.js';
import { FoodReferralLog } from '../../modules/food/admin/models/referralLog.model.js';
import { FoodUserWallet } from '../../modules/food/user/models/userWallet.model.js';
import { getGlobalUserReferralProgram } from '../platform/userReferralProgram.service.js';
import { isReferralEnabled } from '../platform/referralSwitch.service.js';
import { ensureUserReferralCode } from './referralCode.util.js';

const maskPhone = (value = '') => {
  const raw = String(value || '');
  return raw ? `${raw.slice(0, Math.min(3, raw.length))}${'*'.repeat(Math.max(raw.length - 5, 0))}${raw.slice(-2)}` : '';
};

/**
 * Everything the rider's Refer & Earn screen (Taxi and Food) shows: the code, how many friends joined, what was earned,
 * the reward rule and each friend with the state of the reward ("credited" now / "pending" until the friend finishes the
 * rides the Global admin asked for). Reward rule = Global admin > Referral Management > User Referral Settings.
 */
export const getUserReferralOverview = async (userId) => {
  const oid = new mongoose.Types.ObjectId(String(userId));
  const [me, program, enabled, friends, logs, wallet] = await Promise.all([
    User.findById(oid).select('referralCode referralCount').lean(),
    getGlobalUserReferralProgram(),
    isReferralEnabled(),
    User.find({ referredBy: oid })
      .select('name phone createdAt referralRewardGrantedAt referredRideCompletionCount')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    FoodReferralLog.find({ referrerId: oid, role: 'USER', status: 'credited' }).select('refereeId rewardAmount').lean(),
    FoodUserWallet.collection.findOne({ userId: oid }, { projection: { referralEarnings: 1, transactions: 1 } }),
  ]);

  const loggedAmount = new Map(logs.map((log) => [String(log.refereeId), Number(log.rewardAmount) || 0]));

  // instant rewards are counted in wallet.referralEarnings; ride-based rewards are wallet credits with a "user-referral:" key
  const rideBasedEarnings = (wallet?.transactions || [])
    .filter((item) => item?.kind === 'credit' && /^user-referral:/.test(String(item?.referenceKey || '')) && /:referrer$/.test(String(item.referenceKey)))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalEarnings = Math.round(((Number(wallet?.referralEarnings) || 0) + rideBasedEarnings) * 100) / 100;

  const needsRides = program.usable && !program.isInstant;

  return {
    enabled,
    referralCode: await ensureUserReferralCode(oid, me?.referralCode),
    referralCount: Number(me?.referralCount) || friends.length,
    totalEarnings,
    reward: {
      amount: program.usable ? program.amount : 0,
      type: program.type,
      newUserAlsoGets: program.usable && (program.paysNewUser || program.type === 'conditional_referrer_new'),
      ridesNeeded: needsRides ? Math.max(1, program.rideCount || 1) : 0,
    },
    friends: friends.map((friend) => {
      const logged = loggedAmount.get(String(friend._id));
      const credited = logged !== undefined || (needsRides && Boolean(friend.referralRewardGrantedAt));
      return {
        id: String(friend._id),
        name: String(friend.name || '').trim() || 'Friend',
        phone: maskPhone(friend.phone),
        joinedAt: friend.createdAt || null,
        status: credited ? 'credited' : needsRides ? 'pending' : 'credited',
        amount: credited ? (logged ?? program.amount) : 0,
        ridesDone: needsRides ? Number(friend.referredRideCompletionCount) || 0 : null,
        ridesNeeded: needsRides ? Math.max(1, program.rideCount || 1) : null,
      };
    }),
  };
};
