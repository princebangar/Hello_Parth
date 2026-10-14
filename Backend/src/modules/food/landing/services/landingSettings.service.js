import { FoodLandingSettings } from '../models/landingSettings.model.js';
import { deleteStoredAsset } from '../../../../services/storage.service.js';

export const getLandingSettings = async (zoneId = null) => {
    let query = zoneId ? { zoneId } : { zoneId: null };
    let doc = await FoodLandingSettings.findOne(query).lean();
    if (!doc) {
        doc = (await FoodLandingSettings.create(query)).toObject();
    }
    return doc;
};

/** Saves the settings and also reports what happened to a banner file that was replaced or removed. */
export const updateLandingSettingsDetailed = async (payload, zoneId = null) => {
    let query = zoneId ? { zoneId } : { zoneId: null };
    const oldDoc = await FoodLandingSettings.findOne(query).lean();

    const doc = await FoodLandingSettings.findOneAndUpdate(query, payload, {
        new: true,
        upsert: true
    }).lean();

    // Drop the previous banner file when the URL was cleared or replaced.
    let removedAsset = null;
    if (oldDoc && oldDoc.festBannerImageUrl && oldDoc.festBannerImageUrl !== doc.festBannerImageUrl) {
        removedAsset = { url: oldDoc.festBannerImageUrl, deleted: await deleteStoredAsset(oldDoc.festBannerImageUrl) };
    }

    return { doc, removedAsset };
};

export const updateLandingSettings = async (payload, zoneId = null) => (await updateLandingSettingsDetailed(payload, zoneId)).doc;

