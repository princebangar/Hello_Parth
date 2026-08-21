import { ApiError } from '../../../../utils/ApiError.js';
import {
  normalizeOtpPhone,
  createOrUpdateOtp,
  verifyOtp,
} from '../../../../core/otp/otp.service.js';
import { User } from '../models/User.js';
import { UserAuthSession } from '../models/UserAuthSession.js';
import { assignPushTokenToEntity } from '../../services/pushTokenService.js';
import { buildUnifiedUserSession } from '../../../../core/auth/unifiedUserSession.js';

/**
 * Legacy taxi user OTP endpoints — now share the same OTP store + rate/attempt
 * limits as food (`core/otp/otp.service.js`). Prefer `/food/auth/user/*` (shared /login).
 */

const VERIFIED_SESSION_TTL_MS = 10 * 60 * 1000;

export const normalizeUserPhone = (value) => normalizeOtpPhone(value);

export const validateUserPhone = (phone) => {
  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, 'A valid 10-digit phone number is required');
  }
};

const getVisibleOtp = (otp) => (process.env.NODE_ENV !== 'production' ? String(otp) : null);

const ensureUserCanLogin = (user) => {
  if (user?.deletedAt || user?.isActive === false || user?.active === false) {
    throw new ApiError(403, 'User account is not active');
  }
};

const isReusableSignupUser = (user) => Boolean(user?.deletedAt);

const toUserPayload = (user) => ({
  id: user._id,
  name: user.name || '',
  phone: user.phone || '',
  email: user.email || '',
  gender: user.gender || '',
  currentRideId: user.currentRideId || null,
});

const createUserSession = (user) => {
  const unified = buildUnifiedUserSession(user);
  return {
    token: unified.taxiAuth.token,
    user: toUserPayload(user),
    foodAuth: {
      accessToken: unified.accessToken,
      refreshToken: unified.refreshToken,
      user: { ...toUserPayload(user), role: 'USER' },
    },
  };
};

const publicOtpSession = (phone, debugOtp = null) => ({
  phone,
  status: 'otp_sent',
  debugOtp,
});

export const startUserOtp = async ({ phone }) => {
  const normalizedPhone = normalizeUserPhone(phone);
  validateUserPhone(normalizedPhone);

  const user = await User.findOne({ phone: normalizedPhone }).lean();

  if (user && !isReusableSignupUser(user)) {
    ensureUserCanLogin(user);
  }

  let otp;
  try {
    otp = await createOrUpdateOtp(normalizedPhone, 'user');
  } catch (err) {
    if (err?.name === 'ValidationError' || err?.statusCode === 400) {
      throw new ApiError(err.statusCode || 400, err.message || 'Unable to send OTP');
    }
    throw err;
  }

  // Keep a short verified-session marker for any legacy taxi signup callers
  await UserAuthSession.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      phone: normalizedPhone,
      otpVerifiedAt: null,
      expiresAt: new Date(Date.now() + VERIFIED_SESSION_TTL_MS),
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  const debugOtp = getVisibleOtp(otp);
  if (debugOtp) {
    console.log(`[userOtpService] OTP for ${normalizedPhone} = ${debugOtp} (shared otp.service)`);
  }

  return {
    message: 'OTP sent successfully',
    exists: Boolean(user && !isReusableSignupUser(user)),
    session: publicOtpSession(normalizedPhone, debugOtp),
  };
};

export const verifyUserOtp = async ({ phone, otp, token, fcmToken, platform }) => {
  const normalizedPhone = normalizeUserPhone(phone);
  validateUserPhone(normalizedPhone);

  const result = await verifyOtp(normalizedPhone, otp, 'user');
  if (!result.valid) {
    const reason = String(result.reason || 'OTP verification failed');
    if (/max attempts/i.test(reason)) {
      throw new ApiError(429, 'Max OTP attempts exceeded');
    }
    if (/expired/i.test(reason)) {
      throw new ApiError(410, 'OTP has expired');
    }
    throw new ApiError(401, reason || 'Invalid OTP');
  }

  const user = await User.findOne({ phone: normalizedPhone });

  if (user) {
    if (isReusableSignupUser(user)) {
      await UserAuthSession.findOneAndUpdate(
        { phone: normalizedPhone },
        {
          phone: normalizedPhone,
          otpVerifiedAt: new Date(),
          expiresAt: new Date(Date.now() + VERIFIED_SESSION_TTL_MS),
        },
        { upsert: true },
      );
      return {
        message: 'OTP verified. Continue signup to restore account.',
        exists: false,
        session: { phone: normalizedPhone, status: 'otp_verified' },
      };
    }

    ensureUserCanLogin(user);

    if (token || fcmToken) {
      await assignPushTokenToEntity({
        entityType: 'user',
        entityId: user._id,
        token: token || fcmToken,
        platform,
        markActive: true,
      });
    }

    await UserAuthSession.deleteOne({ phone: normalizedPhone });
    return {
      message: 'Login successful',
      exists: true,
      ...createUserSession(user),
    };
  }

  await UserAuthSession.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      phone: normalizedPhone,
      otpVerifiedAt: new Date(),
      expiresAt: new Date(Date.now() + VERIFIED_SESSION_TTL_MS),
    },
    { upsert: true },
  );

  return {
    message: 'OTP verified. Continue signup.',
    exists: false,
    session: { phone: normalizedPhone, status: 'otp_verified' },
  };
};

export const requireVerifiedUserSignupSession = async (phone) => {
  const normalizedPhone = normalizeUserPhone(phone);
  validateUserPhone(normalizedPhone);

  const session = await UserAuthSession.findOne({ phone: normalizedPhone });
  if (!session?.otpVerifiedAt) {
    throw new ApiError(401, 'Verify OTP before continuing signup');
  }
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    await UserAuthSession.deleteOne({ _id: session._id });
    throw new ApiError(410, 'OTP session expired');
  }
  return session;
};

export const consumeUserSignupSession = async (sessionOrPhone) => {
  if (!sessionOrPhone) return;
  if (typeof sessionOrPhone === 'object' && sessionOrPhone._id) {
    await UserAuthSession.deleteOne({ _id: sessionOrPhone._id });
    return;
  }
  const normalizedPhone = normalizeUserPhone(sessionOrPhone);
  await UserAuthSession.deleteOne({ phone: normalizedPhone });
};
