// Web: pages/restaurant/MenuCategoriesPage.jsx — the restaurant's own menu categories: "How this works" card, Add
// Category, the list (approval / diet-scope / Global pills, items linked, show-hide / edit / delete buttons) and the
// create / edit bottom sheet (name, diet scope, optional type label, image, "Keep category active").
// Native:
// - the sheet is a Sheet (native Modal) with a KeyboardAwareScrollView, so every field stays above the keyboard;
// - the diet scope <select> opens a small bottom Sheet with the same three options;
// - the image comes from ImageSourcePicker (camera / gallery) as a { uri, name, type } file, uploaded with
//   uploadAPI.uploadMedia like the web File;
// - window.confirm("Delete ...?") -> Alert.alert with Cancel / OK;
// - the web's draftCategoryName hand-over cleared its route state with navigate(pathname, { replace }); here that
//   would rebuild the screen (and close the sheet again), so the hand-over is consumed once per route state instead.
import React, { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock3,
  Edit2,
  Eye,
  EyeOff,
  Globe,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react-native"
import { useLocation } from "@/lib/router"
import { toast } from "@/lib/toast"
import { AppImage, KeyboardAwareScrollView, Screen, Sheet, Text, TextInput } from "@/native/ui"
import { colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { restaurantAPI, uploadAPI } from "@food/api"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"

const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]
const STRONG = restaurantTheme.primaryStrong // text-green-700 / emerald-700 / amber-700 in the restaurant theme

const defaultFormData = {
  name: "",
  type: "",
  image: "",
  isActive: true,
  sortOrder: 0,
  foodTypeScope: "Veg",
}

const DIET_OPTIONS = ["Veg", "Non-Veg", "Both"]

const approvalBadgeStyle = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return { bg: colors.emerald[50], text: STRONG, border: colors.emerald[200] }
  if (value === "rejected") return { bg: colors.rose[50], text: colors.rose[700], border: colors.rose[200] }
  return { bg: restaurantTheme.primarySoft, text: STRONG, border: colors.amber[200] }
}

const scopePillStyle = (scope) => {
  if (scope === "Veg") return { bg: colors.green[50], text: STRONG, border: colors.green[200] }
  if (scope === "Non-Veg") return { bg: colors.red[50], text: colors.red[700], border: colors.red[200] }
  return { bg: colors.slate[100], text: colors.slate[700], border: colors.slate[200] }
}

function Gradient({ style }) {
  return <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, style]} />
}

/** <input> with the restaurant theme's focus border */
function Field({ style, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      placeholderTextColor={colors.gray[400]}
      {...props}
      onFocus={(e) => {
        setFocused(true)
        props.onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        props.onBlur?.(e)
      }}
      style={[s.input, focused && s.inputFocused, style]}
    />
  )
}

