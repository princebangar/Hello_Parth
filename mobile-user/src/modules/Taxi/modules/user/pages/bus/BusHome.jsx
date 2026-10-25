// Web: modules/Taxi/modules/user/pages/bus/BusHome.jsx — bus search (From / To / date), popular routes, calendar sheet.
// Colours follow modules/Taxi/index.css's `.user-app-theme` remap (bg-white / bg-slate-50 / bg-slate-900 -> card,
// a dark <button> -> yellow accent, slate text -> --user-text-*), see UserThemeContext.userPalette.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, BusFront, ArrowRightLeft, Loader2, Route, MapPin, Search, X } from 'lucide-react-native';
import { useNavigate, useLocation } from '@/lib/router';
import { Screen, Sheet, StatusBarSpacer, Text, TextInput } from '@/native/ui';
import { Spin } from '@/shared/components/Loader';
import NumberSkeleton from '@/shared/components/NumberSkeleton';
import { recallLastKnown, rememberLastKnown } from '@/shared/utils/lastKnown';
import { colors } from '@/theme';
import { localDateKey } from '../../../../shared/utils/localDate';
import userBusService from '../../services/busService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { USER_SHADOW, useUserPalette } from '../../../../shared/context/UserThemeContext';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const getDateOffset = (offset = 1) => localDateKey(offset);

const getTodayDate = () => getDateOffset(0);

const getTomorrowDate = () => getDateOffset(1);

const formatDateKey = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextWeekendDate = () => {
  const date = new Date();
  const day = date.getDay();

  if (day === 6 || day === 0) {
    return formatDateKey(date);
  }

  const daysUntilSaturday = (6 - day + 7) % 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return formatDateKey(date);
};

const getMonthStart = (value) => new Date(value.getFullYear(), value.getMonth(), 1);

const addMonths = (value, amount) => new Date(value.getFullYear(), value.getMonth() + amount, 1);

const buildCalendarDays = (monthDate) => {
  const start = getMonthStart(monthDate);
  const startOffset = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(gridStart);
    value.setDate(gridStart.getDate() + index);
    return value;
  });
};

