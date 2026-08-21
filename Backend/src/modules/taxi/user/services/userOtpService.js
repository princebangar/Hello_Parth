import crypto from 'node:crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { config } from '../../../../config/env.js';
import { UserAuthSession } from '../models/UserAuthSession.js';
import { User } from '../models/User.js';
import { sendOtpSms, normalizeOtpPhone, getOtpTtlMs, resolveOtpForPhone } from '../../../../core/otp/otp.service.js';
import { assignPushTokenToEntity } from '../../services/pushTokenService.js';
import { buildUnifiedUserSession } from '../../../../core/auth/unifiedUserSession.js';

const VERIFIED_SESSION_TTL_MS = 10 * 60 * 1000;

export const normalizeUserPhone = (value) => normalizeOtpPhone(value);

export const validateUserPhone = (phone) => {
  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, 'A valid 10-digit phone number is required');
  }
};

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
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

const getOtpSession = async (phone) => {
  const normalizedPhone = normalizeUserPhone(phone);
  const session = await UserAuthSession.findOne({ phone: normalizedPhone }).select('+otpHash');

  if (!session) {
    throw new ApiError(404, 'OTP session not found');
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    await UserAuthSession.deleteOne({ _id: session._id });
    throw new ApiError(410, 'OTP session expired');
  }

  return session;
};

const publicOtpSession = (session, debugOtp = null) => ({
  phone: session.phone,
  status: session.otpVerifiedAt ? 'otp_verified' : 'otp_sent',
  debugOtp,
});

export const startUserOtp = async ({ phone }) => {
  const normalizedPhone = normalizeUserPhone(phone);
  validateUserPhone(normalizedPhone);

  const user = await User.findOne({ phone: normalizedPhone }).lean();

  if (user && !isReusableSignupUser(user)) {
    ensureUserCanLogin(user);
  }

  const existingSession = await UserAuthSession.findOne({ phone: normalizedPhone });
  const windowMs = (config.otpRateWindow || 600) * 1000;
  const now = Date.now();
  if (existingSession?.lastOtpRequestedAt) {
    const elapsed = now - new Date(existingSession.lastOtpRequestedAt).getTime();
    if (elapsed < windowMs) {
      const count = Number(existingSession.otpRequestCount || 0);
      if (count >= (config.otpRateLimit || 3)) {
        throw new ApiError(
          429,
          `Too many OTP requests. Please try again after ${Math.ceil(windowMs / 60000)} minutes.`,
        );
      }
    }
  }

  const { otp, isStatic, reason } = resolveOtpForPhone(normalizedPhone);
  const ttlMs = getOtpTtlMs();
  const requestCount =
    existingSession?.lastOtpRequestedAt &&
    now - new Date(existingSession.lastOtpRequestedAt).getTime() < windowMs
      ? Number(existingSession.otpRequestCount || 0) + 1
      : 1;

  const session = await UserAuthSession.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      phone: normalizedPhone,
      otpHash: hashOtp(otp),
      otpExpiresAt: new Date(now + ttlMs),
      otpVerifiedAt: null,
      otpAttempts: 0,
      otpRequestCount: requestCount,
      lastOtpRequestedAt: new Date(now),
      expiresAt: new Date(now + ttlMs),
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  );

  const smsDispatch = isStatic
    ? { mode: 'static', message: `Static OTP (${reason})` }
    : await sendOtpSms({
        phone: normalizedPhone,
        otp,
        purpose: 'user OTP',
      });
  const debugOtp = getVisibleOtp(otp);

  if (debugOtp) {
    console.log(`[userOtpService] OTP for ${normalizedPhone} = ${debugOtp} (${smsDispatch.mode})`);
  }

  return {
    message: smsDispatch.mode === 'live' ? 'OTP sent successfully' : 'OTP generated successfully',
    exists: Boolean(user && !isReusableSignupUser(user)),
    session: publicOtpSession(session, debugOtp),
  };
};

export const verifyUserOtp = async ({ phone, otp, token, fcmToken, platform }) => {
  const session = await getOtpSession(phone);
  const normalizedOtp = String(otp || '').trim();

  if (!/^\d{4}$/.test(normalizedOtp)) {
    throw new ApiError(400, 'A valid 4-digit OTP is required');
  }

  if (!session.otpExpiresAt || new Date(session.otpExpiresAt).getTime() < Date.now()) {
    await UserAuthSession.deleteOne({ _id: session._id });
    throw new ApiError(410, 'OTP has expired');
  }

  const attempts = Number(session.otpAttempts || 0) + 1;
  session.otpAttempts = attempts;
  if (attempts > (config.otpMaxAttempts || 4)) {
    await session.save();
    throw new ApiError(429, 'Max OTP attempts exceeded');
  }

  if (session.otpHash !== hashOtp(normalizedOtp)) {
    await session.save();
    throw new ApiError(401, 'Invalid OTP');
  }

  const user = await User.findOne({ phone: session.phone });

  if (user) {
    if (isReusableSignupUser(user)) {
      session.otpVerifiedAt = new Date();
      session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
      await session.save();

      return {
        exists: false,
        phone: session.phone,
        session: publicOtpSession(session),
      };
    }

    ensureUserCanLogin(user);
    const incomingToken = String(fcmToken || token || '').trim();
    if (incomingToken) {
      assignPushTokenToEntity(user, {
        token: incomingToken,
        platform: platform || 'web',
      });
      await user.save();
    }
    await UserAuthSession.deleteOne({ _id: session._id });
    return {
      exists: true,
      ...createUserSession(user),
    };
  }

  session.otpVerifiedAt = new Date();
  session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
  await session.save();

  return {
    exists: false,
    phone: session.phone,
    session: publicOtpSession(session),
  };
};

export const requireVerifiedUserSignupSession = async (phone) => {
  const session = await getOtpSession(phone);

  if (!session.otpVerifiedAt) {
    throw new ApiError(400, 'Verify OTP before signup');
  }

  return session;
};

export const consumeUserSignupSession = (session) => UserAuthSession.deleteOne({ _id: session._id });
