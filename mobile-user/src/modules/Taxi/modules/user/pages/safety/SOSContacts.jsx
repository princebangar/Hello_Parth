import React, { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Plus, Trash2, Phone, User, AlertTriangle, ShieldAlert, X, CheckCircle2 } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Dialog, Screen, Sheet, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { colors, useTheme } from '@/theme';
import api from '../../../../shared/api/axiosInstance';
import { triggerUserSosAlert } from '../../../../shared/services/safetyAlertService';

const MAX_CONTACTS = 5;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const CONTACTS_PATH = '/users/me/emergency-contacts';

const readContacts = (response) => {
  const results = response?.data?.results || response?.results || response?.data?.data?.results;
  return Array.isArray(results) ? results : [];
};

const EMERGENCY_SERVICES = [
  { id: 'police', label: 'Police', phone: '100', accent: { border: colors.blue[100], fg: colors.blue[600] } },
  { id: 'ambulance', label: 'Ambulance', phone: '108', accent: { border: colors.emerald[100], fg: colors.emerald[600] } },
  { id: 'fire', label: 'Fire Brigade', phone: '101', accent: { border: colors.orange[100], fg: colors.orange[600] } },
];

// --user-* palette of modules/Taxi/index.css; the Taxi scope remaps bg-white / slate text / borders to it.
const LIGHT = { bg: '#F1F4F9', card: '#FFFFFF', soft: '#E9EDF4', text: '#0B1220', sec: '#475569', muted: '#64748B', border: 'rgba(15,23,42,0.10)' };
const DARK = { bg: '#0a0a0a', card: '#141414', soft: '#1c1c1c', text: '#FFFFFF', sec: '#CBD5E1', muted: '#94A3B8', border: 'rgba(255,255,255,0.12)' };
const ACCENT = '#FFC400';
const INK = '#0b1220';
// `.user-app-theme .shadow-*` override
const SH = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };
const CARD_SHADOW = { elevation: 2, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } };

