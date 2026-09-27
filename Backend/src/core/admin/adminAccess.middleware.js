import mongoose from 'mongoose';
import { sendError } from '../../utils/response.js';
import { FoodAdmin } from './admin.model.js';
import { ADMIN_LEVELS } from './adminHierarchy.constants.js';
import {
  getAdminModuleAccess,
  isAdminAccountDisabled,
  resolveAdminLevel,
} from './adminHierarchy.service.js';
import { hasGlobalAction } from './globalPermissions.constants.js';

/**
 * Every admin signs in with an ADMIN token, whatever kind of admin it is. These helpers look the account up
 * behind the token so the panel APIs can tell a super admin from a sub-admin, refuse a disabled account and
 * refuse an admin that was not given access to that part of the panel.
 */
export const loadAdminAccount = async (req) => {
  const adminId = String(req.user?.userId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(adminId)) {
    return null;
  }

  return FoodAdmin.findById(adminId)
    .select('-password -resetPasswordOtp -resetPasswordExpires')
    .lean();
};

export const isSubAdminAccount = (admin = {}) =>
  resolveAdminLevel(admin) === ADMIN_LEVELS.SUBADMIN ||
  String(admin.role || '').toUpperCase() === 'SUB_ADMIN';

/**
 * Food admin API. A sub-admin is presented to the Food permission middleware as SUB_ADMIN with its Food
 * matrix; a super admin stays ADMIN. Admins without Food access are refused outright.
 */
export const attachFoodAdminAccess = async (req, res, next) => {
  try {
    const admin = await loadAdminAccount(req);

    if (!admin) {
      return sendError(res, 401, 'Admin account not found');
    }
    if (isAdminAccountDisabled(admin)) {
      return sendError(res, 403, 'This admin account is disabled');
    }
    if (!getAdminModuleAccess(admin).food) {
      return sendError(res, 403, 'You do not have access to the Food admin');
    }

    const subAdmin = isSubAdminAccount(admin);
    req.adminAccount = admin;
    req.user = {
      ...req.user,
      role: subAdmin ? 'SUB_ADMIN' : 'ADMIN',
      permissions: subAdmin ? admin.foodPermissions || {} : undefined,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Global admin API. Platform super admins pass everything; a global sub-admin needs the given action on the
 * given Global sidebar section. Managing sub-admins passes `platformOnly`.
 */
export const requireGlobalAccess = ({ section = null, action = 'view', platformOnly = false } = {}) =>
  async (req, res, next) => {
    try {
      const admin = await loadAdminAccount(req);

      if (!admin) {
        return sendError(res, 401, 'Admin account not found');
      }
      if (isAdminAccountDisabled(admin)) {
        return sendError(res, 403, 'This admin account is disabled');
      }

      req.adminAccount = admin;

      if (resolveAdminLevel(admin) === ADMIN_LEVELS.PLATFORM_SUPERADMIN) {
        return next();
      }

      if (platformOnly || !section) {
        return sendError(res, 403, 'Only a platform super admin can do this');
      }

      if (!hasGlobalAction(admin.globalPermissions, section, action)) {
        return sendError(res, 403, 'You do not have permission for this Global section');
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
