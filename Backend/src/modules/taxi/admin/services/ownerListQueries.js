import { Owner } from '../models/Owner.js';
import { Vehicle } from '../models/Vehicle.js';

// Server-side search / status filters for the Manage Fleet and Owner Bookings tables. The screens used to
// download every row and filter + page them in the browser; now the browser asks for one page at a time and
// MongoDB does the filtering.

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "toyota innova" -> [/toyota/i, /innova/i]. Every word has to match somewhere in the row. */
export const searchWordsToRegexes = (search, maxWords = 6) =>
  String(search || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .map((word) => new RegExp(escapeRegExp(word), 'i'));

/** page / limit from a query string, with a hard ceiling so nobody can ask for "all rows" through the pager. */
export const readPaging = ({ page, limit } = {}, { defaultLimit = 10, maxLimit = 100 } = {}) => {
  const safePage = Math.max(1, Math.floor(Number(page)) || 1);
  const safeLimit = Math.min(maxLimit, Math.max(1, Math.floor(Number(limit)) || defaultLimit));
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

export const buildPagerMeta = ({ page, limit }, total) => ({
  current_page: page,
  per_page: limit,
  total,
  last_page: Math.max(1, Math.ceil(total / limit)),
});

const ownerMatches = (regex) => ({ $or: [{ company_name: regex }, { name: regex }, { owner_name: regex }] });

/** Filter for FleetVehicle: status ("pending" also covers rows that never got a status) + free-text search. */
export const buildFleetVehicleFilter = async ({ status, search } = {}) => {
  const conditions = [];

  const wantedStatus = String(status || '').trim().toLowerCase();
  if (wantedStatus === 'approved' || wantedStatus === 'rejected') {
    conditions.push({ status: wantedStatus });
  } else if (wantedStatus === 'pending') {
    conditions.push({ $or: [{ status: 'pending' }, { status: null }] });
  }

  const words = searchWordsToRegexes(search);
  if (words.length > 0) {
    // owner and vehicle-type names live in other collections: find which of them match each word first
    const [ownerIdsPerWord, vehicleIdsPerWord] = await Promise.all([
      Promise.all(words.map((regex) => Owner.distinct('_id', ownerMatches(regex)))),
      Promise.all(words.map((regex) => Vehicle.distinct('_id', { $or: [{ name: regex }, { type_name: regex }] }))),
    ]);

    conditions.push({
      $and: words.map((regex, index) => ({
        $or: [
          { car_brand: regex },
          { car_model: regex },
          { license_plate_number: regex },
          { reason: regex },
          { status: regex },
          // a row without a status is shown (and was always searched) as "pending"
          ...(regex.test('pending') ? [{ status: null }] : []),
          { owner_id: { $in: ownerIdsPerWord[index] } },
          { vehicle_type_id: { $in: vehicleIdsPerWord[index] } },
        ],
      })),
    });
  }

  return conditions.length > 0 ? { $and: conditions } : {};
};

/** Filter for OwnerBooking: free-text search over the booking, the customer, the route and the owner's name. */
export const buildOwnerBookingFilter = async ({ search } = {}) => {
  const words = searchWordsToRegexes(search);
  if (words.length === 0) return {};

  const ownerIdsPerWord = await Promise.all(words.map((regex) => Owner.distinct('_id', ownerMatches(regex))));

  return {
    $and: words.map((regex, index) => ({
      $or: [
        { booking_reference: regex },
        { customer_name: regex },
        { customer_phone: regex },
        { pickup_location: regex },
        { dropoff_location: regex },
        { booking_status: regex },
        { owner_id: { $in: ownerIdsPerWord[index] } },
      ],
    })),
  };
};
