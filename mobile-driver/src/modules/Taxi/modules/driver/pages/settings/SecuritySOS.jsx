// Web: modules/Taxi/modules/driver/pages/settings/SecuritySOS.jsx — SOS: trigger the safety alert (then dial 112),
// and the driver's emergency contacts (up to 5: add, call, remove).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import {
  ArrowLeft,
  Phone,
  Plus,
  Trash2,
  Zap,
  X,
  CheckCircle2,
  User,
  Smartphone,
} from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { Dialog, Screen, Sheet, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import {
  addDriverEmergencyContact,
  deleteDriverEmergencyContact,
  getDriverEmergencyContacts,
} from '../../services/registrationService';
import { triggerDriverSosAlert } from '../../../../shared/services/safetyAlertService';

const PAGE_BG = '#f8f9fb';
const MAX_CONTACTS = 5;
const PHONE_REGEX = /^\d{10}$/;
const NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const normalizeName = (value) => String(value || '').replace(/[^A-Za-z .'-]/g, '').replace(/\s+/g, ' ');

// The web's blurred colour blob (blur-3xl): a radial fade of the same colour.
const GlowBlob = ({ size, color, opacity, style }) => (
  <View pointerEvents="none" style={[{ position: 'absolute', width: size * 1.6, height: size * 1.6 }, style]}>
    <Svg width="100%" height="100%">
      <Defs>
        <RadialGradient id="sosGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.6} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50%" cy="50%" r="50%" fill="url(#sosGlow)" />
    </Svg>
  </View>
);

const ButtonSpinner = () => (
  <Spin>
    <View style={styles.spinRing} />
  </Spin>
);

// "SOS Triggered For Saved Contacts" banner (top, slides in; the bolt pulses like animate-pulse).
const SosBanner = ({ visible, top }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    const a = Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true });
    a.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => a.stop();
  }, [visible, anim]);

  useEffect(() => {
    if (!mounted) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mounted, pulse]);

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
      <Animated.View style={{ opacity: pulse }}>
        <Zap size={20} color={colors.white} fill={colors.white} strokeWidth={3} />
      </Animated.View>
      <Text style={styles.bannerText}>SOS Triggered For Saved Contacts</Text>
    </Animated.View>
  );
};

