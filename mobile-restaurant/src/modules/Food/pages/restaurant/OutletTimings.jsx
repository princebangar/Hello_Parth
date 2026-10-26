// Web: pages/restaurant/OutletTimings.jsx (/food/restaurant/outlet-timings) — "<company> delivery" day accordion:
// Open / Close switch per day and the opening / closing time (MUI MobileTimePicker, format "hh:mm a") of the open day.
// GET restaurantAPI.getOutletTimings() on mount; every change is saved (debounced 500 ms, only after a user edit) with
// restaurantAPI.saveOutletTimings(days) and announced with the `outletTimingsUpdated` window event.
// Native:
// - MobileTimePicker -> a box with the time ("hh:mm a") that opens the native time picker
//   (@react-native-community/datetimepicker, mode "time"; Android dialog, iOS spinner in a bottom sheet); the value
//   is stored as "HH:mm" exactly like the web.
// - The accordion opens / closes with a short fade + slide (web: height 0 -> auto, 0.2 s).
// - No text inputs on this page (no keyboard handling needed).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ArrowLeft, ChevronDown, ChevronUp, Clock } from 'lucide-react-native';
import { Screen, Sheet, StatusBarSpacer, Text } from '@/native/ui';
import { colors, restaurantTheme, sp } from '@/theme';
import useRestaurantBackNavigation from '@food/hooks/useRestaurantBackNavigation';
import { Switch } from '@food/components/ui/switch';
import { useCompanyName } from '@food/hooks/useCompanyName';
import { restaurantAPI } from '@food/api';

const debugError = () => {};
const debugWarn = () => {};

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  if (!timeString || !timeString.includes(':')) {
    return new Date(2000, 0, 1, 9, 0); // Default to 9:00 AM
  }
  const [hours, minutes] = timeString.split(':').map(Number);
  const validHours = Math.max(0, Math.min(23, hours || 9));
  const validMinutes = Math.max(0, Math.min(59, minutes || 0));
  return new Date(2000, 0, 1, validHours, validMinutes);
};

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '09:00';
  }
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Format time from 24-hour to 12-hour format for display
const formatTime12Hour = (time24) => {
  if (!time24) return '09:00 AM';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  const minutesStr = minutes.toString().padStart(2, '0');
  return `${hours12}:${minutesStr} ${period}`;
};

// MobileTimePicker format "hh:mm a"
const formatPickerValue = (date) => {
  const h = date.getHours();
  const hh = String(h % 12 || 12).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
};

const getDefaultDays = () => ({
  Monday: { isOpen: true, openingTime: '09:00', closingTime: '22:00' },
  Tuesday: { isOpen: true, openingTime: '09:00', closingTime: '22:00' },
  Wednesday: { isOpen: true, openingTime: '09:00', closingTime: '22:00' },
  Thursday: { isOpen: true, openingTime: '09:00', closingTime: '22:00' },
  Friday: { isOpen: true, openingTime: '09:00', closingTime: '22:00' },
  Saturday: { isOpen: true, openingTime: '09:00', closingTime: '22:00' },
  Sunday: { isOpen: true, openingTime: '09:00', closingTime: '22:00' },
});

