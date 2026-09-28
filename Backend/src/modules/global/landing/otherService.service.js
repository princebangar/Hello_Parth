import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { OtherService } from './models/OtherService.js';

const assertObjectId = (id) => {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw new ValidationError('Invalid service id');
  }
};

const normalizeUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const isValidUrl = (value) => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const serialize = (doc = {}) => ({
  id: String(doc._id),
  name: doc.name || '',
  url: doc.url || '',
  image: doc.image || '',
  description: doc.description || '',
  isActive: doc.isActive !== false,
  sortOrder: Number(doc.sortOrder || 0),
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
});

const validatePayload = ({ name, url, image, description }, { partial = false } = {}) => {
  const result = {};

  if (name !== undefined || !partial) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) throw new ValidationError('Service name is required');
    if (trimmedName.length > 60) throw new ValidationError('Service name must be 60 characters or fewer');
    result.name = trimmedName;
  }

  if (url !== undefined || !partial) {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl || !isValidUrl(normalizedUrl)) {
      throw new ValidationError('A valid website URL is required');
    }
    result.url = normalizedUrl;
  }

  // Optional — a card can be posted without a banner image.
  if (image !== undefined) {
    result.image = String(image || '').trim();
  }

  if (description !== undefined) {
    const trimmedDescription = String(description || '').trim();
    if (trimmedDescription.length > 300) {
      throw new ValidationError('Description must be 300 characters or fewer');
    }
    result.description = trimmedDescription;
  }

  return result;
};

/** Admin: every card, newest-configured first. */
export async function listAllOtherServices() {
  const docs = await OtherService.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
  return docs.map(serialize);
}

/** Public landing page: only the active cards. */
export async function listPublicOtherServices() {
  const docs = await OtherService.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  return docs.map((doc) => ({
    id: String(doc._id),
    name: doc.name || '',
    url: doc.url || '',
    image: doc.image || '',
    description: doc.description || '',
  }));
}

export async function createOtherService(payload = {}) {
  const validated = validatePayload(payload);
  const doc = await OtherService.create({
    ...validated,
    isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
    sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
  });
  return serialize(doc);
}

export async function updateOtherService(id, payload = {}) {
  assertObjectId(id);
  const doc = await OtherService.findById(id);
  if (!doc) return null;

  const validated = validatePayload(payload, { partial: true });
  Object.assign(doc, validated);

  if (payload.isActive !== undefined) doc.isActive = Boolean(payload.isActive);
  if (payload.sortOrder !== undefined && Number.isFinite(Number(payload.sortOrder))) {
    doc.sortOrder = Number(payload.sortOrder);
  }

  await doc.save();
  return serialize(doc);
}

export async function deleteOtherService(id) {
  assertObjectId(id);
  const doc = await OtherService.findByIdAndDelete(id);
  return doc ? serialize(doc) : null;
}
