// Web: pages/restaurant/OutletInfo.jsx (/food/restaurant/outlet-info) — "Outlet Information": ID pill, cover banner,
// profile thumbnail, name + rating, "Edit Outlet Info" (-> /food/restaurant/edit-owner with activeTab "restaurant"),
// the name card and the location address card, and the restaurant bottom bar (Explore lit).
// Data: restaurantAPI.refreshCurrentRestaurant() each time the page opens and on the cuisinesUpdated / addressUpdated /
// ownerDataUpdated window events; location.state.savedLocation shows a just-saved address at once.
// The web file also holds handlers that no control on the page calls (profile / cover image upload with
// ImageSourcePicker, cover delete, the "Rename Outlet" dialog, the ActionButton helper); they are converted (the
// ActionButton helper, never rendered, is left out) so the page keeps the same behaviour if they are wired up.
// Native:
// - The page renders <BottomNavOrders activeTabOverride="explore" /> itself (last child) and leaves
//   useRestaurantNavSpace() at the end of its scroll content (web: pb-24 + the bar).
// - Header: white/80 + backdrop-blur -> expo-blur under a white/80 layer, outside the ScrollView (web: sticky top-0).
// - window.confirm (cover delete) -> Alert with Cancel / OK.
// - The "Rename Outlet" dialog is the @/native/ui Dialog lifted by useKeyboardOffset() while its input is focused.
// - The default banner / thumbnail images are the web's own fallback URLs (shown until the restaurant's images load).
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ArrowLeft, MapPin, Pencil, Star } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { AppImage, Dialog, Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { alpha, colors, restaurantTheme, shadow, sp } from '@/theme';
import useKeyboardOffset from '@/modules/Taxi/shared/hooks/useKeyboardOffset';
import { panelWords as sw } from '@food/utils/adminPartnerLabels';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { restaurantAPI } from '@food/api';
import { formatRestaurantDisplayAddress } from '@food/utils/restaurantLocation';
import { ImageSourcePicker } from '@food/components/ImageSourcePicker';
import BottomNavOrders, { useRestaurantNavSpace } from '@food/components/restaurant/BottomNavOrders';

const debugError = () => {};

// The web showed stock (unsplash) photos until the outlet's own images loaded; the app shows an empty panel instead
// (no sample pictures in the app).
const DEFAULT_MAIN_IMAGE = '';
const DEFAULT_THUMBNAIL = '';

const confirmAsync = (message) =>
  new Promise((resolve) => {
    Alert.alert('', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

export default function OutletInfo() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useRestaurantBackNavigation();
  const navSpace = useRestaurantNavSpace();
  const keyboardOffset = useKeyboardOffset();

  // State management
  const [restaurantData, setRestaurantData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState('');
  const [, setCuisineTags] = useState('');
  const [address, setAddress] = useState('');
  const [mainImage, setMainImage] = useState(DEFAULT_MAIN_IMAGE);
  const [thumbnailImage, setThumbnailImage] = useState(DEFAULT_THUMBNAIL);
  const [coverImages, setCoverImages] = useState([]); // Array of cover images (separate from menu images)
  const [showEditNameDialog, setShowEditNameDialog] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [restaurantMongoId, setRestaurantMongoId] = useState('');
  const [, setUploadingImage] = useState(false);
  const [, setImageType] = useState(null); // 'profile' or 'menu'
  const [, setUploadingCount] = useState(0); // Track how many images are being uploaded
  const [activePicker, setActivePicker] = useState(null); // { type: 'profile' | 'cover', title: string, multiple: boolean }
  const [nameFocused, setNameFocused] = useState(false);

  const savedLocation = location.state?.savedLocation;

  // Fetch restaurant data on mount and whenever this page is opened again
  useEffect(() => {
    const applyRestaurantData = (data) => {
      if (!data) return;

      setRestaurantData(data);
      setRestaurantName(data.name || '');
      setRestaurantId(data.restaurantId || data.id || '');
      setRestaurantMongoId(String(data.id || data._id || ''));
      setAddress(formatRestaurantDisplayAddress(data.location, data));

      if (data.cuisines && Array.isArray(data.cuisines) && data.cuisines.length > 0) {
        setCuisineTags(data.cuisines.join(', '));
      }

      if (data.profileImage?.url) {
        setThumbnailImage(data.profileImage.url);
      }

      if (data.coverImages && Array.isArray(data.coverImages) && data.coverImages.length > 0) {
        setCoverImages(
          data.coverImages.map((img) => ({
            url: img.url || img,
            publicId: img.publicId,
          })),
        );
        setMainImage(data.coverImages[0].url || data.coverImages[0]);
      } else if (data.menuImages && Array.isArray(data.menuImages) && data.menuImages.length > 0) {
        setCoverImages(
          data.menuImages.map((img) => ({
            url: img.url,
            publicId: img.publicId,
          })),
        );
        setMainImage(data.menuImages[0].url);
      } else {
        setCoverImages([]);
      }
    };

    const fetchRestaurantData = async () => {
      try {
        setLoading(true);
        const response = await restaurantAPI.refreshCurrentRestaurant();
        const data = response?.data?.data?.restaurant || response?.data?.restaurant;
        applyRestaurantData(data);
      } catch (error) {
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError('Error fetching restaurant data:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    if (savedLocation) {
      setAddress(formatRestaurantDisplayAddress(savedLocation));
    }

    fetchRestaurantData();

    const handleRestaurantDataUpdate = () => {
      fetchRestaurantData();
    };

    window.addEventListener('cuisinesUpdated', handleRestaurantDataUpdate);
    window.addEventListener('addressUpdated', handleRestaurantDataUpdate);
    window.addEventListener('ownerDataUpdated', handleRestaurantDataUpdate);

    return () => {
      window.removeEventListener('cuisinesUpdated', handleRestaurantDataUpdate);
      window.removeEventListener('addressUpdated', handleRestaurantDataUpdate);
      window.removeEventListener('ownerDataUpdated', handleRestaurantDataUpdate);
    };
  }, [location.pathname, savedLocation]);

  // Handle profile image replacement
  const handleProfileImageReplace = async (file) => {
    if (!file) return;

    try {
      setUploadingImage(true);
      setImageType('profile');

      // Upload image to the server (/var/www/uploads as WebP)
      const uploadResponse = await restaurantAPI.uploadProfileImage(file);
      const uploadedImage = uploadResponse?.data?.data?.profileImage;

      if (uploadedImage) {
        if (uploadedImage.url) {
          setThumbnailImage(uploadedImage.url);
        }

        // Refresh restaurant data
        const response = await restaurantAPI.getCurrentRestaurant();
        const data = response?.data?.data?.restaurant || response?.data?.restaurant;
        if (data) {
          setRestaurantData(data);
          if (data.profileImage?.url) {
            setThumbnailImage(data.profileImage.url);
          }
        }
      }
    } catch (error) {
      debugError('Error uploading profile image:', error);
      toast.error('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
      setImageType(null);
    }
  };

  // Handle multiple cover images addition
  const handleCoverImageAdd = async (files) => {
    if (!files || (Array.isArray(files) && files.length === 0)) return;
    const fileArray = Array.isArray(files) ? files : [files];

    try {
      setUploadingImage(true);
      setImageType('menu');
      setUploadingCount(fileArray.length);

      // Get current images
      const currentResponse = await restaurantAPI.getCurrentRestaurant();
      const currentData = currentResponse?.data?.data?.restaurant || currentResponse?.data?.restaurant;
      const existingImages =
        currentData?.menuImages && Array.isArray(currentData.menuImages)
          ? currentData.menuImages.map((img) => ({
              url: img.url,
              publicId: img.publicId,
            }))
          : [];

      const uploadedImageData = [];
      const failedUploads = [];

      for (let i = 0; i < fileArray.length; i++) {
        try {
          const uploadResponse = await restaurantAPI.uploadMenuImage(fileArray[i]);
          const uploadedImage = uploadResponse?.data?.data?.menuImage;
          if (uploadedImage?.url) {
            uploadedImageData.push({
              url: uploadedImage.url,
              publicId: uploadedImage.publicId || null,
            });
          }
        } catch (error) {
          failedUploads.push({ fileName: fileArray[i]?.name || 'image', error: error.message });
        }
      }

      if (uploadedImageData.length > 0) {
        const allImages = [...existingImages];
        uploadedImageData.forEach((uploaded) => {
          if (!allImages.find((img) => img.url === uploaded.url)) {
            allImages.push(uploaded);
          }
        });

        try {
          await restaurantAPI.updateProfile({ menuImages: allImages });
          toast.success(`Successfully uploaded ${uploadedImageData.length} image(s)`);
        } catch {
          toast.error('Images uploaded but failed to save.');
        }

        setCoverImages(allImages);
        if (allImages.length > 0) setMainImage(allImages[0].url);
      }
    } catch {
      toast.error('Failed to upload images.');
    } finally {
      setUploadingImage(false);
      setImageType(null);
      setUploadingCount(0);
    }
  };

  // web: isFlutterBridgeAvailable() -> the in-app picker (camera / gallery)
  const handleImageClick = (type, title, multiple = false) => {
    setActivePicker({ type, title, multiple });
  };
  void handleImageClick;

  // Handle cover image deletion
  const handleCoverImageDelete = async (indexToDelete) => {
    if (!(await confirmAsync('Are you sure you want to delete this cover image?'))) return;

    try {
      setUploadingImage(true);
      setImageType('menu');

      const updatedImages = coverImages.filter((_, index) => index !== indexToDelete);
      const menuImagesForBackend = updatedImages.map((img) => ({
        url: img.url,
        publicId: img.publicId || null,
      }));

      await restaurantAPI.updateProfile({ menuImages: menuImagesForBackend });
      setCoverImages(updatedImages);
      if (indexToDelete === 0 && updatedImages.length > 0) {
        setMainImage(updatedImages[0].url);
      } else if (updatedImages.length === 0) {
        setMainImage(DEFAULT_MAIN_IMAGE);
      }
      toast.success('Image deleted successfully');
    } catch {
      toast.error('Failed to delete image.');
    } finally {
      setUploadingImage(false);
      setImageType(null);
    }
  };
  void handleCoverImageDelete;

  // Handle edit name dialog
  const handleOpenEditDialog = () => {
    setEditNameValue(restaurantName);
    setShowEditNameDialog(true);
  };
  void handleOpenEditDialog;

  const handleSaveName = async () => {
    const newName = editNameValue.trim();
    if (!newName) return;
    if (/[/-]/.test(newName)) {
      toast.error('Name cannot contain slashes (/) or hyphens (-)');
      return;
    }
    try {
      await restaurantAPI.updateProfile({ name: newName });
      setRestaurantName(newName);
      setShowEditNameDialog(false);
      toast.success('Name updated successfully');
    } catch {
      toast.error('Failed to update name');
    }
  };

  const idText = loading ? '...' : restaurantMongoId && restaurantMongoId.length >= 5 ? restaurantMongoId.slice(-5) : restaurantId || 'N/A';
  const ratingText = (typeof restaurantData?.rating === 'number' ? restaurantData.rating.toFixed(1) : '') || '0.0';

  return (
    <Screen bg={colors.white} edges={[]} statusBarStyle="dark">
      {/* Header */}
      <View style={styles.header}>
        <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.white, 0.8) }]} />
        <StatusBarSpacer color="transparent" />
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable onPress={goBack} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: alpha(restaurantTheme.brand, 0.05), transform: [{ scale: 0.95 }] }]}>
              <ArrowLeft size={20} color={restaurantTheme.brand} />
            </Pressable>
            <Text style={styles.headerTitle}>Outlet Information</Text>
          </View>
          <View style={styles.idPill}>
            <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.idText}>ID: {idText}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: Math.max(96, navSpace) }}>
        {/* Main Image & Profile Section */}
        <View style={styles.topSection}>
          <View style={styles.banner}>
            {mainImage ? <AppImage src={mainImage} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={sw('Restaurant banner')} /> : null}
            <LinearGradient
              colors={[alpha(colors.black, 0.6), 'transparent', 'transparent']}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>

          {/* Profile Overlap & Restaurant Name */}
          <View style={styles.profileArea}>
            <View style={{ gap: sp(4) }}>
              {/* Profile Image */}
              <View style={styles.thumbWrap}>
                <View style={styles.thumbFrame}>
                  {thumbnailImage ? <AppImage src={thumbnailImage} style={styles.thumb} contentFit="cover" accessibilityLabel={sw('Restaurant thumbnail')} /> : <View style={[styles.thumb, { backgroundColor: colors.gray[200] }]} />}
                </View>
              </View>

              {/* Restaurant Name & Rating */}
              <View style={{ paddingBottom: sp(1) }}>
                <Text style={styles.name}>{loading ? 'Loading...' : restaurantName || 'My Restaurant'}</Text>
                <View style={styles.ratingRow}>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingText}>{ratingText}</Text>
                    <Star size={12} color={colors.white} fill={colors.white} />
                  </View>
                  <Text style={styles.reviews}>{restaurantData?.totalRatings || 0} Reviews</Text>
                </View>

                <Pressable
                  onPress={() => navigate('/food/restaurant/edit-owner', { state: { from: location.pathname, activeTab: 'restaurant' } })}
                  style={({ pressed }) => [styles.editBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                >
                  <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Pencil size={14} color={colors.white} />
                  <Text style={styles.editText}>Edit Outlet Info</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Info Content Section */}
        <View style={styles.info}>
          {/* Restaurant Name Card */}
          <View style={styles.nameCard}>
            <LinearGradient
              colors={[alpha(colors.blue[50], 0.4), alpha(colors.blue[50], 0.8)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.cardLabelRow}>
              <View style={styles.brandDot}>
                <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              </View>
              <Text style={[styles.cardLabel, { color: restaurantTheme.brand }]}>{sw('Restaurant Name')}</Text>
            </View>
            <Text style={styles.cardValue}>{loading ? 'Loading...' : restaurantName || 'N/A'}</Text>
          </View>

          {/* Address Card */}
          <View style={styles.addressCard}>
            <LinearGradient
              colors={[colors.gray[50], alpha(colors.gray[100], 0.5)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.cardLabelRow, { marginBottom: sp(2) }]}>
              <View style={[styles.brandDot, { backgroundColor: colors.gray[500] }]} />
              <Text style={[styles.cardLabel, { color: colors.gray[500] }]}>Location Address</Text>
            </View>
            <View style={styles.addressRow}>
              <View style={styles.pinBox}>
                <MapPin size={20} color={restaurantTheme.brand} />
              </View>
              <Text style={styles.addressText}>{loading ? 'Loading...' : address || 'No address found'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Rename Outlet dialog */}
      <Dialog
        open={showEditNameDialog}
        onClose={() => setShowEditNameDialog(false)}
        style={[styles.renameCard, keyboardOffset ? { marginBottom: keyboardOffset } : null]}
      >
        <View style={styles.renameHead}>
          <LinearGradient colors={[colors.white, colors.gray[50]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.renameTitle}>Rename Outlet</Text>
          <Text style={styles.renameSub}>Update official restaurant name</Text>
        </View>
        <View style={styles.renameBody}>
          <View style={styles.renameInputWrap}>
            <TextInput
              value={editNameValue}
              onChangeText={(v) => setEditNameValue(v.replace(/[/-]/g, ''))}
              placeholder="Ex: Hello Parth Food Express"
              placeholderTextColor={colors.gray[400]}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              style={[styles.renameInput, nameFocused && { borderColor: restaurantTheme.brand, backgroundColor: colors.white }]}
            />
            <View pointerEvents="none" style={styles.renamePencil}>
              <Pencil size={20} color={nameFocused ? restaurantTheme.brand : colors.gray[300]} />
            </View>
          </View>
          <Text style={styles.renameHint}>* This will be visible to all customers on the app.</Text>
        </View>
        <View style={styles.renameFooter}>
          <Pressable onPress={() => setShowEditNameDialog(false)} style={({ pressed }) => [styles.discardBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <Text style={styles.discardText}>Discard</Text>
          </Pressable>
          <Pressable
            onPress={handleSaveName}
            disabled={!editNameValue.trim()}
            style={({ pressed }) => [styles.saveBtn, !editNameValue.trim() && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.saveText}>Save Changes</Text>
          </Pressable>
        </View>
      </Dialog>

      <ImageSourcePicker
        isOpen={!!activePicker}
        onClose={() => setActivePicker(null)}
        onFileSelect={(file) => {
          if (activePicker?.type === 'profile') {
            handleProfileImageReplace(file);
          } else {
            handleCoverImageAdd(file);
          }
        }}
        title={activePicker?.title}
        description={`Choose how to upload your ${activePicker?.type} photo`}
        fileNamePrefix={`outlet-${activePicker?.type}`}
      />

      <BottomNavOrders activeTabOverride="explore" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { borderBottomWidth: 1, borderBottomColor: colors.gray[100], zIndex: 50, overflow: 'hidden', ...shadow.sm },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  backBtn: { padding: sp(2), borderRadius: 14 },
  headerTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.gray[900], letterSpacing: -0.4 },
  idPill: { paddingHorizontal: sp(3), paddingVertical: 6, borderRadius: 9999, overflow: 'hidden', ...shadow.sm },
  idText: { fontSize: 11, lineHeight: 14, fontWeight: '900', color: colors.white, textTransform: 'uppercase', letterSpacing: 0.55 },
  topSection: { paddingHorizontal: sp(4), paddingTop: sp(4) },
  banner: {
    width: '100%',
    height: 180,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha(colors.black, 0.05),
    backgroundColor: colors.gray[100],
    ...shadow.xl,
  },
  profileArea: { zIndex: 10, paddingHorizontal: sp(4) },
  thumbWrap: { marginTop: -48, alignSelf: 'flex-start' },
  thumbFrame: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: colors.white,
    padding: 6,
    borderWidth: 1,
    borderColor: alpha(colors.black, 0.05),
    ...shadow['2xl'],
  },
  thumb: { width: '100%', height: '100%', borderRadius: 25.6 },
  name: { fontSize: 24, lineHeight: 30, fontWeight: '900', color: colors.gray[900] },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginTop: sp(2) },
  ratingBadge: { backgroundColor: colors.green[600], paddingHorizontal: 10, paddingVertical: sp(1), borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: sp(1), ...shadow.sm },
  ratingText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  reviews: { color: colors.gray[400], fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  editBtn: {
    marginTop: sp(4),
    alignSelf: 'flex-start',
    paddingHorizontal: sp(5),
    paddingVertical: 10,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    ...shadow.lg,
    shadowColor: restaurantTheme.brand,
    shadowOpacity: 0.2,
  },
  editText: { color: colors.white, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  info: { paddingHorizontal: sp(5), paddingTop: sp(8), paddingBottom: sp(12), gap: sp(4) },
  nameCard: { borderRadius: 24, padding: sp(5), borderWidth: 1, borderColor: alpha(colors.blue[100], 0.5), overflow: 'hidden', backgroundColor: colors.white, ...shadow.sm },
  addressCard: { borderRadius: 24, padding: sp(5), borderWidth: 1, borderColor: alpha(colors.gray[200], 0.5), overflow: 'hidden', backgroundColor: colors.white, ...shadow.sm },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  brandDot: { width: 6, height: 6, borderRadius: 3, overflow: 'hidden' },
  cardLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  cardValue: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.gray[900] },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(3) },
  pinBox: { backgroundColor: colors.white, padding: sp(2), borderRadius: 14, borderWidth: 1, borderColor: colors.gray[100], ...shadow.sm },
  addressText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.gray[700] },
  // Rename Outlet dialog
  renameCard: { width: '92%', maxWidth: 448, borderRadius: 40, backgroundColor: colors.white, padding: 0, ...shadow['2xl'] },
  renameHead: { padding: sp(6), borderBottomWidth: 1, borderBottomColor: colors.gray[100], overflow: 'hidden' },
  renameTitle: { fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.gray[900], letterSpacing: -0.4 },
  renameSub: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.gray[400], textTransform: 'uppercase', letterSpacing: 1.2, marginTop: sp(1) },
  renameBody: { padding: sp(6), gap: sp(4) },
  renameInputWrap: { justifyContent: 'center' },
  renameInput: {
    width: '100%',
    height: 56,
    paddingHorizontal: sp(5),
    paddingRight: sp(12),
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.gray[100],
    fontSize: 18,
    fontWeight: '700',
    color: colors.gray[900],
    backgroundColor: colors.gray[50],
  },
  renamePencil: { position: 'absolute', right: sp(5) },
  renameHint: { fontSize: 10, lineHeight: 14, fontWeight: '700', color: colors.gray[400], paddingHorizontal: sp(1), fontStyle: 'italic' },
  renameFooter: { padding: sp(6), backgroundColor: alpha(colors.gray[50], 0.5), flexDirection: 'row', gap: sp(3) },
  discardBtn: { flex: 1, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  discardText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.gray[500] },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
    shadowColor: restaurantTheme.brand,
    shadowOpacity: 0.2,
  },
  saveText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.white },
});
