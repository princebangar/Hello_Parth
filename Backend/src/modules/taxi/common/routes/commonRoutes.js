import { Router } from 'express';
import * as commonController from '../controllers/commonController.js';

import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { getPublicRideTracking } from '../../user/controllers/rideShareController.js';

export const commonRouter = Router();

// Public live tracking page of a shared ride (secret link, no login).
commonRouter.get('/common/track/:token', asyncHandler(getPublicRideTracking));

// Universal image upload endpoint
commonRouter.post('/common/upload/image', commonController.uploadImage);
commonRouter.get('/common/referrals/translation', commonController.getReferralTranslation);
commonRouter.get('/common/referrals/settings', commonController.getReferralSettingsContent);
commonRouter.get('/common/payment-gateway', commonController.getPaymentGatewayConfig);
commonRouter.post('/common/payment-gateway/phonepe/callback', commonController.acknowledgePhonePeCallback);
commonRouter.get('/common/recharge-api/callback', commonController.acknowledgeRechargeApiCallback);
commonRouter.post('/common/recharge-api/callback', commonController.acknowledgeRechargeApiCallback);
