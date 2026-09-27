import mongoose from 'mongoose';
import { FoodAdmin } from '../../../core/admin/admin.model.js';
import { FoodRefreshToken } from '../../../core/refreshTokens/refreshToken.model.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { ADMIN_LEVELS, ADMIN_MODULES } from '../../../core/admin/adminHierarchy.constants.js';
import { isAdminAccountDisabled } from '../../../core/admin/adminHierarchy.service.js';
import { normalizeGlobalPermissions } from '../../../core/admin/globalPermissions.constants.js';
import { normalizePermissions as normalizeFoodPermissions } from '../../food/admin/constants/subAdminPermissions.js';
import { ADMIN_PERMISSIONS as TAXI_PERMISSIONS } from '../../taxi/admin/services/adminAccessService.js';
import { ServiceLocation } from '../../taxi/admin/models/ServiceLocation.js';
import { Zone } from '../../taxi/driver/models/Zone.js';

/**
 * Global sub-admins: admin accounts that work across modules. `servicesAccess` lists the modules they may open
 * (Food and/or Taxi); `foodPermissions`, `permissions` (Taxi keys) and `globalPermissions` say which sidebar
 * options they get in each. Only a platform super admin manages them.
 */
const SUB_ADMIN_ROLE = 'SUB_ADMIN';
const SERVICE_MODULES = [ADMIN_MODULES.FOOD, ADMIN_MODULES.TAXI];
// Managing admins stays with the platform super admin, so this Taxi key is never handed out from here.
const GRANTABLE_TAXI_PERMISSIONS = TAXI_PERMISSIONS.filter((key) => key !== 'subadmins.manage');

const globalSubAdminFilter = (extra = {}) => ({ isGlobalSubAdmin: true, ...extra });

const toIdStrings = (values = []) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];

const normalizeServices = (input) =>
  [...new Set((Array.isArray(input) ? input : []).map((value) => String(value || '').trim().toLowerCase()))]
    .filter((value) => SERVICE_MODULES.includes(value));

/** Food rows: writing (create / edit / delete) implies viewing, as in the Food permission screen. */
const normalizeFoodMatrix = (input = {}) => {
  const matrix = normalizeFoodPermissions(input || {});
  Object.values(matrix).forEach((row) => {
    if (row.create || row.edit || row.delete) row.view = true;
  });
  return matrix;
};

const normalizeTaxiKeys = (input = []) =>
  toIdStrings(input).filter((key) => GRANTABLE_TAXI_PERMISSIONS.includes(key));

const assertObjectId = (id) => {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ValidationError('Invalid sub admin id');
  }
};

function sanitizeAdmin(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };

  return {
    id: String(obj._id),
    _id: String(obj._id),
    name: obj.name || '',
    email: obj.email || '',
    phone: obj.phone || '',
    role: obj.role,
    isActive: !isAdminAccountDisabled(obj),
    servicesAccess: normalizeServices(obj.servicesAccess),
    permissions: {
      global: normalizeGlobalPermissions(obj.globalPermissions || {}),
      food: normalizeFoodMatrix(obj.foodPermissions || {}),
      taxi: normalizeTaxiKeys(obj.permissions || []),
    },
    service_location_ids: toIdStrings(obj.service_location_ids),
    zone_ids: toIdStrings(obj.zone_ids),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

export async function listSubAdmins(query = {}) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 200);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;

  const filter = globalSubAdminFilter();

  if (query.search && String(query.search).trim()) {
    const raw = String(query.search).trim().slice(0, 80);
    const term = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
    ];
  }

  const [docs, total] = await Promise.all([
    FoodAdmin.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    FoodAdmin.countDocuments(filter),
  ]);

  return {
    subAdmins: docs.map(sanitizeAdmin),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getSubAdminById(id) {
  assertObjectId(id);
  const doc = await FoodAdmin.findOne(globalSubAdminFilter({ _id: id })).select('-password');
  return sanitizeAdmin(doc);
}

export async function createSubAdmin({ name, email, phone, password, servicesAccess } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const services = normalizeServices(servicesAccess);

  if (!String(name || '').trim()) throw new ValidationError('Name is required');
  if (!normalizedEmail) throw new ValidationError('Email is required');
  if (!password || String(password).length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }
  if (services.length === 0) {
    throw new ValidationError('Give the sub admin access to at least one module (Food or Taxi)');
  }

  const existing = await FoodAdmin.findOne({ email: normalizedEmail });
  if (existing) throw new ValidationError('An admin with this email already exists');

  const doc = await FoodAdmin.create({
    name: String(name).trim(),
    email: normalizedEmail,
    phone: String(phone || '').trim(),
    password: String(password),
    role: SUB_ADMIN_ROLE,
    admin_type: 'subadmin',
    adminLevel: ADMIN_LEVELS.SUBADMIN,
    module: null,
    isGlobalSubAdmin: true,
    isActive: true,
    active: true,
    status: 'active',
    servicesAccess: services,
    permissions: [],
    foodPermissions: normalizeFoodMatrix({}),
    // The Global overview is the natural landing page, so it is on by default and can be switched off.
    globalPermissions: normalizeGlobalPermissions({ overview: { view: true } }),
  });

  return sanitizeAdmin(doc);
}

export async function updateSubAdmin(id, { name, email, phone } = {}) {
  assertObjectId(id);
  const doc = await FoodAdmin.findOne(globalSubAdminFilter({ _id: id }));
  if (!doc) return null;

  if (name !== undefined) {
    if (!String(name).trim()) throw new ValidationError('Name is required');
    doc.name = String(name).trim();
  }
  if (phone !== undefined) doc.phone = String(phone).trim();

  if (email !== undefined) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail) throw new ValidationError('Email is required');
    const duplicate = await FoodAdmin.findOne({ email: normalizedEmail, _id: { $ne: doc._id } });
    if (duplicate) throw new ValidationError('An admin with this email already exists');
    doc.email = normalizedEmail;
  }

  await doc.save();
  return sanitizeAdmin(doc);
}

