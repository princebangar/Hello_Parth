// Hook for managing image uploads with previews (POST /common/upload/image { image: base64 data URL, folder }).
// Web: handleFileChange(event) read <input type="file">'s file with FileReader. Native: handleFileChange() opens the
// gallery (@/lib/media pickImage); it also accepts an already-picked file ({ uri, type }) or an event-like
// { target: { files: [file] } } so callers keep the web's call shape.
import { useState, useCallback } from 'react';
import { File } from 'expo-file-system';
import { pickImage } from '@/lib/media';
import { toast } from '@/lib/toast';
import { uploadService } from '../services/uploadService';

const readAsDataUrl = async (file) => {
  if (!file?.uri) throw new Error('Unable to read selected image');
  const base64 = await new File(file.uri).base64();
  const type = String(file.type || 'image/jpeg');
  return `data:${type};base64,${base64}`;
};

const resolvePickedFile = async (arg) => {
  const fromEvent = arg?.target?.files?.[0] || arg?.currentTarget?.files?.[0];
  if (fromEvent) return fromEvent;
  if (arg?.uri) return arg;
  return pickImage({ source: arg?.source === 'camera' ? 'camera' : 'library' });
};

export const useImageUpload = (options = {}) => {
  const { folder = 'general', onSuccess = () => {}, onError = () => {} } = options;

  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  const handleFileChange = useCallback(
    async (arg) => {
      let file = null;
      try {
        file = await resolvePickedFile(arg);
      } catch (error) {
        if (error?.code === 'PERMISSION_DENIED') toast.error(error.message);
        return;
      }
      if (!file) return;

      try {
        setUploading(true);

        const base64 = await readAsDataUrl(file);

        if (!String(base64 || '').startsWith('data:image/')) {
          toast.error('Please select a valid image file');
          return;
        }

        setPreview(base64);

        const result = await uploadService.uploadImage(base64, folder);

        const url = result.secureUrl || result.url;
        setImageUrl(url);
        onSuccess(url);
        toast.success('Image uploaded');
      } catch (error) {
        console.error('Upload Hook Error:', error);
        toast.error('Failed to upload image. Please try again.');
        onError(error);
      } finally {
        setUploading(false);
      }
    },
    [folder, onSuccess, onError],
  );

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
