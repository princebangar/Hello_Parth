import { ApiError } from '../../../utils/ApiError.js';
import {
  getPaymentGatewayCredentials,
  getPaymentGatewayStatus,
} from '../../../core/platform/paymentGateways.service.js';

/**
 * Taxi view of the platform payment gateways. Keys come from Backend/.env and the on/off switches from
 * Global admin > Customization Settings — Taxi admin no longer stores or edits either.
 * Taxi slugs (razor_pay / phone_pay) are kept because the apps and stored payments already use them.
 */
const TAXI_TO_PLATFORM = {
  razor_pay: 'razorpay',
  phone_pay: 'phonepe',
};

export const getActivePaymentGateway = async () => {
  const status = await getPaymentGatewayStatus();

  // Razorpay first: rides, pooling and the driver QR only run on Razorpay; PhonePe is a wallet top-up fallback.
  for (const [slug, platformKey] of Object.entries(TAXI_TO_PLATFORM)) {
    const gateway = status.find((item) => item.key === platformKey);
    if (gateway?.active) {
      return { slug, label: gateway.label, environment: gateway.environment };
    }
  }

  return null;
};

export const getPublicActivePaymentGateway = async () => {
  const activeGateway = await getActivePaymentGateway();

  if (!activeGateway) {
    return {
      activeGateway: null,
    };
  }

  return {
    activeGateway: {
      slug: activeGateway.slug,
      label: activeGateway.label,
      supportsWalletTopUp: true,
      walletTopUpMode: activeGateway.slug === 'razor_pay' ? 'razorpay_checkout' : 'phonepe_redirect',
    },
  };
};

/** `{ forNewPayment: true }` where a payment starts (also checks the Global on/off switch). */
export const resolveConfiguredGatewayCredentials = async (gatewayKey, options = {}) => {
  const platformKey = TAXI_TO_PLATFORM[gatewayKey];
  if (!platformKey) {
    throw new ApiError(400, 'Unsupported payment gateway');
  }
  return getPaymentGatewayCredentials(platformKey, options);
};
