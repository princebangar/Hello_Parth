import { verifyAccessToken } from './token.util.js';
import { sendError } from '../../utils/response.js';
import { FoodUser } from '../users/user.model.js';
import mongoose from 'mongoose';
import { readUserActive, rememberUserActive } from './userActiveCache.js';

export const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return sendError(res, 403, 'Admin access required');
    }
    next();
};

export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
        return sendError(res, 401, 'Authentication token missing');
    }

    try {
        const decoded = verifyAccessToken(token);
        const userId = decoded.userId || decoded.sub || '';
        const role = String(decoded.role || '').toUpperCase();
        req.user = {
            userId,
            role
        };
        if (role === 'USER') {
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return sendError(res, 401, 'Invalid user token');
            }
            // Enforce active status - deactivated users are logged out on their next request. The answer is
            // remembered for a few seconds (blocking / deleting an account clears it at once), so a screen that
            // fires many requests does not pay a database round trip for each one.
            const known = readUserActive(userId);
            if (known) {
                return known.ok ? next() : sendError(res, 401, known.message);
            }
            FoodUser.findById(userId).select('isActive').lean().then((doc) => {
                if (!doc || doc.isActive === false) {
                    const message = doc ? 'User account is deactivated' : 'User account not found';
                    rememberUserActive(userId, false, message);
                    return sendError(res, 401, message);
                }
                rememberUserActive(userId, true);
                next();
            }).catch(() => sendError(res, 401, 'Invalid user token'));
            return;
        }
        return next();
    } catch (error) {
        return sendError(res, 401, 'Invalid or expired token');
    }
};
