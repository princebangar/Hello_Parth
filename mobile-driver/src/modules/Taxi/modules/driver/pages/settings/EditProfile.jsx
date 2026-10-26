// Web: modules/Taxi/modules/driver/pages/settings/EditProfile.jsx — the driver / owner's name, phone (read-only),
// email and profile photo (uploaded at once and saved to the profile).
// Native: the photo comes from the gallery (useImageUpload opens the picker; the web's <input type="file">).
import React, { useState, useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Camera, User, Phone, Mail, Check, CheckCircle2, Loader2 } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Screen, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { toast } from '@/lib/toast';
import { colors, driverTheme, shadow } from '@/theme';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import { getCurrentDriver, updateDriverProfile } from '../../services/registrationService';

const NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const normalizeName = (value) => String(value || '').replace(/[^A-Za-z .'-]/g, '').replace(/\s+/g, ' ');
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const unwrapDriver = (response) => response?.data?.data || response?.data || response || {};
// Same placeholder photo as the Food user and delivery profiles.
const DEFAULT_AVATAR = require('../../../../../../assets/public/images/profile_avatar.webp');

// "Profile Updated Successfully" banner at the top (the web's motion.div: fade + slide + scale).
const SuccessBanner = ({ visible, top }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    const a = Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => a.stop();
  }, [visible, anim]);

  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.banner,
        {
          top,
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}
    >
      <CheckCircle2 size={20} strokeWidth={3} color={colors.white} />
      <Text style={styles.bannerText}>Profile Updated Successfully</Text>
    </Animated.View>
  );
};

