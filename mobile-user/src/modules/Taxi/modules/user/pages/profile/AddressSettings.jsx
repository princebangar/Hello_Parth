// Web: modules/Taxi/modules/user/pages/profile/AddressSettings.jsx — Home / Work / landmarks saved on this device
// (localStorage "helloparth:savedAddresses"), edit sheet and delete confirm.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Briefcase, Home, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { Dialog, Screen, Sheet, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { alpha, colors } from '@/theme';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const STORAGE_KEY = 'helloparth:savedAddresses';

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const defaultState = {
  home: {
    label: 'Home',
    address: '',
    landmark: '',
    notes: '',
  },
  work: null,
  landmarks: [],
};

const PLACEHOLDER = colors.slate[300];
const SOFT_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.07, shadowRadius: 17, shadowOffset: { width: 0, height: 14 } };
const SMALL_SHADOW = { elevation: 2, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 10 } };
const PRIMARY_SHADOW = { elevation: 6, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 17, shadowOffset: { width: 0, height: 16 } };
const DELETE_SHADOW = { elevation: 6, shadowColor: '#e11d48', shadowOpacity: 0.22, shadowRadius: 17, shadowOffset: { width: 0, height: 16 } };

const tap = (scale) => ({ pressed }) => (pressed ? { transform: [{ scale }] } : null);

const Field = ({ label, children, P }) => (
  <View style={{ gap: 6 }}>
    <Text style={[styles.fieldLabel, { color: P.textSecondary }]}>{String(label).toUpperCase()}</Text>
    {children}
  </View>
);

const PrimaryButton = ({ children, onPress, P }) => (
  <Pressable onPress={onPress} style={(s) => [styles.btn, PRIMARY_SHADOW, { backgroundColor: P.accent }, tap(0.95)(s)]}>
    {children}
  </Pressable>
);

const SecondaryButton = ({ children, onPress, P }) => (
  <Pressable onPress={onPress} style={(s) => [styles.btn, SMALL_SHADOW, { backgroundColor: P.cardBg, borderWidth: 1, borderColor: P.border }, tap(0.95)(s)]}>
    {children}
  </Pressable>
);

const BtnText = ({ color, children }) => <Text style={[styles.btnText, { color }]}>{children}</Text>;

const AddressCard = ({ icon: Icon, title, subtitle, accentColor, onEdit, onDelete, isEmpty, P }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Animated.View
      onTouchStart={() => to(0.985)}
      onTouchEnd={() => to(1)}
      onTouchCancel={() => to(1)}
      style={[styles.addrCard, SOFT_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border, transform: [{ scale }] }]}
    >
      <View style={[styles.iconBox, USER_SHADOW, { borderColor: P.border, backgroundColor: P.cardBg }]}>
        <Icon size={22} strokeWidth={2.6} color={accentColor} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text style={[styles.cardTitle, { color: P.textPrimary }]}>{title}</Text>
            <Text
              numberOfLines={1}
              style={[styles.cardSub, isEmpty ? { color: P.textSecondary, fontStyle: 'italic' } : { color: P.textMuted }]}
            >
              {subtitle}
            </Text>
          </View>

          <View style={[styles.row, { gap: 8 }]}>
            <Pressable
              onPress={onEdit}
              accessibilityLabel={`Edit ${title}`}
              style={(s) => [styles.roundBtn, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }, tap(0.95)(s)]}
            >
              <Pencil size={16} strokeWidth={2.8} color={P.textMuted} />
            </Pressable>
            {!isEmpty && (
              <Pressable
                onPress={onDelete}
                accessibilityLabel={`Delete ${title}`}
                style={(s) => [styles.roundBtn, USER_SHADOW, { backgroundColor: P.cardSoft, borderColor: colors.rose[100] }, tap(0.95)(s)]}
              >
                <Trash2 size={16} strokeWidth={2.6} color={colors.rose[500]} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const ModalShell = ({ open, title, subtitle, onClose, children, P }) => {
  const insets = useSafeAreaInsets();
  return (
    <Sheet open={open} onClose={onClose} backdropOpacity={0.55} style={styles.sheet}>
      <View style={[styles.modalCard, USER_SHADOW, { borderColor: P.border, backgroundColor: P.cardBg }]}>
        <View style={[styles.modalHead, { borderBottomColor: alpha('#ffffff', 0.7), backgroundColor: alpha('#ffffff', 0.6) }]}>
          <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={[styles.modalTitle, { color: P.textPrimary }]}>{title}</Text>
              {subtitle ? <Text style={[styles.modalSub, { color: P.textMuted }]}>{subtitle}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              style={(s) => [styles.closeBtn, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }, tap(0.95)(s)]}
            >
              <X size={18} strokeWidth={2.8} color={P.textMuted} />
            </Pressable>
          </View>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: Math.max(20, insets.bottom) }}
        >
          {children}
        </ScrollView>
      </View>
    </Sheet>
  );
};

