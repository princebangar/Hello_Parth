import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ArrowLeft, Calendar, ChevronRight, Clock3, Info, MapPin, Users } from 'lucide-react-native';
import { useLocation, useNavigate } from '@/lib/router';
import { AppImage, Screen, StatusBarSpacer, Text } from '@/native/ui';
import { makeStyles, useTheme } from '@/theme';
import { localDateKey } from '../../../../shared/utils/localDate';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { PendingCancellationDueNotice } from '../../components/CancellationFeeNotice';

// Taxi/index.css `.user-app-theme` palette (the web remaps slate / white classes to these in both themes).
const userTokens = (dark) => ({
  bg: dark ? '#0a0a0a' : '#F1F4F9',
  card: dark ? '#141414' : '#FFFFFF',
  soft: dark ? '#1c1c1c' : '#E9EDF4',
  text: dark ? '#FFFFFF' : '#0B1220',
  text2: dark ? '#CBD5E1' : '#475569',
  muted: dark ? '#94A3B8' : '#64748B',
  border: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
  accent: '#FFC400',
  ink: '#0B1220',
});
const USER_SHADOW = { elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 12 } };

const pad = (value) => String(value).padStart(2, '0');

const formatDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
};

const formatDateTimeInputValue = (date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// "YYYY-MM-DD" / "YYYY-MM-DDTHH:mm" (local, the <input type="date|datetime-local"> value format) -> Date
const parseLocalValue = (value) => {
  const [datePart = '', timePart = '00:00'] = String(value || '').split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, hh || 0, mm || 0);
};

// Earliest pickup a rider may schedule: Admin > Transport Ride Settings > Schedule Ride: Minimum Minutes Ahead.
const getScheduleLeadMinutes = (settings) => {
  const value = Number(settings?.transportRide?.schedule_ride_min_minutes_ahead);
  return Number.isFinite(value) && value >= 0 ? value : 60;
};

const getTomorrowLocalDateTime = (leadMinutes = 60) => {
  const next = new Date(Date.now() + leadMinutes * 60 * 1000);
  return formatDateTimeInputValue(next);
};

const DEFAULT_BID_STEP_AMOUNT = 10;
const DEFAULT_BID_HEADROOM_PERCENT = 20;

const toConfiguredPositiveInteger = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
};

const clampPercentage = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, numeric));
};

const alignBidAmountToStep = ({ baseFare, amount, stepAmount }) => {
  const safeBaseFare = Math.max(0, Math.round(Number(baseFare || 0)));
  const safeStepAmount = toConfiguredPositiveInteger(stepAmount, DEFAULT_BID_STEP_AMOUNT);
  const safeAmount = Math.max(safeBaseFare, Math.round(Number(amount || 0)));
  const delta = safeAmount - safeBaseFare;

  if (delta === 0) {
    return safeBaseFare;
  }

  return safeBaseFare + (Math.ceil(delta / safeStepAmount) * safeStepAmount);
};

const getTodayLocalDate = () => formatDateInputValue(new Date());

const getMaxAdvanceDate = () => {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return formatDateInputValue(nextWeek);
};

const getMaxAdvanceDateTime = () => {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return formatDateTimeInputValue(nextWeek);
};

const getVehicleIcon = (type = {}) => {
  const customIcon = String(type.icon || '').trim();
  if (customIcon) return customIcon;

  const iconValue = String(type.iconType || type.vehicleName || '').toLowerCase();
  if (iconValue.includes('bike')) return '/1_Bike.png';
  if (iconValue.includes('auto')) return '/2_AutoRickshaw.png';
  return '/4_Taxi.png';
};

