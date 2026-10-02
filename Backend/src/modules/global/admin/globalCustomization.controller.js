import {
  getPaymentGatewayStatus,
  setPaymentGatewaySwitches,
} from '../../../core/platform/paymentGateways.service.js';
import { isReferralEnabled, setReferralEnabled } from '../../../core/platform/referralSwitch.service.js';
import { ApiError } from '../../../utils/ApiError.js';

const respond = (res, message, data) => res.status(200).json({ success: true, message, data });

// The admin sees only the switches — nothing about keys or which env variables exist.
const toAdminView = (gateways = []) =>
  gateways.map(({ key, label, enabled, active }) => ({ key, label, enabled, active }));

/** Customization Settings: payment gateway switches + referral switch for Food and Taxi (keys stay in Backend/.env). */
export async function getCustomizationSettings(_req, res, next) {
  try {
    const [gateways, referralEnabled] = await Promise.all([getPaymentGatewayStatus(), isReferralEnabled()]);
    respond(res, 'Customization settings fetched successfully', {
      paymentGateways: toAdminView(gateways),
      referral: { enabled: referralEnabled },
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePaymentGateways(req, res, next) {
  try {
    const paymentGateways = toAdminView(await setPaymentGatewaySwitches(req.body || {}, req.adminAccount?._id || null));
    respond(res, 'Payment gateways updated', { paymentGateways });
  } catch (error) {
    next(error);
  }
}

export async function updateReferral(req, res, next) {
  try {
    if (typeof req.body?.enabled !== 'boolean') {
      throw new ApiError(400, 'enabled must be true or false');
    }
    const enabled = await setReferralEnabled(req.body.enabled, req.adminAccount?._id || null);
    respond(res, `Referral system turned ${enabled ? 'on' : 'off'}`, { referral: { enabled } });
  } catch (error) {
    next(error);
  }
}
