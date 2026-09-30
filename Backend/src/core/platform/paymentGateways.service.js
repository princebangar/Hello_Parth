import { ApiError } from '../../utils/ApiError.js';
import { PlatformSetting } from './platformSetting.model.js';

/**
 * Payment gateways for the whole app (Food + Taxi).
 *  - Keys come only from Backend/.env (never stored in the DB or shown in an admin panel).
 *  - On/off switches come from Global admin > Customization Settings (`platform_settings`).
 */

const readEnv = (name) => String(process.env[name] || '').trim();
const looksLikePlaceholder = (value) => /demo|your[-_]|xxxx/i.test(value);

const GATEWAYS = {
  razorpay: {
    label: 'Razorpay',
    envKeys: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
    readCredentials: () => {
      const keyId = readEnv('RAZORPAY_KEY_ID');
      const keySecret = readEnv('RAZORPAY_KEY_SECRET');
      return { keyId, keySecret, environment: keyId.startsWith('rzp_live_') ? 'live' : 'test' };
    },
  },
  phonepe: {
    label: 'PhonePe',
    envKeys: ['PHONEPE_CLIENT_ID', 'PHONEPE_CLIENT_SECRET'],
    readCredentials: () => {
      const clientId = readEnv('PHONEPE_CLIENT_ID');
      const clientSecret = readEnv('PHONEPE_CLIENT_SECRET');
      const clientVersion = readEnv('PHONEPE_CLIENT_VERSION') || '1';
      const environment = readEnv('PHONEPE_ENV').toLowerCase() === 'production' ? 'production' : 'test';
      return {
        clientId,
        clientSecret,
        clientVersion,
        // Older PhonePe call sites still read the merchant/salt names.
        merchantId: clientId,
        saltKey: clientSecret,
        saltIndex: clientVersion,
        environment,
      };
    },
  },
};

export const PAYMENT_GATEWAY_KEYS = Object.keys(GATEWAYS);

const isConfiguredInEnv = (gatewayKey) =>
  GATEWAYS[gatewayKey].envKeys.every((name) => {
    const value = readEnv(name);
    return Boolean(value) && !looksLikePlaceholder(value);
  });

const ensurePlatformSettings = async () => {
  const existing = await PlatformSetting.findOne({ scope: 'default' });
  if (existing) return existing;
  try {
    return await PlatformSetting.create({ scope: 'default' });
  } catch (error) {
    // Two first requests racing on the unique scope — the other one won.
    if (error?.code === 11000) return PlatformSetting.findOne({ scope: 'default' });
    throw error;
  }
};

const readSwitches = async () => {
  const settings = await ensurePlatformSettings();
  const stored = settings?.payment_gateways || {};
  return Object.fromEntries(
    PAYMENT_GATEWAY_KEYS.map((key) => [key, stored?.[key]?.enabled === true]),
  );
};

/** State of every gateway: its switch, whether .env has its keys, and whether it can take payments now. */
export const getPaymentGatewayStatus = async () => {
  const switches = await readSwitches();
  return PAYMENT_GATEWAY_KEYS.map((key) => {
    const configured = isConfiguredInEnv(key);
    return {
      key,
      label: GATEWAYS[key].label,
      enabled: switches[key],
      configured,
      active: switches[key] && configured,
      environment: configured ? GATEWAYS[key].readCredentials().environment : null,
      envKeys: GATEWAYS[key].envKeys,
    };
  });
};

export const isPaymentGatewayActive = async (gatewayKey) => {
  const status = await getPaymentGatewayStatus();
  return Boolean(status.find((gateway) => gateway.key === gatewayKey)?.active);
};

/** Global admin switch. A gateway can only be turned on once its keys are in .env. */
export const setPaymentGatewaySwitches = async (payload = {}, updatedBy = null) => {
  const updates = {};
  for (const key of PAYMENT_GATEWAY_KEYS) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== 'boolean') {
      throw new ApiError(400, `${key} must be true or false`);
    }
    if (payload[key] && !isConfiguredInEnv(key)) {
      // Which env keys are missing is a developer concern; the admin only learns it cannot be switched on yet.
      throw new ApiError(400, `${GATEWAYS[key].label} can't be turned on yet — it is not set up on the server.`);
    }
    updates[`payment_gateways.${key}.enabled`] = payload[key];
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, `Nothing to update. Allowed: ${PAYMENT_GATEWAY_KEYS.join(', ')}`);
  }

  await ensurePlatformSettings();
  await PlatformSetting.updateOne({ scope: 'default' }, { $set: { ...updates, updatedBy } });
  return getPaymentGatewayStatus();
};

/**
 * Gateway keys from .env. Pass `forNewPayment` where a checkout / QR / order is about to start: that also
 * honours the Global switch. Verifying, refunding or polling a payment that already started never checks the
 * switch, so turning a gateway off cannot strand money that was already taken.
 */
export const getPaymentGatewayCredentials = async (gatewayKey, { forNewPayment = false } = {}) => {
  const gateway = GATEWAYS[gatewayKey];
  if (!gateway) {
    throw new ApiError(400, 'Unsupported payment gateway');
  }

  if (forNewPayment) {
    const switches = await readSwitches();
    if (!switches[gatewayKey]) {
      throw new ApiError(403, `${gateway.label} payments are turned off right now`);
    }
  }
  if (!isConfiguredInEnv(gatewayKey)) {
    throw new ApiError(503, `${gateway.label} is not configured on the server (${gateway.envKeys.join(', ')})`);
  }

  return gateway.readCredentials();
};