const normalizeVehicleEntry = (pkg, vehicle, index) => ({
  id: vehicle.id || `${pkg.id}:${vehicle.vehicleTypeId || index}`,
  packageId: pkg.id,
  packageTypeName: pkg.packageTypeName || 'Intercity',
  destination: pkg.destination || '',
  vehicleTypeId: vehicle.vehicleTypeId || '',
  name: vehicle.vehicleName || 'Vehicle',
  desc: `${pkg.packageTypeName || 'Intercity'} · ${pkg.destination || 'Destination'}`,
  seats: Number(vehicle.capacity || 4) || 4,
  icon: getVehicleIcon(vehicle),
  vehicleIconUrl: getVehicleIcon(vehicle),
  iconType: vehicle.iconType || vehicle.vehicleName || 'car',
  dispatchType: String(vehicle.dispatchType || 'normal').trim().toLowerCase(),
  supportsBidding: ['bidding', 'both'].includes(String(vehicle.dispatchType || 'normal').trim().toLowerCase()),
  baseFare: Number(vehicle.basePrice || 0),
  freeDistance: Number(vehicle.freeDistance || 0),
  pricePerKm: Number(vehicle.distancePrice || 0),
  freeTime: Number(vehicle.freeTime || 0),
  timePrice: Number(vehicle.timePrice || 0),
  serviceTax: Number(vehicle.serviceTax || 0),
  cancellationFee: Number(vehicle.cancellationFee || 0),
});

const calculateFare = (vehicle, tripType) => {
  const baseFare = Number(vehicle.baseFare || 0);
  return tripType === 'Round Trip' ? Math.round(baseFare * 1.8) : Math.round(baseFare);
};

const calculateDefaultBidCeiling = (fare, stepAmount = DEFAULT_BID_STEP_AMOUNT, headroomPercent = DEFAULT_BID_HEADROOM_PERCENT) => {
  const safeFare = Math.max(0, Number(fare || 0));
  const raisedFare = safeFare * (1 + (clampPercentage(headroomPercent, DEFAULT_BID_HEADROOM_PERCENT) / 100));
  return alignBidAmountToStep({ baseFare: safeFare, amount: raisedFare, stepAmount });
};

const getDisplayDate = (rideMode, travelDate) => (rideMode === 'schedule' ? travelDate : 'Ride Now');

const Tap = ({ scale = 0.96, style, children, ...rest }) => (
  <Pressable {...rest} style={({ pressed }) => [style, pressed && { transform: [{ scale }] }]}>
    {children}
  </Pressable>
);

