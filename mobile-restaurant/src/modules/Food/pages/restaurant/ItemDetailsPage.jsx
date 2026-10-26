// Web: pages/restaurant/ItemDetailsPage.jsx — add / edit one dish (/inventory/item/:id and /hub-menu/item/:id, id "new"
// = add): rejection banner, dish photo (single-image carousel with swipe, remove-photo confirm), category picker sheet
// (search, "Add" -> Menu Categories with the unsaved form kept), name, description, Veg / Non-Veg, base price or
// variants (name + price rows), preparation time, Recommended + In stock switches, fixed Cancel / Save bar with
// "Delete Entire Item from Menu", delete confirm. Same API calls, validation, toasts and navigation.
// Native:
// - the form is a KeyboardAwareScrollView (every input scrolls above the keyboard and above the Save bar); the fixed
//   bar rides on the keyboard (useKeyboardOffset), like the web's visualViewport inset;
// - photos come from ImageSourcePicker (camera / gallery) as { uri, name, type } files; the picked file's uri is the
//   preview (the web's blob: URL), uploaded with uploadAPI.uploadMedia on Save;
// - the Preparation Time <select> opens a bottom Sheet with the same options;
// - going to "Add category" pushes Menu Categories on top: this page stays mounted, so on coming back (screen focus)
//   the kept draft is dropped (the form is still there), categories are loaded again and the picker reopens — what
//   the web's remount + draft restore did.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useFocusEffect } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit as EditIcon,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react-native"
import { useLocation, useNavigate, useParams } from "@/lib/router"
import { toast } from "@/lib/toast"
import { AppImage, Dialog, KeyboardAwareScrollView, Screen, Sheet, Text, TextInput } from "@/native/ui"
import { alpha, colors, fontSize, radius, restaurantTheme, shadow, sp } from "@/theme"
import useKeyboardOffset from "@/modules/Taxi/shared/hooks/useKeyboardOffset"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Switch } from "@food/components/ui/switch"
import { restaurantAPI, uploadAPI } from "@food/api"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { getFoodVariants } from "@food/utils/foodVariants"
import dishFallbackImage from "@food/assets/dish_fallback.webp"
import { networkErrorMessage } from "@/shared/utils/networkError"
const debugLog = () => {}
const debugWarn = () => {}
const debugError = () => {}

const INVENTORY_RECOMMENDED_KEY = "restaurant_inventory_recommended_map"
const BRAND = [restaurantTheme.brand, restaurantTheme.brandDark]
const STRONG = restaurantTheme.primaryStrong

const PREPARATION_OPTIONS = [
  { value: "", label: "Select timing" },
  { value: "10-20 mins", label: "10-20 mins" },
  { value: "20-25 mins", label: "20-25 mins" },
  { value: "25-35 mins", label: "25-35 mins" },
  { value: "35-45 mins", label: "35-45 mins" },
]

const isRemoteUrl = (value) => typeof value === "string" && (value.startsWith("http://") || value.startsWith("https://"))

const getUploadErrorMessage = (error, fileName = "image") => {
  const message =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Please try again."
  return `Failed to upload ${fileName}: ${message}`
}

const createVariantDraft = (variant = {}) => {
  const restaurantPrice =
    variant?.basePrice != null && Number.isFinite(Number(variant.basePrice))
      ? Number(variant.basePrice)
      : variant?.price
  return {
    localId: String(variant?.id || variant?._id || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    persistedId: String(variant?.id || variant?._id || ""),
    name: String(variant?.name || ""),
    price: restaurantPrice != null ? String(restaurantPrice) : "",
  }
}

const cleanPrice = (text) => {
  const value = String(text || "").replace(/[₹\s,]/g, "").replace(/[^0-9.]/g, "")
  const parts = value.split(".")
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : value
}

// Unsaved form kept in memory while the restaurant hops to "Add category" and back. Module scope so the picked
// file survives.
let unsavedItemDraft = null

function Gradient({ style }) {
  return <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, style]} />
}

/** <input> / <textarea> with the restaurant theme's focus border */
function Field({ style, focusStyle, ...props }) {
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
      style={[s.input, style, focused && (focusStyle || s.inputFocused)]}
    />
  )
}