const FadeUp = ({ delay = 0, distance = 8, style, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>{children}</Animated.View>;
};

const tap = (scale) => ({ pressed }) => (pressed ? { transform: [{ scale }] } : null);

const SOSContacts = () => {
  const navigate = useNavigate();
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  const [contacts, setContacts]         = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [name, setName]                 = useState('');
  const [phone, setPhone]               = useState('');
  const [errors, setErrors]             = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sosActive, setSosActive]       = useState(false);
  const [countdown, setCountdown]       = useState(3);
  const [saving, setSaving]             = useState(false);
  const [isTriggeringSos, setIsTriggeringSos] = useState(false);
  const [focused, setFocused]           = useState('');
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const validate = () => {
    const e = {};
    if (!name.trim())              e.name  = 'Name is required';
    if (!PHONE_REGEX.test(phone))  e.phone = 'Enter a valid 10-digit mobile number';
    if (contacts.some(c => c.phone === phone)) e.phone = 'This number is already added';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  useEffect(() => {
    let active = true;
    api.get(CONTACTS_PATH)
      .then((response) => {
        if (active) setContacts(readContacts(response));
      })
      .catch((error) => {
        if (active) toast.error(error?.message || 'Could not load your SOS contacts');
      })
      .finally(() => {
        if (active) setLoadingContacts(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleAdd = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const response = await api.post(CONTACTS_PATH, { name: name.trim(), phone });
      const added = response?.data?.id ? response.data : response?.data?.data || response;
      setContacts(prev => [...prev, { id: String(added?.id || Date.now()), name: added?.name || name.trim(), phone: added?.phone || phone }]);
      setName(''); setPhone(''); setErrors({});
      setShowAddSheet(false);
    } catch (error) {
      toast.error(error?.message || 'Could not save this contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`${CONTACTS_PATH}/${id}`);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      toast.error(error?.message || 'Could not remove this contact');
    } finally {
      setDeleteTarget(null);
    }
  };

  const triggerSOS = () => {
    if (isTriggeringSos) return;

    setSosActive(true);
    setCountdown(3);
    setIsTriggeringSos(true);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setSosActive(false);
          setCountdown(3);
          triggerUserSosAlert()
            .then(() => {
              toast.success('SOS sent to safety center');
            })
            .catch((error) => {
              console.error('Failed to trigger user SOS:', error);
              toast.error(error?.message || 'Unable to send SOS right now');
            })
            .finally(() => {
              setIsTriggeringSos(false);
            });
        }
        return prev - 1;
      });
    }, 1000);
    intervalRef.current = interval;
  };

  const atLimit = contacts.length >= MAX_CONTACTS;
  const fieldBox = (key) => {
    if (errors[key]) return { backgroundColor: p.soft, borderColor: focused === key ? ACCENT : colors.red[200] };
    return { backgroundColor: p.card, borderColor: focused === key ? ACCENT : p.border };
  };

  return (
    <Screen bg={p.bg} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: p.card, borderBottomColor: p.border }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigate(-1)}
            style={(s) => [styles.iconBtn, SH, { borderColor: p.border, backgroundColor: p.card }, tap(0.95)(s)]}
          >
            <ArrowLeft size={18} color={p.text} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: p.sec }]}>SAFETY</Text>
            <Text style={[styles.h1, { color: p.text }]}>SOS Contacts</Text>
          </View>
          <Pressable
            onPress={() => setShowAddSheet(true)}
            disabled={atLimit}
            style={(s) => [styles.addBtn, atLimit ? { backgroundColor: p.soft } : [{ backgroundColor: ACCENT }, SH], tap(0.9)(s)]}
          >
            <Plus size={13} strokeWidth={3} color={atLimit ? p.sec : INK} />
            <Text style={[styles.addText, { color: atLimit ? p.sec : INK }]}>ADD</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* SOS trigger */}
        <FadeUp distance={10}>
          <LinearGradient colors={[colors.red[500], colors.red[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sosCard}>
            <View style={styles.sosHead}>
              <ShieldAlert size={22} color={p.text} strokeWidth={2} />
              <View>
                <Text style={[styles.sosTitle, { color: p.text }]}>Emergency SOS</Text>
                <Text style={styles.sosSub}>Alerts all your emergency contacts</Text>
              </View>
            </View>
            <Pressable
              onPress={triggerSOS}
              disabled={sosActive}
              style={(s) => [styles.sosBtn, SH, { backgroundColor: p.card }, tap(0.96)(s)]}
            >
              {sosActive ? (
                <>
                  <Text style={styles.countdown}>{countdown}</Text>
                  <Text style={styles.sosBtnText}>ALERTING CONTACTS...</Text>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} strokeWidth={2.5} color={colors.red[600]} />
                  <Text style={styles.sosBtnText}>TRIGGER SOS</Text>
                </>
              )}
            </Pressable>
          </LinearGradient>
        </FadeUp>

        <View>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionLabel, { color: p.sec }]}>EMERGENCY SERVICES</Text>
            <Text style={[styles.sectionRight, { color: p.sec }]}>Quick call</Text>
          </View>
          <View style={{ gap: 10 }}>
            {EMERGENCY_SERVICES.map((service) => (
              <Pressable
                key={service.id}
                onPress={() => Linking.openURL(`tel:${service.phone}`).catch(() => {})}
                style={(s) => [styles.card, CARD_SHADOW, { borderColor: p.border, backgroundColor: p.card }, tap(0.98)(s)]}
              >
                <View style={styles.row}>
                  <View style={[styles.serviceIcon, { backgroundColor: p.soft, borderColor: service.accent.border }]}>
                    <Phone size={15} strokeWidth={2.5} color={service.accent.fg} />
                  </View>
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: p.text }]}>{service.label}</Text>
                    <Text style={[styles.cardSub, { color: p.sec }]}>Call {service.phone}</Text>
                  </View>
                  <View style={[styles.phonePill, { backgroundColor: p.card }]}>
                    <Text style={[styles.phonePillText, { color: p.text }]}>{service.phone}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Contacts list */}
        <View>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionLabel, { color: p.sec }]}>EMERGENCY CONTACTS</Text>
            <Text style={[styles.sectionRight, { color: p.sec }]}>{contacts.length}/{MAX_CONTACTS}</Text>
          </View>

          {loadingContacts && (
            <Text style={[styles.loadingText, { color: p.sec }]}>Loading contacts...</Text>
          )}

          {!loadingContacts && contacts.length === 0 && (
            <View style={[styles.emptyCard, CARD_SHADOW, { borderColor: p.border, backgroundColor: p.card }]}>
              <ShieldAlert size={32} color={p.sec} strokeWidth={1.5} />
              <Text style={[styles.emptyText, { color: p.muted }]}>Add emergency contacts to stay safe</Text>
            </View>
          )}

          <View style={{ gap: 8 }}>
            {contacts.map((c, i) => (
              <FadeUp key={c.id} delay={i * 50} style={[styles.card, styles.row, CARD_SHADOW, { borderColor: p.border, backgroundColor: p.card }]}>
                <View style={[styles.avatar, { backgroundColor: p.soft }]}>
                  <Text style={styles.avatarText}>{c.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.cardTitle, { color: p.text }]}>{c.name}</Text>
                  <Text style={[styles.cardSub, { color: p.sec }]}>+91 {c.phone}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    onPress={() => Linking.openURL(`tel:+91${c.phone}`).catch(() => {})}
                    style={(s) => [styles.roundBtn, { backgroundColor: p.soft, borderColor: colors.emerald[100] }, tap(0.9)(s)]}
                  >
                    <Phone size={13} color={colors.emerald[500]} strokeWidth={2.5} />
                  </Pressable>
                  <Pressable
                    onPress={() => setDeleteTarget(c)}
                    style={(s) => [styles.roundBtn, { backgroundColor: p.soft, borderColor: colors.red[100] }, tap(0.9)(s)]}
                  >
                    <Trash2 size={13} color={colors.red[400]} strokeWidth={2} />
                  </Pressable>
                </View>
              </FadeUp>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Add contact bottom sheet */}
      <Sheet open={showAddSheet} onClose={() => setShowAddSheet(false)} style={[styles.sheet, { backgroundColor: p.card }]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
          <View style={[styles.handle, { backgroundColor: p.soft }]} />
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: p.text }]}>Add SOS Contact</Text>
            <Pressable onPress={() => setShowAddSheet(false)} style={[styles.closeBtn, { backgroundColor: p.card }]}>
              <X size={15} color={p.muted} strokeWidth={2.5} />
            </Pressable>
          </View>
          <View style={{ gap: 16 }}>
            <View>
              <Text style={[styles.label, { color: p.sec }]}>NAME</Text>
              <View style={[styles.fieldBox, fieldBox('name')]}>
                <User size={16} color={p.sec} strokeWidth={2} />
                <TextInput
                  value={name}
                  onChangeText={(value) => { setName(value); setErrors((prev) => ({ ...prev, name: '' })); }}
                  placeholder="Contact name"
                  placeholderTextColor={colors.slate[300]}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused('')}
                  style={[styles.input, { color: p.text }]}
                />
              </View>
              {errors.name ? <Text style={styles.errMsg}>{errors.name}</Text> : null}
            </View>
            <View>
              <Text style={[styles.label, { color: p.sec }]}>MOBILE NUMBER</Text>
              <View style={[styles.fieldBox, fieldBox('phone')]}>
                <Phone size={16} color={p.sec} strokeWidth={2} />
                <TextInput
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(value) => { setPhone(value.replace(/\D/g, '')); setErrors((prev) => ({ ...prev, phone: '' })); }}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={colors.slate[300]}
                  onFocus={() => setFocused('phone')}
                  onBlur={() => setFocused('')}
                  style={[styles.input, { color: p.text }]}
                />
                {PHONE_REGEX.test(phone) && <CheckCircle2 size={16} color={colors.emerald[500]} strokeWidth={2.5} />}
              </View>
              {errors.phone ? <Text style={styles.errMsg}>{errors.phone}</Text> : null}
            </View>
            <Pressable
              onPress={handleAdd}
              disabled={saving}
              style={(s) => [styles.saveBtn, SH, tap(0.97)(s)]}
            >
              {saving ? <Spin><View style={styles.ring} /></Spin> : <Text style={styles.saveText}>SAVE CONTACT</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>

      {/* Delete confirm modal */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} style={[styles.dialog, SH, { backgroundColor: p.card }]}>
        <View style={[styles.dialogIcon, { backgroundColor: p.soft }]}>
          <Trash2 size={24} color={colors.red[400]} strokeWidth={2} />
        </View>
        <Text style={[styles.dialogTitle, { color: p.text }]}>Remove contact?</Text>
        <Text style={[styles.dialogText, { color: p.sec }]}>{deleteTarget?.name} will be removed from your SOS list.</Text>
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={() => deleteTarget && handleDelete(deleteTarget.id)}
            style={(s) => [styles.removeBtn, tap(0.97)(s)]}
          >
            <Text style={[styles.removeText, { color: p.text }]}>REMOVE</Text>
          </Pressable>
          <Pressable onPress={() => setDeleteTarget(null)} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: p.sec }]}>CANCEL</Text>
          </Pressable>
        </View>
      </Dialog>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
    zIndex: 20,
    borderBottomWidth: 1,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', letterSpacing: 2.7 },
  h1: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.47 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  addText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1 },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 16 },
  sosCard: {
    borderRadius: 24,
    padding: 20,
    elevation: 8,
    shadowColor: '#ef4444',
    shadowOpacity: 0.25,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
  },
  sosHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sosTitle: { fontSize: 14, lineHeight: 17, fontWeight: '700' },
  sosSub: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.red[100] },
  sosBtn: { width: '100%', paddingVertical: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sosBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4, color: colors.red[600] },
  countdown: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.red[600] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.6 },
  sectionRight: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  card: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  serviceIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, lineHeight: 17, fontWeight: '700' },
  cardSub: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 2 },
  phonePill: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6 },
  phonePillText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.5 },
  loadingText: { paddingVertical: 24, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  emptyCard: { borderRadius: 20, borderWidth: 1, padding: 32, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.red[500] },
  roundBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetBody: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 9999, alignSelf: 'center', marginBottom: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.1, marginLeft: 4, marginBottom: 4 },
  fieldBox: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 2 },
  input: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 0 },
  errMsg: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.red[500], marginLeft: 4, marginTop: 4 },
  saveBtn: { width: '100%', backgroundColor: ACCENT, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveText: { fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 1.4, color: INK },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#ffffff' },
  dialog: { width: '82%', maxWidth: 384, borderRadius: 28, padding: 28, alignItems: 'stretch' },
  dialogIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16 },
  dialogTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  dialogText: { fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center', marginBottom: 24 },
  removeBtn: { width: '100%', backgroundColor: colors.red[500], paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  removeText: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 1.3 },
  cancelBtn: { width: '100%', paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 1.3 },
});

export default SOSContacts;
