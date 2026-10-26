// Web: driver/pages/OwnerBusBookingsPage.jsx — /taxi/owner/bus-bookings: the owner's bus booking register (filters,
// month calendar, cancel full booking / single seats; refunds follow the bus cancellation rules).
// Native: <select> -> bottom sheet, <input type="date"> -> NativeDateInput (YYYY-MM-DD), <input type="month"> -> the
// system date dialog, whose picked day sets the month (YYYY-MM; Android has no month-only picker). Pull-to-refresh
// reloads the bookings and the calendar.
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Bus, CalendarDays, Check, ChevronDown, ChevronLeft, IndianRupee, Search, Ticket, Users } from 'lucide-react-native';
import { toast } from '@/lib/toast';
import { useNavigate } from '@/lib/router';
import { Sheet, Skeleton, Text, TextInput, useBottomNavSpace } from '@/native/ui';
import { StatusBar } from '@/native/ui/SectionStatusBar';
import { alpha, colors, driverTheme, shadow } from '@/theme';
import { NativeDateInput } from '../components/FleetDocumentFields';
import {
  cancelOwnerBusBookingSeats,
  getOwnerBusBookingCalendar,
  getOwnerBusBookings,
} from '../services/registrationService';

const statusTone = {
  confirmed: { bg: colors.emerald[50], fg: colors.emerald[700], border: colors.emerald[200] },
  pending: { bg: colors.amber[50], fg: colors.amber[700], border: colors.amber[200] },
  cancelled: { bg: colors.rose[50], fg: colors.rose[700], border: colors.rose[200] },
  failed: { bg: colors.slate[100], fg: colors.slate[600], border: colors.slate[200] },
  expired: { bg: colors.slate[100], fg: colors.slate[600], border: colors.slate[200] },
};

const formatCurrency = (amount = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const formatDateLabel = (value) => {
  if (!value) return 'No date';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const getTodayValue = () => new Date().toISOString().slice(0, 10);
const getMonthValue = (value = getTodayValue()) => String(value || '').slice(0, 7);

const buildCalendarCells = (month, dayLookup) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return [];
  const [year, monthIndexValue] = month.split('-').map(Number);
  const monthIndex = monthIndexValue - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingSlots = firstDay.getDay();
  const cells = [];

  for (let index = 0; index < leadingSlots; index += 1) {
    cells.push({ id: `blank-${index}`, isCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({
      id: date,
      date,
      isCurrentMonth: true,
      metrics: dayLookup.get(date) || null,
    });
  }

  return cells;
};

// rows of 7 (web grid-cols-7); the last row is padded so every cell keeps a seventh of the width
const chunkWeeks = (cells) => {
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
};

// <select>: a field that opens a bottom sheet with the options.
const SelectField = ({ value, options, onSelect, title }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.field, styles.selectRow]}>
        <Text style={styles.fieldText} numberOfLines={1}>{selected ? selected.label : ''}</Text>
        <ChevronDown size={16} color={colors.slate[500]} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody}>
          {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Pressable
                key={option.value || '__empty__'}
                onPress={() => {
                  setOpen(false);
                  onSelect(option.value);
                }}
                style={({ pressed }) => [styles.sheetOption, active ? styles.sheetOptionActive : null, pressed ? styles.sheetOptionPressed : null]}
              >
                <Text style={[styles.sheetOptionText, active ? styles.sheetOptionTextActive : null]}>{option.label}</Text>
                {active ? <Check size={16} color={colors.blue[600]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
};

// <input type="month">: value "YYYY-MM"; the browser showed "October 2026".
const MonthInput = ({ value, onChangeValue }) => {
  const [iosOpen, setIosOpen] = useState(false);
  const m = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  const current = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date();
  const toMonth = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onValueChange: (_event, date) => {
          if (date) onChangeValue(toMonth(date));
        },
      });
      return;
    }
    setIosOpen(true);
  };
  const shown = m ? current.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';
  return (
    <>
      <Pressable onPress={open} style={[styles.monthBox, styles.selectRow]}>
        <Text style={styles.fieldText}>{shown || '-------- ----'}</Text>
        <CalendarDays size={16} color={colors.slate[900]} />
      </Pressable>
      {Platform.OS !== 'android' ? (
        <Sheet open={iosOpen} onClose={() => setIosOpen(false)}>
          <View style={styles.sheetBody}>
            <DateTimePicker
              value={current}
              mode="date"
              display="inline"
              onValueChange={(_event, date) => {
                if (date) onChangeValue(toMonth(date));
                setIosOpen(false);
              }}
              onDismiss={() => setIosOpen(false)}
            />
          </View>
        </Sheet>
      ) : null}
    </>
  );
};

