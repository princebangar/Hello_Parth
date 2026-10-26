// Native version of the web's deliveryOnboardingStorage.js (same exports, same session keys).
// Web: the signup document photos (File objects) lived in IndexedDB "DeliveryOnboardingFiles" (+ an in-memory copy),
// were shrunk with a canvas, and previews were blob: URLs. Here a document is a { uri, name, type, size } descriptor
// (what pickImage() returns and what FormData uploads); a copy is kept in the app's document folder
// "DeliveryOnboardingFiles/<docType>-<time>.<ext>" (the IndexedDB equivalent), shrinking uses shrinkImage(), and the preview
// is the file's own uri.
import { Directory, File, Paths } from "expo-file-system"
import { clearModuleAuth } from "@food/utils/auth"
import { clearOnboardingFcmLocal } from "@food/utils/firebaseMessaging"
import { shrinkImage } from "@/lib/media"

export const DELIVERY_SIGNUP_DOC_TYPES = [
  "profilePhoto",
  "aadharPhoto",
  "panPhoto",
  "drivingLicensePhoto",
]

const ONBOARDING_SESSION_KEYS = [
  "deliverySignupDetails",
  "deliverySignupDocs",
  "deliveryNeedsRegistration",
  "deliveryAuthData",
]

const DELIVERY_FILES_DB = "DeliveryOnboardingFiles"
const IMAGE_COMPRESS_TIMEOUT_MS = 8000

const withTimeout = (promise, timeoutMs, timeoutValueFactory) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      try {
        resolve(timeoutValueFactory())
      } catch (error) {
        reject(error)
      }
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })

const getFilesDir = () => {
  const dir = new Directory(Paths.document, DELIVERY_FILES_DB)
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
  return dir
}

/** A picked / stored document: { uri, name, type } (size optional). */
const isUploadableFile = (file) =>
  Boolean(file && typeof file === "object" && typeof file.uri === "string" && file.uri)

/** In-memory copy (the web kept one too, for when IndexedDB hung). */
const signupDocumentMemory = Object.create(null)

const extensionForType = (type = "") =>
  type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"

const toSignupFile = (file, fallbackName = "document.jpg") => {
  const type = file?.type || "image/jpeg"
  const extension = extensionForType(type)
  const name = file?.name || String(fallbackName || "document").replace(/\.[^.]+$/, "") + `.${extension}`
  return { uri: file.uri, name, type, size: file?.size }
}

const fileSize = (uri) => {
  try {
    const f = new File(uri)
    return f.exists ? f.size : undefined
  } catch {
    return undefined
  }
}

const compressSignupDocumentFile = async (file) => {
  const maxBytes = 1.5 * 1024 * 1024
  const maxDimension = 1600
  const original = toSignupFile(file)
  const originalSize = original.size ?? fileSize(original.uri) ?? 0

  const out = await shrinkImage(original.uri, { maxSide: maxDimension, quality: 0.82 })
  const size = fileSize(out.uri) ?? 0
  if (!out?.uri || !size || (originalSize && size >= originalSize) || size > maxBytes) {
    return original
  }

  const baseName = String(original.name || "document").replace(/\.[^.]+$/, "")
  return { uri: out.uri, name: `${baseName}.jpg`, type: "image/jpeg", size }
}

export const prepareSignupDocumentFile = async (file) => {
  if (!isUploadableFile(file) || !String(file.type || "image/jpeg").startsWith("image/")) {
    throw new Error("Invalid image file")
  }

  const original = toSignupFile(file)
  const size = original.size ?? fileSize(original.uri) ?? 0

  // Keep small images as-is (including webp).
  if (size && size <= 400 * 1024) {
    return { ...original, size }
  }

  try {
    return await withTimeout(
      compressSignupDocumentFile({ ...original, size }),
      IMAGE_COMPRESS_TIMEOUT_MS,
      () => original,
    )
  } catch {
    return original
  }
}

// "<docType>-<time>.<ext>": a new name per save, so the image cache never shows the previous photo
const storedEntries = (docType) => {
  try {
    return getFilesDir()
      .list()
      .filter((entry) => entry instanceof File && String(entry.name || "").startsWith(`${docType}-`))
  } catch {
    return []
  }
}

const storedFileFor = (docType) => {
  const entries = storedEntries(docType).filter((f) => f.exists)
  return entries.length ? entries[entries.length - 1] : null
}

const removeStoredFile = (docType) => {
  storedEntries(docType).forEach((f) => {
    try {
      if (f.exists) f.delete()
    } catch {
      // ignore
    }
  })
}

export const saveSignupDocumentToDB = async (docType, file) => {
  if (!DELIVERY_SIGNUP_DOC_TYPES.includes(docType) || !isUploadableFile(file)) return

  const prepared = toSignupFile(file, `${docType}.jpg`)

  try {
    removeStoredFile(docType)
    const dest = new File(getFilesDir(), `${docType}-${Date.now()}.${extensionForType(prepared.type)}`)
    new File(prepared.uri).copy(dest)
    signupDocumentMemory[docType] = { ...prepared, uri: dest.uri, size: dest.size }
  } catch {
    // Session memory still holds the picked file for preview + submit.
    signupDocumentMemory[docType] = prepared
  }
}

