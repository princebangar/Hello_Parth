import { getLandingSettings, updateLandingSettings } from '../services/landingSettings.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';

export const getAdminLandingSettingsController = async (req, res, next) => {
    try {
        const { zoneId } = req.query;
        const settings = await getLandingSettings(zoneId);
        return sendResponse(res, 200, 'Landing settings fetched successfully', settings);
    } catch (error) {
        next(error);
    }
};

export const updateAdminLandingSettingsController = async (req, res, next) => {
    try {
        const payload = req.body || {};
        if (typeof payload !== 'object') {
            throw new ValidationError('Invalid settings payload');
        }
        const zoneId = payload.zoneId;
        // The fest banner moved to Global admin (User Management > Home Banners); this old endpoint must not touch it.
        delete payload.festBannerImageUrl;
        delete payload.festBannerTopColor;
        const updated = await updateLandingSettings(payload, zoneId);
        return sendResponse(res, 200, 'Landing settings updated successfully', updated);
    } catch (error) {
        next(error);
    }
};

