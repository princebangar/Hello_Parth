import mongoose from 'mongoose';
import { FoodDiningBooking } from '../models/diningBooking.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { getIO, rooms } from '../../../../config/socket.js';

// Format database booking document into the exact JSON shape required by the frontend
function formatBooking(bookingDoc) {
    if (!bookingDoc) return null;
    const booking = bookingDoc.toObject ? bookingDoc.toObject() : bookingDoc;
    
    // Format restaurant details
    let restaurantObj = null;
    if (booking.restaurantId && typeof booking.restaurantId === 'object') {
        const rest = booking.restaurantId;
        const coverImage = Array.isArray(rest.coverImages)
            ? rest.coverImages.map(img => typeof img === 'string' ? img : img?.url || '').find(Boolean)
            : '';
        const profilePhoto = typeof rest.profileImage === 'string'
            ? rest.profileImage
            : (rest.profileImage?.url || '');

        restaurantObj = {
            _id: rest._id,
            id: rest._id,
            name: rest.restaurantName || rest.name || 'Restaurant',
            restaurantName: rest.restaurantName || rest.name || 'Restaurant',
            profileImage: rest.profileImage || null,
            image: coverImage || profilePhoto || '',
            location: rest.location || null,
            slug: rest.slug || ''
        };
    } else if (booking.restaurantId) {
        restaurantObj = {
            _id: booking.restaurantId,
            id: booking.restaurantId,
            name: 'Restaurant',
            restaurantName: 'Restaurant',
            profileImage: null,
            image: '',
            location: null,
            slug: ''
        };
    }

    // Format user details
    let userObj = null;
    if (booking.userId && typeof booking.userId === 'object') {
        const u = booking.userId;
        userObj = {
            _id: u._id,
            id: u._id,
            name: u.name || 'Guest',
            phone: u.phone || '',
            email: u.email || ''
        };
    } else if (booking.userId) {
        userObj = {
            _id: booking.userId,
            id: booking.userId,
            name: 'Guest',
            phone: '',
            email: ''
        };
    }

    return {
        _id: booking._id,
        id: booking._id,
        bookingId: booking.bookingId,
        restaurantId: booking.restaurantId?._id || booking.restaurantId,
        restaurant: restaurantObj,
        userId: booking.userId?._id || booking.userId,
        user: userObj,
        guests: booking.guests,
        date: booking.date,
        timeSlot: booking.timeSlot,
        specialRequest: booking.specialRequest || '',
        status: booking.status || 'pending',
        review: booking.review || null,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt
    };
}

const SEAT_HOLDING_STATUSES = ['accepted', 'confirmed', 'checked-in'];
const PENDING_HOLD_MS = 30 * 60 * 1000; // a request nobody answered for 30 minutes stops holding seats
const toIstDay = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

// "07:00 PM", "7:00 pm" and "19:00" are the same slot
const slotKey = (v) => {
  const m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i)
  if (!m) return String(v || '').trim().toLowerCase()
  let h = Number(m[1]) % 12
  if (!m[3]) h = Number(m[1])
  else if (/^p/i.test(m[3])) h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// Guests already holding seats in ONE slot (same restaurant, same India calendar day, same time).
async function countSeatsTakenInSlot(restaurantId, date, timeSlot) {
    const day = toIstDay(date);
    const start = new Date(day + 'T00:00:00+05:30');
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const bookings = await FoodDiningBooking.find({
        restaurantId,
        date: { $gte: start, $lt: end },
        status: { $in: ['pending', ...SEAT_HOLDING_STATUSES] },
    }).select('guests status createdAt timeSlot').lean();
    const now = Date.now();
    const wanted = slotKey(timeSlot);
    return bookings
        .filter((b) => slotKey(b.timeSlot) === wanted)
        .filter((b) => b.status !== 'pending' || now - new Date(b.createdAt).getTime() < PENDING_HOLD_MS)
        .reduce((sum, b) => sum + (Number(b.guests) || 0), 0);
}

