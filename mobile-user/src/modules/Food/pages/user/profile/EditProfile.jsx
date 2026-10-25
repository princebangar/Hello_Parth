// Web: modules/Food/pages/user/profile/EditProfile.jsx
// Photo: the app is the native shell, so (as inside the web's Flutter wrapper) the pencil opens the camera-or-gallery
// chooser (ImageSourcePicker -> @/lib/media pickImage); the picked { uri, name, type } file goes through the same
// crop dialog and is uploaded by userAPI.uploadProfileImage on "Update profile". The web's FileReader data-URL preview
// is the picked file's local uri.
import { useState, useEffect, useRef } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { BlurView } from "expo-blur"
import Svg, { Path } from "react-native-svg"
import { ArrowLeft, X, Pencil, Loader2 } from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { AppImage, Text, TextInput } from "@/native/ui"
import { alpha, colors, fontSize, makeStyles, sp, useTheme } from "@/theme"
import { Button } from "@food/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@food/components/ui/dropdown-menu"
import { ImageCropper } from "@food/components/ImageCropper"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { Avatar } from "@food/components/ui/avatar"
import { useProfile } from "@food/context/ProfileContext"
import { normalizeImageUrl } from "@food/utils/common"
import { userAPI } from "@food/api"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable, openGallery } from "@food/utils/imageUploadUtils"
import { compressImageForUpload, PROFILE_PRESET } from "@/shared/utils/imageCompressor"
import { EMAIL_REGEX } from "@/shared/utils/emailValidation"
import { Spin } from "@/shared/components/Loader"

const DEFAULT_AVATAR = require("../../../../../assets/public/images/profile_avatar.webp")

const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }
const EDIT_PROFILE_DRAFT_KEY = "user_edit_profile_draft"

// Gender options
const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
]

// Load profile data from localStorage (legacy + current keys)
const loadProfileFromStorage = () => {
  try {
    const candidates = ["user_user", "userProfile", "helloparth_user_profile"]
    for (const key of candidates) {
      const stored = localStorage.getItem(key)
      if (stored) return JSON.parse(stored)
    }
  } catch (error) {
    debugError('Error loading profile from localStorage:', error)
  }
  return null
}

// Save profile data to localStorage (keep keys used by ProfileContext)
const saveProfileToStorage = (data) => {
  try {
    localStorage.setItem('user_user', JSON.stringify(data))
    localStorage.setItem('userProfile', JSON.stringify(data))
  } catch (error) {
    debugError('Error saving profile to localStorage:', error)
  }
}

const normalizePhoneToTenDigits = (value) =>
  String(value || "").replace(/\D/g, "").slice(-10)

const buildFormDataFromProfile = (profile = {}) => ({
  name: profile.name || "",
  mobile: normalizePhoneToTenDigits(profile.mobile || profile.phone || ""),
  email: profile.email || "",
  gender: profile.gender || "",
})

const clearEditProfileDraft = () => {
  try {
    localStorage.removeItem(EDIT_PROFILE_DRAFT_KEY)
  } catch (error) {
    debugError('Error clearing edit profile draft from localStorage:', error)
  }
}

// A just-picked photo is a local file uri (the web's data: URL preview) — show it as is.
const previewSource = (value) => (/^(file|content|ph|assets-library):/i.test(value) ? value : normalizeImageUrl(value))

const isValidImageValue = (value) =>
  value && typeof value === "string" && value.trim() !== "" && value !== "null" && value !== "undefined"

function Fieldset({ label, focused, style, children }) {
  const s = useStyles()
  return (
    <View style={[s.fieldset, focused && s.fieldsetFocused, style]}>
      <View style={s.legendWrap} pointerEvents="none">
        <Text style={s.legend}>{label}</Text>
      </View>
      {children}
    </View>
  )
}

