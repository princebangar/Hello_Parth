// Native replacements for <input type="file">, downloads, print and voice input.
import { Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { File, Paths } from 'expo-file-system';

/**
 * Image from camera or gallery -> { uri, name, type, width, height, size } (null if cancelled).
 * Append to FormData as: form.append('image', { uri, name, type }).
 */
export async function pickImage({ source = 'library', quality = 0.8, allowsEditing = false, aspect } = {}) {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    const err = new Error(source === 'camera' ? 'Camera permission denied' : 'Photo permission denied');
    err.code = 'PERMISSION_DENIED';
    throw err;
  }
  const opts = { mediaTypes: ['images'], quality, allowsEditing, aspect };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const type = a.mimeType || 'image/jpeg';
  const ext = type.split('/')[1] || 'jpg';
  return { uri: a.uri, name: a.fileName || `image_${Date.now()}.${ext}`, type, width: a.width, height: a.height, size: a.fileSize };
}

/** Any document -> { uri, name, type, size } (null if cancelled). */
export async function pickDocument({ type = '*/*' } = {}) {
  const res = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, type: a.mimeType || 'application/octet-stream', size: a.size };
}

/** Downloads `url` to the cache and opens the share sheet ("Save to device", Drive, WhatsApp ...). */
export async function downloadAndShare(url, filename, { mimeType, headers } = {}) {
  const name = filename || decodeURIComponent(String(url).split('/').pop()?.split('?')[0] || `file_${Date.now()}`);
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(url, target, { headers });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
  else await Linking.openURL(url);
  return file.uri;
}

/** Writes text (CSV, JSON ...) to a file and shares it. */
export async function shareTextFile(content, filename, mimeType = 'text/plain') {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(String(content));
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
  return file.uri;
}

/** window.print() / jsPDF replacement: renders HTML to a PDF and opens the share sheet (or the print dialog). */
export async function printHtml(html, { filename = 'document.pdf', share = true } = {}) {
  if (!share) {
    await Print.printAsync({ html });
    return null;
  }
  const { uri } = await Print.printToFileAsync({ html });
  let finalUri = uri;
  try {
    const src = new File(uri);
    const dest = new File(Paths.cache, filename);
    if (dest.exists) dest.delete();
    src.move(dest);
    finalUri = dest.uri;
  } catch {
    // keep the generated name
  }
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(finalUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
  return finalUri;
}

/** Opens a phone dialer / WhatsApp / maps / mail link like an <a href> would. */
export function openExternal(url) {
  return Linking.openURL(String(url)).catch(() => {});
}

/** Google Maps turn-by-turn navigation to a point (what the wrapper did for "Navigate" buttons). */
export function openMapsNavigation(lat, lng, label) {
  const q = `${lat},${lng}`;
  const url = Platform.OS === 'android' ? `google.navigation:q=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  return Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label || q)}`));
}
