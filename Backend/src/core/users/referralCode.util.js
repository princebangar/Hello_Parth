import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { FoodUser } from './user.model.js';

/**
 * One referral code per customer, shared by Food and Taxi (both apps use the same `users` document).
 *
 * Codes are 8 characters from an alphabet without look-alikes (no 0/O, 1/I), e.g. "K7M3PQ9X".
 * Older accounts carry their raw database id as the code (24 hex characters); those are replaced the next
 * time the code is read, and the old id keeps working as a way to find the referrer so links already shared
 * are not broken.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const LEGACY_ID_CODE = /^[0-9a-f]{24}$/i;

export const generateReferralCode = () => {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return code;
};

/** True for "no code yet" and for the old database-id style code. */
export const needsFreshReferralCode = (code) => {
    const value = String(code ?? '').trim();
    return !value || LEGACY_ID_CODE.test(value);
};

/**
 * The user's referral code, creating (or replacing an old database-id code) when needed.
 * Safe to call concurrently: the write only lands while the account still has no proper code.
 */
export const ensureUserReferralCode = async (userId, currentCode) => {
    if (!needsFreshReferralCode(currentCode)) {
        return String(currentCode).trim();
    }

    const id = String(userId || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return '';
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = generateReferralCode();
        if (await FoodUser.exists({ referralCode: candidate })) {
            continue;
        }

        const result = await FoodUser.updateOne(
            {
                _id: id,
                $or: [
                    { referralCode: { $exists: false } },
                    { referralCode: null },
                    { referralCode: '' },
                    { referralCode: { $regex: LEGACY_ID_CODE } },
                ],
            },
            { $set: { referralCode: candidate } },
        );

        if (result.modifiedCount > 0) {
            return candidate;
        }
        break; // someone else set a proper code first - read it back below
    }

    const saved = await FoodUser.findById(id).select('referralCode').lean();
    return needsFreshReferralCode(saved?.referralCode) ? '' : String(saved.referralCode).trim();
};

/** Referrer's user id for a code typed or shared by a friend, or null. Understands old database-id codes too. */
export const findUserIdByReferralCode = async (rawCode) => {
    const code = String(rawCode ?? '').trim();
    if (!code) return null;

    const upper = code.toUpperCase();
    let doc = await FoodUser.findOne({ referralCode: upper }).select('_id').lean();

    if (!doc && LEGACY_ID_CODE.test(code)) {
        doc = await FoodUser.findOne({ referralCode: code }).select('_id').lean()
            || await FoodUser.findById(code).select('_id').lean();
    }

    return doc?._id ? String(doc._id) : null;
};