export const getSignupDocumentFromDB = async (docType) => {
  if (!DELIVERY_SIGNUP_DOC_TYPES.includes(docType)) return null

  const documents = await getAllSignupDocumentsFromDB()
  return documents[docType] || null
}

export const getAllSignupDocumentsFromDB = async () => {
  const emptyResult = DELIVERY_SIGNUP_DOC_TYPES.reduce((acc, docType) => {
    acc[docType] = null
    return acc
  }, {})

  // Prefer in-memory copies; else the stored copy in the document folder.
  return DELIVERY_SIGNUP_DOC_TYPES.reduce((acc, docType) => {
    const memoryFile = signupDocumentMemory[docType]
    if (isUploadableFile(memoryFile)) {
      acc[docType] = memoryFile
      return acc
    }
    const stored = storedFileFor(docType)
    if (stored) {
      const type = stored.uri.endsWith(".png") ? "image/png" : stored.uri.endsWith(".webp") ? "image/webp" : "image/jpeg"
      acc[docType] = { uri: stored.uri, name: stored.name, type, size: stored.size }
    }
    return acc
  }, { ...emptyResult })
}

export const deleteSignupDocumentFromDB = async (docType) => {
  if (!DELIVERY_SIGNUP_DOC_TYPES.includes(docType)) return

  delete signupDocumentMemory[docType]
  removeStoredFile(docType)
}

export const clearSignupDocumentsFromDB = async () => {
  DELIVERY_SIGNUP_DOC_TYPES.forEach((docType) => {
    delete signupDocumentMemory[docType]
  })

  try {
    const dir = new Directory(Paths.document, DELIVERY_FILES_DB)
    if (dir.exists) dir.delete()
  } catch {
    // Ignore cleanup failures.
  }
}

// Web: very old builds kept base64 data URLs in sessionStorage "deliverySignupDocs" and moved them to IndexedDB.
// sessionStorage starts empty in the app, so only the cleanup of that key remains meaningful; data URLs are still
// accepted (written to a file) so the behaviour matches.
const migrateLegacySignupDocsToIndexedDB = async () => {
  if (typeof sessionStorage === "undefined") return

  const saved = sessionStorage.getItem("deliverySignupDocs")
  if (!saved) return

  try {
    const parsed = JSON.parse(saved)
    let migrated = false

    for (const docType of DELIVERY_SIGNUP_DOC_TYPES) {
      const stored = parsed?.[docType]
      const dataUrl = typeof stored === "string" ? stored : typeof stored?.dataUrl === "string" ? stored.dataUrl : ""
      if (!dataUrl.startsWith("data:image")) continue
      const [header, base64] = dataUrl.split(",")
      const mimeType = stored?.type || header.match(/:(.*?);/)?.[1] || "image/jpeg"
      const tmp = new File(Paths.cache, `${docType}_legacy.${extensionForType(mimeType)}`)
      if (tmp.exists) tmp.delete()
      tmp.create()
      tmp.write(base64, { encoding: "base64" })
      const prepared = await prepareSignupDocumentFile({ uri: tmp.uri, name: stored?.name || "document.jpg", type: mimeType })
      await saveSignupDocumentToDB(docType, prepared)
      migrated = true
    }

    if (migrated) {
      sessionStorage.removeItem("deliverySignupDocs")
    }
  } catch {
    sessionStorage.removeItem("deliverySignupDocs")
  }
}

export const loadSignupDocumentPreviews = async () => {
  await migrateLegacySignupDocsToIndexedDB()

  const documents = await getAllSignupDocumentsFromDB()
  const previews = {}

  for (const docType of DELIVERY_SIGNUP_DOC_TYPES) {
    const file = documents[docType]
    if (file) {
      previews[docType] = file.uri
    }
  }

  return previews
}

export const hasDeliveryStep1Progress = (formData = {}) => {
  const textFields = [
    "name",
    "email",
    "address",
    "city",
    "state",
    "vehicleName",
    "vehicleNumber",
    "drivingLicenseNumber",
    "panNumber",
    "aadharNumber",
  ]

  if (textFields.some((field) => String(formData[field] || "").trim())) {
    return true
  }

  if (formData.vehicleType && formData.vehicleType !== "bike") {
    return true
  }

  return false
}

const getOnboardingPhoneDigits = () => {
  if (typeof sessionStorage === "undefined") return ""

  try {
    const details = JSON.parse(sessionStorage.getItem("deliverySignupDetails") || "{}")
    return String(details.phone || "").replace(/\D/g, "")
  } catch {
    return ""
  }
}

export async function clearDeliveryOnboardingData() {
  if (typeof sessionStorage !== "undefined") {
    const phone = getOnboardingPhoneDigits()

    ONBOARDING_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key))

    if (phone) {
      sessionStorage.removeItem(`delivery_block_expires_at_${phone}`)
      sessionStorage.removeItem(`delivery_resend_expires_at_${phone}`)
    }

    sessionStorage.removeItem("delivery_block_expires_at")
    sessionStorage.removeItem("delivery_resend_expires_at")
  }

  await clearSignupDocumentsFromDB()
  clearOnboardingFcmLocal("delivery")
  clearModuleAuth("delivery")
}
