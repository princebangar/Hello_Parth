import api from '../api/axiosInstance';

/**
 * Taxi upload client — hits shared backend storage (same storage.service as food).
 * Images are compressed to WebP and stored under /var/www/uploads.
 */
export const uploadService = {
  /**
   * @param {string} base64Image
   * @param {string} folder
   * @param {{ replaceUrl?: string }} [options]
   */
  uploadImage: async (base64Image, folder = 'general', options = {}) => {
    try {
      const response = await api.post('/common/upload/image', {
        image: base64Image,
        folder,
        replaceUrl: options.replaceUrl || undefined,
      });
      return response?.data || response;
    } catch (error) {
      console.error('Upload Service Error:', error);
      throw error;
    }
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

      const response = await api.post('/common/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
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
