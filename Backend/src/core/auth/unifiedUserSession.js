import jwt from 'jsonwebtoken';
import ms from 'ms';
import { config } from '../../config/env.js';
import { signAccessToken as signFoodAccessToken, signRefreshToken as signFoodRefreshToken } from './token.util.js';
import { FoodRefreshToken } from '../refreshTokens/refreshToken.model.js';
import { logger } from '../../utils/logger.js';

/**
 * Reverse of buildUnifiedUserSession: called from taxi's own login/signup flow
 * so a taxi-native login also produces a food-compatible session (same shared
 * `users` document, same JWT secret). Persists the food refresh token so
 * food's own logout endpoint can revoke it later.
 */
export async function buildFoodAuthForTaxiUser(userDoc) {
  const id = String(userDoc?._id || '');
  const user = typeof userDoc?.toObject === 'function' ? userDoc.toObject() : { ...userDoc };

  const accessToken = signFoodAccessToken({ userId: id, role: 'USER' });
  const refreshToken = signFoodRefreshToken({ userId: id, role: 'USER' });

  const ttlMs = ms(config.jwtRefreshExpiresIn || '7d');

  try {
    await FoodRefreshToken.create({
      userId: id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + ttlMs),
    });
  } catch (err) {
    logger?.warn?.({ err }, '[unifiedUserSession] Failed to persist food refresh token for taxi login');
  }

  return {
    accessToken,
    refreshToken,
    user: {
      _id: id,
      name: user.name || '',
      phone: user.phone || '',
      email: user.email || '',
    },
  };
}

export function buildUnifiedUserSession(userDoc) {
  const id = String(userDoc?._id || '');
  const user = typeof userDoc?.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  const token = jwt.sign(
    { userId: id, role: 'USER' },
    config.jwtAccessSecret,
    {
      subject: id,
      expiresIn: config.jwtAccessExpiresIn,
    },
  );
  const taxiUser = {
    id,
    _id: id,
    name: user.name || '',
    phone: user.phone || '',
    email: user.email || '',
    role: 'user',
  };

  return {
    accessToken: token,
    refreshToken: signFoodRefreshToken({ userId: id, role: 'USER' }),
    taxiAuth: {
      token,
      user: taxiUser,
    },
  };
}