export default function EditProfile() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { userProfile, updateUserProfile } = useProfile()
  const s = useStyles()
  const t = useTheme()
  const insets = useSafeAreaInsets()

  // Always start from saved profile — never hydrate unsaved drafts into the form
  useEffect(() => {
    clearEditProfileDraft()
  }, [])

  const storedProfile = loadProfileFromStorage()
  const initialProfile = storedProfile || userProfile || {}

  const initialFormData = buildFormDataFromProfile(initialProfile)

  const [formData, setFormData] = useState(initialFormData)
  const [initialData] = useState(initialFormData)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [profileImage, setProfileImage] = useState(initialProfile?.profileImage || userProfile?.profileImage || "")
  const [imagePreview, setImagePreview] = useState(initialProfile?.profileImage || userProfile?.profileImage || "")
  const [pendingImageFile, setPendingImageFile] = useState(null)
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)
  const [cropImageFile, setCropImageFile] = useState(null)
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({
    email: "",
  })
  const [focusedField, setFocusedField] = useState("")
  const fileInputRef = useRef(null)
  const savedProfileImageRef = useRef(initialProfile?.profileImage || userProfile?.profileImage || "")

  // Sync form when real saved profile loads from context (not while user is editing)
  useEffect(() => {
    if (hasChanges) return
    const stored = loadProfileFromStorage()
    const profile = stored || userProfile || {}
    const nextForm = buildFormDataFromProfile(profile)
    setFormData(nextForm)
    if (profile.profileImage) {
      setProfileImage(profile.profileImage)
      setImagePreview(profile.profileImage)
      savedProfileImageRef.current = profile.profileImage
    }
  }, [userProfile, hasChanges])

  // Check if form has changes (including profile photo changes)
  useEffect(() => {
    const currentData = JSON.stringify(formData)
    const savedData = JSON.stringify(initialData)
    const originalImage = savedProfileImageRef.current || ""
    const isImageChanged = pendingImageFile !== null || profileImage !== originalImage
    setHasChanges(currentData !== savedData || isImageChanged)
  }, [formData, initialData, pendingImageFile, profileImage])

  const discardAndGoBack = () => {
    clearEditProfileDraft()
    goBack()
  }
  const validateEmail = (value) => {
    if (!value) return ""
    return EMAIL_REGEX.test(value) ? "" : "Please enter a valid email"
  }

  const handleChange = (field, value) => {
    let normalizedValue = value
    let errorMessage = ""

    if (field === "name") {
      normalizedValue = String(value || "").replace(/[^a-zA-Z\s]/g, "")
    } else if (field === "email") {
      normalizedValue = String(value || "").trim()
      errorMessage = validateEmail(normalizedValue)
    }

    setFormData((prev) => ({
      ...prev,
      [field]: normalizedValue
    }))

    if (field === "email") {
      setFieldErrors((prev) => ({
        ...prev,
        [field]: errorMessage
      }))
    }
  }

  const handleClear = (field) => {
    setFormData(prev => ({
      ...prev,
      [field]: ""
    }))
  }

  const processProfileImageFile = async (file) => {
    if (!file) return

    if (!String(file.type || "").startsWith('image/')) {
      toast.error('Please select a valid image file')
      return
    }

    try {
      const prepared = await compressImageForUpload(file, {
        ...PROFILE_PRESET,
        maxWidth: 1600,
        maxHeight: 1600,
      })
      setCropImageFile(prepared)
      setIsCropModalOpen(true)
    } catch (err) {
      console.error("Could not prepare selected image:", err)
      toast.error("Could not read this image. Please try another photo.")
    }
  }

  const handleCropComplete = async (croppedFile) => {
    setIsCropModalOpen(false)
    setCropImageFile(null)

    if (!croppedFile) return

    try {
      const preparedFile = await compressImageForUpload(croppedFile, PROFILE_PRESET)
      setImagePreview(preparedFile.uri)
      setPendingImageFile(preparedFile)
    } catch (err) {
      console.error("Profile image preparation failed:", err)
      toast.error("Could not prepare image. Please try another photo.")
    }
  }

  const handleProfileImageAction = () => {
    if (isFlutterBridgeAvailable()) {
      setPhotoPickerOpen(true)
      return
    }

    openGallery({ onSelectFile: processProfileImageFile, fileNamePrefix: "profile-photo", fallbackInputRef: fileInputRef })
  }

  const validateForm = () => {
    const nextErrors = {
      email: validateEmail(formData.email),
    }
    setFieldErrors(nextErrors)
    return !Object.values(nextErrors).some(Boolean)
  }

  const handleUpdate = async () => {
    if (isSaving) return
    if (!validateForm()) {
      toast.error("Please fix the highlighted fields")
      return
    }

    try {
      setIsSaving(true)

      let finalImageUrl = profileImage
      if (pendingImageFile) {
        setIsUploadingImage(true)
        try {
          const uploadRes = await userAPI.uploadProfileImage(pendingImageFile)
          finalImageUrl =
            uploadRes?.data?.data?.profileImage ||
            uploadRes?.data?.profileImage ||
            uploadRes?.data?.data?.user?.profileImage ||
            profileImage

          if (!finalImageUrl) {
            throw new Error("Upload succeeded but profile image URL was missing")
          }
        } catch (uploadErr) {
          debugError('Error uploading image:', uploadErr)
          const uploadMessage =
            uploadErr?.response?.data?.error ||
            uploadErr?.response?.data?.message ||
            uploadErr?.message ||
            'Failed to upload image'
          toast.error(uploadMessage)
          setIsUploadingImage(false)
          setIsSaving(false)
          return
        }
        setIsUploadingImage(false)
      }

      const updateData = {
        name: formData.name,
        email: formData.email || undefined,
        gender: formData.gender || undefined,
        profileImage: finalImageUrl,
      }

      // Call API to update profile
      const response = await userAPI.updateProfile(updateData)
      const updatedUser = response?.data?.data?.user || response?.data?.user

      if (updatedUser) {
        // Update context with all fields including profileImage
        updateUserProfile({
          ...updatedUser,
          phone: updatedUser.phone || formData.mobile,
          profileImage: finalImageUrl,
          localImagePreview: imagePreview !== finalImageUrl ? imagePreview : undefined
        })

        saveProfileToStorage({
          name: updatedUser.name || formData.name,
          phone: updatedUser.phone || formData.mobile,
          mobile: updatedUser.phone || formData.mobile,
          email: updatedUser.email || formData.email,
          profileImage: updatedUser.profileImage || finalImageUrl,
          localImagePreview: imagePreview !== finalImageUrl ? imagePreview : undefined,
          gender: updatedUser.gender || formData.gender,
        })
        clearEditProfileDraft()

        // Dispatch event to refresh profile from API
        window.dispatchEvent(new Event("userAuthChanged"))

        // Navigate back
        navigate("/food/user/profile")
      }
    } catch (error) {
      debugError('Error updating profile:', error)
      toast.error(error?.response?.data?.message || 'Failed to update profile')
      setIsSaving(false)
    }
  }

  const hasPreview = isValidImageValue(imagePreview)
  const buttonDisabled = !hasChanges || isSaving || isUploadingImage

  const pencilButton = (onPress) => (
    <Pressable
      onPress={onPress}
      disabled={isUploadingImage}
      style={({ pressed }) => [s.pencilButton, pressed && { backgroundColor: colors.gray[50] }, isUploadingImage && { opacity: 0.5 }]}
      accessibilityLabel="Edit profile photo"
    >
      {isUploadingImage ? (
        <Spin>
          <Loader2 size={16} color="#DC2626" />
        </Spin>
      ) : (
        <Pencil size={18} color="#DC2626" strokeWidth={2.5} />
      )}
    </Pressable>
  )

  return (
    <View style={s.page}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <View style={s.headerInner}>
          <Pressable
            onPress={discardAndGoBack}
            style={({ pressed }) => [s.backButton, pressed && { backgroundColor: t.dark ? colors.gray[800] : colors.gray[100] }]}
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={t.dark ? colors.white : colors.gray[700]} />
          </Pressable>
          <Text style={s.headerTitle}>Your Profile</Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: sp(28) + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* The hump and the avatar stick out above the card (web: absolute -top-[49px] / -top-[105px]); they sit in this
            wrapper, drawn after the card, so they stay on top and their taps land on Android. */}
        <View style={s.cardWrap}>
        <View style={s.card}>
          {/* Form Fields */}
          <View style={s.form}>
            {/* Name Field */}
            <Fieldset label="Name" focused={focusedField === "name"}>
              <View style={s.fieldRow}>
                <TextInput
                  value={formData.name}
                  onChangeText={(text) => handleChange('name', text)}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField("")}
                  style={s.input}
                  cursorColor={t.dark ? "#ffffff" : "#1f2937"}
                />
                {formData.name ? (
                  <Pressable onPress={() => handleClear('name')} hitSlop={8} accessibilityLabel="Clear name">
                    <X size={16} color={colors.gray[400]} />
                  </Pressable>
                ) : null}
              </View>
            </Fieldset>

            {/* Email Field (fieldset — matches Name/Gender) */}
            <View>
              <Fieldset label="Email" focused={focusedField === "email"}>
                <TextInput
                  value={formData.email}
                  onChangeText={(text) => handleChange('email', text)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField("")}
                  placeholder="yourname@example.com"
                  placeholderTextColor={t.dark ? colors.gray[500] : colors.gray[400]}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={s.input}
                  cursorColor={t.dark ? "#ffffff" : "#1f2937"}
                />
              </Fieldset>
              {fieldErrors.email ? <Text style={s.errorText}>{fieldErrors.email}</Text> : null}
            </View>

            {/* Phone — read-only */}
            <Fieldset label="Phone Number" style={{ opacity: 0.7 }}>
              <View style={[s.fieldRow, { gap: sp(2), paddingBottom: sp(1) }]}>
                <Text style={s.phoneText}>{formData.mobile ? `+91 ${formData.mobile}` : '+91'}</Text>
                <View style={s.verifiedPill}>
                  <Text style={s.verifiedText}>Verified</Text>
                </View>
              </View>
            </Fieldset>

            {/* Gender Field */}
            <Fieldset label="Gender" style={s.genderFieldset}>
              <Select
                value={formData.gender || ""}
                onValueChange={(value) => handleChange('gender', value)}
              >
                <SelectTrigger style={s.genderTrigger} textStyle={s.genderText} iconColor={t.dark ? colors.gray[400] : undefined}>
                  <SelectValue placeholder="Select gender" style={t.dark ? { color: colors.white, opacity: formData.gender ? 1 : 0.9 } : null} />
                </SelectTrigger>
                <SelectContent style={{ borderRadius: 14 }}>
                  {genderOptions.map((option, index) => (
                    <SelectItem key={option.value} value={option.value} textStyle={s.genderOption} isLast={index === genderOptions.length - 1}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Fieldset>
          </View>

          {/* Update Profile Button */}
          <View style={s.buttonWrap}>
            <Button
              onPress={handleUpdate}
              disabled={buttonDisabled}
              style={({ pressed }) => [
                s.updateButton,
                buttonDisabled ? s.updateButtonMuted : [s.updateButtonActive, pressed && { backgroundColor: "#991B1B" }],
              ]}
              textStyle={s.updateButtonText}
            >
              {isSaving ? (
                <View style={s.savingRow}>
                  <Spin style={{ marginRight: sp(2) }}>
                    <Loader2 size={20} color={colors.white} />
                  </Spin>
                  <Text style={s.updateButtonText}>Saving...</Text>
                </View>
              ) : (
                'Update profile'
              )}
            </Button>
          </View>
        </View>

          {/* SVG Hump overlapping top */}
          <View style={s.hump} pointerEvents="none">
            <Svg width={320} height={50} viewBox="0 0 320 50" fill="none">
              <Path d="M0 50 C 50 50, 70 0, 92 0 L 228 0 C 250 0, 270 50, 320 50 Z" fill={t.dark ? "#1a1a1a" : "white"} />
            </Svg>
          </View>

          {/* Avatar Section */}
          <View style={s.avatarSection}>
            <View>
              <Avatar style={s.avatar}>
                <AppImage
                  src={hasPreview ? previewSource(imagePreview) : DEFAULT_AVATAR}
                  fallback={DEFAULT_AVATAR}
                  style={s.avatarImage}
                  contentFit="cover"
                  accessibilityLabel={formData.name || 'User'}
                />
              </Avatar>
              {hasPreview ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild style={s.pencilAnchor}>
                    {pencilButton()}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" sideOffset={12} style={s.menu}>
                    <BlurView intensity={40} tint={t.dark ? "dark" : "light"} style={s.menuBlur} pointerEvents="none" />
                    <DropdownMenuItem
                      onPress={() => {
                        setProfileImage("")
                        setImagePreview("")
                        setPendingImageFile(null)
                      }}
                      style={({ pressed }) => [s.menuItem, pressed && s.menuItemPressed]}
                      textStyle={[s.menuItemText, { color: "#DC2626" }]}
                    >
                      Delete Photo
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onPress={handleProfileImageAction}
                      style={({ pressed }) => [s.menuItem, pressed && s.menuItemPressed]}
                      textStyle={[s.menuItemText, { color: t.dark ? colors.gray[100] : colors.gray[900] }]}
                    >
                      Change photo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <View style={s.pencilAnchor}>{pencilButton(handleProfileImageAction)}</View>
              )}
            </View>
          </View>

        </View>

        <ImageSourcePicker
          isOpen={photoPickerOpen}
          onClose={() => setPhotoPickerOpen(false)}
          onFileSelect={processProfileImageFile}
          title="Update profile photo"
          description="Choose how you want to upload your profile photo."
          fileNamePrefix="profile-photo"
          galleryInputRef={fileInputRef}
        />

        <ImageCropper
          isOpen={isCropModalOpen}
          onClose={() => {
            setIsCropModalOpen(false)
            setCropImageFile(null)
          }}
          imageFile={cropImageFile}
          onCropComplete={handleCropComplete}
        />
      </ScrollView>
    </View>
  )
}