export async function updateSubAdminStatus(id, isActive) {
  assertObjectId(id);
  const doc = await FoodAdmin.findOne(globalSubAdminFilter({ _id: id }));
  if (!doc) return null;

  doc.isActive = isActive !== false;
  doc.active = doc.isActive;
  doc.status = doc.isActive ? 'active' : 'inactive';
  await doc.save();

  if (!doc.isActive) {
    await FoodRefreshToken.deleteMany({ userId: doc._id });
  }

  return sanitizeAdmin(doc);
}

export async function resetSubAdminPassword(id, newPassword) {
  assertObjectId(id);
  const password = String(newPassword || '');
  if (password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }

  const doc = await FoodAdmin.findOne(globalSubAdminFilter({ _id: id }));
  if (!doc) return null;

  doc.password = password;
  await doc.save();
  // Force a fresh sign-in with the new password.
  await FoodRefreshToken.deleteMany({ userId: doc._id });

  return sanitizeAdmin(doc);
}

export async function deleteSubAdmin(id) {
  assertObjectId(id);
  const doc = await FoodAdmin.findOne(globalSubAdminFilter({ _id: id }));
  if (!doc) return null;

  await FoodRefreshToken.deleteMany({ userId: doc._id });
  await FoodAdmin.deleteOne({ _id: doc._id });
  return sanitizeAdmin(doc);
}

/**
 * Saves module access plus the sidebar options granted in each module.
 * Removing a module clears everything that belonged to it, so nothing is left dormant behind a hidden tab.
 */
export async function updateSubAdminAccess(id, body = {}) {
  assertObjectId(id);
  const doc = await FoodAdmin.findOne(globalSubAdminFilter({ _id: id }));
  if (!doc) return null;

  const services = body.servicesAccess === undefined
    ? normalizeServices(doc.servicesAccess)
    : normalizeServices(body.servicesAccess);

  if (services.length === 0) {
    throw new ValidationError('Give the sub admin access to at least one module (Food or Taxi)');
  }

  const hasFood = services.includes(ADMIN_MODULES.FOOD);
  const hasTaxi = services.includes(ADMIN_MODULES.TAXI);

  const foodMatrix = hasFood
    ? normalizeFoodMatrix(body.food !== undefined ? body.food : doc.foodPermissions || {})
    : normalizeFoodMatrix({});

  const taxiKeys = hasTaxi
    ? normalizeTaxiKeys(body.taxi !== undefined ? body.taxi : doc.permissions || [])
    : [];

  let serviceLocationIds = hasTaxi
    ? toIdStrings(body.service_location_ids !== undefined ? body.service_location_ids : doc.service_location_ids)
    : [];
  let zoneIds = hasTaxi
    ? toIdStrings(body.zone_ids !== undefined ? body.zone_ids : doc.zone_ids)
    : [];

  if (hasTaxi && taxiKeys.length > 0 && serviceLocationIds.length === 0) {
    throw new ValidationError('Assign at least one service location for Taxi access');
  }

  if (serviceLocationIds.some((value) => !mongoose.Types.ObjectId.isValid(value))
    || zoneIds.some((value) => !mongoose.Types.ObjectId.isValid(value))) {
    throw new ValidationError('One or more selected service locations or zones are invalid');
  }

  if (serviceLocationIds.length > 0) {
    const count = await ServiceLocation.countDocuments({ _id: { $in: serviceLocationIds } });
    if (count !== serviceLocationIds.length) {
      throw new ValidationError('One or more selected service locations are invalid');
    }
  }

  if (zoneIds.length > 0) {
    const zones = await Zone.find({ _id: { $in: zoneIds } }).select('_id service_location_id').lean();
    if (zones.length !== zoneIds.length) {
      throw new ValidationError('One or more selected zones are invalid');
    }
    if (zones.some((zone) => !serviceLocationIds.includes(String(zone.service_location_id || '')))) {
      throw new ValidationError('Assigned zones must belong to the selected service locations');
    }
  }

  doc.servicesAccess = services;
  doc.foodPermissions = foodMatrix;
  doc.markModified('foodPermissions');
  doc.permissions = taxiKeys;
  doc.globalPermissions = normalizeGlobalPermissions(
    body.global !== undefined ? body.global : doc.globalPermissions || {},
  );
  doc.markModified('globalPermissions');
  doc.service_location_ids = serviceLocationIds;
  doc.zone_ids = zoneIds;

  await doc.save();
  return sanitizeAdmin(doc);
}

/** Service locations / zones a Taxi-enabled sub-admin can be limited to. */
export async function getScopeOptions() {
  const [serviceLocations, zones] = await Promise.all([
    ServiceLocation.find({ active: { $ne: false } })
      .select('_id name service_location_name')
      .sort({ service_location_name: 1, name: 1 })
      .lean(),
    Zone.find({}).select('_id name service_location_id').sort({ name: 1 }).lean(),
  ]);

  return {
    serviceLocations: serviceLocations.map((item) => ({
      id: String(item._id),
      name: item.service_location_name || item.name || '',
    })),
    zones: zones.map((item) => ({
      id: String(item._id),
      name: item.name || '',
      service_location_id: item.service_location_id ? String(item.service_location_id) : '',
    })),
  };
}
