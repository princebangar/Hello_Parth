import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { partnerTypeCondition } from '../../utils/partnerScope.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import { FoodDiningCategory } from '../models/diningCategory.model.js';
import { FoodDiningRestaurant } from '../models/diningRestaurant.model.js';
import { FoodDiningRequest } from '../models/diningRequest.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { deleteReplacedAssets, deleteStoredAssets } from '../../../../services/storage.service.js';

const slugify = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

const zoneToPolygon = (zoneDoc) => {
    const coords = Array.isArray(zoneDoc?.coordinates) ? zoneDoc.coordinates : [];
    if (coords.length < 3) return null;
    const ring = coords
        .map((c) => [Number(c.longitude), Number(c.latitude)])
        .filter((pair) => pair.every((n) => Number.isFinite(n)));
    if (ring.length < 3) return null;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    return { type: 'Polygon', coordinates: [ring] };
};

const buildRestaurantZoneCondition = async (zoneIdValue) => {
    const zoneOr = [{ zoneId: new mongoose.Types.ObjectId(zoneIdValue) }];
    try {
        const zoneDoc = await FoodZone.findById(zoneIdValue).select('isActive coordinates location').lean();
        if (zoneDoc?.isActive) {
            const polygon = zoneToPolygon(zoneDoc);
            if (polygon) {
                zoneOr.push({ location: { $geoWithin: { $geometry: polygon } } });
            }
        }
    } catch {
        // Fall back to zoneId match only.
    }
    return { $or: zoneOr };
};

const toObjectIdArray = (values) =>
    Array.from(
        new Set(
            (Array.isArray(values) ? values : [values])
                .map((value) => String(value || '').trim())
                .filter((value) => mongoose.Types.ObjectId.isValid(value))
        )
    ).map((value) => new mongoose.Types.ObjectId(value));

async function syncRestaurantDiningSettings(restaurantId, diningDoc) {
    const primaryCategory = diningDoc?.primaryCategoryId
        ? await FoodDiningCategory.findById(diningDoc.primaryCategoryId).select('slug').lean()
        : null;

    await FoodRestaurant.findByIdAndUpdate(
        restaurantId,
        {
            $set: {
                diningSettings: {
                    isEnabled: Boolean(diningDoc?.isEnabled),
                    maxGuests: Math.max(1, Number(diningDoc?.maxGuests) || 6),
                    diningType: Array.isArray(diningDoc?.diningType) ? diningDoc.diningType : (primaryCategory?.slug ? [primaryCategory.slug] : [])
                }
            }
        },
        { new: false }
    );
}

async function syncCategoryRestaurantLinks(restaurantId, categoryIds) {
    await FoodDiningCategory.updateMany(
        { restaurantIds: restaurantId, _id: { $nin: categoryIds } },
        { $pull: { restaurantIds: restaurantId } }
    );

    if (categoryIds.length > 0) {
        await FoodDiningCategory.updateMany(
            { _id: { $in: categoryIds } },
            { $addToSet: { restaurantIds: restaurantId } }
        );
    }
}

function mapCategory(doc) {
    return {
        _id: doc._id,
        name: doc.name,
        slug: doc.slug,
        imageUrl: doc.imageUrl || '',
        isActive: doc.isActive !== false,
        sortOrder: doc.sortOrder || 0,
        restaurantCount: Array.isArray(doc.restaurantIds) ? doc.restaurantIds.length : 0,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
    };
}

function getRestaurantZone(restaurant) {
    return (
        restaurant?.location?.area ||
        restaurant?.location?.city ||
        restaurant?.area ||
        restaurant?.city ||
        'N/A'
    );
}

function getRestaurantImage(restaurant) {
    const coverImage = Array.isArray(restaurant?.coverImages)
        ? restaurant.coverImages
            .map((image) => (typeof image === 'string' ? image : image?.url || ''))
            .find(Boolean)
        : '';
    if (coverImage) return coverImage;

    const menuImage = Array.isArray(restaurant?.menuImages)
        ? restaurant.menuImages
            .map((image) => (typeof image === 'string' ? image : image?.url || ''))
            .find(Boolean)
        : '';
    if (menuImage) return menuImage;

    const value = restaurant?.profileImage;
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value?.url || '';
}

