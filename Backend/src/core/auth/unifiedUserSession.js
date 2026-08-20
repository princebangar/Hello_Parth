import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { signRefreshToken as signFoodRefreshToken } from './token.util.js';

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
