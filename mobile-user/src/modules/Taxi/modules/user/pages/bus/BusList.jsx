// Web: modules/Taxi/modules/user/pages/bus/BusList.jsx — search results for a route + date, sort / filter chips,
// change-date picker (<input type="date"> -> the native date dialog).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ArrowLeft, Check, ChevronRight, Clock3, Loader2, Star, SlidersHorizontal } from 'lucide-react-native';
import { useNavigate, useLocation, useBeforeLeave } from '@/lib/router';
import { Screen, StatusBarSpacer, Text } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import { alpha, colors } from '@/theme';
import userBusService from '../../services/busService';
import { buildBusRouteState, toPlainData } from './busNavigationState';
import { formatBusTime } from '../../utils/busTime';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const SORT_OPTIONS = [
  { id: 'recommended', label: 'Filter & Sort' },
  { id: 'price-asc', label: 'Price: Low to High' },
  { id: 'departure-asc', label: 'Early Departure' },
  { id: 'rating-desc', label: 'Top Rated' },
];

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const formatTravelDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
};

const formatDurationBrief = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'Direct';
  return raw
    .replace(/days?/gi, 'd')
    .replace(/hours?/gi, 'h')
    .replace(/hrs?/gi, 'h')
    .replace(/minutes?/gi, 'm')
    .replace(/mins?/gi, 'm')
    .replace(/\s+/g, ' ')
    .trim();
};

const getNumericValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getBusCompany = (bus) =>
  String(bus?.operator || bus?.busName || bus?.travels || bus?.company || '')
    .trim();

const getBusRating = (bus) => getNumericValue(bus?.rating, 0);
const getBusRatingCount = (bus) => getNumericValue(bus?.ratingCount, 0);
const hasBusRating = (bus) => getBusRatingCount(bus) > 0;
const isHighlyRatedBus = (bus) => hasBusRating(bus) && getBusRating(bus) >= 4.5;

const hasBusDeal = (bus) => {
  const searchableText = [
    bus?.cancellationPolicy,
    bus?.offerText,
    bus?.badge,
    Array.isArray(bus?.tags) ? bus.tags.join(' ') : bus?.tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes('free') || searchableText.includes('deal') || searchableText.includes('save');
};

const getDepartureSortValue = (bus) => {
  const raw = String(bus?.departure || '').trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;

  return (Number(match[1]) * 60) + Number(match[2]);
};

const keyToDate = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
};

const CARD_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } };
const MENU_SHADOW = { elevation: 12, shadowColor: '#0f172a', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 18 } };
const HEADER_SHADOW = { elevation: 3, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } };

// motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
const FadeIn = ({ delay = 0, children }) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
};