function mapDiningRestaurant(restaurant, diningDoc, categoriesById) {
    const categoryIds = (diningDoc?.categoryIds || []).map((id) => String(id));
    const categories = categoryIds
        .map((id) => categoriesById.get(id))
        .filter(Boolean)
        .map((category) => ({
            _id: category._id,
            name: category.name,
            slug: category.slug,
            imageUrl: category.imageUrl || ''
        }));

    const primaryCategoryId = diningDoc?.primaryCategoryId ? String(diningDoc.primaryCategoryId) : '';
    const primaryCategory = categories.find((category) => String(category._id) === primaryCategoryId) || categories[0] || null;

    return {
        _id: restaurant._id,
        id: restaurant._id,
        name: restaurant.restaurantName || restaurant.name || 'N/A',
        restaurantName: restaurant.restaurantName || restaurant.name || 'N/A',
        ownerName: restaurant.ownerName || 'N/A',
        ownerPhone: restaurant.ownerPhone || restaurant.phone || 'N/A',
        pureVegRestaurant: diningDoc?.pureVegRestaurant === true || restaurant?.pureVegRestaurant === true,
        zone: getRestaurantZone(restaurant),
        city: restaurant?.location?.city || restaurant?.city || '',
        status: restaurant.status,
        isActive: restaurant.status === 'approved',
        rating: Number(restaurant.rating || 0),
        logo: getRestaurantImage(restaurant),
        categories,
        categoryIds,
        primaryCategoryId: primaryCategory?._id || null,
        diningSettings: {
            isEnabled: Boolean(diningDoc?.isEnabled),
            maxGuests: Math.max(1, Number(diningDoc?.maxGuests) || 6),
            pureVegRestaurant: diningDoc?.pureVegRestaurant === true || restaurant?.pureVegRestaurant === true,
            diningType: primaryCategory?.slug || restaurant?.diningSettings?.diningType || ''
        }
    };
}

export async function listDiningCategoriesAdmin() {
    const categories = await FoodDiningCategory.find({})
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean();
    return { categories: categories.map(mapCategory) };
}

export async function createDiningCategory(body = {}) {
    const name = String(body.name || '').trim();
    if (!name) {
        throw new ValidationError('Category name is required');
    }

    const slug = slugify(body.slug || name);
    if (!slug) {
        throw new ValidationError('Category slug is required');
    }

    const existing = await FoodDiningCategory.findOne({ slug }).lean();
    if (existing) {
        throw new ValidationError('Dining category already exists');
    }

    const created = await FoodDiningCategory.create({
        name,
        slug,
        imageUrl: String(body.imageUrl || '').trim(),
        isActive: body.isActive !== false,
        sortOrder: Number(body.sortOrder) || 0
    });

    return mapCategory(created.toObject());
}

export async function updateDiningCategory(id, body = {}) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const doc = await FoodDiningCategory.findById(id);
    if (!doc) return null;

    if (body.name !== undefined) {
        doc.name = String(body.name || '').trim();
    }
    if (body.slug !== undefined || body.name !== undefined) {
        const nextSlug = slugify(body.slug || doc.name);
        const conflict = await FoodDiningCategory.findOne({ slug: nextSlug, _id: { $ne: doc._id } }).lean();
        if (conflict) {
            throw new ValidationError('Dining category slug already exists');
        }
        doc.slug = nextSlug;
    }
    if (body.imageUrl !== undefined) {
        const nextUrl = String(body.imageUrl || '').trim();
        await deleteReplacedAssets(doc.imageUrl, nextUrl);
        doc.imageUrl = nextUrl;
    }
    if (body.isActive !== undefined) {
        doc.isActive = body.isActive !== false;
    }
    if (body.sortOrder !== undefined) {
        doc.sortOrder = Number(body.sortOrder) || 0;
    }

    await doc.save();

    const linkedDiningDocs = await FoodDiningRestaurant.find({ categoryIds: doc._id }).select('_id restaurantId').lean();
    await Promise.all(linkedDiningDocs.map(async (item) => {
        await syncRestaurantDiningSettings(item.restaurantId, await FoodDiningRestaurant.findById(item._id).lean());
    }));

    return mapCategory(doc.toObject());
}