const SecuritySOS = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const insets = useSafeAreaInsets();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';

  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  // The web's Contact Picker API (navigator.contacts.select); not available in the app (nor in the old WebView), so the
  // sheet asks for the name and number like the web did there.
  const canUseContactPicker =
    typeof navigator !== 'undefined' &&
    navigator.contacts &&
    typeof navigator.contacts.select === 'function';

  const remainingSlots = useMemo(
    () => Math.max(0, MAX_CONTACTS - contacts.length),
    [contacts.length],
  );

  const resetForm = () => {
    setName('');
    setPhone('');
    setErrors({});
  };

  const loadContacts = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await getDriverEmergencyContacts();
      setContacts(response?.data?.results || []);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to load emergency contacts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (!showToast) {
      return undefined;
    }

    const timer = setTimeout(() => setShowToast(false), 3000);
    return () => clearTimeout(timer);
  }, [showToast]);

  const validateContact = (contactName, contactPhone) => {
    const nextErrors = {};
    const trimmedName = String(contactName || '').trim();
    const normalizedPhone = normalizePhone(contactPhone);

    if (!trimmedName) {
      nextErrors.name = 'Name is required';
    } else if (!NAME_REGEX.test(trimmedName)) {
      nextErrors.name = 'Use alphabets only for the contact name';
    }

    if (!PHONE_REGEX.test(normalizedPhone)) {
      nextErrors.phone = 'Enter a valid 10-digit mobile number';
    }

    if (contacts.some((contact) => normalizePhone(contact.phone) === normalizedPhone)) {
      nextErrors.phone = 'This number is already added';
    }

    setErrors(nextErrors);

    return {
      isValid: Object.keys(nextErrors).length === 0,
      name: trimmedName,
      phone: normalizedPhone,
    };
  };

  const handleAddContact = async ({ contactName, contactPhone, source = 'manual' }) => {
    const result = validateContact(contactName, contactPhone);

    if (!result.isValid) {
      return;
    }

    if (contacts.length >= MAX_CONTACTS) {
      setError(`You can add up to ${MAX_CONTACTS} emergency contacts`);
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const response = await addDriverEmergencyContact({
        name: result.name,
        phone: result.phone,
        source,
      });

      setContacts((prev) => [...prev, response?.data || {}]);
      resetForm();
      setShowAddSheet(false);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to add emergency contact');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deleteTarget?.id) {
      return;
    }

    setIsDeletingId(deleteTarget.id);
    setError('');

    try {
      await deleteDriverEmergencyContact(deleteTarget.id);
      setContacts((prev) => prev.filter((contact) => contact.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to remove emergency contact');
    } finally {
      setIsDeletingId('');
    }
  };

  const handlePickFromDevice = async () => {
    if (!canUseContactPicker) {
      setError('Phone contact selection is not supported on this device/browser');
      return;
    }

    if (contacts.length >= MAX_CONTACTS) {
      setError(`You can add up to ${MAX_CONTACTS} emergency contacts`);
      return;
    }

    setError('');

    try {
      const [pickedContact] = await navigator.contacts.select(['name', 'tel'], {
        multiple: false,
      });

      if (!pickedContact) {
        return;
      }

      const pickedName = Array.isArray(pickedContact.name)
        ? pickedContact.name[0]
        : pickedContact.name || '';
      const pickedPhone = Array.isArray(pickedContact.tel)
        ? pickedContact.tel[0]
        : pickedContact.tel || '';

      setName(normalizeName(pickedName).trim());
      setPhone(normalizePhone(pickedPhone));
      setShowAddSheet(true);

      await handleAddContact({
        contactName: pickedName,
        contactPhone: pickedPhone,
        source: 'device',
      });
    } catch (requestError) {
      if (requestError?.name === 'AbortError') {
        return;
      }

      setError(requestError?.message || 'Unable to read device contacts');
    }
  };

  const triggerSOS = () => {
    setShowToast(true);
    triggerDriverSosAlert()
      .catch((requestError) => {
        console.error('Failed to trigger driver SOS:', requestError);
        setError(requestError?.message || 'Unable to alert safety center');
      })
      .finally(() => {
        setTimeout(() => {
          Linking.openURL('tel:112').catch(() => {});
        }, 250);
      });
  };

  return (
    <Screen bg={PAGE_BG} edges={['top']}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 128 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigate(`${routePrefix}/profile`)} accessibilityLabel="Back" style={styles.back}>
            <ArrowLeft size={18} color={colors.slate[900]} />
          </Pressable>
          <Text style={styles.headerTitle}>SOS</Text>
        </View>

        <View style={styles.main}>
          <View style={styles.hero}>
            <GlowBlob size={160} color={colors.rose[500]} opacity={0.2} style={{ top: -60, right: -80 }} />
            <View style={styles.heroInner}>
              <View style={styles.heroHead}>
                <View style={styles.heroTitles}>
                  <Text style={styles.heroKicker}> SOS</Text>
                  <Text style={styles.heroTitle}>Emergency Contacts</Text>
                </View>
                <View style={styles.heroIcon}>
                  <Zap size={24} color={colors.white} fill={colors.white} strokeWidth={3} />
                </View>
              </View>
              <Text style={styles.heroText}>
                Add trusted contacts manually or pick from your phone contacts. These contacts can be used for emergency driver safety actions.
              </Text>
              <Pressable
                onPress={triggerSOS}
                style={({ pressed }) => [styles.triggerBtn, pressed && styles.triggerBtnPressed]}
              >
                <Text style={styles.triggerText}>Trigger SOS</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.listSection}>
            <View style={styles.listHead}>
              <Text style={styles.listTitle}>Emergency List</Text>
              <View style={styles.listHeadRight}>
                <Text style={styles.listCount}>
                  {contacts.length}/{MAX_CONTACTS}
                </Text>
                <Pressable
                  onPress={() => {
                    resetForm();
                    setShowAddSheet(true);
                  }}
                  disabled={remainingSlots === 0}
                  style={[styles.addNew, remainingSlots === 0 && styles.addNewDisabled]}
                >
                  <Text style={[styles.addNewText, remainingSlots === 0 && { color: colors.slate[300] }]}>+ Add New</Text>
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {isLoading ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>Loading emergency contacts...</Text>
              </View>
            ) : null}

            {!isLoading && contacts.length === 0 ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>No emergency contacts added yet.</Text>
              </View>
            ) : null}

            {!isLoading &&
              contacts.map((contact, index) => (
                <View key={contact.id || `contact-${index}`} style={styles.contactCard}>
                  <View style={styles.contactLeft}>
                    <View style={styles.contactIcon}>
                      <Phone size={18} color={colors.slate[400]} />
                    </View>
                    <View style={styles.contactText}>
                      <Text style={styles.contactName}>{contact.name}</Text>
                      <Text style={styles.contactPhone}>+91 {contact.phone}</Text>
                      <Text style={styles.contactSource}>
                        {contact.source === 'device' ? 'From Phone Contacts' : 'Added Manually'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.contactActions}>
                    <Pressable
                      onPress={() => Linking.openURL(`tel:+91${contact.phone}`).catch(() => {})}
                      style={({ pressed }) => [styles.roundBtn, styles.callBtn, pressed && styles.pressed90]}
                    >
                      <Phone size={13} color={colors.emerald[500]} strokeWidth={2.5} />
                    </Pressable>
                    <Pressable
                      onPress={() => setDeleteTarget(contact)}
                      style={({ pressed }) => [styles.roundBtn, styles.removeBtn, pressed && styles.pressed90]}
                    >
                      <Trash2 size={13} color={colors.red[400]} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>
              ))}
          </View>
        </View>
      </ScrollView>

      <SosBanner visible={showToast} top={insets.top + 40} />

      <Sheet open={showAddSheet} onClose={() => setShowAddSheet(false)} style={styles.sheet}>
        <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={styles.sheetBody}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Add Emergency Contact</Text>
            <Pressable onPress={() => setShowAddSheet(false)} style={styles.sheetClose}>
              <X size={15} color={colors.slate[500]} strokeWidth={2.5} />
            </Pressable>
          </View>

          <View style={styles.form}>
            {canUseContactPicker ? (
              <Pressable
                onPress={handlePickFromDevice}
                disabled={remainingSlots === 0 || isSaving}
                style={[styles.pickBtn, (remainingSlots === 0 || isSaving) && styles.disabled50]}
              >
                <Smartphone size={16} strokeWidth={2.5} color={colors.slate[700]} />
                <Text style={styles.pickText}>Pick From Phone Contacts</Text>
              </Pressable>
            ) : (
              <View style={styles.typeHint}>
                <Text style={styles.typeHintText}>Type the contact's name and mobile number below.</Text>
              </View>
            )}

            <View>
              <Text style={styles.fieldLabel}>Name</Text>
              <View style={[styles.field, errors.name ? styles.fieldError : styles.fieldOk]}>
                <User size={16} color={colors.slate[400]} strokeWidth={2} />
                <TextInput
                  value={name}
                  onChangeText={(text) => {
                    setName(normalizeName(text));
                    setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  placeholder="Contact name"
                  placeholderTextColor={colors.slate[300]}
                  style={styles.fieldInput}
                />
              </View>
              {errors.name ? <Text style={styles.fieldErrorText}>{errors.name}</Text> : null}
            </View>

            <View>
              <Text style={styles.fieldLabel}>Mobile Number</Text>
              <View style={[styles.field, errors.phone ? styles.fieldError : styles.fieldOk]}>
                <Phone size={16} color={colors.slate[400]} strokeWidth={2} />
                <TextInput
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(normalizePhone(text));
                    setErrors((prev) => ({ ...prev, phone: '' }));
                  }}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={colors.slate[300]}
                  style={styles.fieldInput}
                />
                {PHONE_REGEX.test(phone) ? <CheckCircle2 size={16} color={colors.emerald[500]} strokeWidth={2.5} /> : null}
              </View>
              {errors.phone ? <Text style={styles.fieldErrorText}>{errors.phone}</Text> : null}
            </View>

            <Pressable
              onPress={() => handleAddContact({ contactName: name, contactPhone: phone, source: 'manual' })}
              disabled={isSaving || remainingSlots === 0}
              style={({ pressed }) => [
                styles.saveBtn,
                (isSaving || remainingSlots === 0) && styles.disabled60,
                pressed && styles.pressed97,
              ]}
            >
              {isSaving ? (
                <ButtonSpinner />
              ) : (
                <>
                  <Plus size={15} strokeWidth={2.5} color={colors.white} />
                  <Text style={styles.saveText}>Save Contact</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} style={styles.removeCard}>
        {deleteTarget ? (
          <View style={styles.removeBody}>
            <View style={styles.removeIcon}>
              <Trash2 size={24} color={colors.red[400]} strokeWidth={2} />
            </View>
            <Text style={styles.removeTitle}>Remove contact?</Text>
            <Text style={styles.removeText}>{deleteTarget.name} will be removed from your emergency list.</Text>
            <View style={styles.removeActions}>
              <Pressable
                onPress={handleDeleteContact}
                disabled={isDeletingId === deleteTarget.id}
                style={({ pressed }) => [styles.removeConfirm, pressed && styles.pressed97]}
              >
                <Text style={styles.removeConfirmText}>{isDeletingId === deleteTarget.id ? 'Removing...' : 'Remove'}</Text>
              </Pressable>
              <Pressable onPress={() => setDeleteTarget(null)} style={styles.removeCancel}>
                <Text style={styles.removeCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Dialog>
    </Screen>
  );
};

export default SecuritySOS;

const styles = StyleSheet.create({
  header: {
    zIndex: 30,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: PAGE_BG,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  back: {
    height: 40,
    width: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '900', letterSpacing: -0.45, color: colors.slate[900] },
  main: { paddingHorizontal: 24, gap: 24 },
  hero: { backgroundColor: colors.slate[900], padding: 24, borderRadius: 32, overflow: 'hidden', ...shadow['2xl'] },
  heroInner: { gap: 16 },
  heroHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroTitles: { gap: 4 },
  heroKicker: { fontSize: 14, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4, color: colors.rose[500] },
  heroTitle: { fontSize: 20, lineHeight: 28, fontWeight: '900', letterSpacing: -1, color: colors.white },
  heroIcon: { width: 48, height: 48, backgroundColor: colors.rose[500], borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...shadow.xl },
  heroText: { fontSize: 11, lineHeight: 14, fontWeight: '700', color: alpha(colors.white, 0.4) },
  triggerBtn: {
    height: 48,
    width: '100%',
    backgroundColor: alpha(colors.white, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerBtnPressed: { backgroundColor: colors.rose[500] },
  triggerText: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, color: colors.white },
  listSection: { gap: 16 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  listTitle: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400], opacity: 0.6 },
  listHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listCount: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400] },
  addNew: { borderBottomWidth: 1, borderBottomColor: alpha(colors.blue[500], 0.2), paddingBottom: 2 },
  addNewDisabled: { borderBottomColor: colors.slate[200] },
  addNewText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.blue[500] },
  errorBox: { backgroundColor: colors.rose[50], borderWidth: 1, borderColor: colors.rose[100], paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16 },
  errorText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.rose[600] },
  infoBox: { backgroundColor: colors.white, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], ...shadow.sm },
  infoText: { textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.slate[400] },
  contactCard: {
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadow.sm,
  },
  contactLeft: { flexDirection: 'row', alignItems: 'center', gap: 16, flexShrink: 1 },
  contactIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  contactText: { gap: 2, flexShrink: 1 },
  contactName: { fontSize: 14, lineHeight: 18, fontWeight: '900', letterSpacing: -0.35, color: colors.slate[900] },
  contactPhone: { fontSize: 10, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: colors.slate[400], opacity: 0.6 },
  contactSource: { fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.9, color: colors.slate[300] },
  contactActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  callBtn: { backgroundColor: colors.emerald[50], borderColor: colors.emerald[100] },
  removeBtn: { backgroundColor: colors.red[50], borderColor: colors.red[100] },
  pressed90: { transform: [{ scale: 0.9 }] },
  pressed97: { transform: [{ scale: 0.97 }] },
  banner: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 100,
    elevation: 20,
    backgroundColor: colors.rose[500],
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: colors.rose[500],
    shadowOpacity: 0.2,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  bannerText: { flexShrink: 1, fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, color: colors.white },
  sheet: { maxWidth: 512, alignSelf: 'center', width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: colors.slate[200], borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[900] },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.slate[50], alignItems: 'center', justifyContent: 'center' },
  form: { gap: 16 },
  pickBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickText: { fontSize: 12, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, color: colors.slate[700] },
  disabled50: { opacity: 0.5 },
  disabled60: { opacity: 0.6 },
  typeHint: { borderRadius: 14, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  typeHintText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.slate[500] },
  fieldLabel: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1, color: colors.slate[400], marginLeft: 4, marginBottom: 4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 2 },
  fieldOk: { borderColor: colors.slate[100], backgroundColor: colors.slate[50] },
  fieldError: { borderColor: colors.red[200], backgroundColor: colors.red[50] },
  fieldInput: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.slate[900], paddingVertical: 0 },
  fieldErrorText: { fontSize: 11, lineHeight: 16, fontWeight: '900', color: colors.red[500], marginLeft: 4, marginTop: 4 },
  // bg-slate-900 button: the partner button colour (Taxi blue, white text)
  saveBtn: {
    width: '100%',
    backgroundColor: driverTheme.button,
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    minHeight: 52,
    ...shadow.sm,
  },
  saveText: { fontSize: 14, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4, color: colors.white },
  removeCard: { width: '82%', maxWidth: 384, borderRadius: 28 },
  removeBody: { padding: 28, alignItems: 'center' },
  removeIcon: { width: 56, height: 56, backgroundColor: colors.red[50], borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  removeTitle: { fontSize: 17, lineHeight: 24, fontWeight: '900', color: colors.slate[900], marginBottom: 4, textAlign: 'center' },
  removeText: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.slate[400], marginBottom: 24, textAlign: 'center' },
  removeActions: { gap: 10, width: '100%' },
  removeConfirm: { width: '100%', backgroundColor: colors.red[500], paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  removeConfirmText: { fontSize: 13, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.3, color: colors.white },
  removeCancel: { width: '100%', paddingVertical: 14, alignItems: 'center' },
  removeCancelText: { fontSize: 13, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.3, color: colors.slate[400] },
  spinRing: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: alpha(colors.white, 0.3), borderTopColor: colors.white },
});