const AddressSettings = () => {
  const navigate = useNavigate();
  const P = useUserPalette();
  const [data, setData] = useState(defaultState);
  const [modal, setModal] = useState(null); // { mode: 'home'|'work'|'landmark', id?: string }
  const [confirmDelete, setConfirmDelete] = useState(null); // { mode: 'home'|'work'|'landmark', id?: string, title: string }
  const [focused, setFocused] = useState('');

  const draftDefaults = useMemo(() => {
    const mode = modal?.mode;
    if (!mode) return null;
    if (mode === 'home') return data.home || defaultState.home;
    if (mode === 'work') return data.work || { label: 'Work', address: '', landmark: '', notes: '' };
    if (mode === 'landmark') {
      const existing = data.landmarks.find((l) => l.id === modal.id);
      return existing || { id: createId(), label: '', address: '', landmark: '', notes: '' };
    }
    return null;
  }, [data, modal]);

  const [draft, setDraft] = useState(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') setData({ ...defaultState, ...parsed });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [data]);

  useEffect(() => {
    if (!draftDefaults) {
      setDraft(null);
      return;
    }
    setDraft(draftDefaults);
  }, [draftDefaults]);

  const closeModal = () => setModal(null);

  const openEdit = (mode, id) => setModal({ mode, id });

  const saveDraft = () => {
    if (!modal || !draft) return;

    if (modal.mode === 'home') {
      setData((prev) => ({ ...prev, home: { ...prev.home, ...draft, label: 'Home' } }));
      closeModal();
      return;
    }

    if (modal.mode === 'work') {
      setData((prev) => ({ ...prev, work: { ...draft, label: 'Work' } }));
      closeModal();
      return;
    }

    if (modal.mode === 'landmark') {
      if (!draft.label.trim() || !draft.address.trim()) return;
      setData((prev) => {
        const exists = prev.landmarks.some((l) => l.id === draft.id);
        const nextLandmarks = exists
          ? prev.landmarks.map((l) => (l.id === draft.id ? { ...draft } : l))
          : [{ ...draft }, ...prev.landmarks];
        return { ...prev, landmarks: nextLandmarks };
      });
      closeModal();
    }
  };

  const doDelete = () => {
    if (!confirmDelete) return;

    if (confirmDelete.mode === 'home') {
      setData((prev) => ({ ...prev, home: { ...prev.home, address: '', landmark: '', notes: '' } }));
    } else if (confirmDelete.mode === 'work') {
      setData((prev) => ({ ...prev, work: null }));
    } else if (confirmDelete.mode === 'landmark') {
      setData((prev) => ({ ...prev, landmarks: prev.landmarks.filter((l) => l.id !== confirmDelete.id) }));
    }

    setConfirmDelete(null);
  };

  const homeSubtitle = data.home?.address?.trim() ? data.home.address : 'Add your home address';
  const workSubtitle = data.work?.address?.trim() ? data.work.address : 'Add your office address';
  const hasLandmarks = data.landmarks.length > 0;

  // index.css: a focused input gets the theme's gold border + 1px ring
  const inputStyle = (key, extra) => [
    styles.input,
    USER_SHADOW,
    { backgroundColor: P.cardBg, borderColor: P.border, color: P.textPrimary },
    focused === key && { borderColor: P.accent, borderWidth: 2, paddingHorizontal: 15 },
    extra,
  ];
  const focusProps = (key) => ({ onFocus: () => setFocused(key), onBlur: () => setFocused((f) => (f === key ? '' : f)) });
  const modalOpen = Boolean(modal && draft);

  return (
    <Screen bg={P.bg} edges={['bottom']}>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, SMALL_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: alpha('#ffffff', 0.7) }]}>
        <Pressable onPress={() => navigate('/taxi/user/profile')} style={(s) => [styles.back, tap(0.95)(s)]}>
          <ArrowLeft size={22} color={P.textPrimary} strokeWidth={3} />
        </Pressable>
        <View style={{ minWidth: 0 }}>
          <Text style={[styles.kicker, { color: P.textSecondary }]}>PROFILE</Text>
          <Text numberOfLines={1} style={[styles.h1, { color: P.textPrimary }]}>Addresses</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 12 }}>
          <AddressCard
            icon={Home}
            title="Home"
            subtitle={homeSubtitle}
            accentColor={colors.orange[600]}
            isEmpty={!data.home?.address?.trim()}
            onEdit={() => openEdit('home')}
            onDelete={() => setConfirmDelete({ mode: 'home', title: 'Home address' })}
            P={P}
          />
          <AddressCard
            icon={Briefcase}
            title="Work"
            subtitle={workSubtitle}
            accentColor={colors.indigo[600]}
            isEmpty={!data.work?.address?.trim()}
            onEdit={() => openEdit('work')}
            onDelete={() => setConfirmDelete({ mode: 'work', title: 'Work address' })}
            P={P}
          />
        </View>

        <View style={{ gap: 12 }}>
          <View style={[styles.rowBetween, { alignItems: 'flex-end', paddingHorizontal: 4 }]}>
            <View>
              <Text style={[styles.kicker, { color: P.textSecondary }]}>LANDMARKS</Text>
              <Text style={[styles.sectionTitle, { color: P.textPrimary }]}>Saved places</Text>
            </View>
            <Pressable
              onPress={() => openEdit('landmark')}
              style={(s) => [styles.addBtn, SMALL_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }, tap(0.95)(s)]}
            >
              <Plus size={14} strokeWidth={3} color={P.textSecondary} />
              <Text style={[styles.addText, { color: P.textSecondary }]}>Add</Text>
            </Pressable>
          </View>

          {hasLandmarks ? (
            <View style={[styles.listCard, SOFT_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}>
              {data.landmarks.map((lm, index) => (
                <View
                  key={lm.id}
                  style={[
                    styles.lmRow,
                    index < data.landmarks.length - 1 && { borderBottomWidth: 1, borderBottomColor: alpha('#ffffff', 0.7) },
                  ]}
                >
                  <View style={[styles.lmIcon, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}>
                    <MapPin size={18} strokeWidth={2.6} color={P.textMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.lmLabel, { color: P.textPrimary }]}>{lm.label}</Text>
                    <Text numberOfLines={1} style={[styles.cardSub, { color: P.textMuted }]}>{lm.address}</Text>
                  </View>
                  <View style={[styles.row, { gap: 8 }]}>
                    <Pressable
                      onPress={() => openEdit('landmark', lm.id)}
                      accessibilityLabel={`Edit ${lm.label}`}
                      style={(s) => [styles.roundBtn, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }, tap(0.95)(s)]}
                    >
                      <Pencil size={16} strokeWidth={2.8} color={P.textMuted} />
                    </Pressable>
                    <Pressable
                      onPress={() => setConfirmDelete({ mode: 'landmark', id: lm.id, title: lm.label })}
                      accessibilityLabel={`Delete ${lm.label}`}
                      style={(s) => [styles.roundBtn, USER_SHADOW, { backgroundColor: P.cardSoft, borderColor: colors.rose[100] }, tap(0.95)(s)]}
                    >
                      <Trash2 size={16} strokeWidth={2.6} color={colors.rose[500]} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyCard, SOFT_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}>
              <View style={[styles.iconBox, USER_SHADOW, { borderColor: P.border, backgroundColor: P.cardBg, alignSelf: 'center' }]}>
                <MapPin size={20} strokeWidth={2.6} color={P.textSecondary} />
              </View>
              <Text style={[styles.emptyTitle, { color: P.textPrimary }]}>No landmarks yet</Text>
              <Text style={[styles.emptySub, { color: P.textMuted }]}>
                Save places like “Gym”, “Mom’s house”, or “Office gate”.
              </Text>
              <View style={{ marginTop: 16 }}>
                <SecondaryButton onPress={() => openEdit('landmark')} P={P}>
                  <Plus size={14} strokeWidth={3} color={P.textPrimary} />
                  <BtnText color={P.textPrimary}>ADD LANDMARK</BtnText>
                </SecondaryButton>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <ModalShell
        open={modalOpen}
        P={P}
        title={
          modal?.mode === 'home'
            ? 'Edit home'
            : modal?.mode === 'work'
              ? 'Edit work'
              : modal?.id
                ? 'Edit landmark'
                : 'Add landmark'
        }
        subtitle={modal?.mode === 'landmark' ? 'Save a place for quick access.' : 'Update your saved address.'}
        onClose={closeModal}
      >
        {draft ? (
          <View style={{ gap: 16 }}>
            {modal?.mode === 'landmark' && (
              <Field label="Label" P={P}>
                <TextInput
                  value={draft.label}
                  onChangeText={(text) => setDraft((prev) => ({ ...prev, label: text }))}
                  placeholder="e.g., Gym, Office gate"
                  placeholderTextColor={PLACEHOLDER}
                  {...focusProps('label')}
                  style={inputStyle('label')}
                />
              </Field>
            )}

            <Field label="Address" P={P}>
              <TextInput
                value={draft.address}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, address: text }))}
                placeholder="Add full address"
                placeholderTextColor={PLACEHOLDER}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                {...focusProps('address')}
                style={inputStyle('address', styles.textarea)}
              />
            </Field>

            <Field label="Landmark (Optional)" P={P}>
              <TextInput
                value={draft.landmark}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, landmark: text }))}
                placeholder="Near…"
                placeholderTextColor={PLACEHOLDER}
                {...focusProps('landmark')}
                style={inputStyle('landmark')}
              />
            </Field>

            <Field label="Notes (Optional)" P={P}>
              <TextInput
                value={draft.notes}
                onChangeText={(text) => setDraft((prev) => ({ ...prev, notes: text }))}
                placeholder="e.g., Ring bell, call on arrival"
                placeholderTextColor={PLACEHOLDER}
                {...focusProps('notes')}
                style={inputStyle('notes')}
              />
            </Field>

            <View style={{ paddingTop: 8, gap: 10 }}>
              <PrimaryButton onPress={saveDraft} P={P}>
                <BtnText color={P.accentInk}>{modal?.mode === 'landmark' ? 'SAVE LANDMARK' : 'SAVE ADDRESS'}</BtnText>
              </PrimaryButton>
              <SecondaryButton onPress={closeModal} P={P}>
                <BtnText color={P.textPrimary}>CANCEL</BtnText>
              </SecondaryButton>
            </View>
          </View>
        ) : null}
      </ModalShell>

      <Dialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        backdropOpacity={0.55}
        style={[styles.confirm, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}
      >
        <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.confirmTitle, { color: P.textPrimary }]}>Delete</Text>
            <Text style={[styles.cardSub, { color: P.textMuted }]}>
              Remove <Text style={{ color: P.textPrimary }}>{confirmDelete?.title}</Text> from saved addresses?
            </Text>
          </View>
          <Pressable
            onPress={() => setConfirmDelete(null)}
            accessibilityLabel="Close"
            style={(s) => [styles.closeBtn, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }, tap(0.95)(s)]}
          >
            <X size={18} strokeWidth={2.8} color={P.textMuted} />
          </Pressable>
        </View>

        <View style={{ marginTop: 20, gap: 8 }}>
          <Pressable
            onPress={() => setConfirmDelete(null)}
            style={(s) => [styles.confirmBtn, USER_SHADOW, { backgroundColor: P.cardBg, borderWidth: 1, borderColor: P.border }, tap(0.95)(s)]}
          >
            <Text style={[styles.confirmBtnText, { color: P.textSecondary }]}>CANCEL</Text>
          </Pressable>
          <Pressable onPress={doDelete} style={(s) => [styles.confirmBtn, DELETE_SHADOW, { backgroundColor: colors.rose[600] }, tap(0.95)(s)]}>
            <Text style={[styles.confirmBtnText, { color: P.textPrimary }]}>DELETE</Text>
          </Pressable>
        </View>
      </Dialog>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, zIndex: 30 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { padding: 8, marginLeft: -8, borderRadius: 9999 },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.6 },
  h1: { marginTop: 4, fontSize: 18, lineHeight: 18, fontWeight: '700', letterSpacing: -0.45 },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, gap: 20 },
  addrCard: { borderRadius: 22, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  iconBox: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, lineHeight: 15, fontWeight: '700' },
  cardSub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  roundBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { marginTop: 4, fontSize: 15, lineHeight: 22, fontWeight: '700', letterSpacing: -0.37 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 9999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  addText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  listCard: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  lmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  lmIcon: { width: 40, height: 40, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lmLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  emptyCard: { borderRadius: 22, borderWidth: 1, padding: 20, alignItems: 'stretch' },
  emptyTitle: { marginTop: 12, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  emptySub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' },
  btn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  btnText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 2.16 },
  sheet: { backgroundColor: 'transparent', padding: 12, overflow: 'visible', borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  modalCard: { maxHeight: 640, width: '100%', overflow: 'hidden', borderRadius: 28, borderWidth: 1 },
  modalHead: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4 },
  modalSub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 2.6 },
  input: { width: '100%', height: 48, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  textarea: { height: 96, paddingVertical: 12 },
  confirm: { maxWidth: 384, borderRadius: 26, borderWidth: 1, padding: 20 },
  confirmTitle: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  confirmBtn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  confirmBtnText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.92 },
});

export default AddressSettings;
