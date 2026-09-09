import { ApiError } from '../../../utils/ApiError.js';

const MOBILE_PLATFORMS = new Set(['android', 'ios', 'mobile']);
const WEB_PLATFORMS = new Set(['web', 'browser', 'pwa']);

export const normalizePushPlatform = (platform) => {
  const normalized = String(platform || '').trim().toLowerCase();

  if (WEB_PLATFORMS.has(normalized)) {
    return 'web';
  }

  if (MOBILE_PLATFORMS.has(normalized)) {
    return 'mobile';
  }

  throw new ApiError(400, 'platform must be web, android, ios, or mobile');
};

export const normalizePushToken = (token) => {
  const normalized = String(token || '').trim();

  if (!normalized) {
    throw new ApiError(400, 'token is required');
  }

  if (normalized.length < 20) {
    throw new ApiError(400, 'token looks invalid');
  }

  return normalized;
};

/** Drop accidental JWTs / junk that were mixed into FCM arrays on shared users. */
const isLikelyFcmToken = (token = '') => {
  const value = String(token || '').trim();
  if (!value || value.length < 20) return false;
  if (value.startsWith('eyJ')) return false;
  return true;
};

const toTokenList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(isLikelyFcmToken);
  }

  const single = String(value || '').trim();
  return isLikelyFcmToken(single) ? [single] : [];
};

const pathLooksLikeArray = (entity, fieldName) => {
  const schemaPath = entity?.schema?.paths?.[fieldName];
  if (!schemaPath) {
    return Array.isArray(entity?.[fieldName]);
  }

  return schemaPath.instance === 'Array' || schemaPath.$isMongooseArray === true;
};

const upsertTokenOnEntity = (entity, fieldName, token) => {
  const existing = toTokenList(entity?.[fieldName]);
  const next = [...existing.filter((item) => item !== token), token];
  const schemaInstance = entity?.schema?.paths?.[fieldName]?.instance;
  const useArray =
    pathLooksLikeArray(entity, fieldName) ||
    Array.isArray(entity?.[fieldName]) ||
    schemaInstance === 'Mixed';

  if (useArray) {
    entity[fieldName] = next;
    return;
  }

  // Drivers / owners keep a single latest scalar token.
  entity[fieldName] = token;
};

export const getPushTokenField = (platform) =>
  normalizePushPlatform(platform) === 'web' ? 'fcmTokenWeb' : 'fcmTokenMobile';

export const assignPushTokenToEntity = (entity, { token, platform }) => {
  const normalizedToken = normalizePushToken(token);
  const normalizedPlatform = normalizePushPlatform(platform);
  const fieldName = getPushTokenField(normalizedPlatform);

  upsertTokenOnEntity(entity, fieldName, normalizedToken);

  // Shared Food user docs also use `fcmTokens` for web push.
  if (normalizedPlatform === 'web' && entity?.schema?.paths?.fcmTokens) {
    upsertTokenOnEntity(entity, 'fcmTokens', normalizedToken);
  }

  return {
    token: normalizedToken,
    platform: normalizedPlatform,
    fieldName,
  };
};

export const listEntityPushTokens = (entity = {}, role = 'unknown') => {
  const mobileTokens = toTokenList(entity.fcmTokenMobile);
  const webTokens = [
    ...toTokenList(entity.fcmTokenWeb),
    ...toTokenList(entity.fcmTokens),
  ].filter((token, index, all) => all.indexOf(token) === index);

  // Prefer latest mobile token to avoid double notifications on hybrid WebView devices.
  if (mobileTokens.length) {
    return [{
      role,
      field: 'fcmTokenMobile',
      platform: 'mobile',
      token: mobileTokens[mobileTokens.length - 1],
    }];
  }

  if (webTokens.length) {
    return [{
      role,
      field: entity.fcmTokenWeb ? 'fcmTokenWeb' : 'fcmTokens',
      platform: 'web',
      token: webTokens[webTokens.length - 1],
    }];
  }

  return [];
};