export async function createBooking(userId, payload) {
    const restaurantId = payload.restaurant || payload.restaurantId;
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new Error('Valid Restaurant ID is required');
    }

    const restaurant = await FoodRestaurant.findById(restaurantId).lean();
    if (!restaurant) {
        throw new Error('Restaurant not found');
    }

    const requestedGuests = Math.max(1, Number(payload.guests) || 1);
    const slotDate = new Date(payload.date);
    if (Number.isNaN(slotDate.getTime())) throw new Error('A valid booking date is required');
    const capacity = Number(restaurant?.diningSettings?.maxGuests) || 10;
    const taken = await countSeatsTakenInSlot(restaurantId, slotDate, payload.timeSlot);
    const seatsLeft = Math.max(0, capacity - taken);
    if (seatsLeft <= 0) {
        const err = new Error('This time slot is full. Please pick another slot.');
        err.statusCode = 409;
        throw err;
    }
    if (requestedGuests > seatsLeft) {
        const err = new Error(`Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left in this slot. Please reduce the guests or pick another slot.`);
        err.statusCode = 409;
        throw err;
    }

    // Generate unique display-friendly booking ID: TB + 8 digits
    const uniqueDigits = Math.floor(10000000 + Math.random() * 90000000);
    const bookingId = `TB${uniqueDigits}`;

    const newBooking = new FoodDiningBooking({
        bookingId,
        restaurantId,
        userId,
        guests: Math.max(1, Number(payload.guests) || 1),
        date: new Date(payload.date),
        timeSlot: String(payload.timeSlot || '').trim(),
        specialRequest: String(payload.specialRequest || '').trim(),
        status: 'pending'
    });

    await newBooking.save();

    // Populate relations to match frontend structure
    const populated = await FoodDiningBooking.findById(newBooking._id)
        .populate('restaurantId')
        .populate('userId');

    const formatted = formatBooking(populated);

    // Tell the restaurant right away: live popup + ring (socket), push and inbox message.
    try {
        const io = getIO();
        if (io) io.to(rooms.restaurant(restaurantId)).emit('new_dining_booking', formatted);
    } catch {
        // never block the booking if the live channel is down
    }
    import('../../admin/services/admin.service.js').then(({ notifyRestaurantSafely }) => notifyRestaurantSafely(restaurantId, {
        title: 'New table request',
        body: `${formatted?.user?.name || 'A guest'} requested a table for ${formatted?.guests || 1} (${formatted?.timeSlot || ''}).`,
        link: '/food/restaurant/dining-reservations',
        type: 'dining',
        data: { bookingId: String(formatted?.bookingId || '') },
    })).catch(() => {});

    return formatted;
}

export async function listUserBookings(userId) {
    const docs = await FoodDiningBooking.find({ userId })
        .populate('restaurantId')
        .populate('userId')
        .sort({ date: -1, createdAt: -1 });

    return docs.map(formatBooking).filter(Boolean);
}

export async function listRestaurantBookings(restaurantIdentifier, authInfo = {}) {
    let restaurantId = restaurantIdentifier;

    // Resolve restaurant ID if a slug was passed
    if (!mongoose.Types.ObjectId.isValid(restaurantIdentifier)) {
        const rest = await FoodRestaurant.findOne({ slug: restaurantIdentifier }).select('_id').lean();
        if (!rest) return [];
        restaurantId = rest._id;
    }

    // Owner check: role is RESTAURANT and user ID matches restaurant ID
    const isAuthorizedOwner = authInfo.requesterRole === 'RESTAURANT' && 
        String(authInfo.requesterId) === String(restaurantId);

    const docs = await FoodDiningBooking.find({ restaurantId })
        .populate('restaurantId')
        .populate('userId')
        .sort({ date: -1, createdAt: -1 });

    const formatted = docs.map(formatBooking).filter(Boolean);

    // If request is public (availability check), redact user personal details to protect privacy
    if (!isAuthorizedOwner) {
        return formatted.map((b) => ({
            ...b,
            user: {
                _id: b.user?._id || null,
                id: b.user?.id || null,
                name: 'Guest',
                phone: '',
                email: ''
            },
            specialRequest: ''
        }));
    }

    return formatted;
}

export async function updateBookingStatus(bookingId, status, restaurantId) {
    const booking = await FoodDiningBooking.findById(bookingId);
    if (!booking) {
        throw new Error('Booking not found');
    }

    if (booking.restaurantId.toString() !== restaurantId.toString()) {
        throw new Error('Unauthorized status update for this restaurant');
    }

    booking.status = String(status || '').trim().toLowerCase();
    await booking.save();

    const populated = await FoodDiningBooking.findById(booking._id)
        .populate('restaurantId')
        .populate('userId');

    return formatBooking(populated);
}

export async function submitBookingReview(bookingId, userId, rating, comment) {
    const booking = await FoodDiningBooking.findById(bookingId);
    if (!booking) {
        throw new Error('Booking not found');
    }

    if (booking.userId.toString() !== userId.toString()) {
        throw new Error('Unauthorized feedback submission');
    }

    booking.review = {
        rating: Math.min(5, Math.max(1, Number(rating) || 5)),
        comment: String(comment || '').trim(),
        createdAt: new Date()
    };

    await booking.save();

    const populated = await FoodDiningBooking.findById(booking._id)
        .populate('restaurantId')
        .populate('userId');

    return formatBooking(populated);
}
