// Web: BusDriverHome.jsx (/taxi/driver/bus-home) — the bus driver console: Home (overview), Schedule, Seat desk,
// Bookings and Account, switched by the page's own bottom bar (BusDriverBottomNav), not by routes.
// Native differences (platform only):
// - The page is one FlatList: the tab content is its header and the Bookings tab's passenger cards are its rows.
//   Pull-to-refresh reloads the profile, the seat desk of the selected run and (Bookings tab) the today / upcoming list.
// - The web's sticky tab title bar is a bar above the list (it stays on top like the sticky one).
// - <select> -> a field that opens a bottom sheet with the same options; <input type="time"> -> the system time picker.
// - window.confirm -> Alert with Cancel / OK. tel: link -> Linking.openURL.
// - The web's history.pushState / popstate trap (Back from a tab goes Home, Back from Home asks to log out) is an
//   Android BackHandler while this screen is focused (plus the same rule for a stack "go back").
// - The calendar and run-details popups (data-driver-overlay) are Dialogs (native Modal over the bottom bar); tap
//   outside / Back closes them like the web's outside click / Escape. The body scroll lock is not needed.
// - Font: the web page sets 'Plus Jakarta Sans' on its root, so the page is a FontScope of that family.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useIsFocused } from 'expo-router';
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  MapPin,
  Phone,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Ticket,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react-native';
import { useBeforeLeave, useNavigate } from '@/lib/router';
import { toast } from '@/lib/toast';
import { Dialog, FontScope, Sheet, StatusBarScrim, Text, TextInput, useBottomNavSpace } from '@/native/ui';
import { alpha, colors, fonts, shadow } from '@/theme';
import { clearDriverAuthState, getCurrentDriver } from '../services/registrationService';
import BusDriverBottomNav from '../components/BusDriverBottomNav';
import {
  createBusDriverReservation,
  getBusDriverBookings,
  getBusDriverSeatLayout,
  markBusDriverBookingPaid,
  updateBusDriverSchedules,
} from '../services/busDriverService';
import { formatClockTime } from '../../../shared/utils/clockTime';

const PAGE_BG = '#f6f7fb';