export async function deleteDiningCategory(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const category = await FoodDiningCategory.findByIdAndDelete(id).lean();
    if (!category) return null;
    await deleteStoredAssets(category.imageUrl);

    const categoryId = new mongoose.Types.ObjectId(id);
    const diningDocs = await FoodDiningRestaurant.find({ categoryIds: categoryId });

    for (const doc of diningDocs) {
        doc.categoryIds = (doc.categoryIds || []).filter((value) => String(value) !== id);
        if (doc.primaryCategoryId && String(doc.primaryCategoryId) === id) {
            doc.primaryCategoryId = doc.categoryIds[0] || null;
        }
        if (typeof doc.pureVegRestaurant !== 'boolean') {
            const sourceRestaurant = await FoodRestaurant.findById(doc.restaurantId).select('pureVegRestaurant').lean();
            doc.pureVegRestaurant = sourceRestaurant?.pureVegRestaurant === true;
        }
        await doc.save();
        await syncRestaurantDiningSettings(doc.restaurantId, doc);
    }

    return { id };
}

export async function listDiningRestaurantsAdmin() {
    const [restaurants, diningDocs, categories] = await Promise.all([
        FoodRestaurant.find({})
            .sort({ createdAt: -1 })
            .select('restaurantName ownerName ownerPhone profileImage coverImages menuImages location area city status rating pureVegRestaurant diningSettings')
            .lean(),
        FoodDiningRestaurant.find({})
            .select('restaurantId categoryIds primaryCategoryId isEnabled maxGuests pureVegRestaurant')
            .lean(),
        FoodDiningCategory.find({}).select('name slug imageUrl').lean()
    ]);

    const categoriesById = new Map(categories.map((category) => [String(category._id), category]));
    const diningByRestaurantId = new Map(diningDocs.map((doc) => [String(doc.restaurantId), doc]));

    const items = restaurants.map((restaurant) =>
        mapDiningRestaurant(restaurant, diningByRestaurantId.get(String(restaurant._id)), categoriesById)
    );

    return { restaurants: items };
}

export async function updateDiningRestaurant(restaurantId, body = {}) {
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) return null;

    const restaurant = await FoodRestaurant.findById(restaurantId).lean();
    if (!restaurant) return null;

    let diningDoc = await FoodDiningRestaurant.findOne({ restaurantId });
    if (!diningDoc) {
        diningDoc = new FoodDiningRestaurant({
            restaurantId,
            pureVegRestaurant: restaurant.pureVegRestaurant === true
        });
    }

    const categoryIds = body.categoryIds !== undefined
        ? toObjectIdArray(body.categoryIds)
        : (diningDoc.categoryIds || []);

    const validCategories = categoryIds.length > 0
        ? await FoodDiningCategory.find({ _id: { $in: categoryIds } }).select('_id').lean()
        : [];
    const validCategoryIds = validCategories.map((category) => category._id);

    if (body.categoryIds !== undefined) {
        diningDoc.categoryIds = validCategoryIds;
    }
    if (body.isEnabled !== undefined) {
        diningDoc.isEnabled = body.isEnabled === true;
    }
    if (body.maxGuests !== undefined) {
        diningDoc.maxGuests = Math.max(1, parseInt(body.maxGuests, 10) || 6);
    }
    if (body.pureVegRestaurant !== undefined) {
        if (typeof body.pureVegRestaurant === 'boolean') {
            diningDoc.pureVegRestaurant = body.pureVegRestaurant;
        } else if (typeof body.pureVegRestaurant === 'string') {
            const normalized = body.pureVegRestaurant.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
                diningDoc.pureVegRestaurant = true;
            } else if (normalized === 'false' || normalized === '0' || normalized === 'no') {
                diningDoc.pureVegRestaurant = false;
            }
        }
    }

    if (body.primaryCategoryId !== undefined) {
        diningDoc.primaryCategoryId = mongoose.Types.ObjectId.isValid(body.primaryCategoryId)
            ? new mongoose.Types.ObjectId(body.primaryCategoryId)
            : null;
    }

    const primaryCategoryIsAllowed = diningDoc.primaryCategoryId
        && validCategoryIds.some((categoryId) => String(categoryId) === String(diningDoc.primaryCategoryId));

    if (!primaryCategoryIsAllowed) {
        diningDoc.primaryCategoryId = validCategoryIds[0] || null;
    }
    if (typeof diningDoc.pureVegRestaurant !== 'boolean') {
        diningDoc.pureVegRestaurant = restaurant.pureVegRestaurant === true;
    }

    await diningDoc.save();
    await syncCategoryRestaurantLinks(restaurant._id, validCategoryIds);
    await syncRestaurantDiningSettings(restaurant._id, diningDoc);

    const categories = await FoodDiningCategory.find({}).select('name slug imageUrl').lean();
    const categoriesById = new Map(categories.map((category) => [String(category._id), category]));

    return mapDiningRestaurant(restaurant, diningDoc.toObject(), categoriesById);
}

