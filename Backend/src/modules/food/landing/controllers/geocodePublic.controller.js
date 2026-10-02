const sanitize = (value) => (value ? String(value).trim().replace(/^['"]|['"]$/g, '') : '');

const getGoogleMapsServerKey = () =>
    sanitize(process.env.GOOGLE_MAPS_API_KEY) ||
    sanitize(process.env.VITE_GOOGLE_MAPS_API_KEY);

const toFinite = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
};

// The same GPS fix is reverse-geocoded several times while a screen opens (header, location picker, taxi pickup...).
// Each call used to go to Google (200-800 ms and a billed request). A successful answer for the same spot is
// reused for a while and concurrent identical lookups share one Google call.
const REVERSE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REVERSE_CACHE_MAX = 500;
const reverseCache = new Map(); // key -> { at, data }
const reverseInflight = new Map(); // key -> Promise<data>

const fetchReverseGeocode = async (params) => {
    const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
        { signal: AbortSignal.timeout(10_000) }
    );
    return response.json();
};

/**
 * Proxy Google Geocoding so the API key never appears in the browser Network tab.
 * GET /food/geocode/reverse?lat=&lng=&result_type=
 */
export const reverseGeocodePublicController = async (req, res, next) => {
    try {
        const apiKey = getGoogleMapsServerKey();
        if (!apiKey) {
            return res.status(503).json({
                success: false,
                message: 'Google Maps API key is not configured on the server',
            });
        }

        const lat = toFinite(req.query.lat);
        const lng = toFinite(req.query.lng);
        if (lat === null || lng === null) {
            return res.status(400).json({ success: false, message: 'lat and lng are required' });
        }

        const params = new URLSearchParams({
            latlng: `${lat},${lng}`,
            key: apiKey,
            language: 'en',
            region: 'in',
        });

        const resultType = sanitize(req.query.result_type);
        if (resultType) params.set('result_type', resultType);

        const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}|${resultType}`;
        const cached = reverseCache.get(cacheKey);
        let data = cached && Date.now() - cached.at < REVERSE_CACHE_TTL_MS ? cached.data : null;

        if (!data) {
            let pending = reverseInflight.get(cacheKey);
            if (!pending) {
                pending = fetchReverseGeocode(params).finally(() => reverseInflight.delete(cacheKey));
                reverseInflight.set(cacheKey, pending);
            }
            data = await pending;

            // Only a proper answer is worth remembering (not quota / key errors).
            if (data?.status === 'OK' || data?.status === 'ZERO_RESULTS') {
                if (reverseCache.size >= REVERSE_CACHE_MAX) {
                    reverseCache.delete(reverseCache.keys().next().value);
                }
                reverseCache.set(cacheKey, { at: Date.now(), data });
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Reverse geocode completed',
            data,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /food/geocode/place?place_id=
 */
export const geocodePlacePublicController = async (req, res, next) => {
    try {
        const apiKey = getGoogleMapsServerKey();
        if (!apiKey) {
            return res.status(503).json({
                success: false,
                message: 'Google Maps API key is not configured on the server',
            });
        }

        const placeId = sanitize(req.query.place_id);
        if (!placeId) {
            return res.status(400).json({ success: false, message: 'place_id is required' });
        }

        const params = new URLSearchParams({
            place_id: placeId,
            key: apiKey,
            language: 'en',
            region: 'in',
        });

        const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
        );
        const data = await response.json();

        return res.status(200).json({
            success: true,
            message: 'Place geocode completed',
            data,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /food/geocode/nearby
 * Body: { latitude, longitude, radius?, maxResultCount? }
 */
export const nearbyPlacesPublicController = async (req, res, next) => {
    try {
        const apiKey = getGoogleMapsServerKey();
        if (!apiKey) {
            return res.status(503).json({
                success: false,
                message: 'Google Maps API key is not configured on the server',
            });
        }

        const lat = toFinite(req.body?.latitude ?? req.body?.lat);
        const lng = toFinite(req.body?.longitude ?? req.body?.lng);
        if (lat === null || lng === null) {
            return res.status(400).json({ success: false, message: 'latitude and longitude are required' });
        }

        const radius = Math.min(Math.max(toFinite(req.body?.radius) ?? 60, 1), 500);
        const maxResultCount = Math.min(Math.max(Number(req.body?.maxResultCount) || 5, 1), 10);

        const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                    'places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types',
            },
            body: JSON.stringify({
                locationRestriction: {
                    circle: {
                        center: { latitude: lat, longitude: lng },
                        radius,
                    },
                },
                maxResultCount,
                rankPreference: 'DISTANCE',
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status >= 400 ? response.status : 502).json({
                success: false,
                message: data?.error?.message || 'Nearby places lookup failed',
                data,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Nearby places fetched',
            data,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /food/geocode/text-search
 * Body: { textQuery, latitude?, longitude?, maxResultCount? }
 */
export const textSearchPlacesPublicController = async (req, res, next) => {
    try {
        const apiKey = getGoogleMapsServerKey();
        if (!apiKey) {
            return res.status(503).json({
                success: false,
                message: 'Google Maps API key is not configured on the server',
            });
        }

        const textQuery = sanitize(req.body?.textQuery || req.body?.query);
        if (!textQuery) {
            return res.status(400).json({ success: false, message: 'textQuery is required' });
        }

        const lat = toFinite(req.body?.latitude ?? req.body?.lat);
        const lng = toFinite(req.body?.longitude ?? req.body?.lng);
        const maxResultCount = Math.min(Math.max(Number(req.body?.maxResultCount) || 6, 1), 10);

        const body = {
            textQuery,
            languageCode: 'en',
            regionCode: 'IN',
            maxResultCount,
        };

        if (lat !== null && lng !== null) {
            body.locationBias = {
                circle: {
                    center: { latitude: lat, longitude: lng },
                    radius: 50000,
                },
            };
        }

        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                    'places.id,places.displayName,places.formattedAddress,places.location',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status >= 400 ? response.status : 502).json({
                success: false,
                message: data?.error?.message || 'Text search failed',
                data,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Text search completed',
            data,
        });
    } catch (error) {
        next(error);
    }
};
