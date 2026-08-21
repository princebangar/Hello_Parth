import { useState, useCallback, useRef, useEffect } from 'react';
import { uploadService } from '../services/uploadService';
import toast from 'react-hot-toast';

/**
 * Hook for managing image uploads with previews.
 * Food-style: File → multipart FormData → WebP on /uploads.
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

    if (!String(file.type || '').startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    let localPreview = '';
    try {
      setUploading(true);
      localPreview = URL.createObjectURL(file);
      setPreview(localPreview);

      const previous =
        (typeof getReplaceUrl === 'function' ? getReplaceUrl() : null) ||
        replaceUrlRef.current ||
        imageUrl ||
        '';

      const result = await uploadService.uploadImageFile(file, folder, {
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
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
        setPreview(null);
      }
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
