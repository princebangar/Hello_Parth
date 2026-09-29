import { sendResponse } from '../../../utils/response.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { getAdminPageByKey, upsertLegalPage } from './globalPageContent.service.js';

// Terms/Privacy/Support for User, Restaurant, Delivery and Captain (driver) — the shared, cross-vertical
// content the Global admin owns. About/Refund/Shipping/Cancellation stay on the Food admin.
const ALLOWED_KEYS = [
    'terms', 'terms_user', 'terms_restaurant', 'terms_delivery', 'terms_driver',
    'privacy', 'privacy_user', 'privacy_restaurant', 'privacy_delivery', 'privacy_driver',
    'support_user', 'support_restaurant', 'support_delivery', 'support_driver'
];

const parseKeyFromParam = (req) => String(req.params?.key || '').trim().toLowerCase();

export const getPageController = async (req, res, next) => {
    try {
        const key = parseKeyFromParam(req);
        if (!ALLOWED_KEYS.includes(key)) {
            throw new ValidationError('Invalid page key');
        }
        const result = await getAdminPageByKey(key);
        return sendResponse(res, 200, 'Page fetched successfully', result.data);
    } catch (error) {
        next(error);
    }
};

export const upsertPageController = async (req, res, next) => {
    try {
        const key = parseKeyFromParam(req);
        if (!ALLOWED_KEYS.includes(key)) {
            throw new ValidationError('Invalid page key');
        }
        const updatedBy = req.adminAccount?._id || req.user?.userId || null;
        const result = await upsertLegalPage(key, req.body ?? {}, updatedBy);
        return sendResponse(res, 200, 'Page updated successfully', result.data);
    } catch (error) {
        next(error);
    }
};
