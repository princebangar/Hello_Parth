// Web: pages/restaurant/EditCuisines.jsx (/food/restaurant/edit-cuisines) — "Edit restaurant cuisines": search box,
// the "Recommended / PRE APPROVED" block and the other cuisines with check boxes (max 8, a bubble says so), and the
// fixed "Update Cuisines" button -> PATCH restaurantAPI.updateProfile({ cuisines }), saved to localStorage
// `restaurant_cuisines` too, `cuisinesUpdated` window event, back. Loads restaurantAPI.getCurrentRestaurant() on mount
// (falls back to localStorage, then to the web's DEFAULT_SELECTED list, exactly like the web).
// Native:
// - The list is a KeyboardAwareScrollView (the search box sits at its top); the fixed Update bar rides on the keyboard
//   (useKeyboardOffset) like the web's fixed bottom bar above the browser keyboard.
// - The error bubble sits above the bar (web: fixed bottom-24).
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, Search } from 'lucide-react-native';
import { useNavigate } from '@/lib/router';
import { KeyboardAwareScrollView, Screen, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { colors, restaurantTheme, shadow, sp } from '@/theme';
import useKeyboardOffset from '@/modules/Taxi/shared/hooks/useKeyboardOffset';
import { restaurantAPI } from '@food/api';

const CUISINES_STORAGE_KEY = 'restaurant_cuisines';

const ALL_CUISINES = [
  'Burger',
  'Chinese',
  'Momos',
  'North Indian',
  'Pizza',
  'Rolls',
  'Sandwich',
  'Shawarma',
  'South Indian',
  'Biryani',
  'Desserts',
  'Ice Cream',
  'Fast Food',
  'Cafe',
  'Italian',
  'Mexican',
  'Thai',
  'Seafood',
  'Salad',
  'Healthy Food',
  'Juices',
  'Beverages',
  'Punjabi',
  'Gujarati',
  'Rajasthani',
  'Mughlai',
  'Street Food',
  'Bakery',
];

const DEFAULT_SELECTED = ['Burger', 'Chinese', 'Momos', 'North Indian', 'Pizza', 'Rolls', 'Sandwich', 'Shawarma'];

const BAR_H = 80; // px-4 py-4 + h-12 button

function CheckBox({ checked, borderColor }) {
  return (
    <View style={[styles.box, { borderColor }]}>
      {checked ? (
        <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      ) : null}
      {checked ? <Check size={12} color={colors.white} /> : null}
    </View>
  );
}

export default function EditCuisines() {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Fetch current cuisines from backend
  useEffect(() => {
    const loadFromStorage = () => {
      try {
        const saved = localStorage.getItem(CUISINES_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length) {
            setSelected(parsed);
          } else {
            setSelected(DEFAULT_SELECTED);
          }
        } else {
          setSelected(DEFAULT_SELECTED);
        }
      } catch (e) {
        console.error('Error loading cuisines from localStorage:', e);
        setSelected(DEFAULT_SELECTED);
      }
    };

    const fetchCuisines = async () => {
      try {
        setLoading(true);
        const response = await restaurantAPI.getCurrentRestaurant();
        const data = response?.data?.data?.restaurant || response?.data?.restaurant;
        if (data?.cuisines && Array.isArray(data.cuisines) && data.cuisines.length > 0) {
          setSelected(data.cuisines);
        } else {
          // Fallback to localStorage
          loadFromStorage();
        }
      } catch (err) {
        console.error('Error fetching cuisines:', err);
        // Fallback to localStorage
        loadFromStorage();
      } finally {
        setLoading(false);
      }
    };

    fetchCuisines();
  }, []);

  // the "max 8" bubble hides itself after 2.5 s
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 2500);
    return () => clearTimeout(t);
  }, [error]);

  const handleToggle = (name) => {
    const isSelected = selected.includes(name);
    if (!isSelected && selected.length >= 8) {
      setError('You cannot select more than 8 cuisines');
      return;
    }
    setSelected((prev) => (isSelected ? prev.filter((c) => c !== name) : [...prev, name]));
  };

  const handleUpdate = async () => {
    try {
      // Save to backend API
      const response = await restaurantAPI.updateProfile({ cuisines: selected });

      if (response?.data?.data?.restaurant) {
        // Also save to localStorage as backup
        try {
          localStorage.setItem(CUISINES_STORAGE_KEY, JSON.stringify(selected));
          window.dispatchEvent(new Event('cuisinesUpdated'));
        } catch (e) {
          console.error('Error saving cuisines to localStorage:', e);
        }
        navigate(-1);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      console.error('Error updating cuisines:', err);
    }
  };

  const filtered = ALL_CUISINES.filter((name) => name.toLowerCase().includes(search.toLowerCase()));
  const recommendedSet = new Set(DEFAULT_SELECTED);
  const others = filtered.filter((name) => !recommendedSet.has(name));
  const disabled = selected.length === 0;
  const barBottom = keyboardOffset;
  const barPadBottom = keyboardOffset ? sp(4) : sp(4) + insets.bottom;

  return (
    <Screen bg={colors.white} edges={[]} statusBarStyle="dark">
      {/* Header */}
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigate(-1)} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={24} color={restaurantTheme.brand} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit restaurant cuisines</Text>
        </View>
      </View>

      {/* Body */}
      <KeyboardAwareScrollView style={styles.flex} contentContainerStyle={[styles.body, { paddingBottom: BAR_H + insets.bottom + sp(5) }]}>
        {/* Search */}
        <View style={styles.searchWrap}>
          <View pointerEvents="none" style={styles.searchIcon}>
            <Search size={16} color={colors.gray[400]} />
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search cuisines"
            placeholderTextColor={colors.gray[400]}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={[styles.searchInput, searchFocused && { borderColor: restaurantTheme.focusBorder }]}
          />
        </View>

        {/* Recommended block */}
        <View style={styles.recommended}>
          <View style={styles.recHead}>
            <Text style={styles.recTitle}>Recommended</Text>
            <View style={styles.preBadge}>
              <Text style={styles.preBadgeText}>PRE APPROVED</Text>
            </View>
          </View>
          <Text style={styles.recSub}>These cuisines will be updated instantly</Text>

          {filtered
            .filter((name) => recommendedSet.has(name))
            .map((name) => {
              const isSelected = selected.includes(name);
              return (
                <Pressable key={name} onPress={() => handleToggle(name)} style={styles.recRow}>
                  <Text style={styles.rowText}>{name}</Text>
                  <CheckBox checked={isSelected} borderColor={restaurantTheme.brand} />
                </Pressable>
              );
            })}
        </View>

        {/* Other cuisines */}
        <View style={styles.others}>
          {others.map((name, idx, arr) => {
            const isSelected = selected.includes(name);
            return (
              <Pressable
                key={name}
                onPress={() => handleToggle(name)}
                style={[styles.otherRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.gray[100] }]}
              >
                <Text style={styles.rowText}>{name}</Text>
                <CheckBox checked={isSelected} borderColor={colors.black} />
              </Pressable>
            );
          })}
        </View>
      </KeyboardAwareScrollView>

      {/* Error bubble */}
      {error ? (
        <View pointerEvents="none" style={[styles.bubbleWrap, { bottom: barBottom + sp(24) + (keyboardOffset ? 0 : insets.bottom) }]}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{error}</Text>
          </View>
        </View>
      ) : null}

      {/* Update button */}
      <View style={[styles.bar, { bottom: barBottom, paddingBottom: barPadBottom }]}>
        <Pressable
          onPress={handleUpdate}
          disabled={disabled}
          style={({ pressed }) => [styles.updateBtn, disabled ? styles.updateBtnOff : styles.updateBtnOn, pressed && !disabled && { transform: [{ scale: 0.98 }] }]}
        >
          {!disabled ? (
            <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          ) : null}
          <Text style={[styles.updateText, { color: disabled ? colors.gray[500] : colors.white }]}>Update Cuisines</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 50 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  body: { paddingHorizontal: sp(4), paddingTop: sp(4), gap: sp(4) },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: sp(3), top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  searchInput: {
    width: '100%',
    height: 40,
    paddingLeft: sp(9),
    paddingRight: sp(3),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray[300],
    fontSize: 14,
    color: colors.gray[900],
    backgroundColor: colors.white,
  },
  recommended: { backgroundColor: colors.blue[50], borderRadius: 14, paddingHorizontal: sp(4), paddingVertical: sp(3) },
  recHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(1) },
  recTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.gray[900] },
  preBadge: { backgroundColor: colors.green[600], paddingHorizontal: sp(2), paddingVertical: 2, borderRadius: 4 },
  preBadgeText: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.white },
  recSub: { fontSize: 12, lineHeight: 16, color: colors.gray[600], marginBottom: sp(2) },
  recRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: sp(2) },
  rowText: { fontSize: 14, lineHeight: 20, color: colors.gray[900] },
  others: { borderRadius: 14, borderWidth: 1, borderColor: colors.gray[200] },
  otherRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: sp(2), paddingHorizontal: sp(4) },
  box: { width: 20, height: 20, borderWidth: 1, borderRadius: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, overflow: 'hidden' },
  bubbleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 60 },
  bubble: {
    backgroundColor: colors.white,
    borderRadius: 9999,
    paddingHorizontal: sp(4),
    paddingVertical: sp(2),
    borderWidth: 1,
    borderColor: colors.gray[200],
    ...shadow.lg,
  },
  bubbleText: { fontSize: 12, lineHeight: 16, color: colors.gray[900] },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingHorizontal: sp(4),
    paddingTop: sp(4),
  },
  updateBtn: { width: '100%', height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...shadow.lg },
  updateBtnOn: { shadowColor: restaurantTheme.brand, shadowOpacity: 0.2 },
  updateBtnOff: { backgroundColor: colors.gray[200] },
  updateText: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
});
