import { asyncHandler } from '../../../../utils/asyncHandler.js';
import {
    storeImageBuffer,
    deleteStoredAsset,
    extractAssetUrl,
} from '../../../../services/storage.service.js';
import { AdminAppSetting } from '../../admin/models/AdminAppSetting.js';
import { AdminBusinessSetting } from '../../admin/models/AdminBusinessSetting.js';
import { createDefaultAppSettings } from '../../admin/data/defaultAppSettings.js';
import { createDefaultBusinessSettings } from '../../admin/data/defaultBusinessSettings.js';
import { getReferralSettings, getReferralTranslationContent } from '../../admin/services/adminService.js';
import { getPublicActivePaymentGateway } from '../../services/paymentGatewayService.js';

/**
 * Shared upload endpoint for taxi app/web (food-style multipart).
 * Uses the same storage.service as food (sharp → WebP → /var/www/uploads).
 */
export const uploadImage = asyncHandler(async (req, res) => {
    if (!req.file?.buffer) {
        return res.status(400).json({
            success: false,
            message: 'Image file is required (multipart field: image)',
        });
    }

    const folder = String(req.body?.folder || 'general').trim() || 'general';
    const scopedFolder = `taxi/${folder}`;
    const replaceUrl = extractAssetUrl(req.body?.replaceUrl);

    const stored = await storeImageBuffer(req.file.buffer, scopedFolder, {
        mimeType: req.file.mimetype || 'image/jpeg',
        originalName: req.file.originalname,
        replaceUrl,
    });

    const url = stored.url || stored.secure_url;

    return res.json({
        success: true,
        data: {
            url,
            secureUrl: url,
            publicId: stored.public_id || stored.filename || null,
            format: stored.format || 'webp',
        },
    });
});

export const deleteUploadedImage = asyncHandler(async (req, res) => {
    const url = extractAssetUrl(req.body?.url || req.body?.replaceUrl || req.query?.url);
    if (!url) {
        return res.status(400).json({
            success: false,
            message: 'url is required',
        });
    }

    const deleted = await deleteStoredAsset(url);
    return res.json({
        success: true,
        data: { deleted },
    });
});

export const getReferralTranslation = asyncHandler(async (req, res) => {
    const languageCode = String(req.query?.language || req.query?.lang || '').trim().toLowerCase();
    const data = await getReferralTranslationContent(languageCode);

    return res.json({
        success: true,
        data,
    });
});

export const getReferralSettingsContent = asyncHandler(async (req, res) => {
    const type = String(req.query?.type || '').trim().toLowerCase();
    const data = await getReferralSettings(type || undefined);

    return res.json({
        success: true,
        data,
    });
});

export const getPaymentGatewayConfig = asyncHandler(async (_req, res) => {
    const data = await getPublicActivePaymentGateway();

    return res.json({
        success: true,
        data,
    });
});

export const getPublicSettingsBootstrap = asyncHandler(async (_req, res) => {
    const [businessSettings, appSettings, paymentGateway] = await Promise.all([
        AdminBusinessSetting.findOne({ scope: 'default' })
            .select('general customization transport_ride bid_ride')
            .lean(),
        AdminAppSetting.findOne({ scope: 'default' })
            .select('wallet_setting tip_setting country')
            .lean(),
        getPublicActivePaymentGateway(),
    ]);

    const defaultBusinessSettings = createDefaultBusinessSettings();
    const defaultAppSettings = createDefaultAppSettings();

    return res.json({
        success: true,
        data: {
            general: {
                ...(defaultBusinessSettings.general || {}),
                ...(businessSettings?.general || {}),
            },
            customization: {
                ...(defaultBusinessSettings.customization || {}),
                ...(businessSettings?.customization || {}),
            },
            transportRide: {
                ...(defaultBusinessSettings.transport_ride || {}),
                ...(businessSettings?.transport_ride || {}),
            },
            bidRide: {
                ...(defaultBusinessSettings.bid_ride || {}),
                ...(businessSettings?.bid_ride || {}),
            },
            wallet: {
                ...(defaultAppSettings.wallet_setting || {}),
                ...(appSettings?.wallet_setting || {}),
            },
            tip: {
                ...(defaultAppSettings.tip_setting || {}),
                ...(appSettings?.tip_setting || {}),
            },
            country: {
                ...(defaultAppSettings.country || {}),
                ...(appSettings?.country || {}),
            },
            paymentGateway: paymentGateway?.activeGateway || null,
        },
    });
});

export const acknowledgePhonePeCallback = asyncHandler(async (_req, res) => {
    return res.json({
        success: true,
        message: 'Callback received',
    });
});
