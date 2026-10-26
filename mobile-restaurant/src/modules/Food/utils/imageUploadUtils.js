// Web: modules/Food/utils/imageUploadUtils.js — same exports and options.
// The web asked the Flutter wrapper for the native camera / gallery (window.flutter_inappwebview.callHandler) and fell
// back to a hidden <input type="file"> in browsers. The app IS the native shell now, so every call opens the system
// camera / photo picker (src/lib/media.js pickImage, expo-image-picker) and hands the picked photo to onSelectFile as a
// file descriptor { uri, name, type, width, height, size } — FormData.append(field, file) uploads it as on the web.
import * as ImagePicker from "expo-image-picker"
import { File, Paths } from "expo-file-system"
import { toast } from "@/lib/toast"
import { pickImage } from "@/lib/media"
import { compressImageForUpload } from "../../../shared/utils/imageCompressor.js"

const extensionForMime = (mimeType = "") =>
  mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg"

const decodeBase64 = (base64) => {
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Converts base64 image data (the old Flutter bridge reply) into a file. In the app the bytes are written to the cache
 * folder and a { uri, name, type, size } file descriptor is returned (there is no browser File object).
 */
export const convertBase64ToFile = (
  base64Value,
  mimeType = "image/jpeg",
  fileNamePrefix = "upload",
  originalFileName = "",
) => {
  if (!base64Value || typeof base64Value !== "string") {
    throw new Error("Invalid base64 image data")
  }

  let pureBase64 = base64Value
  if (base64Value.includes(",")) {
    pureBase64 = base64Value.split(",")[1]
  }

  try {
    const bytes = decodeBase64(pureBase64)
    const normalizedFileName = String(originalFileName || "").trim()
    const extension = normalizedFileName.includes(".")
      ? normalizedFileName.split(".").pop()
      : extensionForMime(mimeType)
    const fileName = normalizedFileName || `${fileNamePrefix}-${Date.now()}.${extension}`
    const target = new File(Paths.cache, fileName)
    if (target.exists) target.delete()
    target.create()
    target.write(bytes)
    return { uri: target.uri, name: fileName, type: mimeType, size: bytes.length }
  } catch (error) {
    console.error("Base64 conversion failed:", error)
    throw new Error("Failed to process image data")
  }
}

const notifySelectedFile = async (file, onSelectFile, compressOptions, shouldCompress = true) => {
  if (!shouldCompress || !file || !String(file.type || "").startsWith("image/")) {
    onSelectFile(file)
    return
  }

  try {
    const compressed = await compressImageForUpload(file, compressOptions)
    onSelectFile(compressed)
  } catch (error) {
    console.warn("Image compression failed during selection:", error)
    onSelectFile(file)
  }
}

const toFileDescriptor = (asset, fileNamePrefix) => {
  const type = asset?.mimeType || "image/jpeg"
  return {
    uri: asset.uri,
    name: asset.fileName || `${fileNamePrefix}-${Date.now()}.${extensionForMime(type)}`,
    type,
    width: asset.width,
    height: asset.height,
    size: asset.fileSize,
  }
}

// Gallery with several photos (the web's multi-pick bridge reply); pickImage() returns one photo only.
const pickManyFromGallery = async ({ quality, fileNamePrefix }) => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    const err = new Error("Photo permission denied")
    err.code = "PERMISSION_DENIED"
    throw err
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality,
    allowsMultipleSelection: true,
  })
  if (res.canceled || !Array.isArray(res.assets) || res.assets.length === 0) return []
  return res.assets.map((asset) => toFileDescriptor(asset, fileNamePrefix))
}