const IntercityVehicle = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useTheme();
  const u = userTokens(t.dark);
  const s = useStyles();
  const { settings } = useSettings();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const {
    fromCity,
    toCity,
    tripType: initialTripType,
    date: initialDate,
    rideMode: initialRideMode,
    selectedPackages = [],
    pickupAddress = '',
    pickupCoords = null,
    // set when the destination is a free place (not an admin route)
    serviceLocationId = '',
    destinationAddress = '',
    destinationCoords = null,
    distance: routeDistance = 0,
    isOutstation = false,
  } = location.state || {};

  const [tripType, setTripType] = useState(initialTripType || 'One Way');
  const [rideMode, setRideMode] = useState(initialRideMode || 'now');
  const [travelDate, setTravelDate] = useState(
    initialRideMode === 'schedule' && initialDate && initialDate !== 'Ride Now'
      ? initialDate
      : localDateKey(0)
  );
  const [scheduledAt, setScheduledAt] = useState(
    initialRideMode === 'schedule' && location.state?.scheduledAt
      // ISO (UTC) in router state -> local picker value (slicing it shifted the time by 5 h 30 m)
      ? formatDateTimeInputValue(new Date(location.state.scheduledAt))
      : getTomorrowLocalDateTime(getScheduleLeadMinutes(settings))
  );
  const [passengers, setPassengers] = useState(1);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  // Native picker in place of the hidden <input type="date" / "datetime-local"> (Android has no combined
  // date+time dialog, so the pickup time is asked as a date dialog followed by a time dialog).
  const [picker, setPicker] = useState(null);
  const minTravelDate = useMemo(() => getTodayLocalDate(), []);
  const maxTravelDate = useMemo(() => getMaxAdvanceDate(), []);
  const scheduleLeadMinutes = getScheduleLeadMinutes(settings);
  const minScheduledAt = useMemo(() => getTomorrowLocalDateTime(scheduleLeadMinutes), [scheduleLeadMinutes]);
  const maxScheduledAt = useMemo(() => getMaxAdvanceDateTime(), []);

  const vehicles = useMemo(
    () =>
      selectedPackages.flatMap((pkg) =>
        (Array.isArray(pkg.vehicles) ? pkg.vehicles : []).map((vehicle, index) =>
          normalizeVehicleEntry(pkg, vehicle, index)
        )
      ),
    [selectedPackages]
  );

  useEffect(() => {
    if (!selectedVehicleId && vehicles.length) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [selectedVehicleId, vehicles]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0] || null,
    [selectedVehicleId, vehicles]
  );

  useEffect(() => {
    if (!fromCity || !toCity) {
      navigate(`${routePrefix}/intercity`, { replace: true });
    }
  }, [fromCity, navigate, routePrefix, toCity]);

  useEffect(() => {
    if (!selectedVehicle) return;
    setPassengers((current) => Math.min(Math.max(current, 1), selectedVehicle.seats));
  }, [selectedVehicle]);

  useEffect(() => {
    if (travelDate < minTravelDate) {
      setTravelDate(minTravelDate);
      return;
    }

    if (travelDate > maxTravelDate) {
      setTravelDate(maxTravelDate);
    }
  }, [maxTravelDate, minTravelDate, travelDate]);

  useEffect(() => {
    if (!scheduledAt) {
      return;
    }

    if (scheduledAt < minScheduledAt) {
      setScheduledAt(minScheduledAt);
      return;
    }

    if (scheduledAt > maxScheduledAt) {
      setScheduledAt(maxScheduledAt);
    }
  }, [maxScheduledAt, minScheduledAt, scheduledAt]);

  if (!fromCity || !toCity) {
    return null;
  }

  const finalFare = selectedVehicle ? calculateFare(selectedVehicle, tripType) : 0;
  const configuredBidStepAmount = toConfiguredPositiveInteger(
    settings?.bidRide?.bidding_amount_increase_or_decrease,
    DEFAULT_BID_STEP_AMOUNT,
  );
  const configuredBidHighPercentage = clampPercentage(
    settings?.bidRide?.user_bidding_high_percentage,
    DEFAULT_BID_HEADROOM_PERCENT,
  );

  const handlePickerChange = (event, selected) => {
    const current = picker;
    if (!selected || !current) {
      setPicker(null);
      return;
    }

    if (current.kind === 'travelDate') {
      setPicker(null);
      setTravelDate(formatDateInputValue(selected));
      setScheduleError('');
      return;
    }

    if (current.kind === 'scheduledDate') {
      // keep the chosen day, then ask the time (the second half of the datetime-local input)
      setPicker({ kind: 'scheduledTime', date: selected });
      return;
    }

    const day = current.date || parseLocalValue(scheduledAt);
    const combined = new Date(day.getFullYear(), day.getMonth(), day.getDate(), selected.getHours(), selected.getMinutes());
    setPicker(null);
    setScheduledAt(formatDateTimeInputValue(combined));
    setScheduleError('');
  };

  const handleContinue = () => {
    if (!selectedVehicle) return;

    if (rideMode === 'schedule') {
      const parsedSchedule = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(parsedSchedule.getTime())) {
        setScheduleError('Choose a valid schedule date and time.');
        return;
      }

      if (!travelDate || travelDate < minTravelDate) {
        setScheduleError('Travel date cannot be earlier than today.');
        return;
      }

      if (travelDate > maxTravelDate) {
        setScheduleError('Advance booking is available for up to 7 days only.');
        return;
      }

      if (parsedSchedule.getTime() <= Date.now() + 60 * 1000) {
        setScheduleError('Schedule time must be at least 1 minute ahead.');
        return;
      }

      if (scheduledAt < getTomorrowLocalDateTime(scheduleLeadMinutes)) {
        setScheduleError(`Rides can be scheduled at least ${scheduleLeadMinutes} minutes ahead. Please pick a later time.`);
        return;
      }

      if (scheduledAt > maxScheduledAt) {
        setScheduleError('Advance booking is available for up to 7 days only.');
        return;
      }
    }

    setScheduleError('');

    navigate(`${routePrefix}/intercity/details`, {
      state: {
        fromCity,
        toCity,
        tripType,
        rideMode,
        date: getDisplayDate(rideMode, travelDate),
        travelDate,
        scheduledAt: rideMode === 'schedule' ? new Date(scheduledAt).toISOString() : null,
        selectedPackages,
        pickupAddress,
        pickupCoords,
        distance: Number(routeDistance || 0),
        ...(isOutstation ? { isOutstation: true, serviceLocationId, destinationAddress, destinationCoords } : {}),
        vehicle: selectedVehicle,
        passengers,
        fare: finalFare,
        baseFare: finalFare,
        bookingMode: selectedVehicle.supportsBidding ? 'bidding' : 'normal',
        bidStepAmount: configuredBidStepAmount,
        userMaxBidFare: selectedVehicle.supportsBidding
          ? calculateDefaultBidCeiling(finalFare, configuredBidStepAmount, configuredBidHighPercentage)
          : finalFare,
      },
    });
  };

  const choice = (active) => [s.choice, active ? s.choiceActive : null];
  const choiceText = (active) => [s.choiceText, active ? s.choiceTextActive : null];

  const pickerProps = picker
    ? picker.kind === 'travelDate'
      ? { mode: 'date', value: parseLocalValue(travelDate), minimumDate: parseLocalValue(minTravelDate), maximumDate: parseLocalValue(maxTravelDate) }
      : picker.kind === 'scheduledDate'
        ? { mode: 'date', value: parseLocalValue(scheduledAt), minimumDate: parseLocalValue(minScheduledAt.split('T')[0]), maximumDate: parseLocalValue(maxScheduledAt.split('T')[0]) }
        : { mode: 'time', value: parseLocalValue(scheduledAt) }
    : null;

  return (
    <Screen edges={['bottom']} bg={u.bg}>
      <View style={s.header}>
        <StatusBarSpacer color={u.card} />
        <View style={s.headerRow}>
          <Tap onPress={() => navigate(-1)} style={s.backButton}>
            <ArrowLeft size={18} color={u.text2} />
          </Tap>
          <View style={{ minWidth: 0, flex: 1 }}>
            <Text style={s.headerEyebrow}>Intercity booking</Text>
            <Text numberOfLines={1} style={s.headerTitle}>{toCity}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.section}>
          <View style={s.sectionTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Route</Text>
              <Text style={s.routeTitle}>{fromCity} to {toCity}</Text>
            </View>
            <View style={s.packageBadge}>
              <Text style={s.packageBadgeText}>
                {selectedPackages.length} package{selectedPackages.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
          {pickupAddress ? (
            <View style={s.pickupRow}>
              <MapPin size={16} color="#2563eb" style={{ marginTop: 2 }} />
              <Text numberOfLines={2} style={s.pickupText}>{pickupAddress}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.section}>
          <View>
            <Text style={s.sectionTitle}>Trip details</Text>
            <Text style={s.sectionSub}>Choose how and when this trip should run.</Text>
          </View>

          <View style={s.grid}>
            {['One Way', 'Round Trip'].map((type) => {
              const active = tripType === type;
              return (
                <Pressable key={type} onPress={() => setTripType(type)} style={choice(active)}>
                  <Text style={choiceText(active)}>{type}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.grid}>
            <Pressable onPress={() => setRideMode('now')} style={choice(rideMode === 'now')}>
              <Clock3 size={16} color={rideMode === 'now' ? '#1d4ed8' : u.text2} />
              <Text style={choiceText(rideMode === 'now')}>Ride now</Text>
            </Pressable>
            <Pressable onPress={() => setRideMode('schedule')} style={choice(rideMode === 'schedule')}>
              <Calendar size={16} color={rideMode === 'schedule' ? '#1d4ed8' : u.text2} />
              <Text style={choiceText(rideMode === 'schedule')}>Schedule</Text>
            </Pressable>
          </View>

          {rideMode === 'schedule' ? (
            <View style={{ marginTop: 16 }}>
              <Text style={s.fieldLabel}>Travel date</Text>
              <Pressable onPress={() => setPicker({ kind: 'travelDate' })} style={s.field}>
                <Text style={s.fieldValue}>{travelDate || 'Select travel date'}</Text>
                <Calendar size={16} color={u.text2} />
              </Pressable>
              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Pickup time</Text>
              <Pressable onPress={() => setPicker({ kind: 'scheduledDate' })} style={s.field}>
                <Text style={s.fieldValue}>{scheduledAt ? scheduledAt.replace('T', ' ') : 'Select pickup time'}</Text>
                <Clock3 size={16} color={u.text2} />
              </Pressable>
              {scheduleError ? (
                <Text style={s.scheduleError}>{scheduleError}</Text>
              ) : (
                <Text style={s.scheduleHint}>Drivers will be notified automatically around this scheduled time.</Text>
              )}
            </View>
          ) : null}

          <View style={s.passengersRow}>
            <View style={s.passengersLeft}>
              <Users size={16} color={u.muted} />
              <View>
                <Text style={s.passengersTitle}>Passengers</Text>
                <Text style={s.passengersSub}>Up to {selectedVehicle?.seats || 1} seats</Text>
              </View>
            </View>
            <View style={s.passengersLeft}>
              <Pressable onPress={() => setPassengers((current) => Math.max(1, current - 1))} style={s.stepButton}>
                <Text style={s.stepText}>-</Text>
              </Pressable>
              <Text style={s.passengerCount}>{passengers}</Text>
              <Pressable onPress={() => setPassengers((current) => Math.min(selectedVehicle?.seats || 1, current + 1))} style={s.stepButton}>
                <Text style={s.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <View>
            <Text style={s.sectionTitle}>Choose vehicle</Text>
            <Text style={s.sectionSub}>Only vehicles mapped to this package are shown.</Text>
          </View>

          {vehicles.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Info size={20} color={u.text2} />
              </View>
              <Text style={s.emptyTitle}>No vehicles available</Text>
              <Text style={s.emptySub}>Try another destination or package.</Text>
            </View>
          ) : (
            vehicles.map((vehicle) => {
              const vehicleFare = calculateFare(vehicle, tripType);
              const isActive = selectedVehicleId === vehicle.id;

              return (
                <Pressable
                  key={vehicle.id}
                  onPress={() => {
                    setSelectedVehicleId(vehicle.id);
                    if (passengers > vehicle.seats) {
                      setPassengers(vehicle.seats);
                    }
                  }}
                  style={[s.vehicleCard, isActive ? s.vehicleCardActive : null]}
                >
                  <View style={s.vehicleRow}>
                    <View style={s.vehicleIconBox}>
                      <AppImage src={vehicle.icon} style={{ width: 40, height: 40 }} contentFit="contain" />
                    </View>
                    <View style={s.vehicleInfo}>
                      <View style={{ minWidth: 0, flex: 1 }}>
                        <Text numberOfLines={1} style={s.vehicleName}>{vehicle.name}</Text>
                        <Text style={s.vehicleMeta}>{vehicle.seats} seats · {vehicle.packageTypeName}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.vehicleFare}>Rs {vehicleFare.toLocaleString()}</Text>
                        <Text style={s.vehicleFareSub}>estimated</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={s.bottomBar}>
        <PendingCancellationDueNotice style={{ marginBottom: 12 }} />
        <View style={s.bottomRow}>
          <View>
            <Text style={s.bottomMeta}>{tripType} · {getDisplayDate(rideMode, travelDate)}</Text>
            <Text style={s.bottomFare}>Rs {finalFare.toLocaleString()}</Text>
          </View>
          <Tap
            scale={0.98}
            onPress={handleContinue}
            disabled={!selectedVehicle}
            style={[s.continueButton, !selectedVehicle ? { opacity: 0.5 } : null]}
          >
            <Text style={s.continueText}>Continue</Text>
            <ChevronRight size={16} color={u.ink} />
          </Tap>
        </View>
      </View>

      {pickerProps ? (
        <DateTimePicker
          key={picker.kind}
          {...pickerProps}
          display="default"
          is24Hour={false}
          onValueChange={handlePickerChange}
          onDismiss={() => setPicker(null)}
        />
      ) : null}
    </Screen>
  );
};

const useStyles = makeStyles((t) => {
  const u = userTokens(t.dark);
  return {
    header: { borderBottomWidth: 1, borderBottomColor: u.border, backgroundColor: u.card, zIndex: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 16 },
    backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center' },
    headerEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: u.muted },
    headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: u.text },
    content: { paddingHorizontal: 20, paddingVertical: 20, gap: 20 },
    section: { borderRadius: 24, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, padding: 20, ...USER_SHADOW },
    sectionTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: u.muted },
    routeTitle: { marginTop: 4, fontSize: 20, lineHeight: 28, fontWeight: '600', color: u.text },
    packageBadge: { borderRadius: 9999, backgroundColor: u.soft, paddingHorizontal: 12, paddingVertical: 4 },
    packageBadgeText: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: '#1d4ed8' },
    pickupRow: { marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: u.card, paddingHorizontal: 16, paddingVertical: 12 },
    pickupText: { flex: 1, fontSize: 14, lineHeight: 20, color: u.text2 },
    sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: u.text },
    sectionSub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: u.muted },
    grid: { marginTop: 16, flexDirection: 'row', gap: 12 },
    choice: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: u.border,
      backgroundColor: u.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    choiceActive: { borderColor: '#2563eb', backgroundColor: u.soft },
    choiceText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: u.text2 },
    choiceTextActive: { color: '#1d4ed8' },
    fieldLabel: { marginBottom: 8, fontSize: 14, lineHeight: 20, fontWeight: '500', color: u.text2 },
    field: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: u.border,
      backgroundColor: u.card,
      paddingHorizontal: 16,
    },
    fieldValue: { fontSize: 14, lineHeight: 20, color: u.text },
    scheduleError: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#f43f5e' },
    scheduleHint: { marginTop: 8, fontSize: 12, lineHeight: 16, color: u.muted },
    passengersRow: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 16,
      backgroundColor: u.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    passengersLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    passengersTitle: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: u.text },
    passengersSub: { fontSize: 12, lineHeight: 16, color: u.muted },
    stepButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center' },
    stepText: { fontSize: 18, lineHeight: 28, color: u.text2 },
    passengerCount: { width: 32, textAlign: 'center', fontSize: 16, lineHeight: 24, fontWeight: '600', color: u.text },
    empty: { borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: u.border, backgroundColor: u.card, paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center' },
    emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: u.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    emptyTitle: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: u.text, textAlign: 'center' },
    emptySub: { marginTop: 4, fontSize: 14, lineHeight: 20, color: u.muted, textAlign: 'center' },
    vehicleCard: { width: '100%', borderRadius: 24, borderWidth: 1, borderColor: u.border, backgroundColor: u.card, padding: 16 },
    vehicleCardActive: { borderColor: '#2563eb', backgroundColor: 'rgba(239,246,255,0.6)', ...USER_SHADOW },
    vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    vehicleIconBox: { width: 64, height: 64, borderRadius: 16, backgroundColor: u.card, alignItems: 'center', justifyContent: 'center' },
    vehicleInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    vehicleName: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: u.text },
    vehicleMeta: { marginTop: 4, fontSize: 14, lineHeight: 20, color: u.muted },
    vehicleFare: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: u.text, textAlign: 'right' },
    vehicleFareSub: { fontSize: 12, lineHeight: 16, color: u.muted, textAlign: 'right' },
    bottomBar: { borderTopWidth: 1, borderTopColor: u.border, backgroundColor: u.card, paddingHorizontal: 20, paddingVertical: 16 },
    bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
    bottomMeta: { fontSize: 12, lineHeight: 16, fontWeight: '500', color: u.muted },
    bottomFare: { marginTop: 4, fontSize: 20, lineHeight: 28, fontWeight: '600', color: u.text },
    // button.bg-slate-900 is the yellow accent button inside the Taxi user app (index.css)
    continueButton: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: u.accent, paddingHorizontal: 20 },
    continueText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: u.ink },
  };
});

export default IntercityVehicle;