export async function listDiningCategoriesPublic() {
    const categories = await FoodDiningCategory.find({ isActive: true })
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean();
    return categories.map(mapCategory);
}

export async function listDiningRestaurantsPublic(query = {}) {
    const filter = { isEnabled: true };
    const categoryValue = String(query.category || '').trim();
    const cityValue = String(query.city || '').trim();
    const zoneIdValue = String(query.zoneId || '').trim();

    if (!zoneIdValue || !mongoose.Types.ObjectId.isValid(zoneIdValue)) {
        return [];
    }

    if (categoryValue) {
        const category = await FoodDiningCategory.findOne({
            $or: [
                mongoose.Types.ObjectId.isValid(categoryValue) ? { _id: categoryValue } : null,
                { slug: categoryValue.toLowerCase() }
            ].filter(Boolean)
        }).lean();
        if (!category) {
            return [];
        }
        filter.categoryIds = category._id;
    }

    // My Store partners have no dining; keep them out even if a flag slips through.
    const restaurantMatch = { partnerType: partnerTypeCondition() };
    const restaurantAndConditions = [];

    if (cityValue) {
        restaurantAndConditions.push({
            $or: [
                { city: { $regex: cityValue, $options: 'i' } },
                { 'location.city': { $regex: cityValue, $options: 'i' } }
            ]
        });
    }

    if (zoneIdValue && mongoose.Types.ObjectId.isValid(zoneIdValue)) {
        restaurantAndConditions.push(await buildRestaurantZoneCondition(zoneIdValue));
    }

    if (restaurantAndConditions.length > 0) {
        restaurantMatch.$and = restaurantAndConditions;
    }

    const diningDocs = await FoodDiningRestaurant.find(filter)
        .populate({
            path: 'restaurantId',
            select: 'restaurantName restaurantNameNormalized ownerName ownerPhone profileImage coverImages menuImages cuisines location area city zoneId status rating diningSettings estimatedDeliveryTime estimatedDeliveryTimeMinutes featuredDish featuredPrice offer openingTime closingTime openDays isAcceptingOrders costForTwo pureVegRestaurant',
            match: restaurantMatch
        })
        .populate('categoryIds', 'name slug imageUrl')
        .lean();

    const enabledDocs = diningDocs.filter((doc) => doc.restaurantId);
    const restaurantObjectIds = enabledDocs
        .map((doc) => doc.restaurantId?._id)
        .filter(Boolean);

    const nonVegRestaurantIds = restaurantObjectIds.length
        ? await FoodItem.distinct('restaurantId', {
            restaurantId: { $in: restaurantObjectIds },
            approvalStatus: 'approved',
            foodType: 'Non-Veg',
        })
        : [];
    const nonVegRestaurantIdSet = new Set(nonVegRestaurantIds.map((id) => String(id)));

    return enabledDocs.map((doc) => {
        const restaurant = doc.restaurantId;
        const rid = String(restaurant._id);
        const hasNonVegMenu = nonVegRestaurantIdSet.has(rid);
        const pureVegRestaurant =
            doc.pureVegRestaurant === true || restaurant?.pureVegRestaurant === true;

        return {
            ...restaurant,
            restaurant,
            categories: doc.categoryIds || [],
            pureVegRestaurant,
            hasNonVegMenu,
            isPureVeg: !hasNonVegMenu,
            diningSettings: {
                isEnabled: true,
                maxGuests: Math.max(1, Number(doc.maxGuests) || 6),
                pureVegRestaurant,
                diningType: doc.categoryIds?.[0]?.slug || restaurant?.diningSettings?.diningType || ''
            }
        };
    });
}

// ==================== DINING SETTINGS REQUESTS ====================

// What a customer sees about a dining place: the restaurant gives it with its dining request (asked before approval).
export const DINING_FACILITIES = [
    'Indoor seating', 'Outdoor seating', 'Air conditioned', 'Family friendly', 'Private dining', 'Parking',
    'Wheelchair accessible', 'Wi-Fi', 'Live music', 'Smoking area', 'Serves alcohol', 'Card payment'
];

