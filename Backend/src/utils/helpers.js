export const buildPaginationOptions = (query) => {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

export const buildPaginatedResult = ({ docs, total, page, limit }) => {
    const totalPages = Math.ceil(total / limit) || 1;

    return {
        data: docs,
        meta: {
            total,
            page,
            limit,
            totalPages
        }
    };
};


// A currency code is exactly 3 letters (ISO 4217). A stored value such as "INR 1500" or "Rs" makes Razorpay refuse the
// order ("currency: the length must be exactly 3"), so anything that does not start with a clean 3-letter code falls back.
export const normalizeCurrencyCode = (value, fallback = 'INR') => {
    const match = String(value ?? '').trim().toUpperCase().match(/^([A-Z]{3})(?![A-Z])/);
    return match ? match[1] : fallback;
};
