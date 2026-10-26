import React, { useRef, useState, useEffect } from "react"
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  ArrowLeft, Plus, Edit2, Eye, X, Loader2, User, Camera,
  QrCode, Smartphone, Banknote, Shield, CheckCircle,
  AlertCircle, MapPin, Truck, FileText,
  Bike, Car, Image as ImageIcon, Check
} from "lucide-react-native"
import { useNavigate } from "@/lib/router"
import { toast } from "@/lib/toast"
import { pickImage } from "@/lib/media"
import { AppImage, Overlay, Screen, Sheet, Text, TextInput } from "@/native/ui"
import { alpha, colors, fonts, shadow } from "@/theme"
import BottomPopup from "@/modules/DeliveryV2/components/BottomPopup"
import useCloseOnBack from "@/modules/DeliveryV2/hooks/useCloseOnBack"
import { showUserFacingApiError } from "@/shared/utils/apiError"
import { prepareUploadFile } from "@/shared/utils/imageCompressor"
import { deliveryAPI } from "@food/api"
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation"

const debugError = () => {}

const PRIMARY = "#15498B"
const PRIMARY_SOFT = "#E7EFFA"
const PRIMARY_BORDER = "#C3D0E1"
// web /assets/images/profile_avatar.webp, bundled so it shows offline
const DEFAULT_AVATAR = require("../../../../assets/public/images/profile_avatar.webp")
// deliveryTheme.css: rounded-2xl / rounded-3xl elements get this shadow and border colour
const RX = { elevation: 3, shadowColor: "#112743", shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } }
const RX_BORDER = "#D1DCEB"

const VEHICLE_OPTIONS = [
  { value: "bike", label: "Bike" },
  { value: "scooter", label: "Scooter" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
]

function Spinner({ color = "#ffffff", size = 20 }) {
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [spin])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  )
}

/** border-4 border-orange-100 border-t-orange-500 rounded-full animate-spin */
function RingSpinner() {
  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [spin])
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] })
  return <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
}

const vehicleIconFor = (rawType) => {
  const type = String(rawType || "").toLowerCase()
  if (type.includes("car")) return Car
  if (type.includes("bike") || type.includes("scooter") || type.includes("motorcycle")) return Bike
  if (type.includes("bicycle")) return Bike
  return Truck
}

const InfoCard = ({ icon: Icon, label, value, badge = null, onEdit = null }) => (
  <View style={[styles.infoCard]}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, flexShrink: 1 }}>
      <View style={styles.infoIcon}>
        <Icon size={24} color={PRIMARY} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.microLabel}>{String(label).toUpperCase()}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={styles.infoValue}>{value || "—"}</Text>
          {badge}
        </View>
      </View>
    </View>
    {onEdit ? (
      <Pressable onPress={onEdit} style={({ pressed }) => [styles.editBtn, pressed && { transform: [{ scale: 0.9 }], backgroundColor: colors.gray[50] }]}>
        <Edit2 size={16} color={colors.gray[400]} />
      </Pressable>
    ) : null}
  </View>
)

/**
 * ProfileDetailsV2 - Betterised Premium UI for Delivery Partner Profile.
 */