const Kicker = ({ children, em = 0.2, style }) => (
  <Text style={[styles.kicker, { letterSpacing: 10 * em }, style]}>{children}</Text>
);

const OwnerBusBookingsPage = () => {
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const bottomSpace = useBottomNavSpace();
  const [filters, setFilters] = useState({
    busServiceId: '',
    travelDate: getTodayValue(),
    status: 'all',
    search: '',
  });
  const [month, setMonth] = useState(getMonthValue());
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [bookingData, setBookingData] = useState({
    buses: [],
    bookings: [],
    summary: {},
  });
  const [calendarDays, setCalendarDays] = useState([]);

  const loadBookings = async (activeFilters) => {
    const response = await getOwnerBusBookings(activeFilters);
    return response?.data?.data || response?.data || {};
  };

  const loadCalendar = async (payload) => {
    const response = await getOwnerBusBookingCalendar(payload);
    return response?.data?.data?.days || response?.data?.days || [];
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const data = await loadBookings(filters);
        if (!active) return;
        setBookingData(data);
        if (!filters.busServiceId && Array.isArray(data?.buses) && data.buses[0]) {
          setFilters((current) => ({ ...current, busServiceId: data.buses[0].id }));
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus bookings');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.busServiceId, filters.search, filters.status, filters.travelDate]);

  useEffect(() => {
    if (!filters.busServiceId) return undefined;
    let active = true;
    const run = async () => {
      setCalendarLoading(true);
      try {
        const days = await loadCalendar({
          busServiceId: filters.busServiceId,
          month,
        });
        if (!active) return;
        setCalendarDays(days);
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus calendar');
      } finally {
        if (active) setCalendarLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [filters.busServiceId, month]);

  const buses = useMemo(() => bookingData.buses || [], [bookingData.buses]);
  const bookings = bookingData.bookings || [];
  const summary = bookingData.summary || {};
  const selectedBus = useMemo(
    () => buses.find((item) => item.id === filters.busServiceId) || null,
    [buses, filters.busServiceId],
  );
  const dayLookup = useMemo(
    () => new Map((calendarDays || []).map((item) => [item.date, item])),
    [calendarDays],
  );
  const calendarCells = useMemo(() => buildCalendarCells(month, dayLookup), [dayLookup, month]);

  const refreshData = async () => {
    const [data, days] = await Promise.all([
      loadBookings(filters),
      filters.busServiceId ? loadCalendar({ busServiceId: filters.busServiceId, month }) : Promise.resolve([]),
    ]);
    setBookingData(data);
    setCalendarDays(days);
  };

  // pull-to-refresh: the page shows its own loading state (row + calendar skeletons) while it reloads
  const onRefresh = async () => {
    setRefreshing(true);
    setLoading(true);
    if (filters.busServiceId) setCalendarLoading(true);
    try {
      await refreshData();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus bookings');
    } finally {
      setLoading(false);
      setCalendarLoading(false);
      setRefreshing(false);
    }
  };

  const handleCancelSeats = async (bookingId, seatIds = []) => {
    setActionLoading(`${bookingId}-${seatIds.join(',') || 'all'}`);
    try {
      const response = await cancelOwnerBusBookingSeats(bookingId, {
        seatIds,
        ownerNote: seatIds.length > 0 ? 'Seat cancelled by owner panel' : 'Booking cancelled by owner panel',
      });
      await refreshData();
      toast.success(response?.data?.message || 'Cancellation processed');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to cancel booking seats');
    } finally {
      setActionLoading('');
    }
  };

  const busOptions = [
    { value: '', label: 'Select bus' },
    ...buses.map((bus) => ({ value: bus.id, label: `${bus.busName} | ${bus.route?.originCity} to ${bus.route?.destinationCity}` })),
  ];
  const statusOptions = [
    { value: 'all', label: 'All bookings' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'pending', label: 'Pending' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'failed', label: 'Failed' },
    { value: 'expired', label: 'Expired' },
  ];

  const summaryCards = [
    { label: 'Bookings', value: String(summary.totalBookings || 0), Icon: Ticket, bg: colors.indigo[50], fg: colors.indigo[600], big: true },
    { label: 'Booked Seats', value: String(summary.totalSeats || 0), Icon: Users, bg: colors.emerald[50], fg: colors.emerald[600], big: true },
    { label: 'Selected Date', value: formatDateLabel(filters.travelDate), Icon: CalendarDays, bg: colors.amber[50], fg: colors.amber[600] },
    { label: 'Revenue', value: formatCurrency(summary.totalAmount || 0, selectedBus?.fareCurrency || 'INR'), Icon: IndianRupee, bg: colors.sky[50], fg: colors.sky[600] },
  ];

  const renderCalendar = () => {
    if (calendarLoading) {
      const placeholders = Array.from({ length: 35 }, (_, index) => ({ id: `loading-${index}` }));
      return chunkWeeks(placeholders).map((week, rowIndex) => (
        <View key={`lw-${rowIndex}`} style={styles.weekRow}>
          {week.map((cell) => (
            <View key={cell.id} style={styles.dayCol}>
              <Skeleton height={96} rounded={20} style={{ backgroundColor: colors.slate[100] }} />
            </View>
          ))}
        </View>
      ));
    }
    return chunkWeeks(calendarCells).map((week, rowIndex) => (
      <View key={`w-${rowIndex}`} style={styles.weekRow}>
        {week.map((cell) => {
          if (!cell.isCurrentMonth) {
            return (
              <View key={cell.id} style={styles.dayCol}>
                <View style={styles.dayBlank} />
              </View>
            );
          }
          const selected = filters.travelDate === cell.date;
          const fg = selected ? colors.white : colors.slate[900];
          return (
            <View key={cell.id} style={styles.dayCol}>
              <Pressable
                onPress={() => setFilters((current) => ({ ...current, travelDate: cell.date }))}
                style={[styles.dayCell, selected ? styles.dayCellSelected : null]}
              >
                <View style={styles.dayHead}>
                  <Text style={[styles.dayNum, { color: fg }]}>{String(Number(cell.date.slice(-2)))}</Text>
                  <Text style={[styles.dayBk, { color: fg }]}>{`${cell.metrics?.totalBookings || 0} bk`}</Text>
                </View>
                <View style={styles.dayLines}>
                  <Text style={[styles.dayLine, { color: fg }]}>{`${cell.metrics?.confirmedBookings || 0} confirmed`}</Text>
                  <Text style={[styles.dayLine, { color: fg }]}>{`${cell.metrics?.totalSeats || 0} seats`}</Text>
                </View>
              </Pressable>
            </View>
          );
        })}
        {Array.from({ length: 7 - week.length }, (_, index) => (
          <View key={`pad-${index}`} style={styles.dayCol} />
        ))}
      </View>
    ));
  };

  const renderBooking = (booking) => {
    const tone = statusTone[booking.status] || statusTone.pending;
    const activeSeats = booking.activeSeats || [];
    const cancelledSeats = booking.cancelledSeats || [];
    return (
      <View key={booking.id} style={styles.bookingCard}>
        <View style={styles.gap3}>
          <View style={styles.wrapRow}>
            <Text style={styles.bookingCode}>{booking.bookingCode || booking.id}</Text>
            <View style={[styles.pill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <Text style={[styles.pillText, { color: tone.fg }]}>{booking.status}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: colors.white, borderColor: colors.slate[200] }]}>
              <Text style={[styles.pillText, { color: colors.slate[500] }]}>{booking.bookingSource}</Text>
            </View>
          </View>

          <View style={styles.gap3}>
            {[
              ['Passenger', booking.passenger?.name || booking.user?.name || 'Unknown', booking.passenger?.phone || booking.user?.phone || 'No phone'],
              ['Bus', booking.busService?.busName || booking.routeSnapshot?.busName || 'Bus', booking.busService?.operatorName || booking.routeSnapshot?.operatorName || 'Operator'],
              ['Route', `${booking.routeSnapshot?.originCity || 'Origin'} to ${booking.routeSnapshot?.destinationCity || 'Destination'}`, formatDateLabel(booking.travelDate)],
              ['Fare', formatCurrency(booking.amount, booking.currency), `Payment ${booking.payment?.status || 'pending'}`],
            ].map(([label, main, sub]) => (
              <View key={label} style={styles.infoCell}>
                <Text style={styles.cellLabel}>{label}</Text>
                <Text style={styles.cellMain}>{main}</Text>
                <Text style={styles.cellSub}>{sub}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.controls}>
          <Kicker>Cancellation Controls</Kicker>
          <Text style={[styles.cellMain, { marginTop: 12 }]}>
            {`Seats booked: ${booking.seatSummary?.active || 0} active / ${booking.seatSummary?.total || 0} total`}
          </Text>
          <Text style={styles.cellSub}>Refund follows bus cancellation rules. Cancel all seats or seat-by-seat.</Text>

          {activeSeats.length > 0 ? (
            <View style={[styles.wrapRow, { gap: 8, marginTop: 16 }]}>
              {activeSeats.map((seat) => (
                <Pressable
                  key={`${booking.id}-${seat.seatId}`}
                  disabled={Boolean(actionLoading)}
                  onPress={() => handleCancelSeats(booking.id, [seat.seatId])}
                  style={({ pressed }) => [styles.seatBtn, pressed ? { backgroundColor: colors.rose[100] } : null, actionLoading ? styles.dim : null]}
                >
                  <Text style={styles.seatBtnText}>{`Cancel ${seat.seatLabel}`}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            disabled={Boolean(actionLoading) || activeSeats.length === 0}
            onPress={() => handleCancelSeats(booking.id)}
            style={({ pressed }) => [
              styles.cancelAllBtn,
              pressed ? { opacity: 0.9 } : null,
              Boolean(actionLoading) || activeSeats.length === 0 ? styles.dim : null,
            ]}
          >
            <Text style={styles.cancelAllText}>{actionLoading.startsWith(booking.id) ? 'Processing...' : 'Cancel Full Booking'}</Text>
          </Pressable>

          {cancelledSeats.length > 0 ? (
            <View style={styles.refundBox}>
              <Text style={styles.cellLabel}>Refund Snapshot</Text>
              <View style={{ marginTop: 8, gap: 4 }}>
                {cancelledSeats.map((seat) => (
                  <Text key={`${booking.id}-refund-${seat.seatId}`} style={styles.refundLine}>
                    {`${seat.seatLabel}: ${formatCurrency(seat.refundAmount, booking.currency)} refunded`}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: 32 + bottomSpace }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigate('/taxi/owner/bus-service')}
            style={({ pressed }) => [styles.backBtn, pressed ? { backgroundColor: colors.slate[50] } : null]}
          >
            <ChevronLeft size={16} color={colors.slate[700]} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={styles.badge}>
            <Ticket size={14} color={colors.emerald[700]} />
            <Text style={styles.badgeText}>Owner Bus Bookings</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View>
            <View style={styles.heroBadge}>
              <Bus size={14} color={colors.slate[300]} />
              <Text style={styles.heroBadgeText}>Booking Operations</Text>
            </View>
            <Text style={styles.heroTitle}>Manage Owner Bus Bookings</Text>
            <Text style={styles.heroDesc}>
              Filter owner bookings by travel date, status, and bus. Cancel full bookings or individual seats and let refunds follow the configured bus cancellation rules.
            </Text>
          </View>
          <View style={styles.heroBus}>
            <Kicker em={0.22}>Selected Bus</Kicker>
            <Text style={styles.heroBusName}>{selectedBus?.busName || 'Choose a bus'}</Text>
            <Text style={styles.heroBusRoute}>
              {`${selectedBus?.route?.originCity || 'Origin'} to ${selectedBus?.route?.destinationCity || 'Destination'}`}
            </Text>
          </View>
        </View>

        <View style={[styles.gap4, { marginTop: 20 }]}>
          <View style={styles.card28}>
            <Kicker style={styles.fieldLabel}>Bus</Kicker>
            <SelectField
              title="Bus"
              value={filters.busServiceId}
              options={busOptions}
              onSelect={(next) => setFilters((current) => ({ ...current, busServiceId: next }))}
            />
          </View>

          <View style={styles.card28}>
            <Kicker style={styles.fieldLabel}>Travel Date</Kicker>
            <NativeDateInput
              value={filters.travelDate}
              onChangeValue={(nextDate) => {
                setFilters((current) => ({ ...current, travelDate: nextDate }));
                setMonth(getMonthValue(nextDate));
              }}
              style={[styles.field, styles.selectRow]}
              textStyle={styles.fieldText}
            />
          </View>

          <View style={styles.card28}>
            <Kicker style={styles.fieldLabel}>Status</Kicker>
            <SelectField
              title="Status"
              value={filters.status}
              options={statusOptions}
              onSelect={(next) => setFilters((current) => ({ ...current, status: next }))}
            />
          </View>

          <View style={styles.card28}>
            <Kicker style={styles.fieldLabel}>Search</Kicker>
            <View style={styles.searchWrap}>
              <View style={styles.searchIcon} pointerEvents="none">
                <Search size={18} color={colors.slate[400]} />
              </View>
              <TextInput
                value={filters.search}
                onChangeText={(text) => setFilters((current) => ({ ...current, search: text }))}
                placeholder="Booking, passenger, phone..."
                placeholderTextColor={colors.slate[400]}
                style={[styles.field, styles.searchInput]}
              />
            </View>
          </View>
        </View>

        <View style={[styles.gap4, { marginTop: 20 }]}>
          {summaryCards.map(({ label, value, Icon, bg, fg, big }) => (
            <View key={label} style={styles.card28}>
              <View style={[styles.row, { gap: 12 }]}>
                <View style={[styles.statIcon, { backgroundColor: bg }]}>
                  <Icon size={18} color={fg} />
                </View>
                <View style={styles.flexShrink}>
                  <Kicker>{label}</Kicker>
                  <Text style={big ? styles.statBig : styles.statValue}>{value}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card32}>
          <View style={[styles.gap4, { marginBottom: 20 }]}>
            <View>
              <Kicker em={0.24}>Calendar View</Kicker>
              <Text style={styles.sectionTitle}>{month}</Text>
            </View>
            <MonthInput value={month} onChangeValue={setMonth} />
          </View>
          <View style={[styles.weekRow, { marginBottom: 12 }]}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <View key={label} style={styles.dayCol}>
                <Text style={[styles.kicker, styles.weekLabel]}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.weeks}>{renderCalendar()}</View>
        </View>

        <View style={styles.card32}>
          <View style={{ marginBottom: 20 }}>
            <Kicker em={0.24}>Booking Register</Kicker>
            <Text style={styles.sectionTitle}>Passenger Bookings</Text>
          </View>

          {loading ? (
            <View style={styles.gap3}>
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={`row-${index}`} height={80} rounded={24} style={{ backgroundColor: colors.slate[100] }} />
              ))}
            </View>
          ) : bookings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Bus size={36} color={colors.slate[300]} />
              <Text style={[styles.cellMain, { marginTop: 16, textAlign: 'center' }]}>No bookings for this view</Text>
              <Text style={[styles.emptySub]}>Try another date, status, or bus.</Text>
            </View>
          ) : (
            <View style={styles.gap3}>{bookings.map(renderBooking)}</View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fb' },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  content: { paddingHorizontal: 16, paddingTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  gap3: { gap: 12 },
  gap4: { gap: 16 },
  dim: { opacity: 0.6 },

  topRow: { marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 10, ...shadow.sm },
  backText: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[700] },
  badge: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 9999, backgroundColor: colors.emerald[50], paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontSize: 11, lineHeight: 16.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.76, color: colors.emerald[700] },

  hero: { borderRadius: 24, backgroundColor: colors.slate[900], padding: 20, gap: 20, ...shadow.xl, shadowColor: colors.slate[200] },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, borderRadius: 9999, backgroundColor: alpha(colors.white, 0.1), paddingHorizontal: 16, paddingVertical: 8 },
  heroBadgeText: { fontSize: 10, lineHeight: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.slate[300] },
  heroTitle: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: colors.white },
  heroDesc: { marginTop: 16, fontSize: 14, lineHeight: 22.75, fontWeight: '500', color: colors.slate[400] },
  heroBus: { borderRadius: 28, borderWidth: 1, borderColor: alpha(colors.white, 0.1), backgroundColor: alpha(colors.white, 0.05), paddingHorizontal: 20, paddingVertical: 16 },
  heroBusName: { marginTop: 8, fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.white },
  heroBusRoute: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[300] },

  kicker: { fontSize: 10, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', color: colors.slate[400] },
  fieldLabel: { marginBottom: 8 },
  card28: { borderRadius: 28, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 20, ...shadow.sm },
  card32: { marginTop: 20, borderRadius: 32, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 20, ...shadow.sm },
  field: { width: '100%', minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontWeight: '700', color: colors.slate[800] },
  fieldText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.slate[800] },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthBox: { alignSelf: 'flex-start', minWidth: 200, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[200], backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12 },
  searchWrap: { position: 'relative', justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  searchInput: { paddingLeft: 48, fontWeight: '500' },

  sheetScroll: { maxHeight: 480 },
  sheetBody: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  sheetTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900], marginBottom: 8, paddingHorizontal: 4 },
  sheetOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14 },
  sheetOptionActive: { backgroundColor: colors.blue[50] },
  sheetOptionPressed: { backgroundColor: colors.slate[100] },
  sheetOptionText: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.slate[800] },
  sheetOptionTextActive: { fontWeight: '800', color: colors.blue[700] },

  statIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statBig: { marginTop: 4, fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.slate[900] },
  statValue: { marginTop: 4, fontSize: 16, lineHeight: 24, fontWeight: '900', color: colors.slate[900] },
  sectionTitle: { marginTop: 8, fontSize: 24, lineHeight: 32, fontWeight: '900', color: colors.slate[900] },

  weeks: { gap: 8 },
  weekRow: { flexDirection: 'row', gap: 8 },
  dayCol: { flex: 1, minWidth: 0 },
  weekLabel: { textAlign: 'center', letterSpacing: 2 },
  dayBlank: { height: 96, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.slate[100], backgroundColor: alpha(colors.white, 0.7) },
  dayCell: { height: 96, borderRadius: 20, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: alpha(colors.slate[50], 0.7), padding: 8, overflow: 'hidden' },
  // web bg-slate-900 button -> the partner blue (.driver-theme)
  dayCellSelected: { borderColor: colors.slate[900], backgroundColor: driverTheme.button, ...shadow.lg },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  dayNum: { fontSize: 14, lineHeight: 20, fontWeight: '900' },
  dayBk: { fontSize: 10, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.25 },
  dayLines: { marginTop: 12, gap: 4 },
  dayLine: { fontSize: 11, lineHeight: 16.5, fontWeight: '700' },

  emptyBox: { alignItems: 'center', borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.slate[200], backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 64 },
  emptySub: { marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[500], textAlign: 'center' },
  bookingCard: { borderRadius: 26, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: alpha(colors.slate[50], 0.6), padding: 20, gap: 16 },
  bookingCode: { fontSize: 18, lineHeight: 28, fontWeight: '900', color: colors.slate[900] },
  pill: { borderRadius: 9999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { fontSize: 10, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.25 },
  infoCell: { borderRadius: 16, backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 12 },
  cellLabel: { fontSize: 10, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.slate[400] },
  cellMain: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.slate[900] },
  cellSub: { marginTop: 4, fontSize: 11, lineHeight: 16.5, fontWeight: '600', color: colors.slate[500] },
  controls: { width: '100%', maxWidth: 384, borderRadius: 24, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.white, padding: 16 },
  seatBtn: { borderRadius: 9999, borderWidth: 1, borderColor: colors.rose[200], backgroundColor: colors.rose[50], paddingHorizontal: 12, paddingVertical: 4 },
  seatBtnText: { fontSize: 10, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.25, color: colors.rose[700] },
  // web bg-slate-900 button -> the partner blue (.driver-theme)
  cancelAllBtn: { marginTop: 16, width: '100%', alignItems: 'center', borderRadius: 16, backgroundColor: driverTheme.button, paddingHorizontal: 16, paddingVertical: 12 },
  cancelAllText: { fontSize: 14, lineHeight: 20, fontWeight: '900', color: colors.white },
  refundBox: { marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.slate[100], backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 12 },
  refundLine: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.slate[600] },
});

export default OwnerBusBookingsPage;