export default function MenuCategoriesPage() {
  const location = useLocation()
  const goBack = useRestaurantBackNavigation()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [isPureVegRestaurant, setIsPureVegRestaurant] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formData, setFormData] = useState(defaultFormData)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false)
  const [dietSelectOpen, setDietSelectOpen] = useState(false)
  const handledDraftKeyRef = useRef(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  useEffect(() => {
    const fetchRestaurantDietType = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const profile =
          response?.data?.data?.restaurant ||
          response?.data?.restaurant ||
          response?.data?.data ||
          null
        const pureVeg = profile?.pureVegRestaurant === true
        setIsPureVegRestaurant(pureVeg)
        if (pureVeg) {
          setFormData((prev) =>
            prev.foodTypeScope === "Veg" ? prev : { ...prev, foodTypeScope: "Veg" },
          )
        }
      } catch {
        /* ignore — keep full diet options */
      }
    }
    fetchRestaurantDietType()
  }, [])

  useEffect(() => {
    const draftCategoryName = String(location.state?.draftCategoryName || "").trim()
    if (!draftCategoryName) return
    if (handledDraftKeyRef.current === location.key) return
    handledDraftKeyRef.current = location.key
    setEditingCategory(null)
    setFormData((prev) => ({ ...prev, ...defaultFormData, name: draftCategoryName }))
    setSelectedImageFile(null)
    setImagePreview(null)
    setShowModal(true)
  }, [location.key, location.state])

  const ownCategories = useMemo(
    () => categories.filter((category) => category.ownedByRestaurant),
    [categories],
  )

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getAllCategories()
      const list = response?.data?.data?.categories || []
      setCategories(Array.isArray(list) ? list : [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load categories")
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  const resetModal = () => {
    setShowModal(false)
    setEditingCategory(null)
    setFormData(defaultFormData)
    setSelectedImageFile(null)
    setImagePreview(null)
    setUploadingImage(false)
  }

  const openCreateModal = () => {
    setEditingCategory(null)
    setFormData({
      ...defaultFormData,
      foodTypeScope: isPureVegRestaurant ? "Veg" : defaultFormData.foodTypeScope,
    })
    setSelectedImageFile(null)
    setImagePreview(null)
    setShowModal(true)
  }

  const openEditModal = (category) => {
    if (!category?.canEdit) {
      toast.error("Admin controls this category now")
      return
    }
    setEditingCategory(category)
    const scope = category?.foodTypeScope || "Veg"
    setFormData({
      name: category?.name || "",
      type: category?.type || "",
      image: category?.image || "",
      isActive: category?.isActive !== false,
      sortOrder: Number.isFinite(Number(category?.sortOrder)) ? Number(category.sortOrder) : 0,
      foodTypeScope: isPureVegRestaurant ? "Veg" : scope,
    })
    setSelectedImageFile(null)
    setImagePreview(category?.image || null)
    setShowModal(true)
  }

  const handleImageFileChange = (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size exceeds 5MB limit.")
      return
    }
    setSelectedImageFile(file)
    setImagePreview(file.uri || null)
  }

  const handleImageClick = () => {
    setIsPhotoPickerOpen(true)
  }

  const handleSaveCategory = async () => {
    if (!String(formData.name || "").trim()) {
      toast.error("Category name is required")
      return
    }

    try {
      setUploadingImage(true)
      let imageUrl = String(formData.image || "").trim()

      if (selectedImageFile) {
        const res = await uploadAPI.uploadMedia(selectedImageFile, { folder: "food/categories" })
        const url = res?.data?.data?.url || res?.data?.url
        if (url) imageUrl = String(url)
      }

      const payload = {
        name: String(formData.name || "").trim(),
        type: String(formData.type || "").trim(),
        image: imageUrl,
        isActive: formData.isActive !== false,
        sortOrder: Number.isFinite(Number(formData.sortOrder)) ? Number(formData.sortOrder) : 0,
        foodTypeScope: isPureVegRestaurant ? "Veg" : formData.foodTypeScope,
      }

      if (editingCategory) {
        await restaurantAPI.updateCategory(editingCategory._id || editingCategory.id, payload)
        toast.success("Category updated")
      } else {
        await restaurantAPI.createCategory(payload)
        toast.success("Category created")
      }

      resetModal()
      fetchCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save category")
    } finally {
      setUploadingImage(false)
    }
  }

  const deleteCategory = async (category) => {
    try {
      await restaurantAPI.deleteCategory(category._id || category.id)
      toast.success("Category deleted successfully")
      fetchCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete category")
    }
  }

  const handleDeleteCategory = (category) => {
    if (!category?.canDelete) {
      toast.error(category?.canEdit ? "Remove foods from this category before deleting it" : "Admin controls this category now")
      return
    }
    Alert.alert("", `Delete "${category.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "OK", onPress: () => deleteCategory(category) },
    ])
  }

  const handleToggleActive = async (category) => {
    if (!category?.canEdit) {
      toast.error("Admin controls this category now")
      return
    }
    try {
      await restaurantAPI.updateCategory(category._id || category.id, {
        isActive: !(category?.isActive !== false),
      })
      toast.success("Category updated")
      fetchCategories()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update category")
    }
  }

  const renderCategory = (category) => {
    const status = category?.approvalStatus || "pending"
    const isEditable = category?.canEdit
    const isGlobal = category?.isGlobal
    const badge = approvalBadgeStyle(status)
    const scope = scopePillStyle(category?.foodTypeScope)

    return (
      <View key={category._id || category.id} style={s.card}>
        <View style={s.row3}>
          <View style={s.thumb}>
            {category?.image ? (
              <AppImage src={category.image} style={s.fill} contentFit="cover" />
            ) : (
              <View style={s.thumbLetterWrap}>
                <Text style={s.thumbLetter}>{String(category?.name || "C").slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
          </View>

          <View style={s.flex1}>
            <View style={s.pillRow}>
              <Text style={s.cardTitle}>{category.name}</Text>
              <View style={[s.pill, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                {status === "approved" ? (
                  <BadgeCheck size={14} color={badge.text} style={s.pillIcon} />
                ) : (
                  <Clock3 size={14} color={badge.text} style={s.pillIcon} />
                )}
                <Text style={[s.pillText, { color: badge.text }]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
              </View>
              <View style={[s.pill, { backgroundColor: scope.bg, borderColor: scope.border }]}>
                <Text style={[s.pillText, { color: scope.text }]}>{category?.foodTypeScope || "Both"}</Text>
              </View>
              {isGlobal && (
                <View style={[s.pill, { backgroundColor: colors.sky[50], borderColor: colors.sky[200] }]}>
                  <Globe size={14} color={colors.sky[700]} style={s.pillIcon} />
                  <Text style={[s.pillText, { color: colors.sky[700] }]}>Global</Text>
                </View>
              )}
            </View>

            <View style={s.metaBlock}>
              <Text style={s.metaText}>{`${category?.itemCount || 0} item(s) linked`}</Text>
              {isGlobal ? (
                <Text style={s.metaText}>Admin controls this category now, so you can use it but not rename or delete it.</Text>
              ) : status === "approved" ? (
                <Text style={s.metaText}>Ready to use for your dishes.</Text>
              ) : (
                <Text style={s.metaText}>Save this category again to make it usable.</Text>
              )}
              {status === "rejected" && category?.rejectionReason ? (
                <Text style={[s.metaText, { color: colors.rose[600] }]}>{`Reason: ${category.rejectionReason}`}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={s.actions}>
          <Pressable
            onPress={() => handleToggleActive(category)}
            disabled={!isEditable}
            accessibilityLabel={category?.isActive !== false ? "Deactivate" : "Activate"}
            style={[s.actionBtn, { backgroundColor: colors.slate[100] }, !isEditable && s.disabled]}
          >
            {category?.isActive !== false ? <Eye size={16} color={colors.slate[700]} /> : <EyeOff size={16} color={colors.slate[700]} />}
          </Pressable>
          <Pressable
            onPress={() => openEditModal(category)}
            disabled={!isEditable}
            style={[s.actionBtn, { backgroundColor: colors.blue[50] }, !isEditable && s.disabled]}
          >
            <Edit2 size={16} color={colors.blue[700]} />
          </Pressable>
          <Pressable
            onPress={() => handleDeleteCategory(category)}
            disabled={!category?.canDelete}
            style={[s.actionBtn, { backgroundColor: colors.rose[50] }, !category?.canDelete && s.disabled]}
          >
            <Trash2 size={16} color={colors.rose[700]} />
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <Screen bg={colors.white} edges={["top"]}>
      <View style={s.header}>
        <Pressable onPress={goBack} style={s.backBtn} hitSlop={6}>
          <ArrowLeft size={20} color={colors.slate[700]} />
        </Pressable>
        <View style={s.flex1}>
          <Text style={s.headerTitle}>Menu Categories</Text>
          <Text style={s.headerSub}>Create your own categories and use them right away.</Text>
        </View>
      </View>

      <ScrollView style={s.page} contentContainerStyle={s.pageContent}>
        <View style={s.howCard}>
          <Text style={s.howTitle}>How this works</Text>
          <Text style={s.howText}>
            Categories you create are ready to use immediately, with no admin approval needed. They stay private to your restaurant.
            You can pick them when adding or editing a dish.
          </Text>
        </View>

        <Pressable onPress={openCreateModal} style={({ pressed }) => [s.addBtn, pressed && s.pressed]}>
          <Gradient />
          <Plus size={20} color={colors.white} />
          <Text style={s.addBtnText}>Add Category</Text>
        </Pressable>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="small" color={colors.slate[500]} />
          </View>
        ) : ownCategories.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>No restaurant categories yet</Text>
            <Text style={s.emptyText}>
              {`Start with a category${
                isPureVegRestaurant
                  ? " for your pure veg menu."
                  : " and choose whether it should accept veg, non-veg, or both kinds of dishes."
              }`}
            </Text>
          </View>
        ) : (
          <View style={s.list}>{ownCategories.map(renderCategory)}</View>
        )}
      </ScrollView>

      <Sheet open={showModal} onClose={resetModal} style={s.sheet}>
        <KeyboardAwareScrollView contentContainerStyle={s.sheetContent}>
          <View style={s.sheetHeader}>
            <View style={s.flex1}>
              <Text style={s.sheetTitle}>{editingCategory ? "Edit Category" : "Create Category"}</Text>
              <Text style={s.headerSub}>
                {editingCategory
                  ? "Changes apply right away."
                  : "Choose the diet scope carefully. It decides which dishes can use this category."}
              </Text>
            </View>
            <Pressable onPress={resetModal} hitSlop={8}>
              <X size={20} color={colors.slate[600]} />
            </Pressable>
          </View>

          <View style={s.formGap}>
            <View>
              <Text style={s.label}>Category Name</Text>
              <Field
                value={formData.name}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
                placeholder="Enter category name"
              />
            </View>

            <View>
              <Text style={s.label}>Diet Scope</Text>
              {isPureVegRestaurant ? (
                <View style={s.pureVegBox}>
                  <Text style={s.pureVegText}>Veg (Pure veg restaurant)</Text>
                </View>
              ) : (
                <Pressable onPress={() => setDietSelectOpen(true)} style={[s.input, s.selectBox, dietSelectOpen && s.inputFocused]}>
                  <Text style={s.selectText}>{formData.foodTypeScope}</Text>
                  <ChevronDown size={16} color={colors.slate[500]} />
                </Pressable>
              )}
            </View>

            <View>
              <Text style={s.label}>Optional Type Label</Text>
              <Field
                value={formData.type}
                onChangeText={(text) => setFormData((prev) => ({ ...prev, type: text }))}
                placeholder="Examples: Starters, Desserts, Drinks"
              />
            </View>

            <View style={s.imageRow}>
              {imagePreview || formData.image ? (
                <AppImage src={imagePreview || formData.image} style={s.preview} contentFit="cover" />
              ) : null}
              <Pressable onPress={handleImageClick} style={s.uploadBtn}>
                <Upload size={16} color={colors.slate[700]} />
                <Text style={s.uploadText}>Upload Image</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))}
              style={s.checkRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: formData.isActive }}
            >
              <View style={[s.checkbox, formData.isActive && s.checkboxOn]}>
                {formData.isActive ? <Check size={11} color={colors.white} strokeWidth={3} /> : null}
              </View>
              <Text style={s.checkText}>Keep category active</Text>
            </Pressable>
          </View>

          <View style={s.sheetButtons}>
            <Pressable onPress={resetModal} style={s.cancelBtn}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSaveCategory} disabled={uploadingImage} style={[s.saveBtn, uploadingImage && { opacity: 0.6 }]}>
              <Gradient />
              <Text style={s.saveText}>{uploadingImage ? "Uploading..." : editingCategory ? "Save" : "Create"}</Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollView>

        {/* the web's native <select> list */}
        <Sheet open={dietSelectOpen} onClose={() => setDietSelectOpen(false)}>
          <View style={s.selectSheet}>
            {DIET_OPTIONS.map((option) => {
              const active = formData.foodTypeScope === option
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setFormData((prev) => ({ ...prev, foodTypeScope: option }))
                    setDietSelectOpen(false)
                  }}
                  style={[s.selectOption, active && { backgroundColor: restaurantTheme.primarySoft }]}
                >
                  <Text style={[s.selectOptionText, active && { color: restaurantTheme.brand, fontWeight: "600" }]}>{option}</Text>
                  {active ? <Check size={16} color={restaurantTheme.brand} /> : null}
                </Pressable>
              )
            })}
          </View>
        </Sheet>

        <ImageSourcePicker
          isOpen={isPhotoPickerOpen}
          onClose={() => setIsPhotoPickerOpen(false)}
          onFileSelect={handleImageFileChange}
          title="Category Image"
          description="Choose how to upload your category image"
          fileNamePrefix="category-photo"
        />
      </Sheet>
    </Screen>
  )
}

const s = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  flex1: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(3),
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    backgroundColor: "rgba(255,255,255,0.95)",
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[200],
  },
  backBtn: { borderRadius: radius.full, padding: sp(1) },
  headerTitle: { ...fontSize.xl, fontWeight: "700", color: colors.slate[900] },
  headerSub: { ...fontSize.xs, color: colors.slate[500] },
  page: { flex: 1, backgroundColor: colors.slate[50] },
  pageContent: { padding: sp(4), paddingBottom: sp(4) + 96, gap: sp(4) },
  howCard: { borderRadius: radius["2xl"], borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: sp(4) },
  howTitle: { ...fontSize.sm, fontWeight: "600", color: colors.slate[900] },
  howText: { marginTop: sp(2), ...fontSize.sm, color: colors.slate[600] },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(2),
    borderRadius: radius.xl,
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    overflow: "hidden",
  },
  addBtnText: { ...fontSize.base, fontWeight: "600", color: colors.white },
  loadingBox: { alignItems: "center", justifyContent: "center", paddingVertical: sp(12) },
  emptyBox: {
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.slate[300],
    backgroundColor: colors.white,
    paddingHorizontal: sp(6),
    paddingVertical: sp(12),
    alignItems: "center",
  },
  emptyTitle: { ...fontSize.lg, fontWeight: "600", color: colors.slate[900], textAlign: "center" },
  emptyText: { marginTop: sp(2), ...fontSize.sm, color: colors.slate[500], textAlign: "center" },
  list: { gap: sp(3) },
  card: { borderRadius: radius["2xl"], borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: sp(4), ...shadow.sm },
  row3: { flexDirection: "row", gap: sp(3) },
  thumb: { width: 64, height: 64, borderRadius: radius["2xl"], overflow: "hidden", backgroundColor: colors.slate[100] },
  thumbLetterWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  thumbLetter: { ...fontSize.lg, fontWeight: "700", color: colors.slate[500] },
  pillRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sp(2) },
  cardTitle: { ...fontSize.base, fontWeight: "600", color: colors.slate[900] },
  pill: { flexDirection: "row", alignItems: "center", borderRadius: radius.full, borderWidth: 1, paddingHorizontal: sp(2.5), paddingVertical: sp(1) },
  pillIcon: { marginRight: sp(1) },
  pillText: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  metaBlock: { marginTop: sp(2), gap: sp(1) },
  metaText: { ...fontSize.sm, color: colors.slate[500] },
  actions: { marginTop: sp(4), flexDirection: "row", alignItems: "center", gap: sp(2) },
  actionBtn: { borderRadius: radius.xl, padding: sp(2) },
  sheet: { maxHeight: "90%", backgroundColor: colors.white, borderTopLeftRadius: radius["3xl"], borderTopRightRadius: radius["3xl"], ...shadow["2xl"] },
  sheetContent: { padding: sp(4) },
  sheetHeader: { marginBottom: sp(4), flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(3) },
  sheetTitle: { ...fontSize.lg, fontWeight: "700", color: colors.slate[900] },
  formGap: { gap: sp(4) },
  label: { marginBottom: sp(2), ...fontSize.sm, fontWeight: "500", color: colors.slate[700] },
  input: {
    width: "100%",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.slate[300],
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    ...fontSize.base,
    color: restaurantTheme.text,
    backgroundColor: colors.white,
  },
  inputFocused: { borderColor: restaurantTheme.focusBorder },
  selectBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { ...fontSize.base, color: restaurantTheme.text },
  pureVegBox: {
    width: "100%",
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.green[200],
    backgroundColor: colors.green[50],
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
  },
  pureVegText: { ...fontSize.sm, fontWeight: "500", color: STRONG },
  imageRow: { flexDirection: "row", alignItems: "center", gap: sp(3) },
  preview: { width: 64, height: 64, borderRadius: radius["2xl"] },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(2),
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.slate[300],
    paddingHorizontal: sp(4),
    paddingVertical: sp(2.5),
  },
  uploadText: { ...fontSize.sm, fontWeight: "500", color: colors.slate[700] },
  checkRow: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.gray[500],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  checkboxOn: { backgroundColor: restaurantTheme.brand, borderColor: restaurantTheme.brand },
  checkText: { ...fontSize.sm, color: colors.slate[700] },
  sheetButtons: { marginTop: sp(6), flexDirection: "row", gap: sp(3) },
  cancelBtn: { flex: 1, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.slate[300], paddingVertical: sp(3), alignItems: "center" },
  cancelText: { ...fontSize.base, fontWeight: "500", color: colors.slate[700] },
  saveBtn: { flex: 1, borderRadius: radius.xl, paddingVertical: sp(3), alignItems: "center", overflow: "hidden" },
  saveText: { ...fontSize.base, fontWeight: "500", color: colors.white },
  selectSheet: { paddingVertical: sp(3), paddingHorizontal: sp(3), backgroundColor: colors.white },
  selectOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingVertical: sp(3.5), borderRadius: radius.lg },
  selectOptionText: { ...fontSize.base, color: colors.gray[900] },
})
