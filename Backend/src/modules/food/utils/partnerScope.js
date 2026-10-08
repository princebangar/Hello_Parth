/**
 * My Store scoping.
 *
 * A "My Store" partner (`FoodRestaurant.partnerType === 'store'`) is one of
 * Hello Parth's own brand stores. It must only ever surface inside the My Store
 * section — never in the home/delivery grid, takeaway, dining, under-250,
 * offers, gourmet, recommended or hero-banner lists.
 *
 * Restaurants created before `partnerType` existed have no value at all, so the
 * normal-listing filter is `{ $ne: 'store' }` (missing counts as a restaurant)
 * instead of `{ partnerType: 'restaurant' }`. That keeps every old document
 * visible without a migration.
 */

import { FoodRestaurant } from '../restaurant/models/restaurant.model.js';

export const PARTNER_TYPE_RESTAURANT = 'restaurant';
export const PARTNER_TYPE_STORE = 'store';

/** True when the caller explicitly asked for My Store partners. */
export const isStorePartnerType = (value) =>
    String(value || '').trim().toLowerCase() === PARTNER_TYPE_STORE;

/**
 * Mongo condition for a restaurant query.
 * @param {string} [partnerType] - pass 'store' for the My Store section; anything
 *   else (including undefined) scopes to normal restaurants.
 */
export const partnerTypeCondition = (partnerType) =>
    isStorePartnerType(partnerType)
        ? PARTNER_TYPE_STORE
        : { $ne: PARTNER_TYPE_STORE };

/**
 * Apply the scope onto a filter object in place and return it, so call sites stay
 * a single line: `applyPartnerTypeScope(filter, query.partnerType)`.
 */
export const applyPartnerTypeScope = (filter = {}, partnerType) => {
    filter.partnerType = partnerTypeCondition(partnerType);
    return filter;
};

/** Admin list filter value: 'store' | 'restaurant' | null (null = no filter, both kinds). */
export const normalizePartnerFilter = (value) => {
    const v = String(value || '').trim().toLowerCase();
    return v === PARTNER_TYPE_STORE || v === PARTNER_TYPE_RESTAURANT ? v : null;
};

/** _ids of every restaurant of one kind. */
export const partnerRestaurantIds = async (partnerType) =>
    FoodRestaurant.find({ partnerType: partnerTypeCondition(partnerType) }).distinct('_id');

/**
 * Admin lists: narrow a query on a collection that holds a restaurant id (`field`) to Restaurant Partners or
 * My Store partners. No/unknown partnerType leaves the filter alone. Returns the same filter object.
 */
export const andPartnerFilter = async (filter, partnerType, field = 'restaurantId') => {
    const pt = normalizePartnerFilter(partnerType);
    if (!pt) return filter;
    const ids = await partnerRestaurantIds(pt);
    filter.$and = [...(filter.$and || []), { [field]: { $in: ids } }];
    return filter;
};

/** Normalize an incoming value to a storable partnerType. */
export const normalizePartnerType = (value) =>
    isStorePartnerType(value) ? PARTNER_TYPE_STORE : PARTNER_TYPE_RESTAURANT;
