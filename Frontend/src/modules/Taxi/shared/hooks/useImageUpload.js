import { useState, useCallback, useRef, useEffect } from 'react';
import { uploadService } from '../services/uploadService';
import toast from 'react-hot-toast';

/**
 * Hook for managing image uploads with previews.
 * Uses shared backend storage (same as food): WebP → /var/www/uploads.
 * Pass replaceUrl / getReplaceUrl so the previous file is deleted on replace.
 */
export const useImageUpload = (options = {}) => {
  const {
    folder = 'general',
    replaceUrl,
    getReplaceUrl,
    onSuccess = () => {},
    onError = () => {},
  } = options;

  const replaceUrlRef = useRef(replaceUrl);
  useEffect(() => {
    replaceUrlRef.current = replaceUrl;
  }, [replaceUrl]);

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  const handleFileChange = useCallback(async (e) => {
    const input = e?.target || e?.currentTarget;
    const file = input?.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error('Unable to read selected image'));
        r.onloadend = () => resolve(r.result);
        r.readAsDataURL(file);
      });

      if (!String(base64 || '').startsWith('data:image/')) {
        toast.error('Please select a valid image file');
        return;
      }

      setPreview(base64);

      const previous =
        (typeof getReplaceUrl === 'function' ? getReplaceUrl() : null) ||
        replaceUrlRef.current ||
        imageUrl ||
        '';

      const result = await uploadService.uploadImage(base64, folder, {
        replaceUrl: previous && !String(previous).startsWith('data:') ? previous : undefined,
      });

      const url = result.secureUrl || result.url;
      setImageUrl(url);
      onSuccess(url);
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Upload Hook Error:', error);
      toast.error('Failed to upload image. Please try again.');
      onError(error);
    } finally {
      if (input) {
        input.value = '';
      }
      setUploading(false);
    }
  }, [folder, getReplaceUrl, imageUrl, onSuccess, onError]);

  const reset = useCallback(() => {
    setPreview(null);
    setImageUrl(null);
    setUploading(false);
  }, []);

  return {
    uploading,
    preview,
    imageUrl,
    handleFileChange,
    reset,
    setPreview,
    setImageUrl,
  };
};