// The web's MobileTimePicker text field: tap -> native time picker
function TimeField({ value, onAccept }) {
  const [iosOpen, setIosOpen] = useState(false);
  const [iosValue, setIosValue] = useState(value);

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'time',
        is24Hour: false,
        onValueChange: (_event, date) => {
          if (date) onAccept(date);
        },
      });
      return;
    }
    setIosValue(value);
    setIosOpen(true);
  };

  return (
    <View style={styles.pickerWrap}>
      <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.pickerField, pressed && { borderColor: colors.gray[300] }]}>
        <Text style={styles.pickerText}>{formatPickerValue(value)}</Text>
      </Pressable>
      {Platform.OS !== 'android' ? (
        <Sheet open={iosOpen} onClose={() => setIosOpen(false)}>
          <View style={styles.iosSheet}>
            <DateTimePicker
              value={iosValue}
              mode="time"
              display="spinner"
              onValueChange={(_event, date) => {
                if (date) setIosValue(date);
              }}
            />
            <Pressable
              onPress={() => {
                setIosOpen(false);
                onAccept(iosValue);
              }}
              style={styles.iosOk}
            >
              <Text style={styles.iosOkText}>OK</Text>
            </Pressable>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

function Expand({ children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [anim]);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// web: framer-motion entrance fade. App: shown at once (Prince, 27 Oct: the fade read as a blink on every open)
function FadeInRow({ children }) {
  return <View>{children}</View>;
}

export default function OutletTimings() {
  const companyName = useCompanyName();
  const goBack = useRestaurantBackNavigation();
  const insets = useSafeAreaInsets();
  const [expandedDay, setExpandedDay] = useState('Monday');
  const isInternalUpdate = useRef(false);
  const [days, setDays] = useState(getDefaultDays);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef(null);
  // Skip the first post-load render so we don't overwrite DB with synthetic defaults.
  const allowAutosaveRef = useRef(false);

  // Load from backend on mount.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        allowAutosaveRef.current = false;
        const res = await restaurantAPI.getOutletTimings();
        const outletTimings = res?.data?.data?.outletTimings || res?.data?.outletTimings;
        if (mounted && outletTimings && typeof outletTimings === 'object') {
          setDays({ ...getDefaultDays(), ...outletTimings });
        }
      } catch (error) {
        debugError('Error loading outlet timings from backend:', error);
      } finally {
        if (mounted) {
          setLoading(false);
          // Enable autosave on the next tick after state settles.
          setTimeout(() => {
            allowAutosaveRef.current = true;
          }, 0);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Save to backend whenever days change (debounced) — only after user edits.
  useEffect(() => {
    if (loading || !allowAutosaveRef.current) return undefined;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await restaurantAPI.saveOutletTimings(days);
        window.dispatchEvent(new Event('outletTimingsUpdated'));
      } catch (error) {
        debugError('Error saving outlet timings to backend:', error);
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [days, loading]);

  const toggleDay = (day) => {
    setExpandedDay(expandedDay === day ? null : day);
  };

  const toggleDayOpen = (day) => {
    allowAutosaveRef.current = true;
    isInternalUpdate.current = true;
    setDays((prev) => {
      const newOpen = !prev[day].isOpen;
      return {
        ...prev,
        [day]: {
          ...prev[day],
          isOpen: newOpen,
          openingTime: newOpen ? prev[day].openingTime || '09:00' : '',
          closingTime: newOpen ? prev[day].closingTime || '22:00' : '',
        },
      };
    });
  };

  const handleTimeChange = (day, timeType, newTime) => {
    if (!newTime) {
      debugWarn('No time value received in handleTimeChange');
      return;
    }
    allowAutosaveRef.current = true;
    isInternalUpdate.current = true;
    const timeString = timeToString(newTime);
    if (!timeString || !timeString.includes(':')) {
      debugWarn('Invalid time string generated:', timeString);
      return;
    }
    setDays((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [timeType]: timeString,
      },
    }));
  };

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  if (loading) {
    return (
      <Screen bg={colors.white} statusBarStyle="dark">
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading outlet timings...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg={colors.white} edges={[]} statusBarStyle="dark">
      {/* Header */}
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} accessibilityLabel="Go back" style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}>
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <Text style={styles.headerTitle}>Outlet timings</Text>
        </View>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: sp(6) + insets.bottom }]}>
        {/* Delivery Section Header */}
        <View style={{ marginBottom: sp(6) }}>
          <View style={{ alignItems: 'center', marginBottom: sp(2) }}>
            <Text style={styles.sectionTitle}>{companyName} delivery</Text>
          </View>
          <LinearGradient colors={[restaurantTheme.brand, restaurantTheme.brandDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 2 }} />
        </View>

        {/* Day-wise Accordion */}
        <View style={{ gap: sp(2) }}>
          {dayNames.map((day, index) => {
            const dayData = days[day] || { isOpen: true, openingTime: '09:00', closingTime: '22:00' };
            const isExpanded = expandedDay === day;

            return (
              <FadeInRow key={day} index={index}>
                <View style={styles.dayCard}>
                  {/* Day Header */}
                  <View style={[styles.dayHead, isExpanded && { backgroundColor: colors.gray[100] }]}>
                    <Pressable onPress={() => toggleDay(day)} style={styles.dayToggle}>
                      {isExpanded ? <ChevronUp size={20} color={colors.gray[700]} /> : <ChevronDown size={20} color={colors.gray[700]} />}
                      <Text style={styles.dayName}>{day}</Text>
                    </Pressable>
                    <View style={styles.dayRight}>
                      <Text style={styles.openText}>{dayData.isOpen ? 'Open' : 'Close'}</Text>
                      <Switch
                        checked={dayData.isOpen}
                        onCheckedChange={() => toggleDayOpen(day)}
                        // data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300
                        style={{ backgroundColor: dayData.isOpen ? colors.green[500] : colors.gray[300] }}
                      />
                    </View>
                  </View>

                  {/* Expanded Content */}
                  {isExpanded ? (
                    <Expand>
                      <View style={styles.expanded}>
                        {dayData.isOpen ? (
                          <>
                            {/* Opening Time */}
                            <View style={{ gap: sp(2) }}>
                              <View style={styles.labelRow}>
                                <Clock size={16} color={colors.gray[700]} />
                                <Text style={styles.label}>Opening time</Text>
                              </View>
                              <TimeField value={stringToTime(dayData.openingTime)} onAccept={(v) => handleTimeChange(day, 'openingTime', v)} />
                              <Text style={styles.current}>Current: {formatTime12Hour(dayData.openingTime)}</Text>
                            </View>

                            {/* Closing Time */}
                            <View style={{ gap: sp(2) }}>
                              <View style={styles.labelRow}>
                                <Clock size={16} color={colors.gray[700]} />
                                <Text style={styles.label}>Closing time</Text>
                              </View>
                              <TimeField value={stringToTime(dayData.closingTime)} onAccept={(v) => handleTimeChange(day, 'closingTime', v)} />
                              <Text style={styles.current}>Current: {formatTime12Hour(dayData.closingTime)}</Text>
                            </View>
                          </>
                        ) : (
                          <Text style={styles.closedText}>This day is closed</Text>
                        )}
                      </View>
                    </Expand>
                  ) : null}
                </View>
              </FadeInRow>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 50 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 18, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  content: { paddingHorizontal: sp(4), paddingTop: sp(6) },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: restaurantTheme.brand },
  dayCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], borderRadius: 2, overflow: 'hidden' },
  dayHead: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: sp(4), paddingVertical: sp(3) },
  dayToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  dayName: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.gray[900] },
  dayRight: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  openText: { fontSize: 14, lineHeight: 20, color: colors.gray[700] },
  expanded: { padding: sp(4), gap: sp(4), borderTopWidth: 1, borderTopColor: colors.gray[100] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[700] },
  pickerWrap: { borderWidth: 1, borderColor: colors.gray[200], borderRadius: 6, paddingHorizontal: sp(3), paddingVertical: sp(2), backgroundColor: 'rgba(249,250,251,0.6)' },
  pickerField: { height: 36, borderWidth: 1, borderColor: colors.gray[200], borderRadius: 4, backgroundColor: colors.white, paddingHorizontal: 12, justifyContent: 'center' },
  pickerText: { fontSize: 12, lineHeight: 16, color: colors.gray[900] },
  current: { fontSize: 12, lineHeight: 16, color: colors.gray[500] },
  closedText: { fontSize: 14, lineHeight: 20, color: colors.gray[500], paddingLeft: sp(6) },
  iosSheet: { paddingTop: sp(4), paddingBottom: sp(4), alignItems: 'center' },
  iosOk: { marginTop: sp(2), paddingHorizontal: sp(6), paddingVertical: sp(3) },
  iosOkText: { color: restaurantTheme.brand, fontSize: 16, lineHeight: 24, fontWeight: '700' },
});