const cleanList = (value, max = 20) =>
    [...new Set((Array.isArray(value) ? value : String(value || '').split(','))
        .map((v) => String(v).trim())
        .filter(Boolean))]
        .slice(0, max);

export async function createDiningRequest(restaurantId, settings = {}) {
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new ValidationError('Invalid restaurant ID');
    }

    // Check if there is already a pending request
    const existing = await FoodDiningRequest.findOne({
        restaurantId,
        status: 'pending'
    }).lean();

    if (existing) {
        throw new ValidationError('You already have a pending request awaiting approval');
    }

    // Deduplicate and sanitize categories
    let diningType = settings.diningType
    if (Array.isArray(diningType)) {
        diningType = [...new Set(diningType.map(t => String(t).trim()))].filter(Boolean)
    } else {
        diningType = String(diningType || '').split(',').map(t => t.trim()).filter(Boolean)
        diningType = [...new Set(diningType)]
    }

    // Only categories the admin really created count. A restaurant used to send "family-dining" (an old built-in
    // default) even though no such category exists, and the admin saw it on every request.
    const activeCategories = diningType.length
        ? await FoodDiningCategory.find({ slug: { $in: diningType }, isActive: { $ne: false } }).select('slug').lean()
        : [];
    const activeSlugs = new Set(activeCategories.map((c) => c.slug));
    diningType = diningType.filter((slug) => activeSlugs.has(slug));
    if (Boolean(settings.isEnabled) && diningType.length === 0) {
        throw new ValidationError('Please choose at least one dining category');
    }

    const cuisines = cleanList(settings.cuisines, 15).map((c) => c.slice(0, 40));
    const facilities = cleanList(settings.facilities, DINING_FACILITIES.length).filter((f) => DINING_FACILITIES.includes(f));
    const costForTwoValue = Number(settings.costForTwo);
    const costForTwo = Number.isFinite(costForTwoValue) && costForTwoValue > 0 ? Math.round(costForTwoValue) : null;
    if (Boolean(settings.isEnabled)) {
        if (cuisines.length === 0) throw new ValidationError('Please add the cuisines you serve');
        if (!costForTwo) throw new ValidationError('Please add the average price for two people');
    }

    const created = await FoodDiningRequest.create({
        restaurantId,
        requestedSettings: {
            isEnabled: Boolean(settings.isEnabled),
            maxGuests: parseInt(settings.maxGuests, 10) >= 0 ? parseInt(settings.maxGuests, 10) : 6,
            diningType: diningType,
            cuisines,
            costForTwo,
            facilities
        }
    });

    try {
        const restaurant = await FoodRestaurant.findById(restaurantId).select('restaurantName').lean();
        const { notifyAdminsSafely } = await import('../../../../core/notifications/firebase.service.js');
        void notifyAdminsSafely({
            title: 'New dining request 🍽️',
            body: `"${restaurant?.restaurantName || 'A restaurant'}" asked to update its dining settings. Review it in Dining Category Requests.`,
            data: { type: 'dining_request', id: String(created._id), restaurantId: String(restaurantId), link: '/admin/food/dining-requests' }
        });
    } catch (e) {
        console.error('Failed to notify admins of dining request:', e?.message || e);
    }

    return created.toObject();
}

// Tell the restaurant the admin's decision (push + inbox).
async function notifyRestaurantAboutDiningRequest(restaurantId, approved, reason = '') {
    try {
        const { notifyRestaurantSafely } = await import('../../admin/services/admin.service.js');
        await notifyRestaurantSafely(restaurantId, approved
            ? { title: 'Dining request approved ✅', body: 'Your dining settings are approved and live for customers.', link: '/food/restaurant/reservations', type: 'dining_request' }
            : { title: 'Dining request rejected', body: reason ? `Your dining settings were not approved: ${reason}` : 'Your dining settings were not approved. Please update them and send again.', link: '/food/restaurant/reservations', type: 'dining_request' });
    } catch (e) {
        console.error('Failed to notify restaurant about dining request:', e?.message || e);
    }
}

export async function getPendingDiningRequest(restaurantId) {
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    return await FoodDiningRequest.findOne({
        restaurantId,
        status: 'pending'
    }).lean();
}