export const ProfileDetailsV2 = () => {
  const navigate = useNavigate()
  const goBack = useDeliveryBackNavigation()
  const insets = useSafeAreaInsets()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [vehicleNumber, setVehicleNumber] = useState("")
  const [vehicleBrand, setVehicleBrand] = useState("")
  const [vehicleType, setVehicleType] = useState("")
  const [showVehiclePopup, setShowVehiclePopup] = useState(false)
  const [vehicleInput, setVehicleInput] = useState({ number: "", brand: "", type: "" })
  const [vehicleTypeSheetOpen, setVehicleTypeSheetOpen] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [showDocumentModal, setShowDocumentModal] = useState(false)
  useCloseOnBack(showDocumentModal, () => setShowDocumentModal(false))
  const [showBankDetailsPopup, setShowBankDetailsPopup] = useState(false)
  const [, setWalletBalance] = useState(null)
  const [bankDetails, setBankDetails] = useState({
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
    panNumber: "",
    upiId: "",
    upiQrCode: null
  })
  const [upiQrFile, setUpiQrFile] = useState(null)
  const [upiQrPreview, setUpiQrPreview] = useState(null)

  const [isUpdatingBankDetails, setIsUpdatingBankDetails] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [, setUploadTarget] = useState(null) // 'profilePhoto' only for instant picker
  const [showDeletePopup, setShowDeletePopup] = useState(false)
  const [isDeletingImage, setIsDeletingImage] = useState(false)
  const [focusedBankField, setFocusedBankField] = useState(null)

  // Fetch profile data
  useEffect(() => {
    const parseWalletBalance = (response) => {
      const data = response?.data
      const wallet = (data?.success && data?.data?.wallet) || data?.wallet || data?.data || data
      const possibleBalance = wallet?.totalBalance || wallet?.balance || wallet?.pocketBalance || 0
      return Number(possibleBalance) || 0
    }

    const fetchWalletBalance = async () => {
      try {
        const walletResponse = await deliveryAPI.getWallet()
        setWalletBalance(parseWalletBalance(walletResponse))
      } catch (error) {
        debugError("Error fetching wallet balance:", error)
      }
    }

    const fetchProfile = async () => {
      try {
        setLoading(true)
        const [profileResponse] = await Promise.allSettled([
          deliveryAPI.getProfile(),
          fetchWalletBalance()
        ])

        if (
          profileResponse?.status === "fulfilled" &&
          profileResponse?.value?.data?.success &&
          profileResponse?.value?.data?.data?.profile
        ) {
          const profileData = profileResponse.value.data.data.profile
          setProfile(profileData)
          const vNum = profileData?.vehicle?.number || ""
          const vBrand = profileData?.vehicle?.brand || ""
          const vType = profileData?.vehicle?.type || ""
          setVehicleNumber(vNum)
          setVehicleBrand(vBrand)
          setVehicleType(vType)
          setVehicleInput({ number: vNum, brand: vBrand, type: vType })
          // Set bank details
          setBankDetails({
            accountHolderName: profileData?.documents?.bankDetails?.accountHolderName || "",
            accountNumber: profileData?.documents?.bankDetails?.accountNumber || "",
            ifscCode: profileData?.documents?.bankDetails?.ifscCode || "",
            bankName: profileData?.documents?.bankDetails?.bankName || "",
            panNumber: profileData?.documents?.pan?.number || "",
            upiId: profileData?.documents?.bankDetails?.upiId || "",
            upiQrCode: profileData?.documents?.bankDetails?.upiQrCode || null
          })
        } else {
          throw new Error("Profile fetch failed")
        }
      } catch (error) {
        debugError("Error fetching profile:", error)
        if (error.response?.status === 401) {
          showUserFacingApiError(error, "Session expired. Please login again.")
          setTimeout(() => {
            navigate("/food/delivery/login", { replace: true })
          }, 2000)
        } else {
          showUserFacingApiError(error, "Failed to load profile data")
        }
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [navigate])

  const isAdminApproved = ["approved", "active"].includes(String(profile?.status || "").toLowerCase())

  const getDocumentVerificationLabel = (doc) => {
    if (!doc?.document) return "Not uploaded"
    if (doc?.verified || isAdminApproved) return "Verified"
    return "Pending Verification"
  }

  const getDocumentNumber = (doc) => {
    return String(
      doc?.number ||
      doc?.idNumber ||
      doc?.documentNumber ||
      "",
    ).trim()
  }

  const getDrivingLicenseNumber = () =>
    String(
      profile?.documents?.drivingLicense?.number ||
      profile?.documents?.drivingLicense?.idNumber ||
      profile?.documents?.drivingLicense?.documentNumber ||
      profile?.drivingLicenseNumber ||
      profile?.documents?.drivingLicenseNumber ||
      "",
    ).trim()

  const parseNumericValue = (...values) => {
    for (const value of values) {
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric
      }
    }
    return null
  }

  const ratingValue = parseNumericValue(
    profile?.metrics?.rating,
    profile?.ratings?.average,
    profile?.averageRating,
    profile?.rating,
    profile?.stats?.averageRating,
    profile?.analytics?.averageRating,
  )

  const ratingCount = Number(
    profile?.metrics?.ratingCount ||
    profile?.ratings?.count ||
    profile?.totalRatings ||
    profile?.reviewCount ||
    profile?.reviewsCount ||
    profile?.stats?.totalRatings ||
    profile?.analytics?.totalRatings ||
    0,
  )

  const ratingDisplay = ratingValue
    ? `${ratingValue.toFixed(1)}${ratingCount > 0 ? ` (${ratingCount})` : ""}`
    : "-"

  const getRiderLevel = () => {
    if (!Number.isFinite(ratingValue) || ratingValue <= 0 || ratingCount <= 0) return "New Rider"
    if (ratingValue >= 4.8 && ratingCount >= 100) return "Champion"
    if (ratingValue >= 4.6 && ratingCount >= 50) return "Elite"
    if (ratingValue >= 4.3 && ratingCount >= 20) return "Pro"
    if (ratingValue >= 4.0 && ratingCount >= 10) return "Rising"
    return "Starter"
  }
  const riderLevel = getRiderLevel()

  const profileImageUrl = profile?.profileImage?.url || profile?.documents?.photo || null

  const refreshProfile = async () => {
    const response = await deliveryAPI.getProfile()
    if (response?.data?.success && response?.data?.data?.profile) {
      setProfile(response.data.data.profile)
      const pd = response.data.data.profile
      setBankDetails({
        accountHolderName: pd?.documents?.bankDetails?.accountHolderName || "",
        accountNumber: pd?.documents?.bankDetails?.accountNumber || "",
        ifscCode: pd?.documents?.bankDetails?.ifscCode || "",
        bankName: pd?.documents?.bankDetails?.bankName || "",
        panNumber: pd?.documents?.pan?.number || "",
        upiId: pd?.documents?.bankDetails?.upiId || "",
        upiQrCode: pd?.documents?.bankDetails?.upiQrCode || null
      })
      window.dispatchEvent(new Event('deliveryProfileRefresh'))
    }
  }

  const onPickedFile = (target, file) => {
    if (target === "profilePhoto") {
      setUploadTarget("profilePhoto")
      uploadProfileFile(file)
      return
    }

    if (target === "upiQrCode") {
      uploadUpiQrFile(file)
    }
  }

  // Web: openCamera / openGallery (Flutter bridge picker, <input type="file"> fallback)
  const pickFor = async (target, source) => {
    try {
      const file = await pickImage({ source })
      if (file) onPickedFile(target, file)
    } catch (error) {
      debugError("Picker failed:", error)
      toast.error(source === "camera" ? "Could not open camera. Please try again." : "Could not open gallery. Please try again.")
    }
  }

  const handleTakeCameraPhoto = (target) => pickFor(target, "camera")

  const handlePickFromGallery = (target) => {
    if (target === "profilePhoto") {
      setUploadTarget("profilePhoto")
    }
    pickFor(target, "library")
  }

  const uploadProfileFile = async (file) => {
    try {
      setIsUploadingImage(true)
      const prepared = await prepareUploadFile(file, { preset: "profile" })
      const formData = new FormData()
      formData.append("profilePhoto", { uri: prepared.uri, name: prepared.name, type: prepared.type })
      const response = await deliveryAPI.updateProfileMultipart(formData)
      if (response?.data?.success) {
        toast.success("Profile photo updated")
        await refreshProfile()
      } else {
        showUserFacingApiError(
          { response: { data: { message: response?.data?.message } } },
          "Update failed",
        )
      }
    } catch (error) {
      showUserFacingApiError(error, "Update failed")
    } finally {
      setIsUploadingImage(false)
      setUploadTarget(null)
    }
  }

  const handleDeletePhoto = async () => {
    try {
      setIsDeletingImage(true)
      const response = await deliveryAPI.updateProfileDetails({ profilePhoto: "" })
      // Backend might return different structures; check for success
      if (response?.status === 200) {
        toast.success("Profile photo removed")
        await refreshProfile()
        setShowDeletePopup(false)
      } else {
        toast.error("Failed to remove photo")
      }
    } catch (error) {
      showUserFacingApiError(error, "Delete failed")
    } finally {
      setIsDeletingImage(false)
    }
  }

  const uploadUpiQrFile = (file) => {
    if (!file) return

    if (!String(file.type || "image/jpeg").startsWith("image/")) {
      toast.error("Please select an image file")
      return
    }

    setUpiQrFile(file)
    setUpiQrPreview(file.uri)
    toast.success("UPI QR selected")
  }

  const submitBankDetails = async () => {
    setIsUpdatingBankDetails(true)
    try {
      // Validation
      const { accountNumber, ifscCode, panNumber, upiId } = bankDetails

      if (accountNumber && !/^\d{9,18}$/.test(accountNumber.trim())) {
        return toast.error("Invalid Account Number (9-18 digits)")
      }

      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
      if (ifscCode && !ifscRegex.test(ifscCode.trim().toUpperCase())) {
        return toast.error("Invalid IFSC Code (e.g. SBIN0001234)")
      }

      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
      if (panNumber && !panRegex.test(panNumber.trim().toUpperCase())) {
        return toast.error("Invalid PAN Card format (e.g. ABCDE1234F)")
      }

      const upiRegex = /^[\w.-]+@[\w.-]+$/
      if (upiId && !upiRegex.test(upiId.trim())) {
        return toast.error("Invalid UPI ID (e.g. user@bank)")
      }

      // Send as FormData to support optional QR upload
      const formData = new FormData()
      formData.append("documents[bankDetails][accountHolderName]", (bankDetails.accountHolderName || "").trim())
      formData.append("documents[bankDetails][accountNumber]", (bankDetails.accountNumber || "").trim())
      formData.append("documents[bankDetails][ifscCode]", (bankDetails.ifscCode || "").trim().toUpperCase())
      formData.append("documents[bankDetails][bankName]", (bankDetails.bankName || "").trim())
      formData.append("documents[bankDetails][upiId]", (bankDetails.upiId || "").trim())
      formData.append("documents[pan][number]", (bankDetails.panNumber || "").trim().toUpperCase())

      if (upiQrFile) {
        const prepared = await prepareUploadFile(upiQrFile)
        formData.append("upiQrCode", { uri: prepared.uri, name: prepared.name, type: prepared.type })
      }

      await deliveryAPI.updateBankDetailsMultipart(formData)
      toast.success("Bank details updated")
      setShowBankDetailsPopup(false)
      setUpiQrFile(null)
      setUpiQrPreview(null)
      await refreshProfile()
    } catch (error) {
      showUserFacingApiError(error, "Update failed")
    } finally {
      setIsUpdatingBankDetails(false)
    }
  }

  const saveVehicle = async () => {
    const num = vehicleInput.number.trim();
    const brand = vehicleInput.brand.trim();
    const type = vehicleInput.type;

    if (!num) return toast.error("Vehicle number is required");
    if (!brand) return toast.error("Vehicle brand is required");

    // Improved validation for Indian vehicle numbers
    // Accept common formats like MH12AB1234 or MH12A1234
    const numRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,2}[0-9]{4}$/i;
    if (!numRegex.test(num.replace(/\s+/g, ""))) {
      return toast.error("Please enter a valid vehicle number (e.g. MH12AB1234)");
    }

    try {
      await deliveryAPI.updateProfileDetails({
        vehicle: {
          number: num,
          brand: brand,
          type: type
        }
      })
      setVehicleNumber(num)
      setVehicleBrand(brand)
      setVehicleType(type)
      setShowVehiclePopup(false)
      toast.success("Flight details updated!")
      await refreshProfile()
    } catch {
      toast.error("Cloud storage sync failed")
    }
    return undefined
  }

  if (loading) {
    return (
      <Screen bg="#F8FAFC">
        <View style={styles.loadingWrap}>
          <View style={{ alignItems: "center", gap: 16 }}>
            <View style={{ width: 64, height: 64 }}>
              <RingSpinner />
              <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                <User size={24} color={PRIMARY} />
              </View>
            </View>
            <Text style={styles.loadingText}>INITIALIZING PROFILE...</Text>
          </View>
        </View>
      </Screen>
    )
  }

  const VehicleIcon = vehicleIconFor(profile?.vehicle?.type)
  const vehicleInputType = String(vehicleInput.type || "").toLowerCase()
  const VehicleInputIcon = vehicleInputType.includes("car") ? Car : vehicleInputType.includes("bicycle") ? Bike : Truck
  const vehicleTypeLabel = VEHICLE_OPTIONS.find((o) => o.value === vehicleInput.type)?.label || vehicleInput.type || ""

  const bankFields = [
    { label: "Account Holder", key: "accountHolderName", icon: User, maxLength: 60 },
    { label: "Account Number", key: "accountNumber", icon: Banknote, maxLength: 20, isNumeric: true },
    { label: "IFSC Code", key: "ifscCode", icon: Shield, format: (v) => v.toUpperCase(), maxLength: 11 },
    { label: "Bank Name", key: "bankName", icon: MapPin, maxLength: 60 },
    { label: "PAN Number", key: "panNumber", icon: FileText, format: (v) => v.toUpperCase(), maxLength: 10 },
    { label: "UPI ID", key: "upiId", icon: Smartphone, maxLength: 60 }
  ]

  return (
    <Screen bg="#FDFEFE" edges={["bottom"]}>
      {/* ─── HEADER ─── */}
      <View style={[styles.header, { paddingTop: insets.top, height: 64 + insets.top }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { transform: [{ scale: 0.9 }], backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={20} color={colors.gray[700]} />
          </Pressable>
          <Text style={styles.headerTitle}>PROFILE</Text>
        </View>
        <View style={styles.idPill}>
          <Text style={styles.idPillText}>{`ID: ${profile?.deliveryId || "..."}`.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ─── PROFILE AVATAR BLOCK ─── */}
        <View>
          <View style={styles.avatarBox}>
            <AppImage src={profileImageUrl || DEFAULT_AVATAR} fallback={DEFAULT_AVATAR} style={styles.fill} contentFit="cover" accessibilityLabel="Avatar" />
            {isUploadingImage ? (
              <View style={[StyleSheet.absoluteFill, styles.avatarBusy]}>
                <Spinner size={24} />
              </View>
            ) : null}
          </View>

          <View style={styles.avatarActions}>
            <Pressable
              onPress={() => handleTakeCameraPhoto('profilePhoto')}
              accessibilityLabel="Take Photo"
              style={({ pressed }) => [styles.avatarBtn, { backgroundColor: colors.black }, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <Camera size={20} color={colors.white} />
            </Pressable>

            <Pressable
              onPress={() => handlePickFromGallery('profilePhoto')}
              accessibilityLabel="Gallery"
              style={({ pressed }) => [styles.avatarBtn, { backgroundColor: PRIMARY }, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <ImageIcon size={20} color={colors.white} />
            </Pressable>

            {profileImageUrl ? (
              <Pressable
                onPress={() => setShowDeletePopup(true)}
                accessibilityLabel="Remove"
                style={({ pressed }) => [styles.avatarBtn, { backgroundColor: colors.red[500] }, pressed && { transform: [{ scale: 0.95 }] }]}
              >
                <X size={20} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={{ alignItems: "center", paddingTop: 24 }}>
          <Text style={styles.name}>{profile?.name || ""}</Text>
          <Text style={styles.subLine}>{`DELIVERY PARTNER • ${String(profile?.location?.city || "").toUpperCase()}`}</Text>

          <View style={styles.pillsRow}>
            <View style={[styles.pill, isAdminApproved ? styles.pillApproved : styles.pillPending]}>
              <CheckCircle size={16} color={isAdminApproved ? colors.white : PRIMARY} />
              <Text style={[styles.pillText, { color: isAdminApproved ? colors.white : PRIMARY }]}>
                {String(isAdminApproved ? "Approved" : (profile?.status || "Pending")).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.pill, styles.pillPhone]}>
              <Smartphone size={16} color={PRIMARY} />
              <Text style={[styles.pillText, { color: PRIMARY }]}>{String(profile?.phone || "")}</Text>
            </View>
          </View>
        </View>

        {/* ─── RIDER STATS ─── */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>RIDER LEVEL</Text>
            <Text style={styles.statValue}>{riderLevel}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL RATING</Text>
            <Text style={styles.statValue}>{ratingDisplay}</Text>
          </View>
        </View>

        {/* ─── VEHICLE SECTION ─── */}
        <View>
          <View style={[styles.sectionHead, { marginBottom: 12 }]}>
            <View style={styles.sectionTitleRow}>
              <VehicleIcon size={16} color={colors.gray[400]} />
              <Text style={styles.sectionTitle}>VEHICLE ASSETS</Text>
            </View>
          </View>
          <InfoCard
            icon={VehicleIcon}
            label="Vehicle Details"
            value={[profile?.vehicle?.type, profile?.vehicle?.brand, vehicleNumber].filter(Boolean).map(v => String(v).toUpperCase()).join(" • ") || "N/A"}
            badge={!vehicleNumber ? (
              <View style={styles.missingBadge}>
                <Text style={styles.missingText}>MISSING</Text>
              </View>
            ) : null}
            onEdit={() => {
              setVehicleInput({ number: vehicleNumber, brand: vehicleBrand, type: vehicleType });
              setShowVehiclePopup(true);
            }}
          />
        </View>

        {/* ─── BANK & PAYMENTS SECTION (ENHANCED) ─── */}
        <View>
          <View style={[styles.sectionHead, { marginBottom: 16 }]}>
            <View style={styles.sectionTitleRow}>
              <Banknote size={16} color={colors.gray[400]} />
              <Text style={styles.sectionTitle}>BANK & PAYMENTS</Text>
            </View>
            <Pressable
              onPress={() => {
                // Reset state to current profile data when opening
                setBankDetails({
                  accountHolderName: profile?.documents?.bankDetails?.accountHolderName || "",
                  accountNumber: profile?.documents?.bankDetails?.accountNumber || "",
                  ifscCode: profile?.documents?.bankDetails?.ifscCode || "",
                  bankName: profile?.documents?.bankDetails?.bankName || "",
                  panNumber: profile?.documents?.pan?.number || "",
                  upiId: profile?.documents?.bankDetails?.upiId || "",
                  upiQrCode: profile?.documents?.bankDetails?.upiQrCode || null
                })
                setUpiQrFile(null)
                setUpiQrPreview(null)
                setShowBankDetailsPopup(true)
              }}
              hitSlop={8}
            >
              <Text style={styles.editLink}>EDIT DETAILS</Text>
            </Pressable>
          </View>

          <View style={{ gap: 12 }}>
            <LinearGradient colors={["#15498B", "#000000"]} start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }} style={styles.bankCard}>
              <View style={styles.bankGlow} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
                <View>
                  <Text style={styles.bankMicro}>BANK ACCOUNT</Text>
                  <Text style={styles.bankName}>{bankDetails.bankName || "Link Account"}</Text>
                </View>
                <Banknote size={32} color={alpha(PRIMARY, 0.5)} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.bankNumber}>
                    {bankDetails.accountNumber ? `•••• •••• •••• ${bankDetails.accountNumber.slice(-4)}` : "XXXX XXXX XXXX XXXX"}
                  </Text>
                  <Text style={styles.bankHolder}>{String(bankDetails.accountHolderName || "Account Holder").toUpperCase()}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.bankMicro, { letterSpacing: 1 }]}>IFSC CODE</Text>
                  <Text style={styles.bankIfsc}>{bankDetails.ifscCode || "—"}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* UPI Section */}
            <View style={styles.upiCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 20, flexShrink: 1 }}>
                <View style={styles.upiIcon}>
                  <Smartphone size={28} color={colors.purple[600]} />
                </View>
                <View style={{ flexShrink: 1 }}>
                  <Text style={[styles.microLabel, { letterSpacing: 2, marginBottom: 4 }]}>UPI ID</Text>
                  <Text style={styles.upiValue}>{bankDetails.upiId || "Not added"}</Text>
                </View>
              </View>
              {bankDetails.upiQrCode ? (
                <Pressable
                  onPress={() => { setSelectedDocument({ name: "UPI Scanner", url: bankDetails.upiQrCode }); setShowDocumentModal(true); }}
                  style={styles.qrBtn}
                >
                  <QrCode size={24} color={colors.gray[400]} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {/* ─── DOCUMENTS SECTION ─── */}
        <View>
          <View style={[styles.sectionHead, { marginBottom: 16 }]}>
            <View style={styles.sectionTitleRow}>
              <Shield size={16} color={colors.gray[400]} />
              <Text style={styles.sectionTitle}>VERIFICATION DOCS</Text>
            </View>
          </View>

          <View style={{ gap: 12 }}>
            {[
              { icon: FileText, label: "Aadhar Card", doc: profile?.documents?.aadhar },
              { icon: FileText, label: "PAN Card", doc: profile?.documents?.pan },
              { icon: Truck, label: "Driving License", doc: profile?.documents?.drivingLicense, number: getDrivingLicenseNumber() }
            ].map((item) => {
              const Icon = item.icon
              return (
                <View key={item.label} style={styles.docCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 16, flexShrink: 1 }}>
                    <View style={styles.docIcon}><Icon size={20} color={colors.gray[400]} /></View>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.microLabel}>{item.label.toUpperCase()}</Text>
                      <Text style={styles.docStatus}>{getDocumentVerificationLabel(item.doc)}</Text>
                      <Text style={styles.docNumber}>{item.number || getDocumentNumber(item.doc) || "Number not added"}</Text>
                    </View>
                  </View>
                  {item.doc?.document ? (
                    <Pressable
                      onPress={() => { setSelectedDocument({ name: item.label, url: item.doc.document }); setShowDocumentModal(true); }}
                      style={styles.eyeBtn}
                    >
                      <Eye size={16} color={colors.gray[400]} />
                    </Pressable>
                  ) : null}
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>

      {/* ─── MODALS ─── */}

      {/* Delete Confirmation Popup */}
      <BottomPopup
        isOpen={showDeletePopup}
        onClose={() => setShowDeletePopup(false)}
        title="Remove Photo?"
        showCloseButton={false}
      >
        <View style={{ paddingBottom: 40, paddingTop: 16, alignItems: "center" }}>
          <View style={styles.removeIcon}>
            <AlertCircle size={40} color={colors.red[500]} />
          </View>
          <Text style={styles.removeTitle}>ARE YOU SURE?</Text>
          <Text style={styles.removeText}>This will remove your current profile picture.</Text>

          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 8, width: "100%" }}>
            <Pressable onPress={() => setShowDeletePopup(false)} style={({ pressed }) => [styles.removeCancel, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Text style={[styles.removeBtnText, { color: colors.gray[500] }]}>CANCEL</Text>
            </Pressable>
            <Pressable
              onPress={handleDeletePhoto}
              disabled={isDeletingImage}
              style={({ pressed }) => [styles.removeConfirm, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              {isDeletingImage ? <Spinner size={16} /> : <Text style={[styles.removeBtnText, { color: colors.white }]}>YES, REMOVE</Text>}
            </Pressable>
          </View>
        </View>
      </BottomPopup>

      {/* Vehicle Popup */}
      <BottomPopup isOpen={showVehiclePopup} onClose={() => setShowVehiclePopup(false)} title="Vehicle Info" closeOnHandleClick={true} closeOnBack={true} showCloseButton={false}>
        <View style={{ gap: 16, paddingBottom: 40 }}>
          <View style={styles.vehicleBox}>
            {/* Type Selection */}
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleRowIcon}>
                <VehicleInputIcon size={20} color={PRIMARY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.microLabel, { marginBottom: 4 }]}>VEHICLE TYPE</Text>
                <Pressable onPress={() => setVehicleTypeSheetOpen(true)}>
                  <Text style={styles.vehicleInput}>{vehicleTypeLabel}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Name/Brand Input */}
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleRowIcon}><Plus size={16} color={alpha(PRIMARY, 0.5)} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.microLabel, { marginBottom: 4 }]}>VEHICLE NAME/BRAND</Text>
                <TextInput
                  value={vehicleInput.brand}
                  onChangeText={(text) => setVehicleInput({ ...vehicleInput, brand: text })}
                  placeholder="E.g. Honda Splendor"
                  placeholderTextColor={colors.gray[200]}
                  style={styles.vehicleInput}
                />
              </View>
            </View>

            <View style={styles.divider} />

            {/* Number Input */}
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleRowIcon}><QrCode size={16} color={alpha(PRIMARY, 0.5)} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.microLabel, { marginBottom: 4 }]}>VEHICLE NUMBER</Text>
                <TextInput
                  value={vehicleInput.number}
                  onChangeText={(text) => setVehicleInput({ ...vehicleInput, number: text.toUpperCase() })}
                  autoCapitalize="characters"
                  placeholder="E.g. UP 80 AB 1234"
                  placeholderTextColor={colors.gray[200]}
                  style={styles.vehicleInput}
                />
              </View>
            </View>
          </View>

          <Pressable onPress={saveVehicle} style={({ pressed }) => [styles.blackSave, pressed && { transform: [{ scale: 0.95 }], backgroundColor: colors.gray[900] }]}>
            <Text style={styles.saveText}>SAVE CHANGES</Text>
          </Pressable>
        </View>
      </BottomPopup>

      {/* <select> of the vehicle popup */}
      <Sheet open={vehicleTypeSheetOpen} onClose={() => setVehicleTypeSheetOpen(false)} style={{ backgroundColor: colors.white }}>
        <View style={{ paddingTop: 16, paddingBottom: 12 }}>
          <Text style={styles.selectTitle}>Vehicle Type</Text>
          {VEHICLE_OPTIONS.map((opt) => {
            const selected = vehicleInput.type === opt.value
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setVehicleInput((prev) => ({ ...prev, type: opt.value }))
                  setVehicleTypeSheetOpen(false)
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <Text style={[styles.optionText, selected && { color: PRIMARY, fontWeight: "700" }]}>{opt.label}</Text>
                {selected ? <Check size={18} color={PRIMARY} /> : null}
              </Pressable>
            )
          })}
        </View>
      </Sheet>

      {/* Bank Details Modal (Expanded with UPI) */}
      <BottomPopup
        isOpen={showBankDetailsPopup}
        onClose={() => setShowBankDetailsPopup(false)}
        title="Bank & Payments"
        maxHeight="85vh"
        closeOnHandleClick={true}
        closeOnBack={true}
        showCloseButton={false}
      >
        <View style={{ gap: 20, paddingBottom: 40 }}>
          <View style={{ gap: 16 }}>
            {bankFields.map((field) => {
              const Icon = field.icon
              return (
                <View key={field.key} style={[styles.bankField, focusedBankField === field.key && { borderColor: PRIMARY_BORDER }]}>
                  <View style={styles.bankFieldLabelRow}>
                    <Icon size={14} color={colors.gray[400]} />
                    <Text style={styles.microLabel}>{field.label.toUpperCase()}</Text>
                  </View>
                  <TextInput
                    value={bankDetails[field.key]}
                    onChangeText={(text) => {
                      let val = text;
                      if (field.isNumeric) val = val.replace(/\D/g, "");
                      if (field.maxLength && val.length > field.maxLength) return;
                      if (field.format) val = field.format(val);
                      setBankDetails({ ...bankDetails, [field.key]: val })
                    }}
                    onFocus={() => setFocusedBankField(field.key)}
                    onBlur={() => setFocusedBankField((cur) => (cur === field.key ? null : cur))}
                    keyboardType={field.isNumeric ? "number-pad" : field.key === "upiId" ? "email-address" : "default"}
                    autoCapitalize={field.format ? "characters" : field.key === "upiId" ? "none" : "words"}
                    autoCorrect={false}
                    style={styles.bankInput}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    placeholderTextColor={colors.gray[400]}
                  />
                </View>
              )
            })}

            {/* UPI Scanner Upload */}
            <View style={styles.qrBox}>
              <Text style={[styles.microLabel, { color: colors.purple[600] }]}>UPI PAYMENT QR SCANNER</Text>

              {upiQrPreview || bankDetails.upiQrCode ? (
                <View>
                  <AppImage src={upiQrPreview || bankDetails.upiQrCode} style={styles.qrPreview} contentFit="cover" accessibilityLabel="QR Preview" />
                  <Pressable onPress={() => { setUpiQrFile(null); setUpiQrPreview(null); }} style={styles.qrRemove}>
                    <X size={14} color={colors.white} />
                  </Pressable>
                </View>
              ) : (
                <View style={{ width: "100%", flexDirection: "row", gap: 12 }}>
                  <Pressable onPress={() => handleTakeCameraPhoto("upiQrCode")} style={({ pressed }) => [styles.qrPick, pressed && { backgroundColor: colors.gray[100] }]}>
                    <Camera size={24} color={colors.purple[300]} />
                    <Text style={styles.qrPickText}>CAMERA</Text>
                  </Pressable>
                  <Pressable onPress={() => handlePickFromGallery("upiQrCode")} style={({ pressed }) => [styles.qrPick, pressed && { backgroundColor: colors.gray[100] }]}>
                    <ImageIcon size={24} color={colors.purple[300]} />
                    <Text style={styles.qrPickText}>GALLERY</Text>
                  </Pressable>
                </View>
              )}
              <Text style={styles.qrHint}>Upload your UPI QR code from Google Pay, PhonePe, etc. to receive easy payouts.</Text>
            </View>
          </View>

          <Pressable
            onPress={submitBankDetails}
            disabled={isUpdatingBankDetails}
            style={({ pressed }) => [styles.blueSave, isUpdatingBankDetails && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            {isUpdatingBankDetails ? (
              <>
                <Spinner size={20} />
                <Text style={styles.saveText}>SAVING...</Text>
              </>
            ) : (
              <Text style={styles.saveText}>UPDATE SYSTEMS</Text>
            )}
          </Pressable>
        </View>
      </BottomPopup>

      {/* Fullscreen Document Viewer */}
      <Overlay open={Boolean(showDocumentModal && selectedDocument)} onClose={() => setShowDocumentModal(false)} style={styles.viewer}>
        <View style={[styles.viewerHead, { marginTop: insets.top }]}>
          <Text style={styles.viewerTitle}>{String(selectedDocument?.name || "").toUpperCase()}</Text>
          <Pressable onPress={() => setShowDocumentModal(false)} style={({ pressed }) => [styles.viewerClose, pressed && { transform: [{ scale: 0.9 }] }]}>
            <X size={24} color={colors.white} />
          </Pressable>
        </View>
        <View style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center", marginBottom: insets.bottom }}>
          {selectedDocument?.url ? (
            <AppImage src={selectedDocument.url} style={styles.viewerImage} contentFit="contain" accessibilityLabel="Doc" />
          ) : null}
        </View>
      </Overlay>
    </Screen>
  )
}

export default ProfileDetailsV2

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  ring: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: colors.orange[100], borderTopColor: PRIMARY },
  loadingText: { color: colors.gray[400], fontSize: 14, lineHeight: 20, fontWeight: "700", letterSpacing: 1.4 },
  header: {
    backgroundColor: alpha("#ffffff", 0.95),
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 50,
  },
  backBtn: { padding: 8, borderRadius: 14 },
  headerTitle: { fontFamily: fonts.sora, fontSize: 18, lineHeight: 20, fontWeight: "900", color: colors.black, letterSpacing: -0.4 },
  idPill: { backgroundColor: PRIMARY, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, elevation: 6, shadowColor: PRIMARY, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  idPillText: { color: colors.white, fontSize: 10, fontFamily: fonts.sora, fontWeight: "900", letterSpacing: 1 },
  content: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 96, gap: 24, width: "100%", maxWidth: 512, alignSelf: "center" },
  avatarBox: {
    width: 128,
    height: 128,
    borderRadius: 40,
    backgroundColor: colors.gray[100],
    borderWidth: 2,
    borderColor: colors.white,
    alignSelf: "center",
    overflow: "hidden",
    ...shadow["2xl"],
  },
  avatarBusy: { backgroundColor: alpha("#000000", 0.4), alignItems: "center", justifyContent: "center" },
  avatarActions: { position: "absolute", bottom: -26, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 8 },
  avatarBtn: { padding: 12, borderRadius: 16, borderWidth: 4, borderColor: colors.white, alignItems: "center", justifyContent: "center", ...shadow.xl },
  name: { fontFamily: fonts.sora, fontSize: 24, lineHeight: 28, fontWeight: "900", color: colors.gray[900], textAlign: "center" },
  subLine: { fontSize: 11, lineHeight: 16, fontWeight: "700", color: colors.gray[400], letterSpacing: 2.2, marginTop: 8, marginBottom: 16, textAlign: "center" },
  pillsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 8, ...RX },
  pillApproved: { backgroundColor: PRIMARY, borderColor: RX_BORDER, ...shadow.lg },
  pillPending: { backgroundColor: PRIMARY_SOFT, borderColor: RX_BORDER },
  pillPhone: { backgroundColor: PRIMARY_SOFT, borderColor: RX_BORDER },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: fonts.sora, fontWeight: "900", letterSpacing: 1.2 },
  statCard: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: RX_BORDER, padding: 16, borderRadius: 24, alignItems: "center", ...RX },
  statLabel: { fontSize: 9, lineHeight: 12, fontWeight: "700", color: colors.gray[400], letterSpacing: 0.9, marginBottom: 4 },
  statValue: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: "900", color: colors.gray[900] },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontFamily: fonts.sora, fontSize: 12, lineHeight: 16, fontWeight: "900", color: colors.gray[950], letterSpacing: 1.2 },
  editLink: { fontFamily: fonts.sora, fontSize: 10, fontWeight: "900", color: PRIMARY, letterSpacing: 1 },
  infoCard: { backgroundColor: colors.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: RX_BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-between", ...RX },
  infoIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: PRIMARY_SOFT, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: PRIMARY_BORDER },
  microLabel: { fontSize: 10, lineHeight: 14, fontFamily: fonts.sora, fontWeight: "900", color: colors.gray[400], letterSpacing: 1.5, marginBottom: 2 },
  infoValue: { fontFamily: fonts.sora, fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.gray[900], flexShrink: 1 },
  missingBadge: { backgroundColor: colors.red[50], paddingHorizontal: 6, borderRadius: 4 },
  missingText: { fontSize: 9, lineHeight: 14, color: colors.red[500], fontWeight: "700" },
  editBtn: { padding: 8, borderRadius: 10 },
  bankCard: { borderRadius: 24, padding: 17.6, overflow: "hidden", ...shadow["2xl"] },
  bankGlow: { position: "absolute", top: -64, right: -64, width: 128, height: 128, borderRadius: 64, backgroundColor: alpha("#ffffff", 0.05) },
  bankMicro: { color: alpha("#ffffff", 0.4), fontSize: 9, lineHeight: 12, fontFamily: fonts.sora, fontWeight: "900", letterSpacing: 1.8, marginBottom: 4 },
  bankName: { color: colors.white, fontSize: 18, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4 },
  bankNumber: { color: alpha("#ffffff", 0.6), fontSize: 12, lineHeight: 16, fontFamily: "monospace", letterSpacing: 2.4 },
  bankHolder: { color: alpha("#ffffff", 0.4), fontSize: 10, lineHeight: 14, fontWeight: "700", letterSpacing: 1, marginTop: 8 },
  bankIfsc: { color: colors.white, fontSize: 14, lineHeight: 20, fontFamily: fonts.sora, fontWeight: "900", letterSpacing: 1.4 },
  upiCard: { backgroundColor: colors.white, borderRadius: 24, padding: 17.6, borderWidth: 1, borderColor: RX_BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-between", ...RX },
  upiIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.purple[50], borderWidth: 1, borderColor: RX_BORDER, alignItems: "center", justifyContent: "center" },
  upiValue: { fontFamily: fonts.sora, fontSize: 16, lineHeight: 24, fontWeight: "900", color: colors.gray[900] },
  qrBtn: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.gray[50], borderWidth: 1, borderColor: RX_BORDER, alignItems: "center", justifyContent: "center" },
  docCard: { backgroundColor: colors.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: RX_BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-between", ...RX },
  docIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.gray[50], alignItems: "center", justifyContent: "center" },
  docStatus: { fontSize: 12, lineHeight: 16, fontWeight: "700", color: colors.gray[600] },
  docNumber: { fontSize: 11, lineHeight: 16, fontWeight: "600", color: colors.gray[500], marginTop: 2 },
  eyeBtn: { padding: 8, backgroundColor: colors.gray[50], borderRadius: 10 },
  removeIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.red[50], alignItems: "center", justifyContent: "center", marginBottom: 24 },
  removeTitle: { fontFamily: fonts.sora, fontSize: 20, lineHeight: 28, fontWeight: "900", color: colors.gray[950], marginBottom: 8, letterSpacing: -0.4 },
  removeText: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.gray[500], marginBottom: 32, maxWidth: 200, textAlign: "center" },
  removeCancel: { flex: 1, backgroundColor: colors.gray[100], paddingVertical: 16, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: RX_BORDER },
  removeConfirm: { flex: 1, backgroundColor: colors.red[500], paddingVertical: 16, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, borderWidth: 1, borderColor: RX_BORDER, elevation: 6, shadowColor: colors.red[500], shadowOpacity: 0.2, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  removeBtnText: { fontFamily: fonts.sora, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  vehicleBox: { backgroundColor: colors.gray[50], padding: 17.6, borderRadius: 24, borderWidth: 1, borderColor: RX_BORDER, gap: 16, ...RX },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: 16, width: "100%" },
  vehicleRowIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  vehicleInput: { width: "100%", fontFamily: fonts.sora, fontSize: 18, lineHeight: 26, fontWeight: "900", color: colors.black, paddingVertical: 2 },
  divider: { height: 1, backgroundColor: colors.gray[200], width: "100%" },
  blackSave: { width: "100%", backgroundColor: colors.black, paddingVertical: 20, borderRadius: 24, alignItems: "center", ...shadow.xl },
  blueSave: { width: "100%", backgroundColor: PRIMARY, paddingVertical: 20, borderRadius: 24, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 12, ...shadow.xl },
  saveText: { color: colors.white, fontFamily: fonts.sora, fontSize: 16, fontWeight: "900", letterSpacing: 3.2 },
  selectTitle: { fontFamily: fonts.sora, fontSize: 16, fontWeight: "700", color: colors.gray[900], paddingHorizontal: 20, paddingBottom: 8 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  optionText: { fontSize: 16, color: colors.gray[800] },
  bankField: { backgroundColor: alpha(colors.gray[50], 0.5), padding: 16, borderRadius: 16, borderWidth: 1, borderColor: RX_BORDER },
  bankFieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  bankInput: { width: "100%", fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.gray[950], paddingVertical: 2 },
  qrBox: { backgroundColor: colors.purple[50], padding: 17.6, borderRadius: 24, borderWidth: 1, borderColor: RX_BORDER, alignItems: "center", gap: 16, ...RX },
  qrPreview: { width: 128, height: 128, borderRadius: 14, borderWidth: 4, borderColor: colors.white },
  qrRemove: { position: "absolute", top: -12, right: -12, backgroundColor: colors.red[500], padding: 6, borderRadius: 9999, ...shadow.lg },
  qrPick: { flex: 1, aspectRatio: 1, borderRadius: 24, backgroundColor: colors.gray[50], borderWidth: 2, borderStyle: "dashed", borderColor: RX_BORDER, alignItems: "center", justifyContent: "center", gap: 8 },
  qrPickText: { fontFamily: fonts.sora, fontSize: 8, fontWeight: "900", color: colors.purple[400] },
  qrHint: { fontSize: 9, lineHeight: 13, color: colors.purple[400], fontWeight: "500", textAlign: "center" },
  viewer: { backgroundColor: alpha("#000000", 0.95), alignItems: "center", padding: 17.6 },
  viewerHead: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 40 },
  viewerTitle: { color: colors.white, fontFamily: fonts.sora, fontSize: 18, lineHeight: 28, fontWeight: "900", letterSpacing: 1.8, flexShrink: 1 },
  viewerClose: { backgroundColor: alpha("#ffffff", 0.1), padding: 12, borderRadius: 16 },
  viewerImage: { width: "100%", height: "100%", borderRadius: 24 },
})
