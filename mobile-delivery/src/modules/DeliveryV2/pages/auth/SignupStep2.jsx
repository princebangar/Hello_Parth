import React, { useState, useEffect, useRef } from "react"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { ArrowLeft, Upload, X, Check, Camera, Image as ImageIcon } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { pickImage } from "@/lib/media"
import { AppImage, Screen, Text } from "@/native/ui"
import { colors, fonts } from "@/theme"
import { deliveryAPI } from "@food/api"
import {
  getUserFacingApiError,
  isAlreadyExistsError,
  showUserFacingApiError,
} from "@/shared/utils/apiError"
import { prepareUploadFile } from "@/shared/utils/imageCompressor"
import useDeliveryOnboardingExitGuard from "../../hooks/useDeliveryOnboardingExitGuard"
import {
  DELIVERY_SIGNUP_DOC_TYPES,
  clearSignupDocumentsFromDB,
  deleteSignupDocumentFromDB,
  getAllSignupDocumentsFromDB,
  loadSignupDocumentPreviews,
  prepareSignupDocumentFile,
  saveSignupDocumentToDB,
} from "../../utils/deliveryOnboardingStorage"
import {
  collectFcmTokenForSignup,
  finalizeDeliveryPendingSubmission,
  prefetchModuleFcmToken,
} from "@food/utils/firebaseMessaging"

const debugError = () => { }

const createEmptyPreviewState = () =>
  DELIVERY_SIGNUP_DOC_TYPES.reduce((acc, docType) => {
    acc[docType] = null
    return acc
  }, {})