const unwrap = (response) => response?.data?.data || response?.data || response;
// "+91 98765 43210", "09876543210", "919876543210" -> "9876543210"
const toTenDigitPhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  const national = digits.length > 10 ? digits.replace(/^(?:00)?(?:91|0)(?=\d{10}$)/, '') : digits;
  return national.slice(-10);
};
const unwrapResults = (response) => response?.data?.results || response?.results || [];
const formatDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const createToday = () => formatDateKey(new Date());
const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const createLocalScheduleId = () =>
  `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createScheduleDraft = () => ({
  id: createLocalScheduleId(),
  label: '',
  departureTime: '',
  arrivalTime: '',
  activeDays: [...DAY_OPTIONS],
  status: 'active',
});

const formatCurrency = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDisplayDate = (value) => {
  if (!value) return 'No date selected';
  const date = parseDateKey(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getNextTravelDate = (schedule) => {
  const activeDays = Array.isArray(schedule?.activeDays) ? schedule.activeDays : [];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let index = 0; index < 14; index += 1) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + index);
    const label = dayLabels[nextDate.getDay()];
    if (activeDays.length === 0 || activeDays.includes(label)) {
      return formatDateKey(nextDate);
    }
  }

  return createToday();
};

// bg / text / border of the web's STOP_TYPE_TONE classes
const STOP_TYPE_TONE = {
  pickup: { bg: colors.emerald[50], text: colors.emerald[700], border: colors.emerald[200] },
  drop: { bg: colors.rose[50], text: colors.rose[700], border: colors.rose[200] },
  both: { bg: colors.indigo[50], text: colors.indigo[700], border: colors.indigo[200] },
};
const DEFAULT_STOP_TONE = { bg: colors.slate[100], text: colors.slate[600], border: colors.slate[200] };

const getCalendarMatrix = (value) => {
  const sourceDate = value instanceof Date ? value : parseDateKey(value) || new Date();
  const year = sourceDate.getFullYear();
  const month = sourceDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < startDay; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cellDate = new Date(year, month, day);
    cells.push({
      label: day,
      value: formatDateKey(cellDate),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const countBlueprintSeats = (blueprint = {}) =>
  ['lowerDeck', 'upperDeck']
    .flatMap((deckKey) => (Array.isArray(blueprint?.[deckKey]) ? blueprint[deckKey] : []))
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat').length;

const timeToDate = (value) => {
  const date = new Date();
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }
  return date;
};
const dateToTime = (date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

// ------------------------------------------------------------------ small native stand-ins for web form controls

/** <select>: shows the chosen option, opens a sheet with the options. */
const SelectField = ({ value, options, onSelect, style, textStyle, iconColor = colors.slate[500] }) => {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[s.selectField, style]}>
        <Text numberOfLines={1} style={[s.flex1, textStyle]}>{current?.label ?? ''}</Text>
        <ChevronDown size={16} color={iconColor} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} style={s.sheetBody}>
        <ScrollView style={s.sheetScroll} contentContainerStyle={s.sheetList}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  setOpen(false);
                  onSelect?.(option.value);
                }}
                style={[s.sheetOption, selected ? s.sheetOptionActive : null]}
              >
                <Text style={[s.sheetOptionText, selected ? s.textBlue600 : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
};

/** <input type="time">: shows the time, opens the system time picker. */
const TimeField = ({ value, onPick, style, textStyle }) => {
  const [iosOpen, setIosOpen] = useState(false);
  const [iosValue, setIosValue] = useState(() => timeToDate(value));
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: timeToDate(value),
        mode: 'time',
        is24Hour: false,
        onValueChange: (event, picked) => {
          if (!picked) return;
          onPick?.(dateToTime(picked));
        },
      });
      return;
    }
    setIosValue(timeToDate(value));
    setIosOpen(true);
  };
  return (
    <>
      <Pressable onPress={open} style={style}>
        <Text style={textStyle}>{value ? formatClockTime(value) : '--:-- --'}</Text>
      </Pressable>
      {Platform.OS === 'ios' ? (
        <Dialog open={iosOpen} onClose={() => setIosOpen(false)} style={s.iosPickerCard}>
          <DateTimePicker
            value={iosValue}
            mode="time"
            display="spinner"
            onValueChange={(event, picked) => {
              if (picked) setIosValue(picked);
            }}
          />
          <Pressable
            onPress={() => {
              setIosOpen(false);
              onPick?.(dateToTime(iosValue));
            }}
            style={s.iosPickerDone}
          >
            <Text style={s.iosPickerDoneText}>Done</Text>
          </Pressable>
        </Dialog>
      ) : null}
    </>
  );
};

// ------------------------------------------------------------------ web sub-components

const SeatDeck = ({ title, rows, selectedSeatIds, onToggle }) => {
  if (!rows?.length) return null;

  const maxColumns = Math.max(...rows.map((row) => row.length), 1);

  return (
    <View style={s.deckCard}>
      <View style={s.deckHead}>
        <Text style={s.deckTitle}>{title}</Text>
        <View style={s.deckBadge}>
          <Text style={s.deckBadgeText}>Coach</Text>
        </View>
      </View>

      <View style={s.gap3}>
        {rows.map((row, rowIndex) => {
          const columns = Math.max(maxColumns, row.length);
          const fillers = Array.from({ length: Math.max(0, columns - row.length) });
          return (
            <View key={`${title}-${rowIndex}`} style={s.deckRow}>
              {row.map((seat, cellIndex) => {
                if (!seat || seat.kind !== 'seat') {
                  return <View key={`${title}-${rowIndex}-${cellIndex}`} style={s.deckGap} />;
                }

                const isBooked = seat.status === 'booked';
                const isSelected = selectedSeatIds.includes(seat.id);

                return (
                  <Pressable
                    key={`${title}-${seat.id}`}
                    disabled={isBooked}
                    onPress={() => onToggle(seat)}
                    style={[
                      s.seat,
                      isBooked ? s.seatBooked : isSelected ? s.seatSelected : s.seatFree,
                    ]}
                  >
                    <View style={s.seatBar} />
                    <Text
                      numberOfLines={1}
                      style={[
                        s.seatText,
                        { color: isBooked ? colors.slate[500] : isSelected ? colors.white : colors.slate[700] },
                      ]}
                    >
                      {seat.label || seat.id}
                    </Text>
                  </Pressable>
                );
              })}
              {fillers.map((_, index) => (
                <View key={`${title}-${rowIndex}-filler-${index}`} style={s.flex1} />
              ))}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const StatCard = ({ label, value, tone = 'light', Icon }) => (
  <View style={[s.statCard, tone === 'dark' ? s.statCardDark : s.statCardLight]}>
    <View style={s.rowBetween}>
      <View>
        <Text style={[s.cap10, tone === 'dark' ? { color: alpha(colors.white, 0.55) } : null]}>{label}</Text>
        <Text style={[s.text2xlBlack, { marginTop: 8, color: tone === 'dark' ? colors.white : colors.slate[900] }]}>{value}</Text>
      </View>
      {Icon ? (
        <View style={[s.statIcon, { backgroundColor: tone === 'dark' ? alpha(colors.white, 0.1) : colors.slate[100] }]}>
          <Icon size={20} color={tone === 'dark' ? colors.white : colors.slate[700]} />
        </View>
      ) : null}
    </View>
  </View>
);

const MiniTile = ({ label, value, valueStyle, style }) => (
  <View style={[s.tile, style]}>
    <Text style={s.cap10}>{label}</Text>
    <Text style={[s.textXlBlack, { marginTop: 8 }, valueStyle]}>{value}</Text>
  </View>
);

const StopTypeChip = ({ type }) => {
  const tone = STOP_TYPE_TONE[type] || DEFAULT_STOP_TONE;
  return (
    <View style={[s.stopChip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Text style={[s.stopChipText, { color: tone.text }]}>{type || 'stop'}</Text>
    </View>
  );
};

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
];

const SCHEDULE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'draft', label: 'Draft' },
];

/** The passenger fields of the desk form and of the run-details popup (same inputs, same rules). */
const PassengerFields = ({ passenger, setPassenger }) => (
  <>
    <TextInput
      value={passenger.name}
      onChangeText={(text) => setPassenger((current) => ({ ...current, name: text }))}
      placeholder="Passenger name"
      placeholderTextColor={colors.slate[400]}
      style={s.input}
    />
    <TextInput
      value={passenger.phone}
      onChangeText={(text) => setPassenger((current) => ({ ...current, phone: text.replace(/[^\d+\s-]/g, '').slice(0, 16) }))}
      placeholder="Passenger phone (10 digits, +91 is fine)"
      placeholderTextColor={colors.slate[400]}
      keyboardType="phone-pad"
      style={s.input}
    />
    <TextInput
      value={passenger.age}
      onChangeText={(text) => setPassenger((current) => ({ ...current, age: text.replace(/\D/g, '').slice(0, 3) }))}
      placeholder="Age"
      placeholderTextColor={colors.slate[400]}
      keyboardType="number-pad"
      style={s.input}
    />
    <SelectField
      value={passenger.gender}
      options={GENDER_OPTIONS}
      onSelect={(value) => setPassenger((current) => ({ ...current, gender: value }))}
      style={s.input}
      textStyle={s.inputText}
    />
    <TextInput
      value={passenger.email}
      onChangeText={(text) => setPassenger((current) => ({ ...current, email: text }))}
      placeholder="Passenger email"
      placeholderTextColor={colors.slate[400]}
      keyboardType="email-address"
      autoCapitalize="none"
      style={s.input}
    />
    <TextInput
      value={passenger.notes}
      onChangeText={(text) => setPassenger((current) => ({ ...current, notes: text }))}
      placeholder="Notes for this reservation"
      placeholderTextColor={colors.slate[400]}
      multiline
      textAlignVertical="top"
      style={[s.input, s.textarea]}
    />
  </>
);

const BusDriverHome = () => {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const bottomSpace = useBottomNavSpace();
  const isFocused = useIsFocused();
  const listRef = useRef(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [travelDate, setTravelDate] = useState(createToday());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingDesk, setLoadingDesk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deskError, setDeskError] = useState('');
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingFilter, setBookingFilter] = useState('all');
  // run = the selected bus run only | today = every run today | upcoming = today and all future days
  const [bookingScope, setBookingScope] = useState('run');
  const [scopedBookings, setScopedBookings] = useState([]);
  const [loadingScoped, setLoadingScoped] = useState(false);
  const [scopedReloadKey, setScopedReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleDrafts, setScheduleDrafts] = useState([]);
  const [isSavingSchedules, setIsSavingSchedules] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isRunDetailsOpen, setIsRunDetailsOpen] = useState(false);
  const [passenger, setPassenger] = useState({
    name: '',
    age: '',
    gender: 'Male',
    phone: '',
    email: '',
    notes: '',
    paymentStatus: 'paid',
  });

  const confirmLogout = useCallback(() => {
    Alert.alert('', 'Do you want to log out and leave the bus driver console?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK',
        onPress: () => {
          clearDriverAuthState();
          navigate('/taxi/driver/login', { replace: true });
        },
      },
    ]);
  }, [navigate]);

  const busService = profile?.busService || null;
  const schedules = useMemo(
    () => (Array.isArray(busService?.schedules) ? busService.schedules : []),
    [busService?.schedules],
  );
  const routeStops = Array.isArray(busService?.route?.stops) ? busService.route.stops : [];
  const pickupStops = routeStops.filter((stop) => stop?.stopType === 'pickup' || stop?.stopType === 'both');
  const dropStops = routeStops.filter((stop) => stop?.stopType === 'drop' || stop?.stopType === 'both');
  const selectedSchedule =
    schedules.find((item) => item.id === selectedScheduleId) || schedules[0] || null;
  const persistedScheduleIds = useMemo(
    () => new Set(schedules.map((item) => item.id)),
    [schedules],
  );
  const calendarCells = useMemo(() => getCalendarMatrix(calendarMonth), [calendarMonth]);
  const calendarWeeks = useMemo(() => {
    const weeks = [];
    for (let index = 0; index < calendarCells.length; index += 7) {
      weeks.push(calendarCells.slice(index, index + 7));
    }
    return weeks;
  }, [calendarCells]);
  const calendarLabel = useMemo(
    () =>
      calendarMonth.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth],
  );

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const response = await getCurrentDriver();
        const data = unwrap(response);
        if (!active) return;
        setProfile(data);

        const firstSchedule = Array.isArray(data?.busService?.schedules) ? data.busService.schedules[0] : null;
        if (firstSchedule?.id) {
          setSelectedScheduleId(firstSchedule.id);
          const nextDate = getNextTravelDate(firstSchedule);
          setTravelDate(nextDate);
          const parsedDate = parseDateKey(nextDate);
          if (!parsedDate) return;
          setCalendarMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Unable to load bus driver profile');
      } finally {
        if (active) {
          setLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setScheduleDrafts(
      Array.isArray(schedules) && schedules.length
        ? schedules.map((schedule) => ({
            id: schedule.id,
            label: schedule.label || '',
            departureTime: schedule.departureTime || '',
            arrivalTime: schedule.arrivalTime || '',
            activeDays: Array.isArray(schedule.activeDays) ? [...schedule.activeDays] : [],
            status: schedule.status || 'active',
          }))
        : [createScheduleDraft()],
    );
  }, [schedules]);

  // A tab opened from the bottom menu starts at the top of the page.
  useEffect(() => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, [activeTab]);

  const activeTabRef = useRef('overview');
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Web popstate trap: Back from Schedule / Desk / Bookings goes to Home; only back from Home asks about logging out.
  const handleBack = useCallback(() => {
    if (activeTabRef.current !== 'overview') {
      setActiveTab('overview');
      return true;
    }
    confirmLogout();
    return true;
  }, [confirmLogout]);

  useEffect(() => {
    if (!isFocused) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [handleBack, isFocused]);

  useBeforeLeave(handleBack);

  useEffect(() => {
    if (!schedules.length) {
      setSelectedScheduleId('');
      return;
    }

    if (!selectedScheduleId || !schedules.some((item) => item.id === selectedScheduleId)) {
      const nextSchedule = schedules[0];
      setSelectedScheduleId(nextSchedule.id);
      const nextDate = getNextTravelDate(nextSchedule);
      setTravelDate(nextDate);
      const parsedDate = parseDateKey(nextDate);
      if (!parsedDate) return;
      setCalendarMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
      setSelectedSeats([]);
    }
  }, [schedules, selectedScheduleId]);

  useEffect(() => {
    if (!selectedScheduleId || !travelDate) {
      return undefined;
    }

    let active = true;

    const loadDesk = async () => {
      setLoadingDesk(true);
      setDeskError('');
      try {
        const [layoutResponse, bookingsResponse] = await Promise.all([
          getBusDriverSeatLayout({ scheduleId: selectedScheduleId, date: travelDate }),
          getBusDriverBookings({ scheduleId: selectedScheduleId, date: travelDate }),
        ]);

        if (!active) return;
        setLayout(unwrap(layoutResponse));
        setBookings(unwrapResults(bookingsResponse));
      } catch (error) {
        if (!active) return;
        setDeskError(error?.message || 'Unable to load seat desk');
        setLayout(null);
        setBookings([]);
      } finally {
        if (active) {
          setLoadingDesk(false);
        }
      }
    };

    loadDesk();

    return () => {
      active = false;
    };
  }, [selectedScheduleId, travelDate]);

  useEffect(() => {
    if (!travelDate) {
      return;
    }

    const parsedDate = parseDateKey(travelDate);
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return;
    }

    setCalendarMonth((current) => {
      if (
        current.getFullYear() === parsedDate.getFullYear() &&
        current.getMonth() === parsedDate.getMonth()
      ) {
        return current;
      }

      return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
    });
  }, [travelDate]);

  // Sleeper / window / aisle seats can each have their own price (same rule the server charges).
  const selectedFare = useMemo(() => {
    const variantPricing = busService?.variantPricing || {};
    const defaultPrice = Number(busService?.seatPrice || 0);
    return selectedSeats.reduce((sum, seat) => {
      const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
      const price = Number(variantPricing?.[variantKey] ?? variantPricing?.seat ?? defaultPrice);
      return sum + (Number.isFinite(price) ? price : defaultPrice);
    }, 0);
  }, [selectedSeats, busService?.seatPrice, busService?.variantPricing]);
  const totalSeatCount = useMemo(() => countBlueprintSeats(layout?.blueprint), [layout?.blueprint]);
  const occupiedSeatCount = useMemo(
    () => Math.max(0, totalSeatCount - Number(layout?.availableSeats ?? 0)),
    [layout?.availableSeats, totalSeatCount],
  );

  // Lapsed payment holds come back as `expired`; they never occupied a seat.
  const liveBookingCount = useMemo(
    // Paid passengers only: a "pending" row is a checkout still at the payment step (its seat stays held in Occupied).
    () => bookings.filter((item) => String(item?.status || '').toLowerCase() === 'confirmed').length,
    [bookings],
  );
  const todaysManualReservations = useMemo(
    () => bookings.filter((item) => item.bookingSource === 'bus_driver').length,
    [bookings],
  );
  const occupiedSeatLabels = useMemo(
    () =>
      bookings
        .flatMap((booking) => (Array.isArray(booking?.seatLabels) ? booking.seatLabels : []))
        .filter(Boolean),
    [bookings],
  );

  // The Bookings tab can show the selected run, all of today, or everything upcoming.
  useEffect(() => {
    if (activeTab !== 'bookings' || bookingScope === 'run') {
      return undefined;
    }

    let active = true;
    const today = createToday();
    setLoadingScoped(true);
    getBusDriverBookings(
      bookingScope === 'today' ? { date: today, activeOnly: true } : { from: today, activeOnly: true },
    )
      .then((response) => {
        if (active) setScopedBookings(unwrapResults(response));
      })
      .catch(() => {
        if (active) setScopedBookings([]);
      })
      .finally(() => {
        if (active) setLoadingScoped(false);
      });

    return () => {
      active = false;
    };
  }, [activeTab, bookingScope, scopedReloadKey]);

  const listedBookings = bookingScope === 'run' ? bookings : scopedBookings;

  const filteredBookings = useMemo(() => {
    const query = bookingSearch.trim().toLowerCase();

    return listedBookings.filter((booking) => {
      const sourceLabel = booking.bookingSource === 'bus_driver' ? 'manual' : 'user';
      const matchesFilter =
        bookingFilter === 'all'
          ? true
          : bookingFilter === 'manual'
            ? booking.bookingSource === 'bus_driver'
            : booking.status === bookingFilter || sourceLabel === bookingFilter;

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableValues = [
        booking.bookingCode,
        booking.passenger?.name,
        booking.passenger?.phone,
        booking.passenger?.email,
        booking.seatLabels?.join(' '),
        booking.notes,
      ];

      return searchableValues.some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [bookingFilter, bookingSearch, listedBookings]);

  const handleToggleSeat = (seat) => {
    setSelectedSeats((current) =>
      current.some((item) => item.id === seat.id)
        ? current.filter((item) => item.id !== seat.id)
        : [...current, { id: seat.id, label: seat.label || seat.id }],
    );
  };

  const openTravelDatePicker = () => setIsCalendarOpen(true);

  const handleTravelDateSelect = (value) => {
    setTravelDate(value);
    setSelectedSeats([]);
    setIsCalendarOpen(false);
  };

  const refreshDesk = async () => {
    if (!selectedScheduleId || !travelDate) {
      return;
    }

    setLoadingDesk(true);
    try {
      const [layoutResponse, bookingsResponse, profileResponse] = await Promise.all([
        getBusDriverSeatLayout({ scheduleId: selectedScheduleId, date: travelDate }),
        getBusDriverBookings({ scheduleId: selectedScheduleId, date: travelDate }),
        getCurrentDriver(),
      ]);

      setLayout(unwrap(layoutResponse));
      setBookings(unwrapResults(bookingsResponse));
      setProfile(unwrap(profileResponse));
      setDeskError('');
    } catch (error) {
      setDeskError(error?.message || 'Unable to refresh desk');
    } finally {
      setLoadingDesk(false);
    }
  };

  // Pull-to-refresh: the profile and the selected run's desk (refreshDesk), and the today / upcoming list.
  const handlePullRefresh = async () => {
    setRefreshing(true);
    try {
      if (selectedScheduleId && travelDate) {
        await refreshDesk();
      } else {
        const profileResponse = await getCurrentDriver();
        setProfile(unwrap(profileResponse));
      }
    } catch (error) {
      toast.error(error?.message || 'Unable to load bus driver profile');
    } finally {
      setScopedReloadKey((value) => value + 1);
      setRefreshing(false);
    }
  };

  const updateScheduleDraftField = (scheduleId, field, value) => {
    setScheduleDrafts((current) =>
      current.map((schedule) =>
        schedule.id === scheduleId ? { ...schedule, [field]: value } : schedule,
      ),
    );
  };

  const toggleScheduleDraftDay = (scheduleId, day) => {
    setScheduleDrafts((current) =>
      current.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule;
        const activeDays = schedule.activeDays.includes(day)
          ? schedule.activeDays.filter((item) => item !== day)
          : [...schedule.activeDays, day];
        return { ...schedule, activeDays };
      }),
    );
  };

  const addScheduleDraft = () => {
    setScheduleDrafts((current) => [...current, createScheduleDraft()]);
  };

  const removeScheduleDraft = (scheduleId) => {
    setScheduleDrafts((current) => {
      if (current.length <= 1) return current;
      return current.filter((schedule) => schedule.id !== scheduleId);
    });
  };

  const selectScheduleForOps = (schedule) => {
    if (!schedule?.id || !persistedScheduleIds.has(schedule.id)) return;
    setSelectedScheduleId(schedule.id);
    const nextDate = getNextTravelDate(schedule);
    setTravelDate(nextDate);
    const parsedDate = parseDateKey(nextDate);
    if (parsedDate) {
      setCalendarMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
    }
    setSelectedSeats([]);
  };

  const handleSaveSchedules = async () => {
    const cleanedSchedules = scheduleDrafts.map((schedule) => ({
      id: String(schedule.id || '').trim() || createLocalScheduleId(),
      label: String(schedule.label || '').trim(),
      departureTime: String(schedule.departureTime || '').trim(),
      arrivalTime: String(schedule.arrivalTime || '').trim(),
      activeDays: Array.isArray(schedule.activeDays)
        ? DAY_OPTIONS.filter((day) => schedule.activeDays.includes(day))
        : [],
      status: ['active', 'paused', 'draft'].includes(schedule.status) ? schedule.status : 'active',
    }));

    if (!cleanedSchedules.length) {
      toast.error('Add at least one schedule');
      return;
    }

    const invalidSchedule = cleanedSchedules.find(
      (schedule) => !schedule.label || !schedule.departureTime || !schedule.arrivalTime,
    );
    if (invalidSchedule) {
      toast.error('Each schedule needs a label, departure time, and arrival time');
      return;
    }

    setIsSavingSchedules(true);
    try {
      await updateBusDriverSchedules({ schedules: cleanedSchedules });
      const profileResponse = await getCurrentDriver();
      setProfile(unwrap(profileResponse));
      toast.success('Schedules updated for driver and admin');
    } catch (error) {
      toast.error(error?.message || 'Unable to save schedules');
    } finally {
      setIsSavingSchedules(false);
    }
  };

  const handleReserve = async () => {
    if (!selectedSeats.length) {
      toast.error('Pick at least one seat');
      return;
    }
    const phoneNumber = toTenDigitPhone(passenger.phone);
    if (phoneNumber.length !== 10) {
      toast.error('Enter the 10 digit mobile number of the passenger');
      return;
    }

    setSubmitting(true);
    try {
      await createBusDriverReservation({
        scheduleId: selectedScheduleId,
        travelDate,
        seatIds: selectedSeats.map((seat) => seat.id),
        passenger: {
          name: passenger.name,
          age: Number(passenger.age || 0),
          gender: passenger.gender,
          phone: phoneNumber,
          email: passenger.email,
        },
        notes: passenger.notes,
        paymentStatus: passenger.paymentStatus,
      });

      toast.success('Seat reservation created');
      setPassenger({
        name: '',
        age: '',
        gender: 'Male',
        phone: '',
        email: '',
        notes: '',
        paymentStatus: 'paid',
      });
      setSelectedSeats([]);
      setIsRunDetailsOpen(false);
      setActiveTab('bookings');
      await refreshDesk();
    } catch (error) {
      toast.error(error?.message || 'Unable to reserve seats');
    } finally {
      setSubmitting(false);
    }
  };

  const openLiveRoutePage = useCallback(() => {
    navigate('/taxi/driver/bus-home/live-route', {
      state: {
        profile,
        travelDate,
        selectedScheduleId,
      },
    });
  }, [navigate, profile, selectedScheduleId, travelDate]);

  const [markingPaidId, setMarkingPaidId] = useState('');
  const handleMarkPaid = async (booking) => {
    setMarkingPaidId(booking.id);
    try {
      await markBusDriverBookingPaid(booking.id);
      toast.success('Marked as paid');
      await refreshDesk();
      if (bookingScope !== 'run') setBookingScope((value) => value);
      setScopedBookings((items) => items.map((item) => (item.id === booking.id ? { ...item, paymentStatus: 'paid' } : item)));
    } catch (error) {
      toast.error(error?.message || 'Could not update the payment');
    } finally {
      setMarkingPaidId('');
    }
  };

  const selectedSeatIds = selectedSeats.map((seat) => seat.id);

  const renderRouteStop = (stop, index, withIcon) => (
    <View key={stop?.id || `route-stop-${index}`} style={s.stopCard}>
      <View style={s.rowBetweenStart}>
        <View style={[s.rowStart, s.shrink]}>
          {withIcon ? (
            <View style={s.stopIcon}>
              <MapPin size={16} color={colors.blue[600]} />
            </View>
          ) : null}
          <View style={s.shrink}>
            <Text style={s.textSmBlack}>{stop?.city || 'City not set'}</Text>
            <Text style={[s.textSm, { marginTop: 4, color: colors.slate[600] }]}>{stop?.pointName || 'Point not set'}</Text>
            {withIcon && stop?.landmark ? (
              <Text style={s.landmark}>{stop.landmark}</Text>
            ) : null}
          </View>
        </View>

        {withIcon ? (
          <View style={s.stopRight}>
            <StopTypeChip type={stop?.stopType} />
            <Text style={s.stopTime}>
              {`${formatClockTime(stop?.arrivalTime)} to ${formatClockTime(stop?.departureTime)}`}
            </Text>
          </View>
        ) : (
          <StopTypeChip type={stop?.stopType} />
        )}
      </View>
      {withIcon ? null : (
        <Text style={s.stopTime}>{`${formatClockTime(stop?.arrivalTime)} to ${formatClockTime(stop?.departureTime)}`}</Text>
      )}
    </View>
  );

  const renderNoStops = () => (
    <View style={s.dashedNote}>
      <Text style={s.dashedNoteText}>No stops are configured yet in admin for this bus service.</Text>
    </View>
  );

  // Was the fare collected for this reservation? (shown on every booking as Paid / Unpaid)
  const renderPaymentToggle = () => (
    <View>
      <Text style={[s.cap10, { marginBottom: 8 }]}>Fare</Text>
      <View style={s.row2}>
        {[{ id: 'paid', label: 'Collected (Paid)' }, { id: 'unpaid', label: 'Not collected yet' }].map((option) => {
          const selected = passenger.paymentStatus === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setPassenger((current) => ({ ...current, paymentStatus: option.id }))}
              style={[
                s.payOption,
                { backgroundColor: selected ? (option.id === 'paid' ? colors.emerald[600] : colors.amber[500]) : colors.slate[50] },
              ]}
            >
              <Text style={[s.payOptionText, { color: selected ? colors.white : colors.slate[500] }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderReserveButton = (label) => {
    const disabled = submitting || !selectedSeats.length;
    return (
      <Pressable
        disabled={disabled}
        onPress={handleReserve}
        style={[s.reserveBtn, disabled ? s.reserveBtnDisabled : s.reserveBtnActive]}
      >
        <Text style={[s.textSmBlack, { color: disabled ? colors.slate[500] : colors.white }]}>
          {submitting ? 'Reserving Seats...' : label}
        </Text>
      </Pressable>
    );
  };

  const renderOverviewTab = () => (
    <View style={s.gap5}>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <View style={s.shrink}>
            <Text style={s.cap11}>Assigned Coach</Text>
            <Text style={[s.textXlBlack, { marginTop: 8 }]}>{busService.busName}</Text>
          </View>
          <View style={s.fareBox}>
            <Text style={s.cap10}>Seat Fare</Text>
            <Text style={[s.textLgBlack, { marginTop: 4 }]}>{formatCurrency(busService.seatPrice, busService.fareCurrency)}</Text>
          </View>
        </View>

        <View style={[s.gap3, { marginTop: 20 }]}>
          <Pressable onPress={openLiveRoutePage} style={({ pressed }) => [s.tile, pressed ? s.pressedSoft : null]}>
            <View style={s.iconLabel}>
              <MapPin size={14} color={colors.slate[400]} />
              <Text style={s.cap11b}>Route</Text>
            </View>
            <Text style={[s.textSmBlack, { marginTop: 8 }]}>
              {`${busService.route?.originCity || 'Origin'} to ${busService.route?.destinationCity || 'Destination'}`}
            </Text>
            <Text style={[s.textSm, s.mt1Slate500]}>{busService.route?.routeName || 'Standard route'}</Text>
          </Pressable>
          <View style={s.tile}>
            <View style={s.iconLabel}>
              <Phone size={14} color={colors.slate[400]} />
              <Text style={s.cap11b}>Driver Contact</Text>
            </View>
            <Text style={[s.textSmBlack, { marginTop: 8 }]}>{busService.driverName || profile?.name}</Text>
            <Text style={[s.textSm, s.mt1Slate500]}>{busService.driverPhone || profile?.phone}</Text>
          </View>
        </View>
      </View>

      <View style={s.gap3}>
        <StatCard label="Today's Bookings" value={liveBookingCount} Icon={Ticket} />
        <StatCard label="Manual Reserves" value={todaysManualReservations} tone="dark" Icon={Users} />
      </View>

      <Pressable onPress={openLiveRoutePage} style={s.card}>
        <View style={s.rowBetweenStart}>
          <View style={s.shrink}>
            <Text style={s.cap11}>{"Today's Bus Details"}</Text>
            <Text style={[s.textXlBlack, { marginTop: 8 }]}>{selectedSchedule?.label || busService.busName || 'Assigned run'}</Text>
            <Text style={[s.textSm, s.mt1Slate500, { fontWeight: '500' }]}>
              {`${formatDisplayDate(travelDate)} ${selectedSchedule?.departureTime ? `· ${formatClockTime(selectedSchedule.departureTime)}` : ''}`}
            </Text>
          </View>
          <View style={s.liveBadge}>
            <Text style={[s.cap10, { color: alpha(colors.white, 0.6) }]}>Tap To Open</Text>
            <Text style={[s.textSmBlack, { marginTop: 4, color: colors.white }]}>Live Details</Text>
          </View>
        </View>

        <View style={[s.gap3, { marginTop: 16 }]}>
          <MiniTile label="Available" value={layout?.availableSeats ?? 0} />
          <MiniTile label="Occupied" value={occupiedSeatCount} />
          <MiniTile label="Stops" value={routeStops.length} />
          <MiniTile label="Selected" value={selectedSeats.length} />
        </View>
      </Pressable>

      <View style={s.card}>
        <Text style={s.cap11}>Route Stops</Text>

        <View style={[s.gap3, { marginTop: 16 }]}>
          <MiniTile label="Pickup Stops" value={pickupStops.length} />
          <MiniTile label="Drop Stops" value={dropStops.length} />
          <MiniTile label="Route Name" value={busService.route?.routeName || 'Standard route'} valueStyle={s.textSmBlack} />
        </View>

        {routeStops.length ? (
          <View style={[s.gap3, { marginTop: 16 }]}>
            {routeStops.map((stop, index) => renderRouteStop(stop, index, true))}
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>{renderNoStops()}</View>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cap11}>Quick Actions</Text>
        <View style={[s.gap3, { marginTop: 16 }]}>
          <Pressable onPress={() => setActiveTab('desk')} style={s.quickPrimary}>
            <Text style={[s.textSmBlack, { color: colors.white }]}>Open Seat Desk</Text>
            <Text style={[s.textXs, { marginTop: 4, color: alpha(colors.white, 0.7) }]}>Reserve seats, manage availability, and book passengers.</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('bookings')} style={s.quickSecondary}>
            <Text style={s.textSmBlack}>View Bookings</Text>
            <Text style={[s.textXs, { marginTop: 4, color: colors.slate[500] }]}>Check confirmed passengers for the selected travel date.</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderScheduleTab = () => (
    <View style={s.gap5}>
      <View style={s.card}>
        <View style={s.rowBetweenStart}>
          <View style={s.shrink}>
            <Text style={s.cap11}>Schedule Control</Text>
            <Text style={[s.textXlBlack, { marginTop: 8 }]}>Manage live service scheduling</Text>
            <Text style={[s.textSm, s.mt1Slate500, { fontWeight: '500' }]}>Changes here update the same bus service schedules the admin panel uses.</Text>
          </View>
          <Pressable
            onPress={handleSaveSchedules}
            disabled={isSavingSchedules}
            style={[s.saveBtn, isSavingSchedules ? { backgroundColor: colors.slate[200] } : s.blueShadowBtn]}
          >
            <Save size={15} color={isSavingSchedules ? colors.slate[500] : colors.white} />
            <Text style={[s.btnCaps, { color: isSavingSchedules ? colors.slate[500] : colors.white }]}>
              {isSavingSchedules ? 'Saving' : 'Save'}
            </Text>
          </Pressable>
        </View>
        <View style={[s.gap4, { marginTop: 16 }]}>
          <View>
            <Text style={[s.cap11b, { marginBottom: 8 }]}>Schedule</Text>
            <SelectField
              value={selectedScheduleId}
              options={schedules.map((schedule) => ({
                value: schedule.id,
                label: `${schedule.label || 'Bus Schedule'} · ${formatClockTime(schedule.departureTime)}`,
              }))}
              onSelect={(value) => {
                const nextSchedule = schedules.find((item) => item.id === value);
                setSelectedScheduleId(value);
                if (nextSchedule) {
                  const nextDate = getNextTravelDate(nextSchedule);
                  setTravelDate(nextDate);
                  const parsedDate = parseDateKey(nextDate);
                  if (!parsedDate) return;
                  setCalendarMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
                }
                setSelectedSeats([]);
              }}
              style={s.input}
              textStyle={s.inputText}
            />
          </View>

          <View>
            <Text style={[s.cap11b, { marginBottom: 8 }]}>Travel Date</Text>
            <Pressable
              onPress={openTravelDatePicker}
              accessibilityLabel="Open travel date calendar"
              style={({ pressed }) => [s.input, s.rowBetween, pressed ? s.pressedScale : null]}
            >
              <Text style={s.inputText}>{formatDisplayDate(travelDate)}</Text>
              <CalendarDays size={18} color={colors.slate[500]} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={s.gap3}>
        <View style={[s.slotsHead, s.rowBetween]}>
          <View style={s.shrink}>
            <Text style={s.cap11b}>Departure Slots</Text>
            <Text style={[s.textSm, s.mt1Slate500, { fontWeight: '500' }]}>Add, pause, or update the assigned bus schedules from here.</Text>
          </View>
          <Pressable onPress={addScheduleDraft} style={({ pressed }) => [s.addScheduleBtn, pressed ? s.pressedScale : null]}>
            <Plus size={15} color={colors.slate[700]} />
            <Text style={[s.btnCaps, { color: colors.slate[700] }]}>Add Schedule</Text>
          </Pressable>
        </View>

        {scheduleDrafts.map((schedule, index) => {
          const active = schedule.id === selectedScheduleId;
          const isPersisted = persistedScheduleIds.has(schedule.id);
          const fg = active ? colors.white : colors.slate[900];
          const softBg = active ? alpha(colors.white, 0.1) : colors.slate[50];
          const capColor = active ? alpha(colors.white, 0.55) : colors.slate[400];

          return (
            <Pressable
              key={schedule.id}
              // typing in the card's fields must not switch the live schedule (the fields take their own touches)
              onPress={() => selectScheduleForOps(schedule)}
              style={[s.scheduleCard, active ? s.scheduleCardActive : s.scheduleCardIdle]}
            >
              <View style={s.rowBetweenStart}>
                <View>
                  <Text style={[s.cap10, { color: capColor }]}>Route Slot</Text>
                  <Text style={[s.textLgBlack, { marginTop: 8, color: fg }]}>{`Schedule ${index + 1}`}</Text>
                </View>
                <View style={s.rowGap2}>
                  <Pressable
                    onPress={() => selectScheduleForOps(schedule)}
                    disabled={!isPersisted}
                    style={[s.opsChip, { backgroundColor: active ? colors.white : colors.slate[100] }, !isPersisted ? { opacity: 0.5 } : null]}
                  >
                    <Text style={[s.cap10, { color: active ? colors.slate[900] : colors.slate[600] }]}>
                      {active ? 'Live Now' : isPersisted ? 'Use for Ops' : 'Save First'}
                    </Text>
                  </Pressable>
                  {scheduleDrafts.length > 1 ? (
                    <Pressable
                      onPress={() => removeScheduleDraft(schedule.id)}
                      style={[
                        s.removeBtn,
                        active
                          ? { borderColor: alpha(colors.white, 0.15), backgroundColor: alpha(colors.white, 0.1) }
                          : { borderColor: colors.rose[200], backgroundColor: colors.white },
                      ]}
                    >
                      <XCircle size={16} color={active ? colors.white : colors.rose[500]} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={[s.gap3, { marginTop: 16 }]}>
                <TextInput
                  value={schedule.label}
                  onChangeText={(text) => updateScheduleDraftField(schedule.id, 'label', text)}
                  placeholder="Daily Evening Service"
                  placeholderTextColor={active ? alpha(colors.white, 0.45) : colors.slate[400]}
                  style={[s.draftField, s.draftText, { backgroundColor: softBg, color: fg }]}
                />
                <TimeField
                  value={schedule.departureTime}
                  onPick={(value) => updateScheduleDraftField(schedule.id, 'departureTime', value)}
                  style={[s.draftField, { backgroundColor: softBg }]}
                  textStyle={[s.draftText, { color: fg }]}
                />
                <SelectField
                  value={schedule.status}
                  options={SCHEDULE_STATUS_OPTIONS}
                  onSelect={(value) => updateScheduleDraftField(schedule.id, 'status', value)}
                  style={[s.draftField, { backgroundColor: softBg }]}
                  textStyle={[s.draftText, { color: fg }]}
                  iconColor={active ? colors.white : colors.slate[500]}
                />
              </View>

              <View style={[s.gap3, { marginTop: 12 }]}>
                <View style={[s.draftBox, { backgroundColor: softBg }]}>
                  <Text style={[s.cap10, { color: capColor }]}>Arrival</Text>
                  <TimeField
                    value={schedule.arrivalTime}
                    onPick={(value) => updateScheduleDraftField(schedule.id, 'arrivalTime', value)}
                    style={{ marginTop: 4 }}
                    textStyle={[s.draftText, { color: fg }]}
                  />
                </View>
                <View style={[s.draftBox, { backgroundColor: softBg }]}>
                  <Text style={[s.cap10, { color: capColor }]}>Active Days</Text>
                  <Text style={[s.textSmBlack, { marginTop: 4, color: fg }]}>
                    {Array.isArray(schedule.activeDays) && schedule.activeDays.length ? schedule.activeDays.join(', ') : 'No days selected'}
                  </Text>
                </View>
              </View>

              <View style={s.dayWrap}>
                {DAY_OPTIONS.map((day) => {
                  const enabled = schedule.activeDays.includes(day);
                  const tone = enabled
                    ? active
                      ? { borderColor: colors.white, backgroundColor: colors.white, color: colors.slate[900] }
                      : { borderColor: colors.blue[600], backgroundColor: colors.blue[600], color: colors.white }
                    : active
                      ? { borderColor: alpha(colors.white, 0.15), backgroundColor: alpha(colors.white, 0.1), color: colors.white }
                      : { borderColor: colors.slate[200], backgroundColor: colors.white, color: colors.slate[500] };
                  return (
                    <Pressable
                      key={`${schedule.id}-${day}`}
                      onPress={() => toggleScheduleDraftDay(schedule.id, day)}
                      style={[s.dayChip, { borderColor: tone.borderColor, backgroundColor: tone.backgroundColor }]}
                    >
                      <Text style={[s.dayChipText, { color: tone.color }]}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderDeskTab = () => (
    <View style={s.gap5}>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <View style={s.shrink}>
            <Text style={s.cap11}>Seat Reservation Desk</Text>
            <Text style={[s.textXlBlack, { marginTop: 8 }]}>Reserve seats and manage live availability</Text>
          </View>
          <Pressable onPress={refreshDesk} style={s.iconBtn}>
            <RefreshCcw size={18} color={colors.slate[700]} />
          </Pressable>
        </View>

        {deskError ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{deskError}</Text>
          </View>
        ) : null}

        <View style={[s.gap3, { marginTop: 20 }]}>
          <View style={s.tileSlim}>
            <Text style={s.cap10}>Available Seats</Text>
            <Text style={[s.textLgBlack, { marginTop: 4 }]}>{layout?.availableSeats ?? 0}</Text>
          </View>
          <View style={s.tileSlim}>
            <Text style={s.cap10}>Selected</Text>
            <Text style={[s.textLgBlack, { marginTop: 4 }]}>{selectedSeats.length}</Text>
          </View>
          <View style={s.tileSlim}>
            <Text style={s.cap10}>Reserve Fare</Text>
            <Text style={[s.textLgBlack, { marginTop: 4 }]}>{formatCurrency(selectedFare, busService.fareCurrency)}</Text>
          </View>
        </View>
      </View>

      <View style={s.gap4}>
        {loadingDesk ? (
          <View style={s.deskLoading}>
            <Text style={s.deskLoadingText}>Loading seat desk...</Text>
          </View>
        ) : (
          <>
            <SeatDeck
              title="Lower Deck"
              rows={layout?.blueprint?.lowerDeck || []}
              selectedSeatIds={selectedSeatIds}
              onToggle={handleToggleSeat}
            />
            <SeatDeck
              title="Upper Deck"
              rows={layout?.blueprint?.upperDeck || []}
              selectedSeatIds={selectedSeatIds}
              onToggle={handleToggleSeat}
            />
          </>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.textSmBlack}>Passenger Reservation Form</Text>
        <View style={[s.gap3, { marginTop: 16 }]}>
          <PassengerFields passenger={passenger} setPassenger={setPassenger} />
          {renderPaymentToggle()}
        </View>

        {selectedSeats.length > 0 ? (
          <View style={s.selectedBox}>
            <Text style={s.cap10}>Selected Seats</Text>
            <Text style={[s.textSmBlack, { marginTop: 4 }]}>{selectedSeats.map((seat) => seat.label).join(', ')}</Text>
          </View>
        ) : null}

        {layout?.bus?.cancellationPolicy ? (
          <View style={s.policyBox}>
            <Text style={[s.cap10, { color: colors.amber[600] }]}>Cancellation Policy</Text>
            <Text style={s.policyText}>{layout.bus.cancellationPolicy}</Text>
          </View>
        ) : null}

        {renderReserveButton('Reserve Seats')}
      </View>
    </View>
  );

  const renderBookingsHeader = () => (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <View style={s.shrink}>
          <Text style={s.cap11}>Bookings</Text>
          <Text style={[s.textXlBlack, { marginTop: 8 }]}>
            {bookingScope === 'run' ? 'Passenger list for the selected run' : bookingScope === 'today' ? "All of today's bookings" : 'Upcoming bookings'}
          </Text>
        </View>
        <View style={s.countPill}>
          <Text style={s.countPillText}>
            {loadingScoped ? '...' : `${filteredBookings.length} of ${listedBookings.length}`}
          </Text>
        </View>
      </View>
      <Pressable onPress={() => setActiveTab('desk')} style={({ pressed }) => [s.addPassengerBtn, pressed ? s.pressedScale : null]}>
        <Users size={16} color={colors.white} />
        <Text style={[s.textSmBlack, { color: colors.white }]}>Add passenger</Text>
      </Pressable>
      <View style={[s.row3, { marginTop: 16 }]}>
        {[
          { id: 'run', label: 'This run' },
          { id: 'today', label: 'Today' },
          { id: 'upcoming', label: 'Upcoming' },
        ].map((option) => {
          const selected = bookingScope === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setBookingScope(option.id)}
              style={[s.segment, selected ? s.segmentActive : s.segmentIdle]}
            >
              <Text style={[s.btnCaps, { color: selected ? colors.white : colors.slate[500] }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[s.gap3, { marginTop: 16 }]}>
        <Pressable onPress={openTravelDatePicker} style={({ pressed }) => [s.tileSm, pressed ? s.pressedScale : null]}>
          <Text style={s.cap10}>Travel Date</Text>
          <Text style={[s.textSmBlack, { marginTop: 4 }]}>{travelDate || 'NA'}</Text>
        </Pressable>
        <View style={s.tileSm}>
          <Text style={s.cap10}>Schedule</Text>
          <Text style={[s.textSmBlack, { marginTop: 4 }]}>{selectedSchedule?.label || 'Bus Schedule'}</Text>
        </View>
        <View style={s.tileSm}>
          <Text style={s.cap10}>Departure</Text>
          <Text style={[s.textSmBlack, { marginTop: 4 }]}>{formatClockTime(selectedSchedule?.departureTime)}</Text>
        </View>
      </View>

      <View style={[s.gap3, { marginTop: 16 }]}>
        <View>
          <View style={[s.iconLabel, { marginBottom: 8 }]}>
            <Search size={13} color={colors.slate[400]} />
            <Text style={s.cap11b}>Search Passenger</Text>
          </View>
          <View style={s.searchBox}>
            <Search size={16} color={colors.slate[400]} />
            <TextInput
              value={bookingSearch}
              onChangeText={setBookingSearch}
              placeholder="Name, phone, booking id, seat..."
              placeholderTextColor={colors.slate[400]}
              style={s.searchInput}
            />
          </View>
        </View>

        <View>
          <View style={[s.iconLabel, { marginBottom: 8 }]}>
            <Filter size={13} color={colors.slate[400]} />
            <Text style={s.cap11b}>Booking Filter</Text>
          </View>
          <View style={s.filterGrid}>
            {[
              { id: 'all', label: 'All' },
              { id: 'manual', label: 'Manual' },
              { id: 'confirmed', label: 'Confirmed' },
              { id: 'pending', label: 'Pending' },
            ].map((option) => {
              const active = bookingFilter === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setBookingFilter(option.id)}
                  style={[s.segment, s.filterCell, active ? s.segmentActive : s.segmentIdle]}
                >
                  <Text style={[s.btnCaps, { color: active ? colors.white : colors.slate[500] }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );

  const renderBookingCard = ({ item: booking, index }) => {
    const passengerInfo = booking.passenger || {};
    const isPaid = booking.paymentStatus !== 'unpaid';
    const isManual = booking.bookingSource !== 'user';
    const initial = String(passengerInfo.name || 'P').trim().charAt(0).toUpperCase();
    return (
      <View style={s.bookingCard}>
        <View style={s.bookingHead}>
          <View style={[s.rowStart, s.shrink, { alignItems: 'center' }]}>
            <View style={s.initialBox}>
              <Text style={s.initialText}>{initial}</Text>
            </View>
            <View style={s.shrink}>
              <Text style={[s.cap10, { color: colors.blue[600], fontWeight: '900' }]}>{`Passenger ${index + 1}`}</Text>
              <Text numberOfLines={1} style={s.bookingName}>{passengerInfo.name || 'Passenger'}</Text>
            </View>
          </View>
          <View style={s.bookingHeadRight}>
            <View style={[s.payPill, { backgroundColor: isPaid ? colors.emerald[100] : colors.amber[100] }]}>
              <Text style={[s.payPillText, { color: isPaid ? colors.emerald[700] : colors.amber[700] }]}>
                {isPaid ? 'Paid' : 'Unpaid'}
              </Text>
            </View>
            <Text style={s.bookingSource}>{isManual ? 'Booked at desk' : booking.status}</Text>
          </View>
        </View>

        <View style={s.bookingBody}>
          <View style={s.chipWrap}>
            {passengerInfo.age ? (
              <View style={s.greyChip}>
                <Text style={s.greyChipText}>{`Age ${passengerInfo.age}`}</Text>
              </View>
            ) : null}
            {passengerInfo.gender ? (
              <View style={s.greyChip}>
                <Text style={s.greyChipText}>{passengerInfo.gender}</Text>
              </View>
            ) : null}
            {(booking.seatLabels || []).map((label) => (
              <View key={label} style={s.seatChip}>
                <Text style={s.seatChipText}>{`Seat ${label}`}</Text>
              </View>
            ))}
          </View>

          <View style={s.row2Gap3}>
            <View style={[s.tileSm, s.flex1, { paddingVertical: 12 }]}>
              <View style={s.iconLabel}>
                <CalendarDays size={13} color={colors.slate[400]} />
                <Text style={s.cap10}>Travel</Text>
              </View>
              <Text style={[s.textSmBlack, { marginTop: 4 }]}>
                {`${booking.travelDate || 'NA'} - ${formatClockTime(booking.routeSnapshot?.departureTime)}`}
              </Text>
            </View>
            <View style={[s.tileSm, s.flex1, { paddingVertical: 12 }]}>
              <View style={s.iconLabel}>
                <UserRound size={13} color={colors.slate[400]} />
                <Text style={s.cap10}>Fare</Text>
              </View>
              <Text style={[s.textSmBlack, { marginTop: 4 }]}>{formatCurrency(booking.amount, booking.currency)}</Text>
            </View>
          </View>

          <View style={s.contactRow}>
            <View style={s.shrink}>
              <View style={s.iconLabel}>
                <Phone size={13} color={colors.slate[400]} />
                <Text style={s.cap10}>Contact</Text>
              </View>
              <Text numberOfLines={1} style={[s.textSmBlack, { marginTop: 4 }]}>{passengerInfo.phone || 'NA'}</Text>
            </View>
            {passengerInfo.phone ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${passengerInfo.phone}`).catch(() => {})}
                style={({ pressed }) => [s.callBtn, pressed ? s.pressedScale : null]}
              >
                <Text style={s.callBtnText}>Call</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={s.iconLabel}>
            <Ticket size={13} color={colors.slate[300]} />
            <Text style={s.bookingCode}>{booking.bookingCode}</Text>
          </View>
          {booking.notes ? (
            <View style={s.notesBox}>
              <Text style={[s.textSm, { color: colors.slate[600] }]}>{booking.notes}</Text>
            </View>
          ) : null}

          {!isPaid && isManual ? (
            <Pressable
              disabled={markingPaidId === booking.id}
              onPress={() => handleMarkPaid(booking)}
              style={({ pressed }) => [
                s.markPaidBtn,
                markingPaidId === booking.id ? { opacity: 0.6 } : null,
                pressed ? s.pressedScale : null,
              ]}
            >
              <Text style={[s.textSmBlack, { color: colors.white }]}>
                {markingPaidId === booking.id ? 'Saving...' : 'Mark fare as collected'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  if (loadingProfile) {
    return (
      <View style={[s.root, s.loadingRoot]}>
        <ActivityIndicator size="large" color={colors.slate[900]} />
      </View>
    );
  }

  const showBookingRows = activeTab === 'bookings' && Boolean(busService);

  const renderHero = () => (
    <View style={s.heroShadow}>
      <LinearGradient colors={['#12348c', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <View style={s.rowStartGap4}>
          <View style={s.heroIcon}>
            <Bus size={26} color={colors.white} />
          </View>
          <View style={s.shrink}>
            <Text style={[s.heroCap, { letterSpacing: 2.42 }]}>Bus Driver Console</Text>
            <Text style={s.heroName}>{profile?.name || 'Bus Driver'}</Text>
            <Text style={s.heroSub}>
              {`${busService?.busName || 'No bus assigned'} ${busService?.serviceNumber ? `· ${busService.serviceNumber}` : ''}`}
            </Text>
          </View>
        </View>

        <View style={[s.row3Gap3, { marginTop: 20 }]}>
          {[
            { label: 'Schedules', value: profile?.metrics?.totalSchedules || 0 },
            { label: 'Capacity', value: profile?.metrics?.totalCapacity || 0 },
            { label: 'Bookings', value: profile?.metrics?.upcomingBookings || 0 },
          ].map((item) => (
            <View key={item.label} style={s.heroTile}>
              <Text style={[s.cap10, { color: alpha(colors.white, 0.5) }]}>{item.label}</Text>
              <Text style={[s.text2xlBlack, { marginTop: 8, color: colors.white }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={s.heroDateRow}>
          <View style={s.shrink}>
            <Text style={[s.cap10, { color: alpha(colors.white, 0.5) }]}>Selected Travel Date</Text>
            <Text numberOfLines={1} style={[s.textSmBlack, { marginTop: 4, color: colors.white }]}>{formatDisplayDate(travelDate)}</Text>
          </View>
          <Pressable onPress={openTravelDatePicker} style={({ pressed }) => [s.heroCalendarBtn, pressed ? s.pressedScale : null]}>
            <CalendarDays size={15} color={colors.white} />
            <Text style={[s.btnCaps, { color: colors.white }]}>Calendar</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );

  const renderAccount = () => (
    <View style={s.gap4}>
      <View style={s.card}>
        <View style={s.rowStartGap4Center}>
          <View style={s.accountIcon}>
            <Bus size={26} color={colors.white} />
          </View>
          <View style={s.shrink}>
            <Text numberOfLines={1} style={s.textXlBlack}>{profile?.name || 'Bus Driver'}</Text>
            <Text style={[s.textSm, { fontWeight: '600', color: colors.slate[500] }]}>{profile?.phone || ''}</Text>
          </View>
        </View>
        <View style={[s.row2Gap3, { marginTop: 16 }]}>
          <View style={[s.tileSm, s.flex1]}>
            <Text style={s.cap10}>Bus</Text>
            <Text style={[s.textSmBlack, { marginTop: 4 }]}>{busService?.busName || 'Not assigned'}</Text>
          </View>
          <View style={[s.tileSm, s.flex1]}>
            <Text style={s.cap10}>Service no.</Text>
            <Text style={[s.textSmBlack, { marginTop: 4 }]}>{busService?.serviceNumber || '-'}</Text>
          </View>
        </View>
      </View>
      <Pressable onPress={confirmLogout} style={({ pressed }) => [s.logoutBtn, pressed ? s.pressedScale : null]}>
        <Text style={s.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );

  const renderTabBody = () => {
    if (activeTab === 'profile') return renderAccount();
    if (!busService) {
      return (
        <View style={[s.card, { alignItems: 'center' }]}>
          <Text style={[s.textLgBlack, { textAlign: 'center' }]}>No bus assigned yet</Text>
          <Text style={[s.textSm, { marginTop: 8, color: colors.slate[500], textAlign: 'center' }]}>
            Assign this driver from the admin bus service page using driver name and phone.
          </Text>
        </View>
      );
    }
    if (activeTab === 'overview') return renderOverviewTab();
    if (activeTab === 'schedule') return renderScheduleTab();
    if (activeTab === 'desk') return renderDeskTab();
    if (activeTab === 'bookings') return renderBookingsHeader();
    return null;
  };

  const listHeader = (
    <View style={s.gap5}>
      {activeTab === 'overview' ? renderHero() : null}
      {renderTabBody()}
    </View>
  );

  const runDetailsMaxHeight = windowHeight - insets.top - insets.bottom - 32;

  return (
    <FontScope family={fonts.jakarta}>
      <View style={s.root}>
        {activeTab !== 'overview' ? (
          <View style={[s.stickyBar, { paddingTop: insets.top + 12 }]}>
            <View style={s.rowGap3}>
              <Pressable onPress={() => setActiveTab('overview')} style={({ pressed }) => [s.backBtn, pressed ? s.pressedScale : null]}>
                <ArrowLeft size={16} color={colors.slate[900]} />
              </Pressable>
              <Text style={s.textLgBlack}>
                {{ schedule: 'Schedule', desk: 'Seat desk', bookings: 'Bookings', profile: 'Account' }[activeTab] || activeTab}
              </Text>
            </View>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={showBookingRows ? filteredBookings : []}
          keyExtractor={(item, index) => String(item?.id ?? `booking-${index}`)}
          renderItem={renderBookingCard}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={showBookingRows ? { marginBottom: 20 } : null}
          ItemSeparatorComponent={BookingSeparator}
          ListEmptyComponent={
            showBookingRows ? (
              <View style={s.emptyBookings}>
                <Text style={s.emptyBookingsText}>No bookings match this search.</Text>
              </View>
            ) : null
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: activeTab === 'overview' ? insets.top + 24 : 20,
            paddingBottom: bottomSpace,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handlePullRefresh} />}
        />

        {activeTab === 'overview' ? <StatusBarScrim color={PAGE_BG} /> : null}

        <BusDriverBottomNav activeTab={activeTab} onChangeTab={setActiveTab} />

        <Dialog
          open={isRunDetailsOpen}
          onClose={() => setIsRunDetailsOpen(false)}
          backdropOpacity={0.45}
          style={s.runDialog}
        >
          <ScrollView
            style={{ maxHeight: runDetailsMaxHeight }}
            contentContainerStyle={s.runDialogContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.heroShadow}>
              <LinearGradient colors={['#12348c', '#3b82f6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { borderRadius: 28 }]}>
                <View style={s.rowBetweenStart}>
                  <View style={s.shrink}>
                    <Text style={[s.cap11, { color: alpha(colors.white, 0.55) }]}>{"Today's Bus Run"}</Text>
                    <Text style={[s.text2xlBlack, { marginTop: 8, color: colors.white }]}>{busService?.busName || 'Assigned Bus'}</Text>
                    <Text style={[s.textSm, { marginTop: 4, color: alpha(colors.white, 0.7) }]}>
                      {`${formatDisplayDate(travelDate)} · ${selectedSchedule?.label || 'Schedule'} · ${formatClockTime(selectedSchedule?.departureTime)}`}
                    </Text>
                  </View>
                  <Pressable onPress={() => setIsRunDetailsOpen(false)} style={({ pressed }) => [s.runClose, pressed ? s.pressedScale : null]}>
                    <XCircle size={18} color={colors.white} />
                  </Pressable>
                </View>

                <View style={[s.gap3, { marginTop: 20 }]}>
                  {[
                    { label: 'Available', value: layout?.availableSeats ?? 0 },
                    { label: 'Occupied', value: occupiedSeatCount },
                    { label: 'Stops', value: routeStops.length },
                    { label: 'Selected', value: selectedSeats.length },
                  ].map((item) => (
                    <View key={item.label} style={s.heroTile}>
                      <Text style={[s.cap10, { color: alpha(colors.white, 0.5) }]}>{item.label}</Text>
                      <Text style={[s.text2xlBlack, { marginTop: 8, color: colors.white }]}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>
            </View>

            <View style={[s.gap4, { marginTop: 16 }]}>
              <View style={s.card}>
                <View style={s.rowBetweenStart}>
                  <View style={s.shrink}>
                    <Text style={s.cap11}>Run Overview</Text>
                    <Text style={[s.textLgBlack, { marginTop: 8 }]}>
                      {`${busService?.route?.originCity || 'Origin'} to ${busService?.route?.destinationCity || 'Destination'}`}
                    </Text>
                    <Text style={[s.textSm, s.mt1Slate500]}>{busService?.route?.routeName || 'Standard route'}</Text>
                  </View>
                  <Pressable onPress={refreshDesk} style={s.iconBtn}>
                    <RefreshCcw size={18} color={colors.slate[700]} />
                  </Pressable>
                </View>

                <View style={[s.gap3, { marginTop: 16 }]}>
                  <View style={s.tile}>
                    <View style={s.iconLabel}>
                      <Phone size={14} color={colors.slate[400]} />
                      <Text style={s.cap11b}>Driver</Text>
                    </View>
                    <Text style={[s.textSmBlack, { marginTop: 8 }]}>{busService?.driverName || profile?.name}</Text>
                    <Text style={[s.textSm, s.mt1Slate500]}>{busService?.driverPhone || profile?.phone}</Text>
                  </View>
                  <View style={s.tile}>
                    <View style={s.iconLabel}>
                      <Clock3 size={14} color={colors.slate[400]} />
                      <Text style={s.cap11b}>Trip Window</Text>
                    </View>
                    <Text style={[s.textSmBlack, { marginTop: 8 }]}>
                      {`${formatClockTime(selectedSchedule?.departureTime)} to ${formatClockTime(selectedSchedule?.arrivalTime)}`}
                    </Text>
                    <Text style={[s.textSm, s.mt1Slate500]}>{selectedSchedule?.status || 'active'}</Text>
                  </View>
                </View>
              </View>

              <View style={s.card}>
                <View style={s.rowBetween}>
                  <View style={s.shrink}>
                    <Text style={s.cap11}>Seat Blueprint</Text>
                    <Text style={[s.textLgBlack, { marginTop: 8 }]}>Add or remove seats live</Text>
                  </View>
                  <View style={s.fareBox}>
                    <Text style={s.cap10}>Reserve Fare</Text>
                    <Text style={[s.textLgBlack, { marginTop: 4 }]}>{formatCurrency(selectedFare, busService?.fareCurrency)}</Text>
                  </View>
                </View>

                <View style={[s.gap4, { marginTop: 16 }]}>
                  <SeatDeck
                    title="Lower Deck"
                    rows={layout?.blueprint?.lowerDeck || []}
                    selectedSeatIds={selectedSeatIds}
                    onToggle={handleToggleSeat}
                  />
                  <SeatDeck
                    title="Upper Deck"
                    rows={layout?.blueprint?.upperDeck || []}
                    selectedSeatIds={selectedSeatIds}
                    onToggle={handleToggleSeat}
                  />
                </View>

                {selectedSeats.length ? (
                  <View style={s.selectedBox}>
                    <Text style={s.cap10}>Selected Seats</Text>
                    <View style={[s.chipWrap, { marginTop: 8 }]}>
                      {selectedSeats.map((seat) => (
                        <Pressable key={`selected-seat-${seat.id}`} onPress={() => handleToggleSeat(seat)} style={s.removeSeatChip}>
                          <Text style={[s.dayChipText, { color: colors.white }]}>{`${seat.label} · Remove`}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={s.card}>
                <Text style={s.cap11}>Stops</Text>
                <View style={[s.gap3, { marginTop: 16 }]}>
                  <MiniTile label="Pickup Stops" value={pickupStops.length} />
                  <MiniTile label="Drop Stops" value={dropStops.length} />
                  <MiniTile label="Occupied Labels" value={occupiedSeatLabels.length || 0} valueStyle={s.textSmBlack} />
                </View>

                <View style={[s.gap3, { marginTop: 16 }]}>
                  {routeStops.length ? routeStops.map((stop, index) => renderRouteStop(stop, index, false)) : renderNoStops()}
                </View>
              </View>

              <View style={s.card}>
                <Text style={s.textSmBlack}>Reserve Seats Right Here</Text>
                <View style={[s.gap3, { marginTop: 16 }]}>
                  <PassengerFields passenger={passenger} setPassenger={setPassenger} />
                  {renderPaymentToggle()}
                </View>
                {renderReserveButton('Reserve Selected Seats')}
              </View>
            </View>
          </ScrollView>
        </Dialog>

        <Dialog
          open={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          backdropOpacity={0.35}
          style={s.calendarCard}
        >
          <View style={[s.rowBetweenStart, { marginBottom: 16 }]}>
            <View>
              <Text style={s.cap10}>Travel Date</Text>
              <Text style={[s.textSmBlack, { marginTop: 4 }]}>{calendarLabel}</Text>
            </View>
            <Pressable
              onPress={() => setIsCalendarOpen(false)}
              accessibilityLabel="Close travel date calendar"
              style={({ pressed }) => [s.calendarClose, pressed ? s.pressedScale : null]}
            >
              <XCircle size={18} color={colors.slate[700]} />
            </Pressable>
          </View>

          <View style={[s.rowBetween, { marginBottom: 16 }]}>
            <Pressable
              onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              style={s.monthBtn}
            >
              <ChevronLeft size={16} color={colors.slate[700]} />
            </Pressable>
            <Text style={s.textSmBlack}>{calendarLabel}</Text>
            <Pressable
              onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              style={s.monthBtn}
            >
              <ChevronRight size={16} color={colors.slate[700]} />
            </Pressable>
          </View>

          <View style={[s.weekRow, { marginBottom: 8 }]}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} style={s.weekDay}>{day}</Text>
            ))}
          </View>

          <View style={s.gap2}>
            {calendarWeeks.map((week, weekIndex) => (
              <View key={`calendar-week-${weekIndex}`} style={s.weekRow}>
                {week.map((cell, cellIndex) => {
                  if (!cell) {
                    return <View key={`calendar-empty-${weekIndex}-${cellIndex}`} style={s.dayCellEmpty} />;
                  }

                  const isSelected = cell.value === travelDate;
                  const isToday = cell.value === createToday();
                  // A service date that has already passed cannot be picked.
                  const isPast = cell.value < createToday();

                  return (
                    <Pressable
                      key={cell.value}
                      disabled={isPast}
                      onPress={() => handleTravelDateSelect(cell.value)}
                      style={[
                        s.dayCell,
                        isSelected ? s.dayCellSelected : isToday ? s.dayCellToday : s.dayCellIdle,
                        isPast ? { opacity: 0.3 } : null,
                      ]}
                    >
                      <Text
                        style={[
                          s.textSmBlack,
                          { color: isSelected ? colors.white : isToday ? colors.slate[900] : colors.slate[600] },
                        ]}
                      >
                        {cell.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </Dialog>
      </View>
    </FontScope>
  );
};

const BookingSeparator = () => <View style={{ height: 12 }} />;

const cardBase = {
  borderRadius: 28,
  borderWidth: 1,
  borderColor: colors.slate[200],
  backgroundColor: colors.white,
  padding: 20,
  ...shadow.sm,
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  loadingRoot: { alignItems: 'center', justifyContent: 'center' },
  flex1: { flex: 1 },
  shrink: { flexShrink: 1, minWidth: 0 },
  gap2: { gap: 8 },
  gap3: { gap: 12 },
  gap4: { gap: 16 },
  gap5: { gap: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowBetweenStart: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  rowStart: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowStartGap4: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  rowStartGap4Center: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  rowGap2: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowGap3: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  row2: { flexDirection: 'row', gap: 8 },
  row2Gap3: { flexDirection: 'row', gap: 12 },
  row3: { flexDirection: 'row', gap: 8 },
  row3Gap3: { flexDirection: 'row', gap: 12 },
  iconLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressedScale: { transform: [{ scale: 0.95 }] },
  pressedSoft: { backgroundColor: colors.slate[100], transform: [{ scale: 0.99 }] },

  cap10: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6, color: colors.slate[400] },
  cap11: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.98, color: colors.slate[400] },
  cap11b: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.76, color: colors.slate[400] },
  btnCaps: { fontSize: 11, lineHeight: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.32 },
  textXs: { fontSize: 12, lineHeight: 16 },
  textSm: { fontSize: 14, lineHeight: 20, color: colors.slate[900] },
  textSmBlack: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  textLgBlack: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[900] },
  textXlBlack: { fontSize: 20, lineHeight: 28, fontWeight: '900', color: colors.slate[900] },
  text2xlBlack: { fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.slate[900] },
  mt1Slate500: { marginTop: 4, color: colors.slate[500] },
  textBlue600: { color: colors.blue[600] },

  card: cardBase,
  tile: { borderRadius: 16, backgroundColor: colors.slate[50], padding: 16 },
  tileSlim: { borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  tileSm: { borderRadius: 16, backgroundColor: colors.slate[50], padding: 12 },
  fareBox: { borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 12, paddingVertical: 8, alignItems: 'flex-end' },
  liveBadge: { borderRadius: 16, backgroundColor: colors.blue[600], paddingHorizontal: 16, paddingVertical: 12 },

  heroShadow: {
    borderRadius: 32,
    backgroundColor: '#12348c',
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
  hero: { borderRadius: 32, padding: 20, overflow: 'hidden' },
  heroIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: '#2f67f6', alignItems: 'center', justifyContent: 'center' },
  heroCap: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', color: alpha(colors.white, 0.6) },
  heroName: { marginTop: 4, fontSize: 28, lineHeight: 30, fontWeight: '900', color: colors.white },
  heroSub: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '500', color: alpha(colors.white, 0.7) },
  heroTile: { flex: 1, borderRadius: 16, backgroundColor: alpha(colors.white, 0.08), padding: 12 },
  heroDateRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.1),
    backgroundColor: alpha(colors.white, 0.08),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heroCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: alpha(colors.white, 0.15),
    backgroundColor: alpha(colors.white, 0.1),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  stickyBar: {
    zIndex: 30,
    backgroundColor: alpha(PAGE_BG, 0.95),
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
    alignItems: 'center',
    justifyContent: 'center',
  },

  statCard: { borderRadius: 16, padding: 16, ...shadow.sm },
  statCardLight: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[200] },
  statCardDark: { backgroundColor: colors.blue[600] },
  statIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  stopCard: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: alpha(colors.slate[50], 0.7), padding: 16 },
  stopIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  stopRight: { flexShrink: 0, alignItems: 'flex-end' },
  stopTime: { marginTop: 8, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500] },
  landmark: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', color: colors.slate[500] },
  stopChip: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  stopChipText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
  dashedNote: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.slate[200], backgroundColor: colors.slate[50], padding: 16 },
  dashedNoteText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.slate[500] },

  quickPrimary: { borderRadius: 16, backgroundColor: colors.blue[600], paddingHorizontal: 16, paddingVertical: 16, ...shadow.lg },
  quickSecondary: { borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 16 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  blueShadowBtn: { backgroundColor: colors.blue[600], ...shadow.lg },
  input: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '700',
    color: colors.slate[900],
  },
  inputText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
  textarea: { height: undefined, minHeight: 92, paddingVertical: 12 },
  selectField: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetBody: { backgroundColor: colors.white },
  sheetScroll: { maxHeight: 420 },
  sheetList: { padding: 12, gap: 4 },
  sheetOption: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  sheetOptionActive: { backgroundColor: colors.blue[50] },
  sheetOptionText: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.slate[900] },
  iosPickerCard: { backgroundColor: colors.white, borderRadius: 28, padding: 16 },
  iosPickerDone: { marginTop: 8, height: 48, borderRadius: 16, backgroundColor: colors.blue[600], alignItems: 'center', justifyContent: 'center' },
  iosPickerDoneText: { fontSize: 14, fontWeight: '900', color: colors.white },

  slotsHead: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...shadow.sm,
  },
  addScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scheduleCard: { borderRadius: 28, borderWidth: 1, padding: 16 },
  scheduleCardActive: { borderColor: colors.blue[600], backgroundColor: colors.blue[600], ...shadow.lg },
  scheduleCardIdle: { borderColor: colors.slate[200], backgroundColor: colors.white, ...shadow.sm },
  opsChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  removeBtn: { borderRadius: 16, borderWidth: 1, padding: 8 },
  draftField: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  draftText: { fontSize: 14, lineHeight: 20, fontWeight: '900' },
  draftBox: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 },
  dayWrap: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  dayChipText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },

  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: { marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.rose[100], backgroundColor: colors.rose[50], paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.rose[600] },
  deskLoading: { borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, padding: 40, alignItems: 'center', ...shadow.sm },
  deskLoadingText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[400], textAlign: 'center' },
  selectedBox: { marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  policyBox: { marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.amber[100], backgroundColor: alpha(colors.amber[50], 0.6), paddingHorizontal: 16, paddingVertical: 12 },
  policyText: { marginTop: 4, fontSize: 14, lineHeight: 24, fontWeight: '600', color: colors.slate[700] },
  payOption: { flex: 1, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  payOptionText: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
  reserveBtn: { marginTop: 16, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  reserveBtnDisabled: { backgroundColor: colors.slate[200] },
  reserveBtnActive: { backgroundColor: colors.blue[600], ...shadow.lg },

  deckCard: { ...cardBase, padding: 16 },
  deckHead: { marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deckTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  deckBadge: { borderRadius: 999, backgroundColor: colors.slate[50], paddingHorizontal: 12, paddingVertical: 4 },
  deckBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6, color: colors.slate[400] },
  deckRow: { flexDirection: 'row', gap: 8 },
  deckGap: { flex: 1, height: 40, borderRadius: 14, backgroundColor: alpha(colors.slate[100], 0.7) },
  seat: { flex: 1, minWidth: 0, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  seatBooked: { borderColor: colors.slate[200], backgroundColor: colors.slate[200] },
  seatSelected: { borderColor: colors.blue[600], backgroundColor: colors.blue[600] },
  seatFree: { borderColor: colors.slate[200], backgroundColor: colors.white },
  seatBar: { position: 'absolute', left: 8, right: 8, top: 4, height: 4, borderRadius: 999, backgroundColor: alpha(colors.slate[200], 0.9) },
  seatText: { fontSize: 10, lineHeight: 14, fontWeight: '900' },

  countPill: { borderRadius: 999, backgroundColor: colors.slate[50], paddingHorizontal: 12, paddingVertical: 8 },
  countPillText: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: colors.slate[500] },
  addPassengerBtn: {
    marginTop: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.blue[600],
    ...shadow.lg,
  },
  segment: { flex: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.blue[600], ...shadow.md },
  segmentIdle: { backgroundColor: colors.slate[50] },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterCell: { flexGrow: 1, flexBasis: '45%' },
  searchBox: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.slate[900], paddingVertical: 0 },

  bookingCard: { overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, ...shadow.sm },
  bookingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    backgroundColor: alpha(colors.blue[50], 0.6),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  initialBox: { width: 44, height: 44, flexShrink: 0, borderRadius: 16, backgroundColor: colors.blue[600], alignItems: 'center', justifyContent: 'center' },
  initialText: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.white },
  bookingName: { fontSize: 16, lineHeight: 24, fontWeight: '900', color: colors.slate[900] },
  bookingHeadRight: { flexShrink: 0, alignItems: 'flex-end', gap: 4 },
  payPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  payPillText: { fontSize: 10, lineHeight: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2 },
  bookingSource: { fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, color: colors.slate[400] },
  bookingBody: { padding: 16, gap: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  greyChip: { borderRadius: 999, backgroundColor: colors.slate[100], paddingHorizontal: 12, paddingVertical: 4 },
  greyChipText: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.slate[700] },
  seatChip: { borderRadius: 999, backgroundColor: colors.blue[600], paddingHorizontal: 12, paddingVertical: 4 },
  seatChipText: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.white },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  callBtn: { flexShrink: 0, borderRadius: 999, backgroundColor: colors.blue[600], paddingHorizontal: 16, paddingVertical: 8 },
  callBtnText: { fontSize: 12, lineHeight: 16, fontWeight: '900', color: colors.white },
  bookingCode: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.54, color: colors.slate[300] },
  notesBox: { borderRadius: 16, backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  markPaidBtn: { height: 44, borderRadius: 16, backgroundColor: colors.emerald[600], alignItems: 'center', justifyContent: 'center' },
  emptyBookings: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 32,
    ...shadow.sm,
  },
  emptyBookingsText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[400], textAlign: 'center' },

  accountIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.blue[600], alignItems: 'center', justifyContent: 'center' },
  logoutBtn: { height: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.rose[200], backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontSize: 14, lineHeight: 20, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.96, color: colors.rose[600] },

  runDialog: {
    maxWidth: 896,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: PAGE_BG,
    shadowColor: '#0f172a',
    shadowOpacity: 0.28,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 30 },
    elevation: 20,
  },
  runDialogContent: { padding: 16 },
  runClose: { width: 44, height: 44, borderRadius: 16, backgroundColor: alpha(colors.white, 0.1), alignItems: 'center', justifyContent: 'center' },
  removeSeatChip: { borderRadius: 999, backgroundColor: colors.blue[600], paddingHorizontal: 12, paddingVertical: 8 },

  calendarCard: {
    maxWidth: 384,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.28,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 30 },
    elevation: 20,
  },
  calendarClose: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: { flexDirection: 'row', gap: 8 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 10, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.4, color: colors.slate[400] },
  dayCellEmpty: { flex: 1, height: 44 },
  dayCell: { flex: 1, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayCellSelected: { backgroundColor: colors.blue[600], ...shadow.md },
  dayCellToday: { borderWidth: 1, borderColor: colors.slate[300], backgroundColor: colors.white },
  dayCellIdle: { backgroundColor: colors.slate[50] },
});

export default BusDriverHome;
