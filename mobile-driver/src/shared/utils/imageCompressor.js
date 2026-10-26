const DEFAULT_MAX_WIDTH = 2048
const DEFAULT_MAX_HEIGHT = 2048
const DEFAULT_QUALITY = 0.88
const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024

const PROFILE_PRESET = {
  maxWidth: 1024,
  maxHeight: 1024,
  maxBytes: 2 * 1024 * 1024,
  quality: 0.88,
}

export async function compressImageForUpload(file, options = {}) {
  // In the app a picked photo is a { uri, name, type } descriptor from src/lib/media.js pickImage(), which the system
  // picker already re-encodes (quality 0.8) - there is no canvas to re-encode it again. Browser Blobs never occur here.
  // The size options are accepted so the callers stay as on the web.
  void options
  return file
}

export async function compressImagesForUpload(files = [], options = {}) {
  const normalized = Array.from(files || []).filter(Boolean)
  return Promise.all(normalized.map((file) => compressImageForUpload(file, options)))
}

export async function prepareUploadFile(file, options = {}) {
  if (!file) return file

  const preset =
    options.preset === "profile"
      ? PROFILE_PRESET
      : {}

  return compressImageForUpload(file, { ...preset, ...options })
}

export async function prepareUploadFiles(files = [], options = {}) {
  const normalized = Array.from(files || []).filter(Boolean)
  return Promise.all(normalized.map((file) => prepareUploadFile(file, options)))
}

export async function appendCompressedImageToFormData(formData, fieldName, file, options = {}) {
  if (!file || !formData) return formData
  const prepared = await prepareUploadFile(file, options)
  formData.append(fieldName, prepared)
  return formData
}

export async function appendCompressedImagesToFormData(formData, fieldName, files = [], options = {}) {
  if (!formData) return formData
  const preparedFiles = await prepareUploadFiles(files, options)
  preparedFiles.forEach((file) => formData.append(fieldName, file))
  return formData
}

export { DEFAULT_MAX_BYTES, PROFILE_PRESET }
