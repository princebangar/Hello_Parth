import { Admin } from '../admin/models/Admin.js';
import { Owner } from '../admin/models/Owner.js';
import { ApiError } from '../../../utils/ApiError.js';
import { Driver } from '../driver/models/Driver.js';
import { BusDriver } from '../driver/models/BusDriver.js';
import { PoolingVehicle } from '../admin/models/PoolingVehicle.js';
import { User } from '../user/models/User.js';
import { verifyAccessToken } from '../services/tokenService.js';
import {
  normalizeAdminPermissions,
  normalizeAdminType,
} from '../admin/services/adminAccessService.js';
import { getAdminModuleAccess } from '../../../core/admin/adminHierarchy.service.js';
import { readUserActive, rememberUserActive } from '../../../core/auth/userActiveCache.js';

const roleModelMap = {
  admin: Admin,
  'super-admin': Admin,
  driver: Driver,
  pooling_driver: PoolingVehicle,
  bus_driver: BusDriver,
  owner: Owner,
  user: User,
};

const normalizeRole = (role = '') => {
  const value = String(role || '').toLowerCase();
  if (value === 'super-admin') {
    return 'admin';
  }
  return value;
};

/** Food core JWTs use `userId`; taxi-native JWTs use `sub`. Accept both. */
const resolveSubjectId = (payload = {}) =>
  String(payload.sub || payload.userId || payload.id || '').trim();

const attachResolvedAuth = (req, payload, subjectId) => {
  req.auth = {
    sub: subjectId,
    role: normalizeRole(payload.role),
    originalRole: payload.role,
  };
};

export const authenticate = (allowedRoles = [], options = {}) => async (req, _res, next) => {
  try {
    const allowPending = options?.allowPending === true;
    const authorization = req.headers.authorization || '';
    const [, token] = authorization.split(' ');

    if (!token) {
      throw new ApiError(401, 'Authorization token is required');
    }

    const payload = verifyAccessToken(token);

    const normalizedRole = normalizeRole(payload.role);
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);
    const subjectId = resolveSubjectId(payload);

    if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(normalizedRole)) {
      throw new ApiError(403, 'Insufficient permissions for this resource');
    }

    const Model = roleModelMap[payload.role] || roleModelMap[normalizedRole];

    if (!Model) {
      throw new ApiError(401, 'Unsupported auth role');
    }

    if (!subjectId) {
      throw new ApiError(401, 'Invalid authorization token');
    }

    let entity;

    if (normalizedRole === 'user') {
      // Customers: only the active flags are needed and nothing downstream reads the loaded document, so use a
      // small remembered check instead of loading the whole user on every request (see userActiveCache).
      const known = readUserActive(subjectId, 'taxi');
      if (known) {
        if (!known.ok) {
          throw new ApiError(401, known.message);
        }
      } else {
        const flags = await Model.findById(subjectId).select('deletedAt isActive active').lean();
        if (!flags) {
          rememberUserActive(subjectId, false, 'Authenticated account no longer exists', 'taxi');
          throw new ApiError(401, 'Authenticated account no longer exists');
        }
        if (flags.deletedAt || flags.isActive === false || flags.active === false) {
          rememberUserActive(subjectId, false, 'User account is not active', 'taxi');
          throw new ApiError(401, 'User account is not active');
        }
        rememberUserActive(subjectId, true, '', 'taxi');
      }
      entity = { _id: subjectId };
    } else {
      entity = await Model.findById(subjectId);
    }

    if (!entity) {
      throw new ApiError(401, 'Authenticated account no longer exists');
    }

    if (
      normalizedRole === 'user' &&
      (entity.deletedAt || entity.isActive === false || entity.active === false)
    ) {
      throw new ApiError(401, 'User account is not active');
    }

    if (
      normalizedRole === 'driver' &&
      !allowPending &&
      (entity.approve === false || String(entity.status || '').toLowerCase() === 'pending')
    ) {
      throw new ApiError(403, 'Driver account is pending approval');
    }

    if (
      normalizedRole === 'owner' &&
      !allowPending &&
      (entity.active === false ||
        entity.approve === false ||
        String(entity.status || '').toLowerCase() === 'pending')
    ) {
      throw new ApiError(403, 'Owner account is pending approval');
    }

    if (
      normalizedRole === 'bus_driver' &&
      !allowPending &&
      (entity.active === false ||
        entity.approve === false ||
        ['pending', 'blocked'].includes(String(entity.status || '').toLowerCase()))
    ) {
      throw new ApiError(403, 'Bus driver account is pending approval');
    }

    if (
      normalizedRole === 'pooling_driver' &&
      !allowPending &&
      (entity.approve === false || String(entity.status || '').toLowerCase() === 'pending')
    ) {
      throw new ApiError(403, 'Pooling driver account is pending approval');
    }

    if (
      normalizedRole === 'pooling_driver' &&
      (entity.poolingEnabled === false ||
        ['inactive', 'maintenance'].includes(String(entity.status || '').toLowerCase()))
    ) {
      throw new ApiError(403, 'Pooling driver account is inactive');
    }

    attachResolvedAuth(req, payload, subjectId);
    req.auth.entity = entity;

    if (normalizedRole === 'admin') {
      // Food-only and Global sub-admins without the Taxi module must not reach the Taxi admin API.
      if (!getAdminModuleAccess(entity).taxi) {
        throw new ApiError(403, 'You do not have access to the Taxi admin');
      }

      req.auth.admin = {
        id: String(entity._id),
        email: entity.email || '',
        name: entity.name || '',
        role: entity.role || '',
        admin_type: normalizeAdminType(entity.admin_type || entity.role),
        permissions: normalizeAdminPermissions(entity.permissions || []),
        service_location_ids: Array.isArray(entity.service_location_ids)
          ? entity.service_location_ids.map((item) => String(item))
          : [],
        zone_ids: Array.isArray(entity.zone_ids)
          ? entity.zone_ids.map((item) => String(item))
          : [],
        active: entity.active !== false,
        status: entity.status || 'active',
      };

      if (req.auth.admin.active === false || String(req.auth.admin.status).toLowerCase() === 'inactive') {
        throw new ApiError(403, 'Admin account is inactive');
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};
