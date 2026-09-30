import {
  getPaymentGatewayStatus,
  setPaymentGatewaySwitches,
} from '../../../core/platform/paymentGateways.service.js';

const respond = (res, message, data) => res.status(200).json({ success: true, message, data });

// The admin sees only the switches — nothing about keys or which env variables exist.
const toAdminView = (gateways = []) =>
  gateways.map(({ key, label, enabled, active }) => ({ key, label, enabled, active }));

/** Customization Settings: payment gateway switches for Food + Taxi (keys stay in Backend/.env). */
export async function getCustomizationSettings(_req, res, next) {
  try {
    respond(res, 'Customization settings fetched successfully', {
      paymentGateways: toAdminView(await getPaymentGatewayStatus()),
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
