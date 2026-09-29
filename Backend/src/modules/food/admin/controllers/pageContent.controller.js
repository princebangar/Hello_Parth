import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import {
    getPublicPageByKey,
    getAdminPageByKey,
    upsertLegalPage,
    upsertAboutPage
} from '../../../global/admin/globalPageContent.service.js';

// Terms/Privacy/Support (User, Restaurant, Delivery, Captain) moved to the Global admin — this controller
// keeps only the Food-specific pages. Public reads for ALL keys still go through getPublicPageController
// below (unauthenticated, used by every login screen regardless of which admin manages the content).
const FOOD_ONLY_LEGAL_KEYS = ['refund', 'shipping', 'cancellation'];

const parseKeyFromParam = (req) => String(req.params?.key || '').trim().toLowerCase();

export const getPublicPageController = async (req, res, next) => {
    try {
        const key = parseKeyFromParam(req);
        const result = await getPublicPageByKey(key);
        return sendResponse(res, 200, 'Page fetched successfully', result.data);
    } catch (error) {
        next(error);
    }
};

export const getAdminPageController = async (req, res, next) => {
    try {
        const key = parseKeyFromParam(req);
        const result = await getAdminPageByKey(key);
        return sendResponse(res, 200, 'Page fetched successfully', result.data);
    } catch (error) {
        next(error);
    }
};

export const upsertAdminPageController = async (req, res, next) => {
    try {
        const key = parseKeyFromParam(req);
        const updatedBy = req.user?.userId || null;

        if (key === 'about') {
            const result = await upsertAboutPage(req.body ?? {}, updatedBy);
            return sendResponse(res, 200, 'Page updated successfully', result.data);
        }
        if (FOOD_ONLY_LEGAL_KEYS.includes(key)) {
            const result = await upsertLegalPage(key, req.body ?? {}, updatedBy);
            return sendResponse(res, 200, 'Page updated successfully', result.data);
        }
        throw new ValidationError('Invalid page key');
    } catch (error) {
        next(error);
    }
};