export default function ItemDetailsPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const { id } = useParams()
  const location = useLocation()
  const insets = useSafeAreaInsets()
  const keyboardInset = useKeyboardOffset()
  const isNewItem = id === "new"
  const defaultCategory = location.state?.category || "Select category"
  const defaultCategoryId = location.state?.categoryId || ""

  const [itemData, setItemData] = useState(null)
  const [itemName, setItemName] = useState("")
  const [category, setCategory] = useState(defaultCategory)
  const [selectedCategoryId, setSelectedCategoryId] = useState(defaultCategoryId)
  const [subCategory, setSubCategory] = useState("")
  const [servesInfo, setServesInfo] = useState("")
  const [itemSizeQuantity, setItemSizeQuantity] = useState("")
  const [itemSizeUnit, setItemSizeUnit] = useState("piece")
  const [itemDescription, setItemDescription] = useState("")
  const [foodType, setFoodType] = useState("Veg")
  const [isPureVegRestaurant, setIsPureVegRestaurant] = useState(false)
  const [basePrice, setBasePrice] = useState("")
  const [variants, setVariants] = useState([])
  const [preparationTime, setPreparationTime] = useState("")
  const [gst, setGst] = useState("5.0")
  const [isRecommended, setIsRecommended] = useState(false)
  const [isInStock, setIsInStock] = useState(true)
  const [weightPerServing, setWeightPerServing] = useState("")
  const [calorieCount, setCalorieCount] = useState("")
  const [proteinCount, setProteinCount] = useState("")
  const [carbohydrates, setCarbohydrates] = useState("")
  const [fatCount, setFatCount] = useState("")
  const [fibreCount, setFibreCount] = useState("")
  const [allergens, setAllergens] = useState("")
  const [selectedTags, setSelectedTags] = useState([])
  const [images, setImages] = useState([])
  const [imageFiles, setImageFiles] = useState(new Map()) // picked files by preview uri
  const [uploadingImages, setUploadingImages] = useState(false)
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const touchStartRef = useRef(null)
  const touchEndRef = useRef(null)
  const [isCategoryPopupOpen, setIsCategoryPopupOpen] = useState(false)
  const [categorySearchQuery, setCategorySearchQuery] = useState("")
  const [debouncedCategorySearch, setDebouncedCategorySearch] = useState("")
  const [isPrepSelectOpen, setIsPrepSelectOpen] = useState(false)
  const [showRemoveImageConfirm, setShowRemoveImageConfirm] = useState(false)
  const [showDeleteItemConfirm, setShowDeleteItemConfirm] = useState(false)
  const [isDeletingItem, setIsDeletingItem] = useState(false)
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingItem, setLoadingItem] = useState(false)
  const [barHeight, setBarHeight] = useState(isNewItem ? 72 : 108)

  const handleDeleteItem = async () => {
    if (isNewItem) return
    const itemId = String(itemData?.id || id || "")
    if (!itemId) return
    try {
      setIsDeletingItem(true)
      await restaurantAPI.deleteFood(itemId)
      toast.success("Item deleted from restaurant menu")
      window.dispatchEvent(new CustomEvent("foodsChanged"))
      navigate("/food/restaurant/inventory", { replace: true })
    } catch (error) {
      debugError("Failed to delete food item:", error)
      toast.error(error.response?.data?.message || "Failed to delete item")
    } finally {
      setIsDeletingItem(false)
      setShowDeleteItemConfirm(false)
    }
  }

  const maxNameLength = 70
  const maxDescriptionLength = 1000
  const descriptionLength = itemDescription.length
  const minDescriptionLength = 5
  const nameLength = itemName.length
  const currentApprovalStatus = String(itemData?.approvalStatus || "").toLowerCase()
  const currentRejectionReason = String(itemData?.rejectionReason || "").trim()

  const populateFormFromItem = (item = {}) => {
    setItemData(item)

    setItemName(item.name || "")
    setCategory(item.category || item.categoryName || defaultCategory)
    setSelectedCategoryId(item.categoryId || "")
    setSubCategory(item.subCategory || item.category || item.categoryName || "Starters")
    setServesInfo(item.servesInfo || "")
    setItemSizeQuantity(item.itemSizeQuantity || "")
    setItemSizeUnit(item.itemSizeUnit || "piece")
    setItemDescription(item.description || "")
    if (isPureVegRestaurant) {
      setFoodType("Veg")
    } else {
      setFoodType(item.foodType === "Veg" ? "Veg" : "Non-Veg")
    }
    const rawVariants = Array.isArray(item.variants)
      ? item.variants
      : Array.isArray(item.variations)
        ? item.variations
        : []
    // Restaurant edit must use basePrice (own price), never admin selling price.
    const itemVariants = rawVariants.length
      ? rawVariants
          .map((variant, index) => {
            const name = String(variant?.name || "").trim()
            const base = Number(variant?.basePrice)
            const price = Number.isFinite(base) && base >= 0 ? base : Number(variant?.price)
            if (!name || !Number.isFinite(price) || price <= 0) return null
            return {
              id: String(variant?.id || variant?._id || `variant-${index}`),
              _id: String(variant?.id || variant?._id || `variant-${index}`),
              name,
              price,
              basePrice: price,
            }
          })
          .filter(Boolean)
      : getFoodVariants(item)
    setVariants(itemVariants.map(createVariantDraft))
    const restaurantBase =
      item.basePrice != null && Number.isFinite(Number(item.basePrice))
        ? item.basePrice
        : item.price
    setBasePrice(itemVariants.length === 0 ? (restaurantBase != null ? String(restaurantBase) : "") : "")
    setPreparationTime(item.preparationTime || "")
    setGst(item.gst?.toString() || "5.0")
    setIsRecommended(item.isRecommended || false)
    setIsInStock(item.isAvailable !== false)
    setSelectedTags(item.tags || [])

    const existingImages = Array.isArray(item.images) && item.images.length > 0
      ? item.images.filter(Boolean)
      : (item.image ? [item.image] : [])
    setImages(existingImages)

    setWeightPerServing("")
    setCalorieCount("")
    setProteinCount("")
    setCarbohydrates("")
    setFatCount("")
    setFibreCount("")
    setAllergens("")

    if (item.nutrition && Array.isArray(item.nutrition)) {
      item.nutrition.forEach((nut) => {
        if (typeof nut === "string") {
          if (nut.includes("Weight per serving")) {
            const match = nut.match(/(\d+)\s*grams?/i)
            if (match) setWeightPerServing(match[1])
          } else if (nut.includes("Calorie count")) {
            const match = nut.match(/(\d+)\s*Kcal/i)
            if (match) setCalorieCount(match[1])
          } else if (nut.includes("Protein count")) {
            const match = nut.match(/(\d+)\s*mg/i)
            if (match) setProteinCount(match[1])
          } else if (nut.includes("Carbohydrates")) {
            const match = nut.match(/(\d+)\s*mg/i)
            if (match) setCarbohydrates(match[1])
          } else if (nut.includes("Fat count")) {
            const match = nut.match(/(\d+)\s*mg/i)
            if (match) setFatCount(match[1])
          } else if (nut.includes("Fibre count")) {
            const match = nut.match(/(\d+)\s*mg/i)
            if (match) setFibreCount(match[1])
          }
        }
      })
    }

    if (item.allergies && Array.isArray(item.allergies) && item.allergies.length > 0) {
      setAllergens(item.allergies.join(", "))
    }
  }

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
        if (pureVeg) setFoodType("Veg")
      } catch (error) {
        debugWarn("Failed to load restaurant diet type:", error)
      }
    }
    fetchRestaurantDietType()
  }, [])

  // Fetch item data from menu API when editing
  useEffect(() => {
    const fetchItemData = async () => {
      if (location.state?.item) {
        populateFormFromItem(location.state.item)
      }

      if (!isNewItem && id) {
        try {
          setLoadingItem(true)
          const menuResponse = await restaurantAPI.getMenu()
          const menu = menuResponse.data?.data?.menu
          const sections = menu?.sections || []

          let foundItem = null
          const searchId = String(id).trim()
          for (const section of sections) {
            const item = section.items?.find((i) => {
              const itemId = String(i.id || i._id || "").trim()
              return itemId === searchId || itemId === id
            })
            if (item) {
              foundItem = item
              break
            }
            if (section.subsections) {
              for (const subsection of section.subsections) {
                const subItem = subsection.items?.find((i) => {
                  const itemId = String(i.id || i._id || "").trim()
                  return itemId === searchId || itemId === id
                })
                if (subItem) {
                  foundItem = subItem
                  break
                }
              }
              if (foundItem) break
            }
          }

          if (foundItem) {
            populateFormFromItem(foundItem)
          } else {
            toast.error("Item not found")
          }
        } catch (error) {
          debugError("Error fetching item data:", error)
          toast.error("Failed to load item data")
        } finally {
          setLoadingItem(false)
        }
      }
    }

    fetchItemData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNewItem, location.state, defaultCategory])

  const fetchCategories = useCallback(async () => {
    try {
      setLoadingCategories(true)
      const response = await restaurantAPI.getCategories()
      if (response.data.success && response.data.data.categories) {
        const formattedCategories = response.data.data.categories.map((cat) => ({
          id: cat._id || cat.id,
          name: cat.name,
          foodTypeScope: cat.foodTypeScope || "Both",
        }))
        setCategories(formattedCategories)
        return formattedCategories
      }
      setCategories([])
      return []
    } catch (error) {
      debugError("Error fetching restaurant categories:", error)
      setCategories([])
      return []
    } finally {
      setLoadingCategories(false)
    }
  }, [])

  // Fetch categories once on mount; auto-match by name if category passed via nav state
  useEffect(() => {
    fetchCategories().then((formattedCategories) => {
      if (!defaultCategoryId && defaultCategory && defaultCategory !== "Select category") {
        const matched = formattedCategories.find((cat) => cat.name === defaultCategory)
        if (matched) {
          setSelectedCategoryId(matched.id)
          setCategory(matched.name)
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCategorySearch(categorySearchQuery.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [categorySearchQuery])

  useEffect(() => {
    if (!isCategoryPopupOpen) {
      setCategorySearchQuery("")
      setDebouncedCategorySearch("")
    }
  }, [isCategoryPopupOpen])

  const filteredCategories = useMemo(() => {
    let list = categories
    if (isPureVegRestaurant) {
      list = list.filter((cat) => cat.foodTypeScope !== "Non-Veg")
    }
    if (!debouncedCategorySearch) return list
    const query = debouncedCategorySearch.toLowerCase()
    return list.filter((cat) => String(cat.name || "").toLowerCase().includes(query))
  }, [categories, debouncedCategorySearch, isPureVegRestaurant])

  const openAddCategoryPage = () => {
    unsavedItemDraft = {
      key: String(id || ""),
      values: {
        itemName, category, selectedCategoryId, subCategory, servesInfo,
        itemSizeQuantity, itemSizeUnit, itemDescription, foodType, basePrice,
        variants, preparationTime, gst, isRecommended, isInStock, selectedTags,
        weightPerServing, calorieCount, proteinCount, carbohydrates, fatCount,
        fibreCount, allergens, images,
      },
      imageFiles: new Map(imageFiles),
    }
    setIsCategoryPopupOpen(false)
    navigate("/food/restaurant/menu-categories", {
      state: { backTo: location.pathname, openCategoryPopup: true },
    })
  }

  // Put the unsaved form back when this page is built again while a draft is kept (web: every return from "Add
  // category" rebuilt the page). For an existing item: after its saved data has loaded.
  const draftRestoredRef = useRef(false)
  useEffect(() => {
    if (draftRestoredRef.current || loadingItem) return
    const draft = unsavedItemDraft
    if (!draft || draft.key !== String(id || "")) return
    if (!isNewItem && !itemData) return
    draftRestoredRef.current = true
    unsavedItemDraft = null
    const v = draft.values
    setItemName(v.itemName)
    setCategory(v.category)
    setSelectedCategoryId(v.selectedCategoryId)
    setSubCategory(v.subCategory)
    setServesInfo(v.servesInfo)
    setItemSizeQuantity(v.itemSizeQuantity)
    setItemSizeUnit(v.itemSizeUnit)
    setItemDescription(v.itemDescription)
    setFoodType(v.foodType)
    setBasePrice(v.basePrice)
    setVariants(v.variants)
    setPreparationTime(v.preparationTime)
    setGst(v.gst)
    setIsRecommended(v.isRecommended)
    setIsInStock(v.isInStock)
    setSelectedTags(v.selectedTags)
    setWeightPerServing(v.weightPerServing)
    setCalorieCount(v.calorieCount)
    setProteinCount(v.proteinCount)
    setCarbohydrates(v.carbohydrates)
    setFatCount(v.fatCount)
    setFibreCount(v.fibreCount)
    setAllergens(v.allergens)
    setImages(v.images)
    setImageFiles(draft.imageFiles)
    // Back from creating a category → let them pick it right away.
    setIsCategoryPopupOpen(true)
  }, [loadingItem, itemData, id, isNewItem])

  // Native: Menu Categories opens on top of this (still mounted) page. Coming back: the form is still here, so the
  // draft is only dropped; the categories are loaded again (the new one must be listed) and the picker reopens.
  const focusedOnceRef = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnceRef.current) {
        focusedOnceRef.current = true
        return undefined
      }
      const draft = unsavedItemDraft
      if (draft && draft.key === String(id || "")) {
        unsavedItemDraft = null
        draftRestoredRef.current = true
        fetchCategories()
        setIsCategoryPopupOpen(true)
      }
      return undefined
    }, [id, fetchCategories]),
  )

  const handleImageAdd = (file) => {
    if (!file) return

    // Single-image mode: keep only the first selected valid file
    const previewUrl = file.uri
    const newImageFilesMap = new Map()
    newImageFilesMap.set(previewUrl, file)

    setImages([previewUrl])
    setImageFiles(newImageFilesMap)
    setCurrentImageIndex(0)
  }

  const handleCameraClick = () => {
    setIsPhotoPickerOpen(true)
  }

  // Swipe handlers
  const minSwipeDistance = 50

  const onTouchStart = (e) => {
    touchEndRef.current = null
    touchStartRef.current = e.nativeEvent.pageX
  }

  const onTouchMove = (e) => {
    touchEndRef.current = e.nativeEvent.pageX
  }

  const onTouchEnd = () => {
    const touchStart = touchStartRef.current
    const touchEnd = touchEndRef.current
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && images.length > 0) {
      setDirection(1)
      setCurrentImageIndex((prev) => (prev + 1) % images.length)
    }
    if (isRightSwipe && images.length > 0) {
      setDirection(-1)
      setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
    }
  }

  const goToNext = () => {
    setDirection(1)
    setCurrentImageIndex((prev) => (prev + 1) % images.length)
  }

  const goToPrevious = () => {
    setDirection(-1)
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length)
  }

  // slide + fade in of the shown photo (web: AnimatePresence x ±300, opacity, 0.3 s easeInOut)
  const slide = useRef(new Animated.Value(1)).current
  useEffect(() => {
    slide.setValue(0)
    Animated.timing(slide, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start()
  }, [currentImageIndex, slide])

  const handleCategorySelect = (catId, subCat) => {
    const selectedCategory = categories.find((c) => c.id === catId)
    setSelectedCategoryId(selectedCategory?.id || "")
    setCategory(selectedCategory?.name || "")
    setSubCategory(subCat)
    setIsCategoryPopupOpen(false)
  }

  const handleSave = async () => {
    if (!itemName.trim()) {
      toast.error("Please enter an item name")
      return
    }

    try {
      setUploadingImages(true)

      const uploadedImageUrls = []

      // Separate existing URLs (already uploaded) from new picked files (local uris)
      const existingImageUrls = images.filter((img) => isRemoteUrl(img))

      debugLog("Images state:", images)

      const filesToUpload = Array.from(imageFiles.values())

      if (filesToUpload.length > 0) {
        toast.info(`Uploading ${filesToUpload.length} image(s)...`)
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i]
          try {
            let uploadResponse
            try {
              uploadResponse = await uploadAPI.uploadMedia(file, {
                folder: "helloparth/restaurant/menu-items",
              })
            } catch (folderUploadError) {
              // Fallback: retry without folder in case provider/account rejects custom folder.
              debugWarn(`Retrying upload without folder for ${file.name}:`, folderUploadError)
              uploadResponse = await uploadAPI.uploadMedia(file)
            }
            const imageUrl = uploadResponse?.data?.data?.url || uploadResponse?.data?.url
            if (imageUrl) {
              uploadedImageUrls.push(imageUrl)
            } else {
              debugError("Upload response:", uploadResponse)
              throw new Error("Failed to get uploaded image URL")
            }
          } catch (uploadError) {
            debugError(`Error uploading image ${i + 1} (${file.name}):`, uploadError)
            toast.error(getUploadErrorMessage(uploadError, file.name))
            setUploadingImages(false)
            return
          }
        }
      }

      // Single-image mode: keep only one URL
      const allImageUrls = [...existingImageUrls, ...uploadedImageUrls]
        .filter((url, index, self) => url && typeof url === "string" && url.trim() !== "" && self.indexOf(url) === index)
        .slice(0, 1)

      const matchedCategory = Array.isArray(categories)
        ? categories.find((c) => String(c?.id || "") === String(selectedCategoryId || ""))
        : null
      const categoryId = matchedCategory?.id || matchedCategory?._id || null
      const categoryName = matchedCategory?.name || category || ""

      if (!categoryId) {
        toast.error("Please select an approved category first")
        setIsCategoryPopupOpen(true)
        setUploadingImages(false)
        return
      }

      if (
        matchedCategory?.foodTypeScope &&
        matchedCategory.foodTypeScope !== "Both" &&
        matchedCategory.foodTypeScope !== foodType
      ) {
        toast.error(`This ${matchedCategory.foodTypeScope} category cannot accept ${foodType} food`)
        setUploadingImages(false)
        return
      }

      const normalizedVariants = variants
        .map((variant) => ({
          persistedId: String(variant.persistedId || "").trim(),
          name: String(variant.name || "").trim(),
          price: Number(variant.price),
        }))
        .filter((variant) => variant.name || variant.persistedId || variant.price)

      if (normalizedVariants.some((variant) => !variant.name)) {
        toast.error("Each variant must have a name")
        setUploadingImages(false)
        return
      }

      if (normalizedVariants.some((variant) => !Number.isFinite(variant.price) || variant.price <= 0)) {
        toast.error("Each variant price must be greater than 0")
        setUploadingImages(false)
        return
      }

      const hasVariants = normalizedVariants.length > 0
      const parsedBasePrice = Number(basePrice)
      if (!hasVariants && (!Number.isFinite(parsedBasePrice) || parsedBasePrice < 0)) {
        toast.error("Please enter a valid base price")
        setUploadingImages(false)
        return
      }

      const variantPayload = normalizedVariants.map((variant) => ({
        ...(variant.persistedId ? { _id: variant.persistedId } : {}),
        name: variant.name,
        price: variant.price,
      }))

      const effectiveFoodType = isPureVegRestaurant ? "Veg" : foodType

      let itemId
      if (isNewItem) {
        const createRes = await restaurantAPI.createFood({
          name: itemName.trim(),
          description: itemDescription.trim(),
          price: hasVariants ? undefined : parsedBasePrice,
          variants: variantPayload,
          image: allImageUrls.length > 0 ? allImageUrls[0] : "",
          foodType: effectiveFoodType,
          isAvailable: isInStock,
          isRecommended: isRecommended === true,
          preparationTime: preparationTime || "",
          categoryId: categoryId || undefined,
          categoryName,
        })
        const created = createRes?.data?.data?.food || createRes?.data?.food
        itemId = String(created?._id || created?.id || "")
        if (!itemId) {
          throw new Error("Failed to create item in database")
        }
      } else {
        itemId = String(itemData?.id || id || "")
        if (!itemId) {
          throw new Error("Invalid item id")
        }
        await restaurantAPI.updateFood(itemId, {
          name: itemName.trim(),
          description: itemDescription.trim(),
          price: hasVariants ? undefined : parsedBasePrice,
          variants: variantPayload,
          image: allImageUrls.length > 0 ? allImageUrls[0] : "",
          foodType: effectiveFoodType,
          isAvailable: isInStock,
          isRecommended: isRecommended === true,
          preparationTime: preparationTime || "",
          categoryId: categoryId || undefined,
          categoryName,
        })
      }

      try {
        const raw = localStorage.getItem(INVENTORY_RECOMMENDED_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        const safeMap = parsed && typeof parsed === "object" ? parsed : {}
        localStorage.setItem(
          INVENTORY_RECOMMENDED_KEY,
          JSON.stringify({ ...safeMap, [String(itemId)]: Boolean(isRecommended) }),
        )
      } catch (recommendedError) {
        debugWarn("Failed to persist recommended state after save:", recommendedError)
      }

      toast.success(isNewItem ? "Item created successfully" : "Item updated and sent for approval again")
      await new Promise((resolve) => setTimeout(resolve, 200))
      navigate("/food/restaurant/inventory", { replace: true })
      window.dispatchEvent(new CustomEvent("foodsChanged"))
    } catch (error) {
      debugError("Error saving menu:", error)
      if (error.code === "ERR_NETWORK") {
        toast.error(networkErrorMessage())
      } else {
        toast.error(error.response?.data?.message || error.message || "Failed to save item. Please try again.")
      }
    } finally {
      setUploadingImages(false)
    }
  }

  const handleVariantChange = (localId, field, value) => {
    setVariants((prev) => prev.map((variant) => (variant.localId === localId ? { ...variant, [field]: value } : variant)))
  }

  const handleAddVariant = () => {
    setVariants((prev) => [...prev, createVariantDraft()])
  }

  const handleRemoveVariant = (localId) => {
    setVariants((prev) => prev.filter((variant) => variant.localId !== localId))
  }

  const prepLabel = PREPARATION_OPTIONS.find((o) => o.value === preparationTime)?.label || preparationTime || "Select timing"

  const renderCategoryRow = (cat) => {
    const isSelected = String(selectedCategoryId || "") === String(cat.id)
    const isVeg = cat.foodTypeScope === "Veg"
    const isNonVeg = cat.foodTypeScope === "Non-Veg"
    return (
      <Pressable
        key={cat.id}
        onPress={() => handleCategorySelect(cat.id, cat.name)}
        style={[s.catRow, isSelected ? shadow.md : { backgroundColor: colors.gray[50] }]}
      >
        {isSelected ? <Gradient /> : null}
        <View style={s.catRowInner}>
          <Text style={[s.catRowName, { color: isSelected ? colors.white : colors.gray[900] }]}>{cat.name}</Text>
          {isVeg ? (
            <View
              style={[
                s.scopePill,
                isSelected
                  ? { borderColor: colors.green[400], backgroundColor: alpha(colors.green[900], 0.4) }
                  : { borderColor: restaurantTheme.primaryBorderStrong, backgroundColor: colors.green[50] },
              ]}
            >
              <View style={[s.scopeBox, { borderColor: isSelected ? colors.green[400] : colors.green[600] }]}>
                <View style={[s.scopeDot, { backgroundColor: isSelected ? colors.green[400] : colors.green[600] }]} />
              </View>
              <Text style={[s.scopeText, { color: isSelected ? colors.green[300] : STRONG }]}>Veg</Text>
            </View>
          ) : isNonVeg ? (
            <View
              style={[
                s.scopePill,
                isSelected
                  ? { borderColor: alpha(colors.white, 0.4), backgroundColor: alpha(colors.white, 0.15) }
                  : { borderColor: colors.red[300], backgroundColor: colors.red[50] },
              ]}
            >
              <View style={[s.scopeBox, { borderColor: isSelected ? colors.white : colors.red[600] }]}>
                <View style={[s.scopeDot, { backgroundColor: isSelected ? colors.white : colors.red[600] }]} />
              </View>
              <Text style={[s.scopeText, { color: isSelected ? colors.white : colors.red[700] }]}>Non-Veg</Text>
            </View>
          ) : (
            <View
              style={[
                s.scopePill,
                isSelected
                  ? { borderColor: alpha(colors.white, 0.4), backgroundColor: alpha(colors.white, 0.15) }
                  : { borderColor: colors.slate[200], backgroundColor: colors.slate[100] },
              ]}
            >
              <Text style={[s.scopeText, { color: isSelected ? colors.white : colors.slate[600] }]}>Both</Text>
            </View>
          )}
        </View>
      </Pressable>
    )
  }

  const slideStyle = {
    opacity: slide,
    transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [direction > 0 ? 300 : -300, 0] }) }],
  }

  return (
    <Screen bg={colors.white} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={goBack} style={s.backBtn} hitSlop={6}>
          <ArrowLeft size={20} color={colors.gray[700]} />
        </Pressable>
        <Text style={s.headerTitle}>Item details</Text>
      </View>

      {/* Content */}
      <KeyboardAwareScrollView
        style={s.flex1}
        contentContainerStyle={{ paddingBottom: barHeight + insets.bottom + 24 }}
        extraOffset={barHeight + 16}
      >
        {!isNewItem && currentApprovalStatus === "rejected" && currentRejectionReason ? (
          <View style={s.rejectWrap}>
            <View style={s.rejectBox}>
              <Text style={s.rejectTitle}>Approval rejected</Text>
              <Text style={s.rejectReason}>{`Reason: ${currentRejectionReason}`}</Text>
              <Text style={s.rejectHint}>UPDATE THE DISH AND SAVE TO SEND IT FOR APPROVAL AGAIN</Text>
            </View>
          </View>
        ) : null}

        {/* Image Carousel */}
        <View style={s.carouselWrap}>
          {images.length > 0 ? (
            <View style={s.carousel}>
              <View style={s.fill} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                <Animated.View style={[StyleSheet.absoluteFill, slideStyle]}>
                  {images[currentImageIndex] ? (
                    <AppImage src={images[currentImageIndex]} style={s.fill} contentFit="cover" />
                  ) : null}
                </Animated.View>

                {images.length > 1 && (
                  <>
                    <Pressable onPress={goToPrevious} style={[s.arrow, { left: 12 }]}>
                      <ChevronLeft size={20} color={colors.gray[900]} />
                    </Pressable>
                    <Pressable onPress={goToNext} style={[s.arrow, { right: 12 }]}>
                      <ChevronRight size={20} color={colors.gray[900]} />
                    </Pressable>
                  </>
                )}

                {/* Remove Dish Photo button (Top Right) */}
                <Pressable
                  onPress={() => setShowRemoveImageConfirm(true)}
                  accessibilityLabel="Remove Dish Photo"
                  style={({ pressed }) => [s.removePhotoBtn, pressed && { transform: [{ scale: 0.95 }], backgroundColor: "#990831" }]}
                >
                  <Trash2 size={20} color={colors.white} strokeWidth={2.2} />
                </Pressable>

                {images.length > 1 && (
                  <View style={s.counter}>
                    <Text style={s.counterText}>{`${currentImageIndex + 1} / ${images.length}`}</Text>
                  </View>
                )}
              </View>

              {images.length > 1 && (
                <View style={s.dots}>
                  {images.map((_, index) => (
                    <Pressable
                      key={index}
                      onPress={() => {
                        setDirection(index > currentImageIndex ? 1 : -1)
                        setCurrentImageIndex(index)
                      }}
                      style={[s.dot, index === currentImageIndex ? s.dotActive : null]}
                    >
                      {index === currentImageIndex ? <Gradient /> : null}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={s.carousel}>
              <AppImage src={dishFallbackImage} style={s.fill} contentFit="cover" />
              <View style={s.fallbackOverlay}>
                <View style={s.fallbackCard}>
                  <View style={s.fallbackIcon}>
                    <Camera size={24} color={colors.gray[600]} />
                  </View>
                  <Text style={s.fallbackTitle}>No Image Uploaded</Text>
                  <Text style={s.fallbackText}>Optional: Tap button below to add a photo</Text>
                </View>
              </View>
            </View>
          )}

          {/* Add image button */}
          <View style={s.addImageWrap}>
            <Pressable onPress={handleCameraClick} style={({ pressed }) => [s.addImageBtn, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Gradient />
              <View style={s.addImageIcon}>
                <Plus size={16} color={colors.white} />
              </View>
              <Text style={s.addImageText}>{images.length > 0 ? "Replace Image" : "Add Image (Optional)"}</Text>
            </Pressable>
          </View>
        </View>

        {/* Form Fields */}
        <View style={s.form}>
          {/* Category Selector */}
          <View>
            <Text style={s.label}>Category</Text>
            <Pressable onPress={() => setIsCategoryPopupOpen(true)} style={s.selectBtn}>
              <Text style={[s.selectText, { color: selectedCategoryId ? colors.gray[900] : colors.gray[400] }]}>
                {selectedCategoryId ? category : "Select category"}
              </Text>
              <ChevronDown size={20} color={colors.gray[500]} />
            </Pressable>
          </View>

          {/* Item Name */}
          <View>
            <Text style={s.label}>Item name</Text>
            <View>
              <Field
                value={itemName}
                onChangeText={setItemName}
                maxLength={maxNameLength}
                placeholder="Enter item name"
                style={{ paddingRight: sp(12) }}
              />
              <View pointerEvents="none" style={s.editIcon}>
                <EditIcon size={16} color={colors.gray[500]} />
              </View>
            </View>
            <Text style={s.counterRight}>{`${nameLength} / ${maxNameLength}`}</Text>
          </View>

          {/* Item Description */}
          <View style={{ marginTop: -4 }}>
            <Text style={s.label}>Item description</Text>
            <View>
              <Field
                value={itemDescription}
                onChangeText={setItemDescription}
                maxLength={maxDescriptionLength}
                multiline
                textAlignVertical="top"
                placeholder="Eg: Yummy veg paneer burger with a soft patty, veggies, cheese, and special sauce"
                style={[s.textarea, { paddingRight: sp(12) }]}
              />
              <View pointerEvents="none" style={[s.editIcon, { top: 12, marginTop: 0 }]}>
                <EditIcon size={16} color={colors.gray[500]} />
              </View>
            </View>
            <View style={s.descMeta}>
              <Text style={[s.metaXs, descriptionLength < minDescriptionLength && { color: restaurantTheme.brand }]}>
                {descriptionLength < minDescriptionLength ? "Min 5 characters required" : ""}
              </Text>
              <Text style={s.metaXs}>{`${descriptionLength} / ${maxDescriptionLength}`}</Text>
            </View>
            {/* Dietary Options */}
            <View style={s.dietRow}>
              <Pressable
                onPress={() => setFoodType("Veg")}
                style={[s.dietBtn, foodType === "Veg" ? { borderWidth: 2, borderColor: colors.green[600] } : s.dietBtnIdle]}
              >
                {foodType === "Veg" && <Check size={16} color={colors.green[600]} />}
                <Text style={[s.dietText, { color: foodType === "Veg" ? colors.green[600] : colors.gray[700] }]}>Veg</Text>
              </Pressable>
              {!isPureVegRestaurant && (
                <Pressable
                  onPress={() => setFoodType("Non-Veg")}
                  style={[s.dietBtn, foodType === "Non-Veg" ? { borderWidth: 2, borderColor: colors.red[600] } : s.dietBtnIdle]}
                >
                  {foodType === "Non-Veg" && <Check size={16} color={restaurantTheme.brand} />}
                  <Text style={[s.dietText, { color: foodType === "Non-Veg" ? restaurantTheme.brand : colors.gray[700] }]}>Non-Veg</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Item Price */}
          <View>
            <Text style={s.label}>Item price</Text>
            <View style={s.gap3}>
              {variants.length === 0 ? (
                <View>
                  <Text style={s.subLabel}>Base price</Text>
                  <View>
                    <Field
                      value={basePrice}
                      onChangeText={(text) => setBasePrice(cleanPrice(text))}
                      keyboardType="decimal-pad"
                      placeholder="Enter price"
                      style={{ paddingLeft: sp(8), paddingRight: sp(12), backgroundColor: colors.gray[50] }}
                    />
                    <View pointerEvents="none" style={s.rupeeWrap}><Text style={s.rupee}>{"₹"}</Text></View>
                    <View pointerEvents="none" style={s.editIcon}>
                      <EditIcon size={16} color={colors.gray[500]} />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={s.variantHint}>
                  <Text style={s.variantHintText}>Customers will see the lowest variant price first.</Text>
                </View>
              )}

              <View style={s.variantsCard}>
                <View style={s.variantsHead}>
                  <View style={s.flex1}>
                    <Text style={s.variantsTitle}>Variants</Text>
                    <Text style={s.metaXs}>Optional. Add multiple names and prices like Half, Full, Small, Large.</Text>
                  </View>
                  <Pressable onPress={handleAddVariant} style={s.addVariantBtn}>
                    <Plus size={14} color={STRONG} />
                    <Text style={s.addVariantText}>Add variant</Text>
                  </Pressable>
                </View>

                {variants.length > 0 ? (
                  <View style={s.gap3}>
                    {variants.map((variant, index) => (
                      <View key={variant.localId} style={s.variantRow}>
                        <View style={[s.flex1, s.gap3]}>
                          <View>
                            <Text style={s.subLabel}>Variant name</Text>
                            <Field
                              value={variant.name}
                              onChangeText={(text) => handleVariantChange(variant.localId, "name", text)}
                              placeholder={index === 0 ? "e.g., Half" : "e.g., Full"}
                              style={s.variantInput}
                            />
                          </View>
                          <View>
                            <Text style={s.subLabel}>Variant price</Text>
                            <View>
                              <Field
                                value={variant.price}
                                onChangeText={(text) => handleVariantChange(variant.localId, "price", cleanPrice(text))}
                                keyboardType="decimal-pad"
                                placeholder="Enter price"
                                style={[s.variantInput, { paddingLeft: sp(8) }]}
                              />
                              <View pointerEvents="none" style={s.rupeeWrap}><Text style={s.rupee}>{"₹"}</Text></View>
                            </View>
                          </View>
                        </View>
                        <Pressable onPress={() => handleRemoveVariant(variant.localId)} style={s.removeVariantBtn}>
                          <X size={16} color={colors.gray[500]} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={s.metaXs}>No variants added. This item will use the base price only.</Text>
                )}
              </View>

              {/* Preparation Time */}
              <View>
                <Text style={s.subLabel}>Preparation Time</Text>
                <Pressable
                  onPress={() => setIsPrepSelectOpen(true)}
                  style={[s.selectBtn, { backgroundColor: colors.gray[50] }, isPrepSelectOpen && s.inputFocused]}
                >
                  <Text style={[s.selectText, { color: colors.gray[900] }]}>{prepLabel}</Text>
                  <ChevronDown size={20} color={colors.gray[500]} />
                </Pressable>
              </View>
            </View>
          </View>

          {/* Recommend and In Stock */}
          <View style={s.switches}>
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>Recommended</Text>
              <Switch checked={isRecommended} onCheckedChange={setIsRecommended} />
            </View>
            <View style={s.switchRow}>
              <Text style={s.switchLabel}>In stock</Text>
              <Switch checked={isInStock} onCheckedChange={setIsInStock} />
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* Bottom Sticky Buttons (ride on the keyboard) */}
      <View
        style={[s.bar, { bottom: keyboardInset, paddingBottom: keyboardInset ? 0 : insets.bottom }]}
        onLayout={(e) => setBarHeight(Math.round(e.nativeEvent.layout.height - (keyboardInset ? 0 : insets.bottom)))}
      >
        {!isNewItem && (
          <View style={s.deleteRow}>
            <Pressable
              onPress={() => setShowDeleteItemConfirm(true)}
              style={({ pressed }) => [s.deleteBtn, pressed && { backgroundColor: colors.rose[50] }]}
            >
              <Trash2 size={14} color={colors.rose[600]} />
              <Text style={s.deleteText}>Delete Entire Item from Menu</Text>
            </Pressable>
          </View>
        )}
        <View style={s.barButtons}>
          <Pressable onPress={goBack} style={s.cancelBtn}>
            <Text style={s.cancelText}>CANCEL</Text>
          </Pressable>
          <Pressable onPress={handleSave} disabled={uploadingImages} style={[s.saveBtn, uploadingImages && { backgroundColor: colors.gray[300] }]}>
            {uploadingImages ? null : <Gradient />}
            {uploadingImages ? (
              <>
                <ActivityIndicator size="small" color={colors.gray[500]} />
                <Text style={[s.saveText, { color: colors.gray[500] }]}>SAVING...</Text>
              </>
            ) : (
              <Text style={s.saveText}>SAVE</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Category Selection Popup */}
      <Sheet open={isCategoryPopupOpen} onClose={() => setIsCategoryPopupOpen(false)} style={s.catSheet}>
        <View style={s.catSheetHeader}>
          <Text style={s.sheetTitle}>Select category</Text>
          <View style={s.rowGap2}>
            <Pressable onPress={openAddCategoryPage} accessibilityLabel="Add Category" style={s.catAddBtn}>
              <Gradient />
              <Plus size={16} color={colors.white} />
              <Text style={s.catAddText}>Add</Text>
            </Pressable>
            <Pressable onPress={() => setIsCategoryPopupOpen(false)} style={s.iconBtn} hitSlop={6}>
              <X size={20} color={colors.gray[600]} />
            </Pressable>
          </View>
        </View>
        <View style={s.catSearchWrap}>
          <View>
            <View pointerEvents="none" style={s.searchIcon}>
              <Search size={16} color={colors.gray[400]} />
            </View>
            <Field
              value={categorySearchQuery}
              onChangeText={setCategorySearchQuery}
              placeholder="Search categories..."
              returnKeyType="search"
              style={s.catSearchInput}
              focusStyle={s.catSearchFocused}
            />
            {categorySearchQuery ? (
              <Pressable onPress={() => setCategorySearchQuery("")} accessibilityLabel="Clear search" style={s.clearSearch} hitSlop={6}>
                <X size={16} color={colors.gray[400]} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <ScrollView style={s.flex1} contentContainerStyle={s.catList} keyboardShouldPersistTaps="handled">
          {loadingCategories ? (
            <View style={s.catCenter}>
              <ActivityIndicator size="small" color={colors.gray[600]} />
            </View>
          ) : categories.length === 0 ? (
            <View style={[s.catCenter, { gap: sp(4) }]}>
              <Text style={s.catEmpty}>No categories available</Text>
              <Pressable onPress={openAddCategoryPage} style={s.catEmptyBtn}>
                <Gradient />
                <Plus size={20} color={colors.white} />
                <Text style={s.catEmptyBtnText}>Add Category</Text>
              </Pressable>
            </View>
          ) : filteredCategories.length === 0 ? (
            <View style={s.catCenter}>
              <Text style={s.catEmpty}>No matching categories found.</Text>
            </View>
          ) : (
            <View style={{ gap: sp(1.5) }}>{filteredCategories.map(renderCategoryRow)}</View>
          )}
        </ScrollView>
      </Sheet>

      {/* Preparation Time (the web's <select>) */}
      <Sheet open={isPrepSelectOpen} onClose={() => setIsPrepSelectOpen(false)}>
        <View style={s.prepSheet}>
          {PREPARATION_OPTIONS.map((option) => {
            const active = preparationTime === option.value
            return (
              <Pressable
                key={option.value || "none"}
                onPress={() => {
                  setPreparationTime(option.value)
                  setIsPrepSelectOpen(false)
                }}
                style={[s.prepOption, active && { backgroundColor: restaurantTheme.primarySoft }]}
              >
                <Text style={[s.prepOptionText, active && { color: restaurantTheme.brand, fontWeight: "600" }]}>{option.label}</Text>
                {active ? <Check size={16} color={restaurantTheme.brand} /> : null}
              </Pressable>
            )
          })}
        </View>
      </Sheet>

      {/* Photo Removal Confirmation Modal */}
      <Dialog open={showRemoveImageConfirm} onClose={() => setShowRemoveImageConfirm(false)} backdropOpacity={0.6} style={s.confirmCard}>
        <View style={s.confirmIcon}>
          <Trash2 size={28} color={colors.rose[600]} />
        </View>
        <Text style={s.confirmTitle}>Remove Dish Photo?</Text>
        <Text style={s.confirmText}>
          {"Are you sure you want to remove this dish photo? The photo will be removed once you click "}
          <Text style={s.bold}>SAVE</Text>
          {"."}
        </Text>
        <View style={s.confirmButtons}>
          <Pressable onPress={() => setShowRemoveImageConfirm(false)} style={s.confirmCancel}>
            <Text style={s.confirmCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setImages([])
              setImageFiles(new Map())
              setCurrentImageIndex(0)
              setShowRemoveImageConfirm(false)
              toast.info("Photo removed. Click SAVE to apply changes.")
            }}
            style={s.confirmDanger}
          >
            <Text style={s.confirmDangerText}>Yes, Remove</Text>
          </Pressable>
        </View>
      </Dialog>

      {/* Entire Dish Item Deletion Confirmation Modal */}
      <Dialog
        open={showDeleteItemConfirm}
        onClose={() => !isDeletingItem && setShowDeleteItemConfirm(false)}
        backdropOpacity={0.6}
        style={s.confirmCard}
      >
        <View style={s.confirmIcon}>
          <Trash2 size={28} color={colors.rose[600]} />
        </View>
        <Text style={s.confirmTitle}>Delete Dish Item?</Text>
        <Text style={s.confirmText}>
          {"Are you sure you want to delete "}
          <Text style={s.bold}>{itemName || "this item"}</Text>
          {" from your restaurant menu? This action cannot be undone."}
        </Text>
        <View style={s.confirmButtons}>
          <Pressable
            disabled={isDeletingItem}
            onPress={() => setShowDeleteItemConfirm(false)}
            style={[s.confirmCancel, isDeletingItem && s.disabled]}
          >
            <Text style={s.confirmCancelText}>Cancel</Text>
          </Pressable>
          <Pressable disabled={isDeletingItem} onPress={handleDeleteItem} style={[s.confirmDanger, isDeletingItem && s.disabled]}>
            {isDeletingItem ? (
              <>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={s.confirmDangerText}>Deleting...</Text>
              </>
            ) : (
              <Text style={s.confirmDangerText}>Yes, Delete</Text>
            )}
          </Pressable>
        </View>
      </Dialog>

      {/* Photo Picker */}
      <ImageSourcePicker
        isOpen={isPhotoPickerOpen}
        onClose={() => setIsPhotoPickerOpen(false)}
        onFileSelect={handleImageAdd}
        title="Item Image"
        description="Choose how to upload your item image"
        fileNamePrefix="item-photo"
      />
    </Screen>
  )
}

const s = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  fill: { width: "100%", height: "100%" },
  disabled: { opacity: 0.5 },
  bold: { fontWeight: "700" },
  gap3: { gap: sp(3) },
  rowGap2: { flexDirection: "row", alignItems: "center", gap: sp(2) },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(3),
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backBtn: { padding: sp(1), borderRadius: radius.full },
  headerTitle: { ...fontSize.xl, fontWeight: "700", color: colors.gray[900] },
  rejectWrap: { paddingHorizontal: sp(4), paddingTop: sp(4) },
  rejectBox: { borderRadius: radius["2xl"], borderWidth: 1, borderColor: colors.red[200], backgroundColor: colors.red[50], paddingHorizontal: sp(4), paddingVertical: sp(3) },
  rejectTitle: { ...fontSize.sm, fontWeight: "600", color: colors.red[700] },
  rejectReason: { marginTop: sp(1), fontSize: 14, lineHeight: 20, color: restaurantTheme.brand },
  rejectHint: { marginTop: sp(2), ...fontSize.xs, fontWeight: "500", letterSpacing: 12 * 0.18, color: restaurantTheme.brand },
  carouselWrap: { backgroundColor: colors.white },
  carousel: { width: "100%", height: 320, overflow: "hidden", backgroundColor: colors.gray[100] },
  arrow: {
    position: "absolute",
    top: 160 - 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: alpha(colors.white, 0.9),
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    ...shadow.lg,
  },
  removePhotoBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: restaurantTheme.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.3),
    zIndex: 20,
    ...shadow.md,
  },
  counter: { position: "absolute", top: 16, left: 16, backgroundColor: alpha(colors.black, 0.6), paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: radius.full, zIndex: 10 },
  counterText: { ...fontSize.xs, fontWeight: "500", color: colors.white },
  dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: sp(2), paddingVertical: sp(4), backgroundColor: colors.white },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gray[300], overflow: "hidden" },
  dotActive: { width: 32, backgroundColor: "transparent" },
  fallbackOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0,backgroundColor: alpha(colors.black, 0.3), alignItems: "center", justifyContent: "center" },
  fallbackCard: {
    alignItems: "center",
    backgroundColor: alpha(colors.white, 0.9),
    paddingHorizontal: sp(6),
    paddingVertical: sp(4),
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.2),
    ...shadow.xl,
  },
  fallbackIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.gray[100], alignItems: "center", justifyContent: "center", marginBottom: sp(2) },
  fallbackTitle: { ...fontSize.sm, fontWeight: "700", color: colors.gray[900], textAlign: "center" },
  fallbackText: { ...fontSize.xs, color: colors.gray[500], marginTop: 2, textAlign: "center" },
  addImageWrap: { paddingHorizontal: sp(4), paddingVertical: sp(4), backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray[100] },
  addImageBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(2.5),
    paddingHorizontal: sp(6),
    paddingVertical: sp(3.5),
    borderRadius: radius.xl,
    overflow: "hidden",
    ...shadow.md,
  },
  addImageIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: alpha(colors.white, 0.2), alignItems: "center", justifyContent: "center" },
  addImageText: { ...fontSize.sm, fontWeight: "600", color: colors.white },
  form: { padding: sp(4), gap: sp(3) },
  label: { ...fontSize.sm, fontWeight: "500", color: colors.gray[900], marginBottom: sp(2) },
  subLabel: { ...fontSize.xs, color: colors.gray[600], marginBottom: sp(1) },
  selectBtn: {
    width: "100%",
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: { ...fontSize.sm, flex: 1 },
  input: {
    width: "100%",
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: radius.lg,
    ...fontSize.sm,
    color: colors.gray[900],
    backgroundColor: colors.white,
  },
  inputFocused: { borderColor: restaurantTheme.focusBorder },
  textarea: { minHeight: 4 * 20 + 24 },
  editIcon: { position: "absolute", right: 12, top: "50%", marginTop: -12, padding: 4 },
  rupeeWrap: { position: "absolute", left: 12, top: 0, bottom: 0, justifyContent: "center" },
  rupee: { ...fontSize.sm, color: colors.gray[600] },
  counterRight: { textAlign: "right", marginTop: sp(1), ...fontSize.xs, color: colors.gray[500] },
  descMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: sp(1) },
  metaXs: { ...fontSize.xs, color: colors.gray[500] },
  dietRow: { flexDirection: "row", gap: sp(2), marginTop: sp(3) },
  dietBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: sp(4), paddingVertical: sp(2), borderRadius: radius.lg },
  dietBtnIdle: { backgroundColor: colors.gray[100], borderWidth: 2, borderColor: "transparent" },
  dietText: { ...fontSize.sm, fontWeight: "500" },
  variantHint: { borderRadius: radius.lg, borderWidth: 1, borderColor: restaurantTheme.primaryBorder, backgroundColor: restaurantTheme.primarySoft, paddingHorizontal: sp(3), paddingVertical: sp(2) },
  variantHintText: { ...fontSize.sm, color: STRONG },
  variantsCard: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.white, padding: sp(3), gap: sp(3) },
  variantsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(3) },
  variantsTitle: { ...fontSize.sm, fontWeight: "500", color: colors.gray[900] },
  addVariantBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: sp(1),
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: restaurantTheme.primaryBorder,
    backgroundColor: restaurantTheme.primarySoft,
    paddingHorizontal: sp(3),
    paddingVertical: 6,
  },
  addVariantText: { ...fontSize.xs, fontWeight: "600", color: STRONG },
  variantRow: { flexDirection: "row", gap: sp(3), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray[200], backgroundColor: colors.gray[50], padding: sp(3) },
  variantInput: { paddingHorizontal: sp(3), paddingVertical: sp(2.5) },
  removeVariantBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  switches: { gap: sp(4), paddingVertical: sp(4), borderTopWidth: 1, borderTopColor: colors.gray[200] },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { ...fontSize.sm, fontWeight: "500", color: colors.gray[700] },
  bar: { position: "absolute", left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray[200], zIndex: 40 },
  deleteRow: { paddingTop: sp(2), alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6, paddingHorizontal: sp(3), borderRadius: radius.lg },
  deleteText: { ...fontSize.xs, fontWeight: "600", color: colors.rose[600] },
  barButtons: { flexDirection: "row", gap: sp(3), paddingHorizontal: sp(4), paddingVertical: sp(3) },
  cancelBtn: { flex: 1, paddingVertical: sp(3), paddingHorizontal: sp(4), borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.lg, backgroundColor: colors.white, alignItems: "center" },
  cancelText: { ...fontSize.sm, fontWeight: "700", color: colors.gray[900] },
  saveBtn: {
    flex: 1,
    paddingVertical: sp(3),
    paddingHorizontal: sp(4),
    borderRadius: radius.lg,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(2),
  },
  saveText: { ...fontSize.sm, fontWeight: "700", color: colors.white },
  catSheet: { height: "85%", backgroundColor: colors.white, borderTopLeftRadius: radius["2xl"], borderTopRightRadius: radius["2xl"], ...shadow["2xl"] },
  catSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingVertical: sp(4), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  sheetTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900] },
  catAddBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: sp(2), borderRadius: radius.lg, overflow: "hidden" },
  catAddText: { ...fontSize.sm, fontWeight: "500", color: colors.white },
  iconBtn: { padding: sp(1), borderRadius: radius.full },
  catSearchWrap: { borderBottomWidth: 1, borderBottomColor: colors.gray[200], backgroundColor: colors.white, paddingHorizontal: sp(4), paddingVertical: sp(3) },
  searchIcon: { position: "absolute", left: 14, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 },
  catSearchInput: { paddingLeft: sp(10), paddingRight: sp(10), paddingVertical: sp(2.5), borderRadius: radius.xl, borderColor: colors.gray[200], backgroundColor: colors.gray[50] },
  catSearchFocused: { borderColor: restaurantTheme.focusBorder, backgroundColor: colors.white },
  clearSearch: { position: "absolute", right: 10, top: 0, bottom: 0, justifyContent: "center", padding: 4 },
  catList: { padding: sp(2), flexGrow: 1 },
  catCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: sp(10) },
  catEmpty: { ...fontSize.sm, color: colors.gray[500] },
  catEmptyBtn: { flexDirection: "row", alignItems: "center", gap: sp(2), paddingHorizontal: sp(4), paddingVertical: sp(2), borderRadius: radius.lg, overflow: "hidden" },
  catEmptyBtnText: { ...fontSize.base, fontWeight: "600", color: colors.white },
  catRow: { width: "100%", borderRadius: radius.xl, paddingHorizontal: sp(4), paddingVertical: sp(3), overflow: "hidden" },
  catRowInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: sp(3) },
  catRowName: { ...fontSize.sm, fontWeight: "500", flex: 1 },
  scopePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: sp(2.5), paddingVertical: sp(1), borderRadius: radius.full, borderWidth: 1 },
  scopeBox: { width: 14, height: 14, borderRadius: 2, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  scopeDot: { width: 6, height: 6, borderRadius: 3 },
  scopeText: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  prepSheet: { paddingVertical: sp(3), paddingHorizontal: sp(3), backgroundColor: colors.white },
  prepOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: sp(4), paddingVertical: sp(3.5), borderRadius: radius.lg },
  prepOptionText: { ...fontSize.base, color: colors.gray[900] },
  confirmCard: { maxWidth: 384, padding: sp(6), borderRadius: radius["2xl"], borderWidth: 1, borderColor: colors.gray[100], backgroundColor: colors.white, alignItems: "center", ...shadow["2xl"] },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.rose[50],
    borderWidth: 1,
    borderColor: colors.rose[100],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: sp(4),
  },
  confirmTitle: { ...fontSize.lg, fontWeight: "700", color: colors.gray[900], marginBottom: sp(2), textAlign: "center" },
  confirmText: { ...fontSize.xs, lineHeight: 19, color: colors.gray[500], marginBottom: sp(6), textAlign: "center" },
  confirmButtons: { flexDirection: "row", gap: sp(3), alignSelf: "stretch" },
  confirmCancel: { flex: 1, paddingVertical: sp(3), paddingHorizontal: sp(4), borderRadius: radius.xl, borderWidth: 1, borderColor: colors.gray[200], alignItems: "center" },
  confirmCancelText: { ...fontSize.sm, fontWeight: "600", color: colors.gray[700] },
  confirmDanger: {
    flex: 1,
    paddingVertical: sp(3),
    paddingHorizontal: sp(4),
    borderRadius: radius.xl,
    backgroundColor: colors.rose[600],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: sp(2),
    ...shadow.md,
    shadowColor: colors.rose[600],
  },
  confirmDangerText: { ...fontSize.sm, fontWeight: "600", color: colors.white },
})