const useStyles = makeStyles((t) => ({
  page: { flex: 1, backgroundColor: t.dark ? "#0a0a0a" : "#f5f5f5" },
  header: {
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderBottomWidth: 1,
    borderBottomColor: t.dark ? colors.gray[800] : colors.gray[100],
  },
  headerInner: { flexDirection: "row", alignItems: "center", gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(4) },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 9999, flexShrink: 0 },
  headerTitle: { ...fontSize.lg, fontWeight: "600", color: t.dark ? colors.white : colors.gray[900] },
  // web: py-8 + mt-20 above the card (112); the wrapper starts 105 above the card, where the avatar begins
  content: { paddingHorizontal: sp(4), paddingTop: sp(8) + sp(20) - 105 },
  cardWrap: { position: "relative", paddingTop: 105 },
  card: {
    position: "relative",
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
    borderRadius: 32,
    paddingTop: sp(16),
    paddingBottom: sp(8),
    paddingHorizontal: sp(4),
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : alpha(colors.gray[100], 0.5),
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  hump: { position: "absolute", top: 105 - 49, left: "50%", marginLeft: -160, width: 320, height: 50, overflow: "hidden" },
  avatarSection: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, alignItems: "center" },
  avatar: { height: 112, width: 112, borderWidth: 4, borderColor: colors.white, backgroundColor: "transparent", elevation: 1, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  avatarImage: { width: "100%", height: "100%", borderRadius: 9999 },
  pencilAnchor: { position: "absolute", bottom: 4, right: 4 },
  pencilButton: {
    width: 32,
    height: 32,
    backgroundColor: colors.white,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.gray[100],
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  menu: {
    width: 220,
    backgroundColor: t.dark ? alpha("#1a1a1a", 0.7) : alpha(colors.white, 0.7),
    borderRadius: 28,
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[800] : alpha(colors.gray[100], 0.5),
    padding: sp(2),
    gap: sp(2),
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 8 },
  },
  menuBlur: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  menuItem: {
    paddingVertical: sp(3.5),
    paddingHorizontal: sp(4),
    borderRadius: 20,
    backgroundColor: t.dark ? "#333333" : "#E5E7EB",
    justifyContent: "center",
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  menuItemPressed: { backgroundColor: t.dark ? "#444444" : "#D1D5DB" },
  menuItemText: { fontSize: 15.5, lineHeight: 22, fontWeight: "500", letterSpacing: 0.4, textAlign: "center" },
  form: { gap: sp(4), paddingTop: sp(6) },
  fieldset: {
    borderWidth: 1,
    borderColor: t.dark ? colors.gray[700] : colors.gray[300],
    borderRadius: 14,
    paddingHorizontal: sp(3),
    paddingBottom: sp(2),
    paddingTop: 10,
  },
  fieldsetFocused: { borderColor: "#DC2626", borderWidth: 1.5 },
  genderFieldset: { borderColor: t.dark ? colors.gray[600] : colors.gray[300], paddingBottom: sp(1) },
  // <legend> sits on the border line, cutting it with the card colour
  legendWrap: {
    position: "absolute",
    top: -10,
    left: sp(2),
    paddingHorizontal: sp(1),
    backgroundColor: t.dark ? "#1a1a1a" : colors.white,
  },
  legend: { fontSize: 13, lineHeight: 18, color: t.dark ? colors.gray[500] : colors.gray[400], letterSpacing: 0.3 },
  fieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  input: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: "500", color: t.dark ? colors.white : colors.gray[800], paddingBottom: sp(1), paddingTop: 2 },
  errorText: { ...fontSize.xs, color: colors.red[600], marginTop: sp(1) },
  phoneText: { fontSize: 16, lineHeight: 24, fontWeight: "500", color: t.dark ? colors.gray[400] : colors.gray[500] },
  verifiedPill: { backgroundColor: colors.emerald[100], paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 8, flexShrink: 0 },
  verifiedText: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: colors.emerald[700], textTransform: "uppercase", letterSpacing: 1 },
  genderTrigger: {
    width: "100%",
    alignSelf: "stretch",
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    paddingHorizontal: 0,
    height: 32,
    backgroundColor: "transparent",
    marginBottom: sp(1),
    marginTop: -sp(1),
  },
  genderText: { fontSize: 16, lineHeight: 22, fontWeight: "500", color: t.dark ? colors.white : colors.gray[800] },
  genderOption: { fontSize: 15, lineHeight: 22, fontWeight: "500" },
  buttonWrap: { marginTop: sp(8), marginBottom: sp(2) },
  updateButton: { width: "100%", height: 52, borderRadius: 14 },
  updateButtonActive: {
    backgroundColor: "#DC2626",
    elevation: 4,
    shadowColor: colors.red[500],
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  updateButtonMuted: { backgroundColor: alpha("#DC2626", 0.7), elevation: 0, shadowOpacity: 0 },
  updateButtonText: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: colors.white },
  savingRow: { flexDirection: "row", alignItems: "center" },
}))