const formatTravelDate = (value) => {
  if (!value) return '';

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const normalizeCity = (value = '') => value.trim().toLowerCase();
const getListKey = (value, index, prefix) => `${String(value || '').trim() || prefix}-${index}`;
const getRouteKey = (route, index) => {
  const fromCity = String(route?.fromCity || '').trim();
  const toCity = String(route?.toCity || '').trim();
  const operatorName = String(route?.operatorName || '').trim();
  // the index keeps keys unique when one operator runs the same route twice (React warned about duplicate keys)
  return `${fromCity || `from`}-${toCity || 'to'}-${operatorName || 'op'}-${index}`;
};

// The route list (and so the Routes / Cities counts and Popular Routes) is remembered: a later visit shows it at once and
// refreshes it quietly. The very first time the counts show a skeleton, never a "0" that then jumps.
const BUS_ROUTES_KEY = 'taxi:bus:routes';
const rememberedRoutes = () => {
  const routes = recallLastKnown(BUS_ROUTES_KEY);
  return Array.isArray(routes) ? routes : null;
};

const PLACEHOLDER = colors.slate[300];
const tap = (scale) => ({ pressed }) => (pressed ? { transform: [{ scale }] } : null);

// <datalist id="bus-route-cities">: the browser listed the matching route cities under the focused field.
const CitySuggestions = ({ visible, options, value, onPick, P }) => {
  if (!visible) return null;
  const typed = normalizeCity(value);
  const list = options.filter((city) => (!typed ? true : normalizeCity(city).includes(typed) && normalizeCity(city) !== typed));
  if (!list.length) return null;
  return (
    <View style={[styles.suggestBox, USER_SHADOW, { backgroundColor: P.cardBg, borderColor: P.border }]}>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
        {list.map((city, index) => (
          <Pressable
            key={getListKey(city, index, 'city')}
            onPress={() => onPick(city)}
            style={({ pressed }) => [styles.suggestRow, { borderBottomColor: P.border }, pressed && { backgroundColor: P.cardSoft }]}
          >
            <Text style={[styles.suggestText, { color: P.textPrimary }]}>{city}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const BusHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const P = useUserPalette();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);

  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [date, setDate] = useState(getTodayDate());
  const [error, setError] = useState('');
  const [routeSuggestions, setRouteSuggestions] = useState(() => rememberedRoutes() || []);
  const [routesKnown, setRoutesKnown] = useState(() => Boolean(rememberedRoutes()));
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(new Date(getTomorrowDate())));
  const [focusedField, setFocusedField] = useState('');
  const swapSpin = useRef(new Animated.Value(0)).current;
  const searchScale = useRef(new Animated.Value(1)).current;

  // force = show the loading state even with a remembered list (pull to refresh).
  const loadRoutes = useCallback(async ({ force = false, isActive = () => true } = {}) => {
    // with a remembered list on screen this is a quiet refresh - no spinner
    setRoutesLoading(force || !rememberedRoutes());
    setRoutesError('');
    try {
      const response = await userBusService.getRoutes();
      if (!isActive()) return;
      const routes = Array.isArray(response?.data?.results) ? response.data.results : [];
      setRouteSuggestions(routes);
      setRoutesKnown(true);
      rememberLastKnown(BUS_ROUTES_KEY, routes);
    } catch (err) {
      if (!isActive()) return;
      setRoutesError(err?.message || 'Failed to load route suggestions');
    } finally {
      if (isActive()) {
        setRoutesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!busEnabled) {
      setRouteSuggestions([]);
      return;
    }

    let active = true;

    loadRoutes({ isActive: () => active });

    return () => {
      active = false;
    };
  }, [busEnabled, loadRoutes]);

  // Pull to refresh: the counts and Popular Routes go back to their first-load skeleton while the routes reload.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!busEnabled) return;
    setRefreshing(true);
    setRouteSuggestions([]);
    setRoutesKnown(false);
    setRoutesLoading(true);
    try {
      await loadRoutes({ force: true });
    } finally {
      // a failed reload keeps the last list the server gave (a good reload has just saved the new one)
      const known = rememberedRoutes();
      if (known) {
        setRouteSuggestions(known);
        setRoutesKnown(true);
      }
      setRoutesLoading(false);
      setRefreshing(false);
    }
  }, [busEnabled, loadRoutes]);

  const cityOptions = useMemo(() => {
    const cities = new Set();

    routeSuggestions.forEach((route) => {
      const from = String(route?.fromCity || '').trim();
      const to = String(route?.toCity || '').trim();

      if (from) cities.add(from);
      if (to) cities.add(to);
    });

    return Array.from(cities).sort((left, right) => left.localeCompare(right));
  }, [routeSuggestions]);

  const matchingRoute = useMemo(
    () =>
      routeSuggestions.find(
        (route) =>
          normalizeCity(route.fromCity) === normalizeCity(fromCity) &&
          normalizeCity(route.toCity) === normalizeCity(toCity),
      ) || null,
    [fromCity, routeSuggestions, toCity],
  );

  const hasTypedInvalidRoute =
    fromCity.trim() &&
    toCity.trim() &&
    normalizeCity(fromCity) !== normalizeCity(toCity) &&
    routeSuggestions.length > 0 &&
    !matchingRoute;

  const quickDates = useMemo(
    () => [
      { label: 'Today', value: getTodayDate() },
      { label: 'Tomorrow', value: getDateOffset(1) },
      { label: 'Day After', value: getDateOffset(2) },
      { label: 'This Weekend', value: getNextWeekendDate() },
    ],
    [],
  );

  const featuredRoutes = useMemo(() => routeSuggestions.slice(0, 6), [routeSuggestions]);
  const minimumDate = useMemo(() => new Date(`${getTodayDate()}T00:00:00`), []);
  const selectedDateValue = useMemo(() => (date ? new Date(`${date}T00:00:00`) : null), [date]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const calendarWeeks = useMemo(
    () => Array.from({ length: 6 }, (_, week) => calendarDays.slice(week * 7, week * 7 + 7)),
    [calendarDays],
  );
  const monthLabel = useMemo(
    () =>
      calendarMonth.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth],
  );

  const handleSearch = () => {
    const source = fromCity.trim();
    const destination = toCity.trim();

    if (!busEnabled) {
      setError('Bus service is disabled right now.');
      return;
    }

    if (!source || !destination) {
      setError('Choose both source and destination first.');
      return;
    }

    if (normalizeCity(source) === normalizeCity(destination)) {
      setError('From and destination cannot be the same.');
      return;
    }

    if (!date) {
      setError('Select a travel date.');
      return;
    }

    if (date < getTodayDate()) {
      setError('Please select today or a future travel date.');
      return;
    }

    if (!matchingRoute) {
      setError('This route is not active yet. Pick one from the available routes below.');
      return;
    }

    setError('');
    navigate(`${routePrefix}/bus/list`, {
      state: {
        fromCity: source,
        toCity: destination,
        date,
      },
    });
  };

  const fillRoute = (route) => {
    setFromCity(route.fromCity || '');
    setToCity(route.toCity || '');
    setError('');

    if (date) {
      navigate(`${routePrefix}/bus/list`, {
        state: {
          fromCity: route.fromCity || '',
          toCity: route.toCity || '',
          date,
        },
      });
    }
  };

  const swapCities = () => {
    setFromCity(toCity);
    setToCity(fromCity);
    setError('');
  };

  const openCalendar = () => {
    const activeDate = selectedDateValue && !Number.isNaN(selectedDateValue.getTime()) ? selectedDateValue : minimumDate;
    setCalendarMonth(getMonthStart(activeDate));
    setCalendarOpen(true);
  };

  const selectCalendarDate = (value) => {
    const nextValue = formatDateKey(value);
    if (nextValue < getTodayDate()) {
      return;
    }

    setDate(nextValue);
    setCalendarOpen(false);
    setError('');
  };

  // active:rotate-180 (300ms) on the swap button
  const spinSwap = (pressed) => {
    Animated.timing(swapSpin, { toValue: pressed ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  };
  const pressSearch = (pressed) => {
    Animated.spring(searchScale, { toValue: pressed ? 0.98 : 1, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };

  const card = { backgroundColor: P.cardBg, borderColor: P.border };
  const muted = { color: P.textSecondary };

  return (
    <Screen bg={P.bg} edges={[]}>
      <StatusBarSpacer color={P.cardBg} />
      <View style={[styles.header, USER_SHADOW, { backgroundColor: P.cardBg, borderBottomColor: P.border }]}>
        <View style={styles.row3}>
          <Pressable onPress={() => navigate(-1)} style={(s) => [styles.backBtn, USER_SHADOW, card, tap(0.95)(s)]}>
            <ArrowLeft size={18} color={P.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, muted]}>BUS TICKETS</Text>
            <Text style={[styles.h1, { color: P.textPrimary }]}>Book your journey</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: 128 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[P.accent]} />}
      >
        <View style={[styles.hero, USER_SHADOW, { backgroundColor: P.cardBg }]}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: P.textPrimary }]}>Travel with ease</Text>
              <Text style={[styles.heroText, muted]}>
                Find and book bus tickets for your preferred routes in just a few clicks.
              </Text>
            </View>
            <View style={[styles.heroIcon, { backgroundColor: P.cardSoft }]}>
              <BusFront size={24} color={P.textPrimary} />
            </View>
          </View>

          <View style={[styles.stats, { borderTopColor: P.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, muted]}>ROUTES</Text>
              <View style={styles.statValueBox}>
                {routesKnown || routesError ? (
                  <Text style={[styles.statValue, { color: P.textPrimary }]}>{routesKnown ? routeSuggestions.length : 0}</Text>
                ) : (
                  <NumberSkeleton fontSize={18} color={P.textPrimary} style={{ alignSelf: 'flex-start' }} />
                )}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, muted]}>CITIES</Text>
              <View style={styles.statValueBox}>
                {routesKnown || routesError ? (
                  <Text style={[styles.statValue, { color: P.textPrimary }]}>{routesKnown ? cityOptions.length : 0}</Text>
                ) : (
                  <NumberSkeleton fontSize={18} color={P.textPrimary} style={{ alignSelf: 'flex-start' }} />
                )}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statLabel, muted]}>DATE</Text>
              <Text style={[styles.statDate, { color: P.textPrimary }]}>{formatTravelDate(date) || 'Choose'}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.searchCard, USER_SHADOW, card]}>
          <View style={styles.row3}>
            <View style={[styles.searchIcon, { backgroundColor: P.cardBg }]}>
              <Search size={20} color={P.textSecondary} />
            </View>
            <View>
              <Text style={[styles.h3, { color: P.textPrimary }]}>Search Buses</Text>
              <Text style={[styles.sub, { color: P.textMuted }]}>Find available buses on your route</Text>
            </View>
          </View>

          <View style={{ gap: 16 }}>
            <View style={{ zIndex: focusedField === 'source' ? 5 : 1 }}>
              <View>
                <View style={styles.fieldIcon}>
                  <MapPin size={16} color={P.textSecondary} />
                </View>
                <View style={[styles.field, card]}>
                  <Text style={[styles.fieldLabel, muted]}>FROM</Text>
                  <TextInput
                    value={fromCity}
                    onChangeText={setFromCity}
                    onFocus={() => setFocusedField('source')}
                    onBlur={() => setFocusedField((f) => (f === 'source' ? '' : f))}
                    placeholder="Enter source city"
                    placeholderTextColor={PLACEHOLDER}
                    style={[styles.input, { color: P.textPrimary }]}
                  />
                </View>

                <View style={styles.swapWrap} pointerEvents="box-none">
                  <Pressable
                    onPress={swapCities}
                    onPressIn={() => spinSwap(true)}
                    onPressOut={() => spinSwap(false)}
                    style={[styles.swapBtn, USER_SHADOW, card]}
                  >
                    <Animated.View style={{ transform: [{ rotate: swapSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
                      <ArrowRightLeft size={16} color={P.textSecondary} />
                    </Animated.View>
                  </Pressable>
                </View>
              </View>
              <CitySuggestions visible={focusedField === 'source'} options={cityOptions} value={fromCity} onPick={setFromCity} P={P} />
            </View>

            <View style={{ zIndex: focusedField === 'to' ? 5 : 1 }}>
              <View>
                <View style={styles.fieldIcon}>
                  <MapPin size={16} color={P.textSecondary} />
                </View>
                <View style={[styles.field, card]}>
                  <Text style={[styles.fieldLabel, muted]}>TO</Text>
                  <TextInput
                    value={toCity}
                    onChangeText={setToCity}
                    onFocus={() => setFocusedField('to')}
                    onBlur={() => setFocusedField((f) => (f === 'to' ? '' : f))}
                    placeholder="Enter destination city"
                    placeholderTextColor={PLACEHOLDER}
                    style={[styles.input, { color: P.textPrimary }]}
                  />
                </View>
              </View>
              <CitySuggestions visible={focusedField === 'to'} options={cityOptions} value={toCity} onPick={setToCity} P={P} />
            </View>

            <Pressable onPress={openCalendar} style={[styles.dateBtn, card]}>
              <Calendar size={16} color={P.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, muted]}>DATE OF JOURNEY</Text>
                <Text style={[styles.dateValue, { color: P.textPrimary }]}>{formatTravelDate(date) || 'Choose date'}</Text>
              </View>
              <Text style={[styles.changeText, muted]}>Change</Text>
            </Pressable>
          </View>

          <View style={{ gap: 12 }}>
            <Text style={[styles.kicker, muted]}>QUICK DATES</Text>
            <View style={styles.chips}>
              {quickDates.map((item) => {
                const on = date === item.value;
                return (
                  <Pressable
                    key={item.value}
                    onPress={() => setDate(item.value)}
                    style={[styles.chip, on ? { backgroundColor: P.accent, borderColor: P.accent } : card]}
                  >
                    <Text style={[styles.chipText, { color: on ? P.accentInk : P.textSecondary }]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 16 }}>
            {matchingRoute && (
              <View style={[styles.notice, styles.rowBetween, { backgroundColor: P.cardSoft, borderColor: colors.emerald[100] }]}>
                <View style={[styles.row3, { gap: 8 }]}>
                  <Route size={14} color={colors.emerald[600]} />
                  <Text style={[styles.noticeText, { color: colors.emerald[700] }]}>Route available</Text>
                </View>
                <Text style={[styles.noticeText, { color: colors.emerald[700] }]}>
                  Starts at ₹{Number(matchingRoute.startingPrice || 0)}
                </Text>
              </View>
            )}

            {hasTypedInvalidRoute ? (
              <View style={[styles.notice, card]}>
                <Text style={[styles.noticeText, { color: P.textMuted }]}>
                  This specific route is not available. Please check the list below.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={[styles.notice, { backgroundColor: P.cardSoft, borderColor: colors.rose[100] }]}>
                <Text style={[styles.noticeText, { color: colors.rose[600] }]}>{error}</Text>
              </View>
            ) : null}

            {!busEnabled && (
              <View style={[styles.notice, { backgroundColor: P.cardSoft, borderColor: colors.amber[100] }]}>
                <Text style={[styles.noticeText, { color: colors.amber[700] }]}>Bus service is currently disabled.</Text>
              </View>
            )}

            <Animated.View style={{ transform: [{ scale: searchScale }] }}>
              <Pressable
                onPress={handleSearch}
                onPressIn={() => pressSearch(true)}
                onPressOut={() => pressSearch(false)}
                style={[styles.searchBtn, USER_SHADOW, { backgroundColor: P.accent }]}
              >
                <Text style={[styles.searchBtnText, { color: P.accentInk }]}>Search Buses</Text>
                <ChevronRight size={18} color={P.accentInk} />
              </Pressable>
            </Animated.View>
          </View>
        </View>

        <View style={{ gap: 16 }}>
          <View style={styles.rowBetween}>
            <Text style={[styles.h3, { color: P.textPrimary }]}>Popular Routes</Text>
            {routesLoading && (
              <Spin>
                <Loader2 size={18} color={P.textSecondary} />
              </Spin>
            )}
          </View>

          <View style={{ gap: 12 }}>
            {featuredRoutes.map((route, index) => (
              <Pressable
                key={getRouteKey(route, index)}
                onPress={() => fillRoute(route)}
                style={(s) => [styles.routeCard, USER_SHADOW, card, tap(0.99)(s)]}
              >
                <View style={[styles.rowBetween, { gap: 12 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.routeTitle, { color: P.textPrimary }]}>
                      {route.fromCity} → {route.toCity}
                    </Text>
                    <Text numberOfLines={1} style={[styles.routeSub, { color: P.textMuted }]}>
                      {route.operatorName || 'Multiple operators available'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.statLabel, muted]}>FROM</Text>
                    <Text style={[styles.routePrice, { color: P.textPrimary }]}>₹{Number(route.startingPrice || 0)}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>

          {routesKnown && !routesLoading && !featuredRoutes.length && !routesError ? (
            <Text style={[styles.emptyText, muted]}>No active routes found.</Text>
          ) : null}

          {routesError ? <Text style={[styles.emptyText, { color: colors.rose[500] }]}>{routesError}</Text> : null}
        </View>
      </ScrollView>

      <Sheet open={calendarOpen} onClose={() => setCalendarOpen(false)} backdropOpacity={0.4} style={styles.sheet}>
        <View style={[styles.calendar, USER_SHADOW, { backgroundColor: P.cardBg }]}>
          <View style={[styles.rowBetween, { marginBottom: 24 }]}>
            <View>
              <Text style={[styles.fieldLabel, muted, { marginBottom: 4 }]}>SELECT JOURNEY DATE</Text>
              <Text style={[styles.h1, { color: P.textPrimary }]}>{monthLabel}</Text>
            </View>
            <Pressable onPress={() => setCalendarOpen(false)} style={[styles.closeBtn, { backgroundColor: P.cardBg }]}>
              <X size={20} color={P.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.rowBetween, { gap: 16, marginBottom: 24 }]}>
            <Pressable onPress={() => setCalendarMonth((current) => addMonths(current, -1))} style={[styles.monthBtn, { borderColor: P.border }]}>
              <ChevronLeft size={20} color={P.textSecondary} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={[styles.datePill, { backgroundColor: P.cardBg }]}>
                <Text style={[styles.datePillText, { color: P.textPrimary }]}>{formatTravelDate(date)}</Text>
              </View>
            </View>
            <Pressable onPress={() => setCalendarMonth((current) => addMonths(current, 1))} style={[styles.monthBtn, { borderColor: P.border }]}>
              <ChevronRight size={20} color={P.textSecondary} />
            </Pressable>
          </View>

          <View style={{ gap: 4, marginBottom: 24 }}>
            <View style={styles.week}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                <View key={i} style={styles.dayHead}>
                  <Text style={[styles.dayHeadText, muted]}>{day}</Text>
                </View>
              ))}
            </View>
            {calendarWeeks.map((week, w) => (
              <View key={w} style={styles.week}>
                {week.map((day) => {
                  const key = formatDateKey(day);
                  const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                  const isDisabled = key < getTodayDate();
                  const isSelected = key === date;
                  const color = isSelected
                    ? P.accentInk
                    : isDisabled
                      ? colors.slate[200]
                      : isCurrentMonth
                        ? P.textPrimary
                        : P.textSecondary;

                  return (
                    <Pressable
                      key={key}
                      disabled={isDisabled}
                      onPress={() => selectCalendarDate(day)}
                      style={[styles.day, isSelected && [{ backgroundColor: P.accent }, USER_SHADOW]]}
                    >
                      <Text style={[styles.dayText, { color }]}>{day.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={[styles.row3, { gap: 12 }]}>
            <Pressable
              onPress={() => {
                setDate(getTodayDate());
                setCalendarOpen(false);
              }}
              style={[styles.sheetBtn, card, { borderWidth: 1 }]}
            >
              <Text style={[styles.sheetBtnText, { color: P.textSecondary }]}>Tomorrow</Text>
            </Pressable>
            <Pressable onPress={() => setCalendarOpen(false)} style={[styles.sheetBtn, { backgroundColor: P.accent }]}>
              <Text style={[styles.sheetBtnText, { color: P.accentInk }]}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>
    </Screen>
  );
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16, borderBottomWidth: 1, zIndex: 20 },
  row3: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: '600', letterSpacing: 0.5 },
  h1: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 24, gap: 24 },
  hero: { borderRadius: 24, padding: 24 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: '600' },
  heroText: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stats: { marginTop: 24, flexDirection: 'row', gap: 16, borderTopWidth: 1, paddingTop: 16 },
  statLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  statValueBox: { marginTop: 4, minHeight: 28, justifyContent: 'center' },
  statValue: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  statDate: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  searchCard: { borderRadius: 24, padding: 24, borderWidth: 1, gap: 24 },
  searchIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  h3: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  sub: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  fieldIcon: { position: 'absolute', left: 16, top: 16, zIndex: 2 },
  field: { paddingLeft: 48, paddingRight: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  fieldLabel: { fontSize: 10, lineHeight: 14, fontWeight: '600', marginBottom: 2 },
  input: { fontSize: 16, lineHeight: 24, fontWeight: '600', paddingVertical: 0, backgroundColor: 'transparent' },
  swapWrap: { position: 'absolute', right: 24, top: 0, bottom: 0, justifyContent: 'center', zIndex: 10 },
  swapBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  suggestBox: { marginTop: 6, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  suggestRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  suggestText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  dateValue: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  changeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  notice: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  noticeText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  searchBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  searchBtnText: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  routeCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16 },
  routeTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  routeSub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  routePrice: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  emptyText: { textAlign: 'center', paddingVertical: 32, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  sheet: { backgroundColor: 'transparent', padding: 16, borderTopLeftRadius: 0, borderTopRightRadius: 0, overflow: 'visible' },
  calendar: { borderRadius: 24, padding: 24 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  monthBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  datePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999 },
  datePillText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  week: { flexDirection: 'row', gap: 4 },
  dayHead: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  dayHeadText: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
  day: { flex: 1, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  sheetBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});


export default BusHome;