function DocumentUpload({ docType, label, required = true, isUploading, previewSrc, onCamera, onGallery, onRemove }) {
  const uploaded = Boolean(previewSrc)

  return (
    <View style={styles.card}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.red[500] }}>{" *"}</Text> : null}
      </Text>

      {uploaded ? (
        <View>
          <AppImage src={previewSrc} style={styles.preview} contentFit="cover" accessibilityLabel={label} />
          <Pressable onPress={() => onRemove(docType)} style={({ pressed }) => [styles.removeBtn, pressed && { backgroundColor: colors.red[600] }]}>
            <X size={16} color={colors.white} />
          </Pressable>
          <View style={styles.uploadedBadge}>
            <Check size={14} color={colors.white} />
            <Text style={styles.uploadedText}>Uploaded</Text>
          </View>
        </View>
      ) : (
        <View style={styles.dropZone}>
          <View style={styles.dropInner}>
            {isUploading ? (
              <>
                <ActivityIndicator size="large" color="#00B761" style={{ marginBottom: 8 }} />
                <Text style={styles.dropText}>Uploading...</Text>
              </>
            ) : (
              <>
                <Upload size={32} color={colors.gray[400]} style={{ marginBottom: 8 }} />
                <Text style={[styles.dropText, { marginBottom: 4 }]}>Upload document</Text>
                <Text style={styles.dropHint}>PNG, JPG up to 5MB</Text>
              </>
            )}
          </View>

          {!isUploading ? (
            <View style={styles.pickRow}>
              <Pressable
                onPress={() => onCamera(docType)}
                style={({ pressed }) => [styles.pickBtn, { backgroundColor: colors.gray[900] }, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.black }]}
              >
                <Camera size={16} color={colors.white} />
                <Text style={styles.pickText}>Take Photo</Text>
              </Pressable>
              <Pressable
                onPress={() => onGallery(docType)}
                style={({ pressed }) => [styles.pickBtn, { backgroundColor: "#15498B" }, pressed && { transform: [{ scale: 0.95 }] }]}
              >
                <ImageIcon size={16} color={colors.white} />
                <Text style={styles.pickText}>Gallery</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
}

export default function SignupStep2() {
  const navigate = useNavigate()
  const { handleBack } = useDeliveryOnboardingExitGuard("documents")
  const previewUrlsRef = useRef(createEmptyPreviewState())
  const [previewUrls, setPreviewUrls] = useState(createEmptyPreviewState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploading, setUploading] = useState({})

  useEffect(() => {
    prefetchModuleFcmToken("delivery")
  }, [])

  useEffect(() => {
    let cancelled = false

    const hydrateDocuments = async () => {
      try {
        const previews = await loadSignupDocumentPreviews()
        if (cancelled) return

        previewUrlsRef.current = previews
        setPreviewUrls(previews)
      } catch (error) {
        debugError("Failed to hydrate signup documents:", error)
      }
    }

    void hydrateDocuments()

    return () => {
      cancelled = true
      previewUrlsRef.current = createEmptyPreviewState()
    }
  }, [])

  const getPreviewSrc = (docType) => previewUrls[docType] || null

  const hasUploadedDoc = (docType) => Boolean(getPreviewSrc(docType))

  const handleFileSelect = async (docType, file) => {
    if (!file) return

    if (!String(file.type || "image/jpeg").startsWith("image/")) {
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      return
    }

    setUploading((prev) => ({ ...prev, [docType]: true }))

    // Failsafe: never leave the UI stuck on "Uploading..." if compression hangs.
    let finished = false
    const failSafeId = setTimeout(() => {
      if (!finished) {
        setUploading((prev) => ({ ...prev, [docType]: false }))
      }
    }, 12000)

    try {
      const preparedFile = await prepareSignupDocumentFile(file)
      await saveSignupDocumentToDB(docType, preparedFile)
      const stored = (await getAllSignupDocumentsFromDB())[docType]
      const nextPreviewUrl = stored?.uri || preparedFile.uri

      previewUrlsRef.current = {
        ...previewUrlsRef.current,
        [docType]: nextPreviewUrl,
      }
      setPreviewUrls((prev) => ({
        ...prev,
        [docType]: nextPreviewUrl,
      }))
    } catch (error) {
      debugError("Failed to store document preview:", error)
      toast.error("Could not process image. Please try another photo.")
    } finally {
      finished = true
      clearTimeout(failSafeId)
      setUploading((prev) => ({ ...prev, [docType]: false }))
    }
  }

  // Web: openCamera / openGallery (Flutter bridge picker, file input fallback)
  const pickFor = async (docType, source) => {
    try {
      const file = await pickImage({ source })
      if (file) await handleFileSelect(docType, file)
    } catch (error) {
      debugError("Picker failed:", error)
      toast.error(
        source === "camera"
          ? "Could not open camera. Please try again."
          : "Could not open gallery. Please try again.",
      )
    }
  }

  const handleTakeCameraPhoto = (docType) => pickFor(docType, "camera")

  const handlePickFromGallery = (docType) => pickFor(docType, "library")

  const handleRemove = async (docType) => {
    await deleteSignupDocumentFromDB(docType)

    previewUrlsRef.current = {
      ...previewUrlsRef.current,
      [docType]: null,
    }
    setPreviewUrls((prev) => ({
      ...prev,
      [docType]: null,
    }))
  }

  const handleSubmit = async () => {
    const resolvedDocuments = await getAllSignupDocumentsFromDB()

    const missingDocument = DELIVERY_SIGNUP_DOC_TYPES.find((docType) => !resolvedDocuments[docType])
    if (missingDocument) {
      return
    }

    const raw = sessionStorage.getItem("deliverySignupDetails")
    if (!raw) {
      navigate("/food/delivery/signup", { replace: true })
      return
    }

    let details
    try {
      details = JSON.parse(raw)
    } catch {
      navigate("/food/delivery/signup", { replace: true })
      return
    }

    const { fcmToken, platform } = await collectFcmTokenForSignup("delivery")

    const [profilePhoto, aadharPhoto, panPhoto, drivingLicensePhoto] = await Promise.all([
      prepareUploadFile(resolvedDocuments.profilePhoto, { preset: "profile" }),
      prepareUploadFile(resolvedDocuments.aadharPhoto),
      prepareUploadFile(resolvedDocuments.panPhoto),
      prepareUploadFile(resolvedDocuments.drivingLicensePhoto),
    ])
    const asPart = (f) => ({ uri: f.uri, name: f.name, type: f.type })

    const formData = new FormData()
    formData.append("name", details.name || "")
    formData.append("phone", String(details.phone || "").replace(/\D/g, "").slice(0, 15))
    formData.append("email", String(details.email || "").trim().toLowerCase())
    if (details.ref) formData.append("ref", String(details.ref).trim())
    if (details.countryCode) formData.append("countryCode", details.countryCode)
    if (details.address) formData.append("address", details.address)
    if (details.city) formData.append("city", details.city)
    if (details.state) formData.append("state", details.state)
    if (details.vehicleType) formData.append("vehicleType", details.vehicleType)
    if (details.vehicleName) formData.append("vehicleName", details.vehicleName)
    if (details.vehicleNumber) formData.append("vehicleNumber", details.vehicleNumber)
    if (details.drivingLicenseNumber) {
      formData.append("drivingLicenseNumber", details.drivingLicenseNumber)
      formData.append("documents[drivingLicense][number]", details.drivingLicenseNumber)
    }
    if (details.panNumber) formData.append("panNumber", details.panNumber)
    if (details.aadharNumber) formData.append("aadharNumber", details.aadharNumber)
    formData.append("profilePhoto", asPart(profilePhoto))
    formData.append("aadharPhoto", asPart(aadharPhoto))
    formData.append("panPhoto", asPart(panPhoto))
    formData.append("drivingLicensePhoto", asPart(drivingLicensePhoto))

    if (fcmToken) {
      formData.append("fcmToken", fcmToken)
      formData.append("platform", platform)
    }

    const hasDeliveryAuth =
      typeof localStorage !== "undefined" &&
      localStorage.getItem("delivery_authenticated") === "true" &&
      Boolean(localStorage.getItem("delivery_accessToken"))

    const shouldRegister =
      sessionStorage.getItem("deliveryNeedsRegistration") === "true" ||
      !hasDeliveryAuth

    setIsSubmitting(true)

    try {
      const response = shouldRegister
        ? await deliveryAPI.register(formData)
        : await deliveryAPI.completeProfile(formData)

      if (response?.data?.success) {
        sessionStorage.removeItem("deliverySignupDetails")
        sessionStorage.removeItem("deliverySignupDocs")
        await clearSignupDocumentsFromDB()
        if (shouldRegister) {
          sessionStorage.removeItem("deliveryNeedsRegistration")
          const phone = String(details.phone || "").replace(/\D/g, "").slice(-10)
          finalizeDeliveryPendingSubmission(navigate, phone, { fcmToken, platform })
        } else {
          toast.success("Profile submitted. Waiting for admin approval.")
          setTimeout(() => navigate("/food/delivery", { replace: true }), 1500)
        }
      }
    } catch (error) {
      debugError("Error submitting registration:", error)
      const errorMsg = getUserFacingApiError(
        error,
        "Registration failed. Please try again.",
      )
      // Already registered / pending — send user to verification screen instead of raw API error.
      if (isAlreadyExistsError(errorMsg) || isAlreadyExistsError(error)) {
        const phone = String(details.phone || "").replace(/\D/g, "").slice(-10)
        sessionStorage.removeItem("deliveryNeedsRegistration")
        finalizeDeliveryPendingSubmission(navigate, phone, { fcmToken, platform })
        return
      }
      showUserFacingApiError(error, "Registration failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const allDocumentsUploaded = DELIVERY_SIGNUP_DOC_TYPES.every((docType) => hasUploadedDoc(docType))
  const submitDisabled = isSubmitting || !allDocumentsUploaded

  const docProps = (docType) => ({
    docType,
    isUploading: Boolean(uploading[docType]),
    previewSrc: getPreviewSrc(docType),
    onCamera: handleTakeCameraPhoto,
    onGallery: handlePickFromGallery,
    onRemove: handleRemove,
  })

  return (
    <Screen bg={colors.gray[100]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.headerTitle}>Upload Documents</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ marginBottom: 24 }}>
          <Text style={styles.h2}>Document Verification</Text>
          <Text style={styles.sub}>Please upload clear photos of your documents</Text>
        </View>

        <View style={{ gap: 16 }}>
          <DocumentUpload {...docProps("profilePhoto")} label="Profile Photo" required={true} />
          <DocumentUpload {...docProps("aadharPhoto")} label="Aadhar Card Photo" required={true} />
          <DocumentUpload {...docProps("panPhoto")} label="PAN Card Photo" required={true} />
          <DocumentUpload {...docProps("drivingLicensePhoto")} label="Driving License Photo" required={true} />

          <Pressable
            onPress={handleSubmit}
            disabled={submitDisabled}
            style={({ pressed }) => [styles.submitShell, !submitDisabled && styles.submitShadow, pressed && !submitDisabled && { transform: [{ scale: 0.98 }] }]}
          >
            {submitDisabled ? (
              <View style={[styles.submit, { backgroundColor: colors.gray[400] }]}>
                <Text style={styles.submitText}>{isSubmitting ? "Submitting..." : "Complete Signup"}</Text>
              </View>
            ) : (
              <LinearGradient colors={["#0E4B9C", "#021024"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submit}>
                <Text style={styles.submitText}>{isSubmitting ? "Submitting..." : "Complete Signup"}</Text>
              </LinearGradient>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    zIndex: 30,
  },
  backBtn: { padding: 8, borderRadius: 9999 },
  headerTitle: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 28, fontWeight: "500", color: "#0F1724", letterSpacing: 0.2 },
  content: { paddingHorizontal: 16, paddingVertical: 24 },
  h2: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: "700", color: colors.gray[900], marginBottom: 8, letterSpacing: 0.2 },
  sub: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  card: { backgroundColor: colors.white, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: colors.gray[200] },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.gray[700], marginBottom: 8 },
  preview: { width: "100%", height: 192, borderRadius: 10 },
  removeBtn: { position: "absolute", top: 8, right: 8, backgroundColor: colors.red[500], padding: 8, borderRadius: 9999 },
  uploadedBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "#00B761",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    elevation: 4,
  },
  uploadedText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  dropZone: {
    width: "100%",
    height: 192,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.gray[300],
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dropInner: { alignItems: "center", justifyContent: "center", paddingTop: 20, paddingBottom: 12 },
  dropText: { fontSize: 14, lineHeight: 20, color: colors.gray[500] },
  dropHint: { fontSize: 12, lineHeight: 16, color: colors.gray[400] },
  pickRow: { width: "100%", flexDirection: "row", gap: 8, paddingBottom: 16 },
  pickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  pickText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  submitShell: { width: "100%", marginTop: 24, borderRadius: 10 },
  submitShadow: { elevation: 6, shadowColor: "#0E4B9C", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  submit: { width: "100%", paddingVertical: 16, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  submitText: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: "700" },
})