const BusList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { fromCity, toCity, date } = state;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buses, setBuses] = useState([]);
  const [sortBy, setSortBy] = useState('recommended');
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [showHighlyRatedOnly, setShowHighlyRatedOnly] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const touchInMenu = useRef(false);
  // a journey can be booked from today up to 90 days ahead (local dates)
  const dateKey = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const todayKey = dateKey(new Date());
  const maxDateKey = dateKey(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

  useEffect(() => {
    if (!fromCity || !toCity || !date) {
      navigate(`${routePrefix}/bus`, { replace: true });
      return;
    }

    let active = true;

    const loadResults = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await userBusService.searchBuses({ fromCity, toCity, date });
        if (!active) return;
        const results = Array.isArray(response?.data?.results) ? response.data.results : [];
        setBuses(Array.isArray(results) ? (toPlainData(results) || []) : []);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Failed to search buses');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadResults();
    return () => {
      active = false;
    };
  }, [date, fromCity, navigate, routePrefix, toCity]);

  // Escape closed the menu on the web; the back button does here.
  useBeforeLeave(() => {
    if (isSortMenuOpen) {
      setIsSortMenuOpen(false);
      return true;
    }
    return false;
  }, isSortMenuOpen);

  // A touch outside the chips + menu closes the menu (the web's document mousedown / touchstart listener).
  const onPageTouchStart = () => {
    if (isSortMenuOpen && !touchInMenu.current) setIsSortMenuOpen(false);
    touchInMenu.current = false;
  };

  const sortOption = useMemo(
    () => SORT_OPTIONS.find((option) => option.id === sortBy) || SORT_OPTIONS[0],
    [sortBy],
  );

  const busCompanies = useMemo(() => {
    const uniqueCompanies = Array.from(
      new Set(
        (Array.isArray(buses) ? buses : [])
          .map((bus) => getBusCompany(bus))
          .filter(Boolean),
      ),
    );

    return uniqueCompanies.sort((left, right) => left.localeCompare(right));
  }, [buses]);

  const visibleBuses = useMemo(() => {
    const nextBuses = Array.isArray(buses) ? [...buses] : [];
    const filteredBuses = nextBuses.filter((bus) => {
      if (showDealsOnly && !hasBusDeal(bus)) {
        return false;
      }

      if (showHighlyRatedOnly && !isHighlyRatedBus(bus)) {
        return false;
      }

      if (selectedCompany !== 'all' && getBusCompany(bus) !== selectedCompany) {
        return false;
      }

      return true;
    });

    if (sortBy === 'price-asc') {
      filteredBuses.sort(
        (left, right) => getNumericValue(left?.price, Number.MAX_SAFE_INTEGER) - getNumericValue(right?.price, Number.MAX_SAFE_INTEGER),
      );
    } else if (sortBy === 'departure-asc') {
      filteredBuses.sort((left, right) => getDepartureSortValue(left) - getDepartureSortValue(right));
    } else if (sortBy === 'rating-desc') {
      filteredBuses.sort((left, right) => {
        const ratingDelta = getBusRating(right) - getBusRating(left);
        if (ratingDelta !== 0) {
          return ratingDelta;
        }

        return getBusRatingCount(right) - getBusRatingCount(left);
      });
    }

    return filteredBuses;
  }, [buses, selectedCompany, showDealsOnly, showHighlyRatedOnly, sortBy]);

  const handleSelect = (bus) => {
    navigate(`${routePrefix}/bus/details`, {
      state: buildBusRouteState(state, { bus }),
    });
  };

  const handleSortSelect = (nextSortId) => {
    setSortBy(nextSortId);
    setIsSortMenuOpen(false);
  };

  const onDatePicked = (event, picked) => {
    setDatePickerOpen(false);
    if (!picked) return;
    const next = dateKey(picked);
    if (next && next !== date) navigate(location.pathname, { replace: true, state: { ...state, date: next } });
  };

  const card = { backgroundColor: P.cardBg, borderColor: P.border };

  const optionRow = (active, label, onPress, key) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ pressed }) => [styles.option, { backgroundColor: active ? P.accent : pressed ? P.cardBg : P.cardBg }]}
    >
      <Text numberOfLines={1} style={[styles.optionText, { color: active ? P.accentInk : P.textSecondary, flexShrink: 1, paddingRight: 12 }]}>{label}</Text>
      {active ? <Check size={14} color={P.accentInk} /> : null}
    </Pressable>
  );

  const header = (
    <View style={{ gap: 16 }}>
      {loading ? (
        <View style={[styles.stateCard, USER_SHADOW, card]}>
          <Spin style={{ alignSelf: 'center' }}>
            <Loader2 size={32} color={P.textSecondary} />
          </Spin>
          <Text style={[styles.loadingText, { color: P.textSecondary }]}>Finding available buses...</Text>
        </View>
      ) : null}

      {!loading && error ? (
        <View style={[styles.errorBox, { backgroundColor: P.cardSoft, borderColor: colors.rose[100] }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!loading && !error && visibleBuses.length === 0 ? (
        <View style={[styles.stateCard, USER_SHADOW, card, { alignItems: 'center' }]}>
          <Text style={[styles.emptyTitle, { color: P.textPrimary }]}>No buses found</Text>
          <Text style={[styles.emptyText, { color: P.textMuted }]}>
            {showDealsOnly || showHighlyRatedOnly || sortBy !== 'recommended' || selectedCompany !== 'all'
              ? 'Try changing your filters to see more buses.'
              : 'Try searching for a different date or route.'}
          </Text>
        </View>
      ) : null}

      {!loading && !error && buses.length > 0 ? (
        // (The three marketing tiles "Bus / Free Cancellation / Special Deals" were removed: they were not backed by any bus data.)
        <View
          style={{ paddingBottom: 4, zIndex: 20 }}
          onTouchStart={() => {
            touchInMenu.current = true;
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={[{ overflow: 'visible' }, { flexGrow: 0 }]}>
            <Pressable
              onPress={() => setIsSortMenuOpen((current) => !current)}
              style={[styles.chip, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}
            >
              <SlidersHorizontal size={14} color={isSortMenuOpen ? P.textPrimary : P.textSecondary} />
              <Text style={[styles.chipText, { color: isSortMenuOpen ? P.textPrimary : P.textSecondary }]}>{sortOption.label}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDealsOnly((current) => !current)}
              style={[
                styles.chip,
                USER_SHADOW,
                showDealsOnly ? { borderColor: colors.orange[200], backgroundColor: P.cardSoft } : { backgroundColor: P.cardBg, borderColor: P.border },
              ]}
            >
              <Text style={[styles.chipText, { color: showDealsOnly ? colors.orange[700] : P.textSecondary }]}>Deals</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowHighlyRatedOnly((current) => !current)}
              style={[
                styles.chip,
                USER_SHADOW,
                showHighlyRatedOnly ? { borderColor: colors.amber[200], backgroundColor: P.cardSoft } : { backgroundColor: P.cardBg, borderColor: P.border },
              ]}
            >
              <Text style={[styles.chipText, { color: showHighlyRatedOnly ? colors.amber[700] : P.textSecondary }]}>Highly Rated</Text>
            </Pressable>
          </ScrollView>

          {isSortMenuOpen ? (
            <View style={[styles.menu, MENU_SHADOW, card, { width: Math.min(320, screenWidth - 32) }]}>
              <Text style={[styles.menuLabel, { color: P.textSecondary }]}>SORT BUSES BY</Text>
              <View style={{ gap: 4 }}>
                {SORT_OPTIONS.map((option) => optionRow(sortBy === option.id, option.label, () => handleSortSelect(option.id), option.id))}
              </View>

              {busCompanies.length > 0 ? (
                <>
                  <View style={[styles.divider, { backgroundColor: P.cardSoft }]} />
                  <Text style={[styles.menuLabel, { color: P.textSecondary }]}>BUS COMPANY</Text>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 224 }} contentContainerStyle={{ gap: 4 }}>
                    {optionRow(selectedCompany === 'all', 'All companies', () => setSelectedCompany('all'), 'all')}
                    {busCompanies.map((company) => optionRow(selectedCompany === company, company, () => setSelectedCompany(company), company))}
                  </ScrollView>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const renderBus = ({ item: bus, index }) => {
    const rated = hasBusRating(bus);
    const topAmenities = Array.isArray(bus.amenities) ? bus.amenities.slice(0, 2) : [];

    return (
      <FadeIn delay={index * 50}>
        <Pressable
          onPress={() => handleSelect(bus)}
          style={({ pressed }) => [
            styles.busCard,
            CARD_SHADOW,
            { backgroundColor: P.cardBg, borderColor: alpha(colors.slate[200], 0.8) },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
            <View style={{ minWidth: 0, flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <Text style={[styles.time, { color: P.textPrimary }]}>{formatBusTime(bus.departure)}</Text>
                <Text style={[styles.arrow, { color: P.textSecondary }]}>→</Text>
                <Text style={[styles.time, { color: P.textSecondary }]}>{formatBusTime(bus.arrival)}</Text>
              </View>
              <Text style={[styles.meta, { color: P.textMuted, marginTop: 4 }]}>
                {formatDurationBrief(bus.duration)} {bus.availableSeats > 0 ? `• ${bus.availableSeats} Seats` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.time, { color: P.textPrimary }]}>₹{Number(bus.price || 0).toLocaleString('en-IN')}</Text>
              <Text style={[styles.onwards, { color: P.textSecondary }]}>Onwards</Text>
            </View>
          </View>

          <View style={[styles.metaRow, { marginTop: 12 }]}>
            <Clock3 size={13} color={P.textSecondary} />
            <Text style={[styles.meta, { color: P.textMuted }]}>{bus.type}</Text>
            <Text style={[styles.meta, { color: P.textMuted }]}>•</Text>
            <Text numberOfLines={1} style={[styles.meta, { color: P.textMuted, flexShrink: 1 }]}>{bus.busName || getBusCompany(bus)}</Text>
          </View>

          <View style={[styles.rowBetween, { marginTop: 12, gap: 12 }]}>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text numberOfLines={1} style={[styles.company, { color: P.textPrimary }]}>{getBusCompany(bus) || 'Bus Service'}</Text>
              <Text numberOfLines={1} style={[styles.meta, { color: P.textMuted, marginTop: 2 }]}>
                {topAmenities.length > 0 ? topAmenities.join(' • ') : (bus.routeName || `${fromCity} to ${toCity}`)}
              </Text>
            </View>
            {rated ? (
              <View style={[styles.ratingBadge, USER_SHADOW]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Star size={12} color={P.accentInk} fill={P.accentInk} />
                  <Text style={[styles.ratingText, { color: P.accentInk }]}>{getBusRating(bus).toFixed(1)}</Text>
                </View>
                <Text style={[styles.ratingCount, { color: P.accentInk }]}>{getBusRatingCount(bus)}</Text>
              </View>
            ) : (
              <View style={[styles.newBadge, { borderColor: colors.emerald[200], backgroundColor: P.cardSoft }]}>
                <Text style={[styles.tagText, { color: colors.emerald[700], fontWeight: '700' }]}>New</Text>
              </View>
            )}
          </View>

          <View style={[styles.tags, { marginTop: 12 }]}>
            {bus.availableSeats > 0 ? (
              <View style={[styles.tag, { backgroundColor: P.cardSoft }]}>
                <Text style={[styles.tagText, { color: colors.orange[600], fontWeight: '700' }]}>{bus.availableSeats} seats left</Text>
              </View>
            ) : null}
            {topAmenities.map((amenity) => (
              <View key={amenity} style={[styles.tag, { backgroundColor: P.cardSoft }]}>
                <Text style={[styles.tagText, { color: P.textSecondary }]}>{amenity}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.rowBetween, { marginTop: 12, gap: 12 }]}>
            <View style={[styles.tags, { flex: 1, minWidth: 0 }]}>
              {isHighlyRatedBus(bus) ? (
                <View style={[styles.tag, { backgroundColor: colors.pink[50] }]}>
                  <Text style={[styles.tagText, { color: colors.pink[600], fontWeight: '700' }]}>Highly rated</Text>
                </View>
              ) : null}
              {String(bus.cancellationPolicy || '').toLowerCase().includes('free') ? (
                <View style={[styles.tag, { backgroundColor: P.cardSoft }]}>
                  <Text style={[styles.tagText, { color: colors.emerald[600], fontWeight: '700' }]}>Free cancellation</Text>
                </View>
              ) : null}
              {!rated ? (
                <View style={[styles.tag, { backgroundColor: colors.sky[50] }]}>
                  <Text style={[styles.tagText, { color: colors.sky[700], fontWeight: '700' }]}>New</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.details, { color: P.textPrimary }]}>DETAILS</Text>
              <ChevronRight size={16} color={P.textPrimary} />
            </View>
          </View>
        </Pressable>
      </FadeIn>
    );
  };

  return (
    <Screen bg={P.bg} edges={[]}>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, HEADER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: alpha(colors.orange[100], 0.7) }]}>
        <View style={[styles.row, { gap: 12 }]}>
          <Pressable
            onPress={() => navigate(-1)}
            style={({ pressed }) => [styles.backBtn, USER_SHADOW, card, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={18} color={P.textPrimary} />
          </Pressable>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text numberOfLines={1} style={[styles.title, { color: P.textPrimary }]}>
              {fromCity} <Text style={{ color: P.textSecondary }}>→</Text> {toCity}
            </Text>
            <Text style={[styles.meta, { color: P.textMuted, marginTop: 2 }]}>{visibleBuses.length || 0} buses</Text>
          </View>
          <Pressable
            onPress={() => setDatePickerOpen(true)}
            accessibilityLabel="Change travel date"
            style={[styles.dateBox, { borderColor: colors.orange[100], backgroundColor: P.cardSoft }]}
          >
            <Text style={[styles.dateText, { color: P.accent }]}>{formatTravelDate(date).toUpperCase()}</Text>
            <Text style={styles.dateSub}>Change date</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={!loading && !error ? visibleBuses : []}
        keyExtractor={(bus, index) => String(bus?.id ?? index)}
        renderItem={renderBus}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ zIndex: 20, elevation: 20, marginBottom: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 + insets.bottom }}
        onTouchStart={onPageTouchStart}
        showsVerticalScrollIndicator={false}
      />

      {datePickerOpen ? (
        <DateTimePicker
          value={keyToDate(date)}
          mode="date"
          minimumDate={keyToDate(todayKey)}
          maximumDate={keyToDate(maxDateKey)}
          onValueChange={onDatePicked}
          onDismiss={() => setDatePickerOpen(false)}
        />
      ) : null}
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  dateBox: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' },
  dateText: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8 },
  dateSub: { fontSize: 10.5, lineHeight: 14, fontWeight: '600', color: colors.orange[400] },
  stateCard: { borderRadius: 24, borderWidth: 1, padding: 48 },
  loadingText: { marginTop: 16, textAlign: 'center', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  errorBox: { borderRadius: 16, borderWidth: 1, padding: 16 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.rose[600] },
  emptyTitle: { fontSize: 20, lineHeight: 28, fontWeight: '600', textAlign: 'center' },
  emptyText: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  menu: { position: 'absolute', left: 0, top: '100%', marginTop: 8, zIndex: 20, borderRadius: 20, borderWidth: 1, padding: 8 },
  menuLabel: { paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4, fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.8 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 },
  optionText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  divider: { marginHorizontal: 4, marginVertical: 8, height: 1 },
  busCard: { borderRadius: 24, borderWidth: 1, padding: 16 },
  time: { fontSize: 24, lineHeight: 26, fontWeight: '700' },
  arrow: { paddingBottom: 2, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  onwards: { marginTop: 4, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  company: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  ratingBadge: { borderRadius: 12, backgroundColor: colors.amber[400], paddingHorizontal: 10, paddingVertical: 6 },
  ratingText: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  ratingCount: { marginTop: 2, textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '600' },
  newBadge: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  tagText: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  details: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1.7 },
});

export default BusList;