export async function listAllPendingDiningRequests() {
    const categories = await FoodDiningCategory.find({}).select('name slug').lean();
    const nameBySlug = new Map(categories.map((c) => [c.slug, c.name]));
    const toNames = (raw) => [...new Set((Array.isArray(raw) ? raw : String(raw || '').split(',')).map((s) => String(s).trim()).filter(Boolean))]
        .filter((slug) => nameBySlug.has(slug))
        .map((slug) => ({ slug, name: nameBySlug.get(slug) }));
    return await FoodDiningRequest.find({ status: 'pending' })
        .populate({
            path: 'restaurantId',
            select: 'restaurantName profileImage location'
        })
        .sort({ createdAt: -1 })
        .lean()
        .then(docs => docs.map(doc => ({
            ...doc,
            restaurant: doc.restaurantId ? {
                _id: doc.restaurantId._id,
                name: doc.restaurantId.restaurantName,
                profileImage: doc.restaurantId.profileImage ? { url: doc.restaurantId.profileImage } : null,
                address: doc.restaurantId.location?.formattedAddress || ''
            } : null,
            restaurantId: doc.restaurantId?._id,
            requestedCategories: toNames(doc.requestedSettings?.diningType)
        })));
}

export async function approveDiningRequest(requestId) {
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw new ValidationError('Invalid request ID');
    }

    const request = await FoodDiningRequest.findById(requestId);
    if (!request || request.status !== 'pending') {
        throw new ValidationError('Pending request not found');
    }

    const { restaurantId, requestedSettings } = request;

    // Sanitize diningType from request (handle array or messy string)
    let finalDiningType = request.requestedSettings.diningType;
    if (!Array.isArray(finalDiningType)) {
        finalDiningType = String(finalDiningType || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    finalDiningType = [...new Set(finalDiningType)];

    // Find the Category IDs based on slugs (in the order the restaurant chose them); unknown slugs are dropped
    const selectedCategories = await FoodDiningCategory.find({
        slug: { $in: finalDiningType }
    }).select('_id slug').lean();
    const idBySlug = new Map(selectedCategories.map((c) => [c.slug, c._id]));
    finalDiningType = finalDiningType.filter((slug) => idBySlug.has(slug));
    const categoryIds = finalDiningType.map((slug) => idBySlug.get(slug));

    // Apply changes to FoodDiningRestaurant
    await FoodDiningRestaurant.findOneAndUpdate(
        { restaurantId },
        {
            $set: {
                isEnabled: request.requestedSettings.isEnabled,
                maxGuests: request.requestedSettings.maxGuests,
                categoryIds: categoryIds,
                primaryCategoryId: categoryIds[0] || null
            }
        },
        { upsert: true }
    );

    // Apply changes to FoodRestaurant (+ the dining details the restaurant gave with the request)
    const requested = request.requestedSettings || {};
    const restaurantSet = {
        diningSettings: {
            isEnabled: requested.isEnabled,
            maxGuests: requested.maxGuests,
            diningType: finalDiningType,
            facilities: Array.isArray(requested.facilities) ? requested.facilities : []
        }
    };
    if (Array.isArray(requested.cuisines) && requested.cuisines.length > 0) restaurantSet.cuisines = requested.cuisines;
    if (Number(requested.costForTwo) > 0) restaurantSet.costForTwo = Number(requested.costForTwo);
    await FoodRestaurant.findByIdAndUpdate(restaurantId, { $set: restaurantSet });

    request.status = 'approved';
    await request.save();

    // the restaurant page / lists are cached for minutes: drop them so customers see the new dining details at once
    void import('../../../../middleware/cache.js').then((m) => m.invalidateFoodBrowseCaches()).catch(() => {});
    void notifyRestaurantAboutDiningRequest(restaurantId, true);
    return request.toObject();
}

export async function rejectDiningRequest(requestId, reason = '') {
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw new ValidationError('Invalid request ID');
    }

    const request = await FoodDiningRequest.findById(requestId);
    if (!request || request.status !== 'pending') {
        throw new ValidationError('Pending request not found');
    }

    request.status = 'rejected';
    request.rejectionReason = String(reason || '').trim() || null;
    await request.save();

    void notifyRestaurantAboutDiningRequest(request.restaurantId, false, request.rejectionReason || '');
    return request.toObject();
}
