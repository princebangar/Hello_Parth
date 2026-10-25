// Web: modules/Taxi/modules/user/pages/profile/ProfileSettings.jsx (route /profile/edit) — name, e-mail, photo
// (gallery / camera upload via useImageUpload), read-only phone.
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ArrowLeft, User, Mail, Smartphone, Camera, CheckCircle2, Loader2, ImagePlus } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { AppImage, Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { colors } from '@/theme';
import { openCamera } from '@food/utils/imageUploadUtils';
import { getAppRoutePath } from '@/shared/utils/nativeShell';
import { userAuthService } from '../../services/authService';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

// same placeholder photo as the Food user profile
const DEFAULT_AVATAR = require('../../../../../../assets/public/images/profile_avatar.webp');

const ProfileSettings = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [focused, setFocused] = useState('');
  const navigate = useNavigate();
  const P = useUserPalette();

  const {
    uploading: photoUploading,
    preview: photoPreview,
    handleFileChange: onPhotoFileChange,
  } = useImageUpload({
    folder: 'user-profiles',
    onSuccess: (url) => setProfileImage(url),
  });

  const cameraInputRef = useRef(null);

  const avatarSrc = useMemo(() => {
    return photoPreview || profileImage || DEFAULT_AVATAR;
  }, [profileImage, photoPreview]);

  useEffect(() => {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
    } catch {
      stored = {};
    }
    if (stored?.name) setName(stored.name);
    if (stored?.email) setEmail(stored.email);
    if (stored?.phone) setPhone(stored.phone);
    if (stored?.profileImage) setProfileImage(stored.profileImage);

    const loadProfile = async () => {
      try {
        const response = await userAuthService.getCurrentUser();
        const user = response?.data?.user || {};
        setName(user.name || stored?.name || '');
        setEmail(user.email || stored?.email || '');
        setPhone(user.phone || stored?.phone || '');
        setProfileImage(user.profileImage || stored?.profileImage || '');
        localStorage.setItem('userInfo', JSON.stringify(user));
      } catch {
        setName((prev) => prev || '');
        setEmail((prev) => prev || '');
        setPhone((prev) => prev || '');
        setProfileImage((prev) => prev || stored?.profileImage || '');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await userAuthService.updateCurrentUser({
        name,
        email,
        profileImage,
      });
      const user = response?.data?.user || {};
      localStorage.setItem('userInfo', JSON.stringify(user));
      toast.success('Profile updated successfully');
      const basePath = getAppRoutePath().startsWith('/taxi/user') ? '/taxi/user' : '';
      navigate(`${basePath}/profile`);
    } catch (err) {
      setSaveError(err?.message || 'Save failed');
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen bg={P.bg}>
        <View style={styles.center}>
          <Spin>
            <Loader2 color={P.textSecondary} size={32} />
          </Spin>
        </View>
      </Screen>
    );
  }

  // focus: index.css draws the theme's gold ring on the box that holds a transparent input
  const fieldBox = (key) => [
    styles.fieldBox,
    USER_SHADOW,
    { backgroundColor: P.cardSoft, borderColor: P.border },
    focused === key && { borderColor: P.accent, borderWidth: 2, paddingHorizontal: 19, paddingVertical: 15 },
  ];
  const fieldLabel = [styles.fieldLabel, { color: P.textSecondary }];
  const photoBtn = (base) =>
    photoUploading
      ? { borderColor: P.border, backgroundColor: P.cardSoft, color: P.textSecondary }
      : base;
  const gallery = photoBtn({ borderColor: P.border, backgroundColor: P.cardBg, color: P.textSecondary });
  const camera = photoBtn({ borderColor: colors.slate[900], backgroundColor: P.cardBg, color: P.textPrimary });

  return (
    <Screen bg={P.bg} edges={['bottom']} keyboard>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, USER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: colors.gray[50] }]}>
        {/* Back to wherever this was opened from (main Profile's "Edit profile" link, or the Settings hub's
            "Edit Profile" row). */}
        <Pressable onPress={() => navigate(-1)} style={({ pressed }) => [styles.back, pressed && { transform: [{ scale: 0.95 }] }]}>
          <ArrowLeft size={24} color={P.textPrimary} strokeWidth={3} />
        </Pressable>
        <View>
          <Text style={[styles.kicker, { color: P.textSecondary }]}>ACCOUNT SETTINGS</Text>
          <Text style={[styles.h2, { color: P.textPrimary }]}>Your Profile</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* AVATAR EDIT AREA */}
        <View style={styles.avatarArea}>
          <View>
            <View style={[styles.avatarFrame, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}>
              <AppImage
                src={avatarSrc}
                fallback={DEFAULT_AVATAR}
                style={[styles.avatar, photoUploading && { opacity: 0.5 }]}
                blurRadius={photoUploading ? 2 : 0}
                accessibilityLabel="User"
              />
              {photoUploading && (
                <View style={[StyleSheet.absoluteFill, styles.center]}>
                  <Spin>
                    <Loader2 color={colors.orange[600]} size={28} strokeWidth={3} />
                  </Spin>
                </View>
              )}
            </View>
            <View style={[styles.cameraBadge, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}>
              <Camera size={18} strokeWidth={2.5} color={P.textPrimary} />
            </View>
          </View>
          <View style={styles.photoBtns}>
            <Pressable
              disabled={photoUploading}
              accessibilityLabel="Upload profile photo from gallery"
              onPress={() => onPhotoFileChange()}
              style={({ pressed }) => [styles.photoBtn, { borderColor: gallery.borderColor, backgroundColor: gallery.backgroundColor }, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <ImagePlus size={14} color={gallery.color} />
              <Text style={[styles.photoBtnText, { color: gallery.color }]}>GALLERY</Text>
            </Pressable>
            {/* The camera goes through the app's own camera (same helper as Food). */}
            <Pressable
              disabled={photoUploading}
              onPress={() =>
                openCamera({
                  onSelectFile: (file) => onPhotoFileChange({ target: { files: [file] } }),
                  fileNamePrefix: 'profile-photo',
                  fallbackInputRef: cameraInputRef,
                })
              }
              style={({ pressed }) => [styles.photoBtn, { borderColor: camera.borderColor, backgroundColor: camera.backgroundColor }, pressed && { transform: [{ scale: 0.99 }] }]}
            >
              <Camera size={14} color={camera.color} />
              <Text style={[styles.photoBtnText, { color: camera.color }]}>CAMERA</Text>
            </Pressable>
          </View>
          <Text style={[styles.photoHint, { color: P.textSecondary }]}>
            {photoUploading ? 'OPTIMIZING FOR WEBP...' : 'CHANGE PROFILE PHOTO'}
          </Text>
        </View>

        {/* FORM FIELDS */}
        <View style={{ gap: 24 }}>
          <View style={{ gap: 8 }}>
            <Text style={fieldLabel}>FULL NAME</Text>
            <View style={fieldBox('name')}>
              <User size={18} color={P.textSecondary} />
              <TextInput
                value={name}
                onChangeText={setName}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused('')}
                style={[styles.input, { color: P.textPrimary }]}
                placeholder="Your full name"
              />
              {name ? <CheckCircle2 size={16} color={colors.emerald[500]} /> : null}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={fieldLabel}>EMAIL ADDRESS</Text>
            <View style={fieldBox('email')}>
              <Mail size={18} color={P.textSecondary} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused('')}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, { color: P.textPrimary }]}
                placeholder="yourname@example.com"
              />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={fieldLabel}>PHONE NUMBER</Text>
            <View style={[styles.fieldBox, { backgroundColor: P.cardSoft, borderColor: P.border, opacity: 0.7 }]}>
              <Smartphone size={18} color={P.textSecondary} />
              <Text style={[styles.input, { color: P.textSecondary }]}>{phone ? `+91 ${phone}` : '+91'}</Text>
              <View style={[styles.verified, { backgroundColor: P.cardSoft }]}>
                <Text style={styles.verifiedText}>VERIFIED</Text>
              </View>
            </View>
          </View>
        </View>
        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: P.cardBg, borderTopColor: colors.gray[50] }]}>
        <Pressable
          onPress={handleSave}
          disabled={photoUploading || saving}
          style={({ pressed }) => [
            styles.save,
            USER_SHADOW,
            { backgroundColor: P.accent, opacity: photoUploading || saving ? 0.5 : 1 },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={[styles.saveText, { color: P.accentInk }]}>{saving ? 'Saving Changes...' : 'Save Profile'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 32, flexDirection: 'row', alignItems: 'center', gap: 24, borderBottomWidth: 1, zIndex: 20 },
  back: { padding: 8, marginLeft: -8 },
  kicker: { fontSize: 11, lineHeight: 11, fontWeight: '600', letterSpacing: 1.1, marginBottom: 6, opacity: 0.6 },
  h2: { fontSize: 18, lineHeight: 18, fontWeight: '600', letterSpacing: -0.45 },
  body: { padding: 20, gap: 40 },
  avatarArea: { alignItems: 'center', gap: 16, paddingVertical: 16 },
  avatarFrame: { width: 110, height: 110, borderRadius: 42, padding: 6, borderWidth: 1, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%', borderRadius: 34 },
  cameraBadge: { position: 'absolute', bottom: -4, right: -4, padding: 10, borderRadius: 16, borderWidth: 1 },
  photoBtns: { marginTop: 4, flexDirection: 'row', gap: 8, width: '100%', maxWidth: 280 },
  photoBtn: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, borderWidth: 1 },
  photoBtnText: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0.55 },
  photoHint: { textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 1.1 },
  fieldLabel: { marginLeft: 4, fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 1.1 },
  fieldBox: { flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 16 },
  input: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '600', paddingVertical: 0, backgroundColor: 'transparent' },
  verified: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  verifiedText: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5, color: colors.emerald[700] },
  saveError: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.rose[500], textAlign: 'center' },
  footer: { padding: 24, paddingBottom: 48, borderTopWidth: 1 },
  save: { width: '100%', height: 60, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
});

export default ProfileSettings;
