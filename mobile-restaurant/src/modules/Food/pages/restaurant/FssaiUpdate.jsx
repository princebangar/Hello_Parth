// Web: pages/restaurant/FssaiUpdate.jsx (/food/restaurant/fssai/update) — "Update FSSAI": registration number,
// "Valid up to" (DD-MM-YYYY), the license upload box (ImageSourcePicker: camera / gallery, max 5 MB, toast
// "FSSAI license uploaded") and Confirm (enabled once a file is chosen). The web sent nothing to the backend; here
// (Prince, 27 Oct) Confirm uploads the license image (uploadAPI.uploadMedia, folder food/restaurants/fssai) and saves
// fssaiNumber / fssaiExpiry / fssaiImage with restaurantAPI.updateProfile (the backend already accepts them), then
// shows "FSSAI details updated" and goes back. The saved number / date are filled in when the page opens.
// Native:
// - Form in a KeyboardAwareScrollView; the Confirm bar rides on the keyboard (useKeyboardOffset) and the scroll view
//   keeps the focused field above that bar (extraOffset).
// - "Valid up to": a field that opens the native date picker and shows the date as DD-MM-YYYY (the web's
//   placeholder format); the web had a free text box.
// - The upload box opens the converted ImageSourcePicker exactly like the web (camera / photo library); see the report
//   about PDF files (the web's browser fallback input also accepted application/pdf).
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ArrowLeft } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { KeyboardAwareScrollView, Screen, Sheet, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { colors, restaurantTheme, sp } from '@/theme';
import useKeyboardOffset from '@/modules/Taxi/shared/hooks/useKeyboardOffset';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { ImageSourcePicker } from '@food/components/ImageSourcePicker';
import { restaurantAPI, uploadAPI } from '@food/api';

const pad2 = (n) => String(n).padStart(2, '0');
const toDDMMYYYY = (date) => `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
const fromDDMMYYYY = (value) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value || ''));
  if (!m) return new Date();
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

function Field({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.gray[400]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, focused && styles.inputFocused, style]}
    />
  );
}

export default function FssaiUpdate() {
  const goBack = useRestaurantBackNavigation();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset();
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [validUpTo, setValidUpTo] = useState('');
  const [iosDateOpen, setIosDateOpen] = useState(false);
  const [iosDate, setIosDate] = useState(new Date());
  const [saving, setSaving] = useState(false);

  // the details saved earlier
  useEffect(() => {
    let alive = true;
    restaurantAPI
      .getCurrentRestaurant()
      .then((res) => {
        const doc = res?.data?.data?.restaurant || res?.data?.restaurant || res?.data?.data || {};
        if (!alive) return;
        if (doc.fssaiNumber) setRegistrationNumber(String(doc.fssaiNumber));
        if (doc.fssaiExpiry) {
          const d = new Date(doc.fssaiExpiry);
          if (!Number.isNaN(d.getTime())) setValidUpTo(toDDMMYYYY(d));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleFileSelect = (file) => {
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size too large. Max 5MB allowed.');
        return;
      }
      setUploadedFile(file);
      toast.success('FSSAI license uploaded');
    }
  };

  const handleFileClick = () => {
    setIsPhotoPickerOpen(true);
  };

  const handleSubmit = async () => {
    if (saving) return;
    const number = String(registrationNumber || '').trim();
    if (!number) {
      toast.error('Please enter FSSAI registration number');
      return;
    }
    if (!validUpTo) {
      toast.error('Please select the valid up to date');
      return;
    }
    try {
      setSaving(true);
      const uploaded = await uploadAPI.uploadMedia(uploadedFile, { folder: 'food/restaurants/fssai' });
      const url = uploaded?.data?.data?.url || uploaded?.data?.url || '';
      if (!url) throw new Error('Failed to upload FSSAI license');
      const d = fromDDMMYYYY(validUpTo);
      await restaurantAPI.updateProfile({
        fssaiNumber: number,
        fssaiExpiry: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        fssaiImage: url,
      });
      toast.success('FSSAI details updated');
      goBack();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to update FSSAI details');
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = () => {
    const current = fromDDMMYYYY(validUpTo);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onValueChange: (_event, date) => {
          if (date) setValidUpTo(toDDMMYYYY(date));
        },
      });
      return;
    }
    setIosDate(current);
    setIosDateOpen(true);
  };

  return (
    <Screen bg={colors.white} edges={[]} statusBarStyle="dark">
      <StatusBarSpacer color={colors.white} />
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} accessibilityLabel="Back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
          <ArrowLeft size={20} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.title}>Update FSSAI</Text>
      </View>

      <KeyboardAwareScrollView style={styles.flex} contentContainerStyle={styles.form} extraOffset={96}>
        <View>
          <Text style={styles.label}>FSSAI registration number</Text>
          <Field value={registrationNumber} onChangeText={setRegistrationNumber} placeholder="eg. 19138110019201" />
        </View>

        <View>
          <Text style={styles.label}>Valid up to</Text>
          <Pressable onPress={openDatePicker} accessibilityRole="button" style={styles.input}>
            <Text style={[styles.inputText, !validUpTo && { color: colors.gray[400] }]}>{validUpTo || 'DD-MM-YYYY'}</Text>
          </Pressable>
        </View>

        <View style={{ gap: sp(2) }}>
          <Text style={[styles.label, { marginBottom: 0 }]}>Upload your FSSAI license</Text>
          <Pressable onPress={handleFileClick} style={({ pressed }) => [styles.uploadBox, pressed && { backgroundColor: colors.gray[100] }]}>
            {uploadedFile ? (
              <View style={{ gap: sp(2), alignItems: 'center' }}>
                <Text style={styles.emoji}>✅</Text>
                <Text style={styles.fileName}>{uploadedFile.name}</Text>
                <Text style={styles.hint}>Click to change</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.emoji, { marginBottom: sp(2) }]}>⬆️</Text>
                <Text style={[styles.fileName, { marginBottom: sp(1) }]}>Upload your FSSAI license</Text>
                <Text style={styles.hint}>jpeg, png, or pdf (up to 5MB)</Text>
              </>
            )}
          </Pressable>
          <Pressable style={{ alignSelf: 'flex-start' }}>
            <Text style={styles.guidelines}>View upload guidelines</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>

      {/* Bottom button */}
      <View style={[styles.bottom, { marginBottom: keyboardOffset, paddingBottom: sp(6) + (keyboardOffset ? 0 : insets.bottom) }]}>
        <Pressable
          onPress={handleSubmit}
          disabled={!uploadedFile || saving}
          style={[styles.confirmBtn, !uploadedFile && { backgroundColor: colors.gray[200] }]}
        >
          {uploadedFile ? (
            <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          ) : null}
          <Text style={[styles.confirmText, { color: uploadedFile ? colors.white : colors.gray[500] }]}>Confirm</Text>
        </Pressable>
      </View>

      <ImageSourcePicker
        isOpen={isPhotoPickerOpen}
        onClose={() => setIsPhotoPickerOpen(false)}
        onFileSelect={handleFileSelect}
        title="Upload FSSAI License"
        description="Choose how to upload your FSSAI license"
        fileNamePrefix="fssai-license"
      />

      {Platform.OS !== 'android' ? (
        <Sheet open={iosDateOpen} onClose={() => setIosDateOpen(false)}>
          <View style={styles.iosSheet}>
            <DateTimePicker
              value={iosDate}
              mode="date"
              display="spinner"
              onValueChange={(_event, date) => {
                if (date) setIosDate(date);
              }}
            />
            <Pressable
              onPress={() => {
                setIosDateOpen(false);
                setValidUpTo(toDDMMYYYY(iosDate));
              }}
              style={styles.iosOk}
            >
              <Text style={styles.iosOkText}>OK</Text>
            </Pressable>
          </View>
        </Sheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: sp(4),
    paddingTop: sp(4),
    paddingBottom: sp(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backBtn: { padding: sp(2), borderRadius: 9999 },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.gray[900] },
  form: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(8), gap: sp(4) },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.gray[700], marginBottom: sp(1) },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 6,
    paddingHorizontal: sp(3),
    paddingVertical: sp(2),
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[900],
    backgroundColor: colors.white,
  },
  inputFocused: { borderColor: restaurantTheme.focusBorder },
  inputText: { fontSize: 14, lineHeight: 20, color: colors.gray[900] },
  uploadBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray[300],
    backgroundColor: colors.gray[50],
    paddingHorizontal: sp(4),
    paddingVertical: sp(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 24, lineHeight: 32, textAlign: 'center' },
  fileName: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900], textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 16, color: colors.gray[500], textAlign: 'center' },
  guidelines: { fontSize: 12, lineHeight: 16, color: colors.gray[700], textDecorationLine: 'underline' },
  bottom: { paddingHorizontal: sp(4), paddingTop: sp(2), borderTopWidth: 1, borderTopColor: colors.gray[200], backgroundColor: colors.white },
  confirmBtn: { width: '100%', paddingVertical: sp(3), borderRadius: 9999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  iosSheet: { paddingTop: sp(4), paddingBottom: sp(4), alignItems: 'center' },
  iosOk: { marginTop: sp(2), paddingHorizontal: sp(6), paddingVertical: sp(3) },
  iosOkText: { color: restaurantTheme.brand, fontSize: 16, lineHeight: 24, fontWeight: '700' },
});
