import crypto from 'node:crypto';
import { Blob } from 'node:buffer';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';
import {
  storeImageFromDataUrl,
  storeFileBuffer,
} from '../services/storage.service.js';

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

const hasCloudinaryCredentials = () =>
  Boolean(env.cloudinary?.cloudName && env.cloudinary?.apiKey && env.cloudinary?.apiSecret);

const parseDataUrl = (dataUrl) => {
  const match = String(dataUrl || '').match(DATA_URL_PATTERN);

  if (!match) {
    throw new ApiError(400, 'A valid base64 image data URL is required');
  }

  const mimeType = match[1];
  const base64 = match[2];
  const extension = mimeType.split('/')[1] || 'jpg';

  return {
    mimeType,
    base64,
    extension,
  };
};

const buildSignature = (params, apiSecret) => {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
};

const toLocalUploadResult = (stored) => {
  const url = stored.url || stored.secure_url || '';
  return {
    secureUrl: url,
    publicId: stored.public_id || stored.filename || null,
    resourceType: stored.resource_type || 'image',
    format: stored.format || 'webp',
    bytes: stored.bytes || null,
    width: stored.width || null,
    height: stored.height || null,
    originalFilename: stored.original_filename || null,
    createdAt: stored.created_at || null,
    raw: stored,
  };
};

const uploadViaLocalStorage = async ({ dataUrl, folder, publicIdPrefix = 'upload' }) => {
  const scopedFolder = String(folder || env.cloudinary?.folder || 'hello-parth-taxi')
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9/_-]/g, '_') || 'hello-parth-taxi';

  try {
    const stored = await storeImageFromDataUrl(dataUrl, scopedFolder, {
      originalName: `${publicIdPrefix}.jpg`,
    });
    return toLocalUploadResult(stored);
  } catch (imageError) {
    // Non-image / resume-style data URLs fall back to raw storage.
    const match = String(dataUrl || '').match(DATA_URL_PATTERN);
    if (!match) {
      throw imageError;
    }

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const stored = await storeFileBuffer(
      buffer,
      scopedFolder,
      `${publicIdPrefix}.${mimeType.split('/')[1] || 'bin'}`,
      { mimeType },
    );
    return toLocalUploadResult(stored);
  }
};

export const uploadDataUrlToCloudinary = async ({
  dataUrl,
  folder = env.cloudinary?.folder || 'hello-parth-taxi',
  publicIdPrefix = 'driver-document',
  publicIdSuffix = '',
}) => {
  if (!hasCloudinaryCredentials()) {
    return uploadViaLocalStorage({ dataUrl, folder, publicIdPrefix });
  }

  const { mimeType, base64, extension } = parseDataUrl(dataUrl);
  const buffer = Buffer.from(base64, 'base64');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `${publicIdPrefix}-${Date.now()}${publicIdSuffix ? `-${publicIdSuffix}` : ''}`;

  const signature = buildSignature(
    {
      folder,
      format: 'webp',
      public_id: publicId,
      timestamp,
    },
    env.cloudinary.apiSecret,
  );

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), `upload.${extension}`);
  formData.append('api_key', env.cloudinary.apiKey);
  formData.append('timestamp', timestamp);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('format', 'webp');
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.message || 'Cloudinary upload failed');
  }

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    resourceType: payload.resource_type,
    format: payload.format,
    bytes: payload.bytes,
    width: payload.width,
    height: payload.height,
    originalFilename: payload.original_filename,
    createdAt: payload.created_at,
    raw: payload,
  };
};

export const uploadRawFileToCloudinary = async ({
  dataUrl,
  folder = env.cloudinary?.folder || 'hello-parth-taxi',
  publicIdPrefix = 'career-resume',
  publicIdSuffix = '',
}) => {
  if (!hasCloudinaryCredentials()) {
    return uploadViaLocalStorage({ dataUrl, folder, publicIdPrefix });
  }

  const { mimeType, base64, extension } = parseDataUrl(dataUrl);
  const buffer = Buffer.from(base64, 'base64');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `${publicIdPrefix}-${Date.now()}${publicIdSuffix ? `-${publicIdSuffix}` : ''}`;

  const isImage = mimeType.startsWith('image/');
  const resourceType = isImage ? 'image' : 'raw';

  const params = {
    folder,
    public_id: publicId,
    timestamp,
  };
  if (isImage) {
    params.format = 'webp';
  }

  const signature = buildSignature(params, env.cloudinary.apiSecret);

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), `upload.${extension}`);
  formData.append('api_key', env.cloudinary.apiKey);
  formData.append('timestamp', timestamp);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  if (isImage) {
    formData.append('format', 'webp');
  }
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.message || 'Cloudinary upload failed');
  }

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    resourceType: payload.resource_type,
    format: payload.format,
    bytes: payload.bytes,
    raw: payload,
  };
};
