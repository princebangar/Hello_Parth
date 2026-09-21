import mongoose from 'mongoose';
import { FoodUser } from './user.model.js';
import { FoodRefreshToken } from '../refreshTokens/refreshToken.model.js';
import { logger } from '../../utils/logger.js';

/**
 * Food and Taxi read/write the same `users` collection (see FoodUser vs
 * modules/taxi/user/models/User.js). These helpers are the single place that
 * soft-deletes / recovers that shared document, so deleting from either app
 * affects the whole account — no admin approval, no per-app split.
 *
 * `active` and `deletion_reason` aren't declared on FoodUser's schema (only
 * on taxi's User schema), so writes here use `strict: false` to make sure
 * they land regardless of which model reads them back.
 */

export async function softDeleteSharedUser(userId, { reason = 'user_delete_request' } = {}) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;

  const updated = await FoodUser.findOneAndUpdate(
    { _id: userId, deletedAt: null },
    {
      $set: {
        deletedAt: new Date(),
        isActive: false,
        active: false,
        deletion_reason: reason,
      },
    },
    { new: true, strict: false },
  );

  if (!updated) return null;

  try {
    await FoodRefreshToken.deleteMany({ userId: String(userId) });
  } catch (err) {
    logger?.warn?.({ err }, '[accountDeletion] Failed to clear food refresh tokens on delete');
  }

  return updated;
}

export async function findDeletedUserByPhone(phone) {
  const normalizedPhone = String(phone || '').trim();
  if (!normalizedPhone) return null;
  return FoodUser.findOne({ phone: normalizedPhone, deletedAt: { $ne: null } }).lean();
}

/** Restores a soft-deleted account exactly as it was left (no data wipe). */
export async function recoverSharedUser(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;

  return FoodUser.findOneAndUpdate(
    { _id: userId, deletedAt: { $ne: null } },
    {
      $set: {
        deletedAt: null,
        isActive: true,
        active: true,
        deletion_reason: '',
      },
    },
    { new: true, strict: false },
  );
}
