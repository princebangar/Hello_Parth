import api from '../api/axiosInstance';

/**
 * Taxi upload client — same practice as food: multipart FormData → storage.service (WebP → /uploads).
 */
const toUploadFile = (input, fallbackName = 'upload.jpg') => {
  if (input instanceof File) return input;
  if (input instanceof Blob) {
    return new File([input], fallbackName, { type: input.type || 'image/jpeg' });
  }

  const dataUrl = String(input || '');
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Upload requires a File or image data URL');
  }

  const [meta, content] = dataUrl.split(',');
  const mimeMatch = meta.match(/^data:([^;]+);base64$/i);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(content || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const ext = mime.split('/')[1] || 'jpg';
  return new File([bytes], `upload.${ext}`, { type: mime });
};

export const uploadService = {
  /**
   * Preferred: upload a File/Blob via multipart (food-style).
   * Also accepts a data URL and converts it to a File before sending FormData.
   */
  uploadImage: async (fileOrDataUrl, folder = 'general', options = {}) => {
    const file = toUploadFile(fileOrDataUrl);
    return uploadService.uploadImageFile(file, folder, options);
  },

  /**
   * @param {File|Blob} file
   * @param {string} folder
   * @param {{ replaceUrl?: string }} [options]
   */
  uploadImageFile: async (file, folder = 'general', options = {}) => {
    try {
      const formData = new FormData();
      formData.append('image', file, file?.name || 'upload.jpg');
      formData.append('folder', folder);
      if (options.replaceUrl) {
        formData.append('replaceUrl', options.replaceUrl);
      }

      const response = await api.post('/common/upload/image', formData);
      return response?.data || response;
    } catch (error) {
      console.error('Upload Service Error:', error);
      throw error;
    }
  },

  /** Delete an uploaded asset from the live /uploads folder. */
  deleteImage: async (url) => {
    if (!url) return;
    try {
      await api.delete('/common/upload/image', { data: { url } });
    } catch (error) {
      console.error('Upload delete error:', error);
      throw error;
    }
  },
};