const openNativePicker = async ({
  isCamera,
  onSelectFile,
  fileNamePrefix,
  quality = 0.8,
  onCancel,
  compressOptions,
  shouldCompress = true,
  multiple = false,
}) => {
  try {
    if (!isCamera && multiple === true) {
      const files = (await pickManyFromGallery({ quality, fileNamePrefix })).filter((file) =>
        String(file.type || "").startsWith("image/"),
      )
      if (!files.length) {
        if (typeof onCancel === "function") onCancel()
        return { status: "cancelled" }
      }
      for (const file of files) {
        await notifySelectedFile(file, onSelectFile, compressOptions, shouldCompress)
      }
      return { status: "success" }
    }

    const picked = await pickImage({ source: isCamera ? "camera" : "library", quality })
    if (!picked) {
      if (typeof onCancel === "function") onCancel()
      return { status: "cancelled" }
    }
    const file = {
      ...picked,
      name: picked.name || `${fileNamePrefix}-${Date.now()}.${extensionForMime(picked.type)}`,
    }
    if (!String(file.type || "").startsWith("image/")) {
      return { status: "failed", lastError: new Error("Picker returned invalid image data") }
    }
    await notifySelectedFile(file, onSelectFile, compressOptions, shouldCompress)
    return { status: "success" }
  } catch (error) {
    return { status: "failed", lastError: error }
  }
}

/**
 * Camera opener kept under the web's name (it was the browser fallback); in the app it opens the system camera.
 */
export const openBrowserCameraFallback = (onSelectFile, fallbackInputRef = null, options = {}) => {
  void fallbackInputRef
  const { compressOptions, shouldCompress = true } = options
  if (!onSelectFile || typeof onSelectFile !== "function") {
    console.warn("openBrowserCameraFallback: onSelectFile callback not provided")
    return
  }

  void openNativePicker({
    isCamera: true,
    onSelectFile,
    fileNamePrefix: "camera-photo",
    compressOptions,
    shouldCompress,
  }).then((outcome) => {
    if (outcome.status !== "failed") return
    const error = outcome.lastError
    console.error("Camera failed:", error)
    if (error?.message && !error.message.includes("canceled") && !error.message.includes("cancelled")) {
      toast.error("Could not open camera")
    }
  })
}

/**
 * The web checked for the Flutter wrapper here. The app is the native shell, so the native camera / gallery is always
 * available (callers keep their "inside the app" branch: e.g. the camera-or-gallery chooser).
 */
export const isFlutterBridgeAvailable = () => true

/**
 * Unified image picker (camera or gallery).
 */
export const handleImageUpload = async ({
  source = "gallery",
  onSelectFile,
  fallbackInputRef = null,
  fileNamePrefix = "upload",
  quality = 0.8,
  onCancel,
  compress = true,
  compressOptions = undefined,
  multiple = false,
}) => {
  void fallbackInputRef
  if (!onSelectFile || typeof onSelectFile !== "function") {
    console.warn("handleImageUpload: onSelectFile callback not provided")
    return
  }

  const isCamera = source === "camera"

  const outcome = await openNativePicker({
    isCamera,
    onSelectFile,
    fileNamePrefix,
    quality,
    onCancel,
    compressOptions,
    shouldCompress: compress,
    multiple,
  })

  if (outcome.status === "failed") {
    console.error(`Native ${isCamera ? "camera" : "gallery"} failed:`, outcome.lastError)
    toast.error(
      isCamera
        ? "Could not open camera. Please try again."
        : "Could not open gallery. Please try again.",
    )
  }
}

/**
 * Open the camera
 */
export const openCamera = async ({
  onSelectFile,
  fileNamePrefix = "camera-photo",
  quality = 0.8,
  fallbackInputRef = null,
  onCancel,
  compress = true,
  compressOptions = undefined,
}) => {
  return handleImageUpload({
    source: "camera",
    onSelectFile,
    fallbackInputRef,
    fileNamePrefix,
    quality,
    onCancel,
    compress,
    compressOptions,
  })
}

/**
 * Open the gallery
 */
export const openGallery = async ({
  onSelectFile,
  fileNamePrefix = "gallery-photo",
  fallbackInputRef = null,
  onCancel,
  compress = true,
  compressOptions = undefined,
  multiple = false,
}) => {
  return handleImageUpload({
    source: "gallery",
    onSelectFile,
    fallbackInputRef,
    fileNamePrefix,
    onCancel,
    compress,
    compressOptions,
    multiple,
  })
}