const EditProfile = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [driver, setDriver] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
  });
  const [errors, setErrors] = useState({});
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [focusedKey, setFocusedKey] = useState('');
  const successTimer = useRef(null);

  useEffect(() => () => clearTimeout(successTimer.current), []);

  const {
    uploading: imageUploading,
    preview: imagePreview,
    handleFileChange: onImageFileChange,
  } = useImageUpload({
    folder: 'driver-profiles',
    onSuccess: async (url) => {
      setDriver((prev) => ({ ...prev, profileImage: url }));
      setAvatarBroken(false);
      try {
        await updateDriverProfile({ profileImage: url });
        toast.success('Profile photo updated');
      } catch (err) {
        toast.error(err?.message || 'Photo uploaded but could not be saved. Press Save to try again.');
      }
    },
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await getCurrentDriver();
        const data = unwrapDriver(res);
        setDriver(data);
        setFormData({
          name: data.name || '',
          phone: data.phone || '',
          email: data.email || '',
        });
      } catch (error) {
        console.error('Failed to load profile:', error);
        toast.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSave = async () => {
    const nextErrors = {};
    const trimmedName = String(formData.name || '').trim();
    const email = normalizeEmail(formData.email);

    if (!NAME_REGEX.test(trimmedName)) {
      nextErrors.name = 'Full name can contain alphabets only';
    }

    if (email && (!EMAIL_REGEX.test(email) || email.includes('..'))) {
      nextErrors.email = 'Please enter a valid email address, example aa@gmail.com';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...formData,
        name: trimmedName,
        email,
        profileImage: driver.profileImage,
      };
      await updateDriverProfile(payload);
      setShowSuccess(true);
      successTimer.current = setTimeout(() => {
        setShowSuccess(false);
        navigate(-1);
      }, 1500);
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Screen bg={colors.white} edges={['top']}>
        <View style={styles.loadingPage}>
          <Spin>
            <Loader2 size={32} color={colors.slate[400]} />
          </Spin>
        </View>
      </Screen>
    );
  }

  const fields = [
    { key: 'name', label: 'Full Name', value: formData.name, Icon: User, keyboardType: 'default' },
    { key: 'phone', label: 'Mobile Number', value: formData.phone, Icon: Phone, keyboardType: 'phone-pad', disabled: true },
    { key: 'email', label: 'Email Address', value: formData.email, Icon: Mail, keyboardType: 'email-address' },
  ];
  const avatarSource = imagePreview || (driver?.profileImage && !avatarBroken ? driver.profileImage : DEFAULT_AVATAR);

  return (
    <Screen bg={colors.slate[50]} edges={['top']}>
      <ScrollView
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => navigate(`${routePrefix}/profile`)}
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.back, pressed && styles.pressed95]}
          >
            <ArrowLeft size={18} color={colors.slate[900]} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Profile</Text>
        </View>

        <View style={styles.main}>
          {/* Profile Image Upload */}
          <View style={styles.photoBlock}>
            <View>
              <View style={styles.avatarRing}>
                <AppImage
                  src={avatarSource}
                  fallback={DEFAULT_AVATAR}
                  onError={() => setAvatarBroken(true)}
                  style={[styles.avatar, imageUploading && styles.avatarDim]}
                  accessibilityLabel="Profile"
                />
                {imageUploading ? (
                  <View style={styles.avatarSpinner}>
                    <Spin>
                      <Loader2 size={24} color={colors.blue[600]} />
                    </Spin>
                  </View>
                ) : null}
              </View>
              <Pressable
                onPress={() => onImageFileChange()}
                disabled={imageUploading}
                accessibilityLabel="Change profile photo"
                style={({ pressed }) => [styles.cameraBtn, pressed && styles.pressed90]}
              >
                <LinearGradient colors={['#1d4ed8', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cameraFill}>
                  <Camera size={16} color={colors.white} />
                </LinearGradient>
              </Pressable>
            </View>
            <Text style={styles.photoLabel}>{imageUploading ? 'Optimizing For WebP...' : 'Profile Photo'}</Text>
          </View>

          <View style={styles.fieldList}>
            {fields.map((field) => {
              const focused = focusedKey === field.key && !field.disabled;
              return (
                <View
                  key={field.key}
                  style={[
                    styles.field,
                    field.disabled && styles.fieldDisabled,
                    focused && styles.fieldFocused,
                  ]}
                >
                  <View style={styles.fieldHead}>
                    <field.Icon size={16} color={colors.slate[400]} />
                    <Text style={styles.fieldLabel}>{field.label}</Text>
                  </View>
                  <TextInput
                    value={field.value}
                    editable={!field.disabled}
                    keyboardType={field.keyboardType}
                    autoCapitalize={field.key === 'name' ? 'words' : 'none'}
                    autoCorrect={false}
                    onFocus={() => setFocusedKey(field.key)}
                    onBlur={() => setFocusedKey((current) => (current === field.key ? '' : current))}
                    onChangeText={(text) => {
                      const value = field.key === 'name'
                        ? normalizeName(text)
                        : field.key === 'email'
                          ? normalizeEmail(text)
                          : text;
                      setFormData((prev) => ({ ...prev, [field.key]: value }));
                      setErrors((prev) => ({ ...prev, [field.key]: '' }));
                    }}
                    style={styles.fieldInput}
                  />
                  {errors[field.key] ? <Text style={styles.fieldError}>{errors[field.key]}</Text> : null}
                </View>
              );
            })}
          </View>

          <View style={styles.saveWrap}>
            <Pressable
              onPress={handleSave}
              disabled={submitting || imageUploading}
              style={({ pressed }) => [
                styles.saveBtn,
                (submitting || imageUploading) && styles.disabled,
                pressed && styles.pressed98,
              ]}
            >
              {submitting ? (
                <Spin>
                  <Loader2 size={20} color={colors.white} />
                </Spin>
              ) : (
                <>
                  <Text style={styles.saveText}>Save Changes</Text>
                  <Check size={18} strokeWidth={3} color={colors.white} />
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <SuccessBanner visible={showSuccess} top={insets.top + 40} />
    </Screen>
  );
};

export default EditProfile;

const styles = StyleSheet.create({
  loadingPage: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  header: {
    zIndex: 30,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.slate[50],
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  pressed90: { transform: [{ scale: 0.9 }] },
  pressed95: { transform: [{ scale: 0.95 }] },
  pressed98: { transform: [{ scale: 0.98 }] },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', letterSpacing: -0.45, color: colors.slate[900] },
  main: { width: '100%', maxWidth: 384 + 48, alignSelf: 'center', paddingHorizontal: 24, gap: 24 },
  photoBlock: { alignItems: 'center', gap: 16, marginBottom: 8 },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.white,
    padding: 4,
    elevation: 8,
    shadowColor: '#0e2a7a',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  avatar: { width: '100%', height: '100%', borderRadius: 44 },
  avatarDim: { opacity: 0.5 },
  avatarSpinner: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  cameraBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.white,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  cameraFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.slate[400], textAlign: 'center' },
  fieldList: { gap: 16 },
  field: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    gap: 8,
    ...shadow.sm,
  },
  fieldDisabled: { opacity: 0.7, backgroundColor: colors.slate[50] },
  // focus-within:border-slate-900 + ring-4 ring-slate-900/5
  fieldFocused: {
    borderColor: colors.slate[900],
    shadowColor: colors.slate[900],
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { fontSize: 10, lineHeight: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400] },
  fieldInput: { width: '100%', fontSize: 15, fontWeight: '600', letterSpacing: -0.38, color: colors.slate[900], paddingVertical: 0 },
  fieldError: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.rose[500] },
  saveWrap: { paddingTop: 24 },
  // bg-slate-900 button: the partner button colour (Taxi blue, white text)
  saveBtn: {
    width: '100%',
    height: 60,
    backgroundColor: driverTheme.button,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 10,
    shadowColor: colors.slate[900],
    shadowOpacity: 0.2,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  disabled: { opacity: 0.5 },
  saveText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.white },
  banner: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 100,
    elevation: 20,
    backgroundColor: colors.emerald[500],
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.emerald[500],
    shadowOpacity: 0.2,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  bannerText: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.33, color: colors.white },
});
