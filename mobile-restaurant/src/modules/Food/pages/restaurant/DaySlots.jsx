// Web: pages/restaurant/DaySlots.jsx (/food/restaurant/outlet-timings/:day) — the time slots of one day: up to 3 slots
// (start / end time + AM/PM, duration per slot and in total), "+ Add time slot", delete with a confirmation dialog,
// "Copy above timings to all days" and Save. Times are chosen in the web's own wheel popup (hour : minute AM/PM, "Okay").
// Native:
// - The wheel popup is drawn natively (three snapping ScrollViews, item height 40, same texts and colours); it is
//   exported as TimePickerWheel because ExploreMore uses the same web wheel (the web file had a copy of it there).
// - The sticky bottom controls are a View under the scrolling slots (no inputs on this page: the time boxes are
//   read-only on the web too, so there is no keyboard here).
// - alert() -> Alert.alert; the shadcn Dialog / Checkbox / Button are the converted ui kit.
// - Web bug fixed (Prince, 27 Oct): the web's handleSave read localStorage.getItem(STORAGE_KEY) with STORAGE_KEY never
//   defined, so Save always failed. The slots are now saved on this phone under DAY_SLOTS_STORAGE_KEY.
// - bg-gray-800 Save button is not one of the colours restaurantTheme.css recolours, so it stays gray-800.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, ArrowLeft, ChevronDown, Clock, Edit2, Trash2 } from 'lucide-react-native';
import { useNavigate, useParams } from '@/lib/router';
import { Dialog as PopupDialog, Screen, StatusBarSpacer, Text } from '@/native/ui';
import { alpha, colors, restaurantTheme, shadow, sp } from '@/theme';
import { Checkbox } from '@food/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@food/components/ui/dialog';
import { useCompanyName } from '@food/hooks/useCompanyName';

const debugError = () => {};

// the per-day slots (the web referenced an undefined STORAGE_KEY here)
const DAY_SLOTS_STORAGE_KEY = 'restaurant_outlet_day_slots';

const getDefaultDayData = () => ({
  isOpen: true,
  slots: [{ id: Date.now(), start: '03:45', end: '02:15', startPeriod: 'am', endPeriod: 'pm' }],
});

// ------------------------------------------------------------------ time picker wheel (web: TimePickerWheel)
const ITEM_H = 40;
const WHEEL_H = 192; // h-48
const WHEEL_PAD = (WHEEL_H - ITEM_H) / 2; // the selected row sits on the centre line
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ['am', 'pm'];

function WheelColumn({ values, initialValue, selected, onSelect, renderValue }) {
  const ref = useRef(null);
  const initialIndex = useRef(Math.max(0, values.indexOf(initialValue))).current;

  useEffect(() => {
    // contentOffset is not always applied on Android: place the wheel once it is laid out
    const t = setTimeout(() => ref.current?.scrollTo({ y: initialIndex * ITEM_H, animated: false }), 0);
    return () => clearTimeout(t);
  }, [initialIndex]);

  const pick = (y) => {
    const index = Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM_H)));
    const value = values[index];
    if (value !== undefined && value !== selected) onSelect(value);
  };

  return (
    <ScrollView
      ref={ref}
      style={styles.wheel}
      contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
      contentOffset={{ x: 0, y: initialIndex * ITEM_H }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      nestedScrollEnabled
      scrollEventThrottle={16}
      onScroll={(e) => pick(e.nativeEvent.contentOffset.y)}
      onMomentumScrollEnd={(e) => pick(e.nativeEvent.contentOffset.y)}
    >
      {values.map((value) => {
        const isSel = selected === value;
        return (
          <View key={String(value)} style={styles.wheelItem}>
            <Text style={isSel ? styles.wheelTextSel : styles.wheelText}>{renderValue(value)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** The web's hour : minute AM/PM wheel popup. onConfirm(hourStr, minuteStr(2 digits), 'am' | 'pm'). */
export function TimePickerWheel({ isOpen, onClose, initialHour, initialMinute, initialPeriod, onConfirm, okBold = false }) {
  const parsedHour = Math.max(1, Math.min(12, parseInt(initialHour, 10) || 1));
  const parsedMinute = Math.max(0, Math.min(59, parseInt(initialMinute, 10) || 0));
  const parsedPeriod = initialPeriod === 'am' || initialPeriod === 'pm' ? initialPeriod : 'am';

  const [selectedHour, setSelectedHour] = useState(parsedHour);
  const [selectedMinute, setSelectedMinute] = useState(parsedMinute);
  const [selectedPeriod, setSelectedPeriod] = useState(parsedPeriod);

  useEffect(() => {
    if (isOpen) {
      setSelectedHour(parsedHour);
      setSelectedMinute(parsedMinute);
      setSelectedPeriod(parsedPeriod);
    }
  }, [isOpen, parsedHour, parsedMinute, parsedPeriod]);

  const handleConfirm = () => {
    const hourStr = selectedHour.toString();
    const minuteStr = selectedMinute.toString().padStart(2, '0');
    onConfirm(hourStr, minuteStr, selectedPeriod);
    onClose();
  };

  return (
    <PopupDialog open={Boolean(isOpen)} onClose={onClose} style={styles.wheelCard}>
      <View style={styles.wheelBody}>
        <View style={styles.wheelCol}>
          <WheelColumn values={HOURS} initialValue={parsedHour} selected={selectedHour} onSelect={setSelectedHour} renderValue={(h) => String(h)} />
        </View>
        <View style={styles.colon}>
          <Text style={styles.colonText}>:</Text>
        </View>
        <View style={styles.wheelCol}>
          <WheelColumn
            values={MINUTES}
            initialValue={parsedMinute}
            selected={selectedMinute}
            onSelect={setSelectedMinute}
            renderValue={(m) => m.toString().padStart(2, '0')}
          />
        </View>
        <View style={styles.wheelCol}>
          <WheelColumn
            values={PERIODS}
            initialValue={parsedPeriod}
            selected={selectedPeriod}
            onSelect={setSelectedPeriod}
            renderValue={(p) => p.toUpperCase()}
          />
        </View>
        {/* Selection Indicator Lines */}
        <View pointerEvents="none" style={styles.wheelLines} />
      </View>
      <View style={styles.okRow}>
        <Pressable onPress={handleConfirm} hitSlop={10}>
          {({ pressed }) => (
            <Text style={[styles.okText, okBold && { fontWeight: '700' }, pressed && { color: okBold ? '#6a2f56' : colors.blue[700] }]}>Okay</Text>
          )}
        </Pressable>
      </View>
    </PopupDialog>
  );
}

// ------------------------------------------------------------------ page
export default function DaySlots() {
  const companyName = useCompanyName();
  const navigate = useNavigate();
  const insets = useSafeAreaInsets();
  const { day } = useParams();
  const dayName = day ? day.charAt(0).toUpperCase() + day.slice(1) : 'Monday';

  const [dayData, setDayData] = useState(getDefaultDayData);
  const [copyToAllDays, setCopyToAllDays] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState(null);
  const [timePickerOpen, setTimePickerOpen] = useState({
    slotId: null,
    field: null,
    type: null, // 'time' or 'period'
  });

  // Get current hour and minute from slot time
  const getTimeParts = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return { hour: '1', minute: '00' };
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h, 10) || 1;
    return {
      hour: hour.toString(),
      minute: (m || '00').padStart(2, '0'),
    };
  };

  const updateSlot = (slotId, field, value) => {
    setDayData((prev) => ({
      ...prev,
      slots: prev.slots.map((slot) => (slot.id === slotId ? { ...slot, [field]: value } : slot)),
    }));
  };

  // Handle time selection from custom picker
  const handleCustomTimeChange = (slotId, field, hour, minute, period = null) => {
    const formattedTime = `${hour}:${minute}`;
    updateSlot(slotId, field, formattedTime);
    if (period && (field === 'start' || field === 'end')) {
      const periodField = field === 'start' ? 'startPeriod' : 'endPeriod';
      updateSlot(slotId, periodField, period);
    }
  };

  // Calculate duration for a slot
  const calculateSlotDuration = (start, end, startPeriod, endPeriod) => {
    const parseTime = (timeStr, period) => {
      if (!timeStr || !timeStr.includes(':')) return 0;
      const [hours, minutes] = timeStr.split(':');
      let hour = parseInt(hours, 10) || 0;
      const mins = parseInt(minutes, 10) || 0;
      if (period === 'pm' && hour !== 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
      return hour * 60 + mins;
    };

    const startMinutes = parseTime(start, startPeriod);
    const endMinutes = parseTime(end, endPeriod);
    let diff = endMinutes - startMinutes;
    if (diff < 0) diff += 24 * 60;

    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    if (minutes === 0) return `${hours} hrs`;
    return `${hours} hrs ${minutes} mins`;
  };

  // Calculate total duration
  const calculateTotalDuration = () => {
    if (!dayData.slots || dayData.slots.length === 0) return '0 hrs';

    let totalMinutes = 0;
    dayData.slots.forEach((slot) => {
      const parseTime = (timeStr, period) => {
        const [hours, minutes] = timeStr.split(':');
        let hour = parseInt(hours, 10);
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;
        return hour * 60 + parseInt(minutes, 10);
      };
      const startMinutes = parseTime(slot.start, slot.startPeriod);
      const endMinutes = parseTime(slot.end, slot.endPeriod);
      let diff = endMinutes - startMinutes;
      if (diff < 0) diff += 24 * 60;
      totalMinutes += diff;
    });

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return `${hours} hrs`;
    return `${hours} hrs ${minutes} mins`;
  };

  const addSlot = () => {
    if (dayData.slots.length >= 3) {
      Alert.alert('', 'Maximum 3 slots allowed per day');
      return;
    }
    setDayData((prev) => ({
      ...prev,
      slots: [
        ...prev.slots,
        {
          id: Date.now() + Math.random(),
          start: '09:00',
          end: '05:00',
          startPeriod: 'am',
          endPeriod: 'pm',
        },
      ],
    }));
  };

  const deleteSlot = (slotId) => {
    if (dayData.slots.length === 1) {
      Alert.alert('', 'At least one slot is required');
      return;
    }
    // Open confirmation dialog
    setSlotToDelete(slotId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (slotToDelete) {
      setDayData((prev) => ({
        ...prev,
        slots: prev.slots.filter((slot) => slot.id !== slotToDelete),
      }));
      setDeleteDialogOpen(false);
      setSlotToDelete(null);
    }
  };

  const persistDaySlots = (storageKey) => {
    if (storageKey === undefined) throw new ReferenceError('STORAGE_KEY is not defined');
    const saved = localStorage.getItem(storageKey);
    const allDays = saved ? JSON.parse(saved) : {};

    if (copyToAllDays) {
      // Copy to all days
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      dayNames.forEach((d) => {
        allDays[d] = { ...dayData };
      });
    } else {
      // Update only current day
      allDays[dayName] = dayData;
    }

    localStorage.setItem(storageKey, JSON.stringify(allDays));
    window.dispatchEvent(new Event('outletTimingsUpdated'));
    navigate('/food/restaurant/outlet-timings');
  };

  const handleSave = () => {
    try {
      persistDaySlots(DAY_SLOTS_STORAGE_KEY);
    } catch (error) {
      debugError('Error saving day slots:', error);
      Alert.alert('', 'Error saving slots. Please try again.');
    }
  };

  const closePicker = () => setTimePickerOpen({ slotId: null, field: null, type: null });

  const renderPicker = () => {
    if (!timePickerOpen.slotId || (timePickerOpen.type !== 'time' && timePickerOpen.type !== 'period')) return null;
    const currentSlot = dayData.slots.find((s) => s.id === timePickerOpen.slotId);
    if (!currentSlot) return null;
    const timeParts = getTimeParts(timePickerOpen.field === 'start' ? currentSlot.start : currentSlot.end);
    const currentPeriod = timePickerOpen.field === 'start' ? currentSlot.startPeriod : currentSlot.endPeriod;
    return (
      <TimePickerWheel
        key={`${timePickerOpen.slotId}-${timePickerOpen.field}-${timePickerOpen.type}`}
        isOpen
        onClose={closePicker}
        initialHour={timeParts.hour}
        initialMinute={timeParts.minute}
        initialPeriod={currentPeriod}
        onConfirm={(hour, minute, period) => {
          handleCustomTimeChange(timePickerOpen.slotId, timePickerOpen.field, hour, minute, period);
          closePicker();
        }}
      />
    );
  };

  const renderTimeRow = (slot, field) => {
    const isStart = field === 'start';
    const value = isStart ? slot.start : slot.end;
    const period = isStart ? slot.startPeriod : slot.endPeriod;
    return (
      <View style={styles.timeRow}>
        <View style={styles.timeLabelWrap}>
          <Clock size={16} color={colors.gray[600]} />
          <Text style={[styles.timeLabel, !isStart && { marginRight: 4 }]} numberOfLines={1}>
            {isStart ? 'Start Time' : 'End Time'}
          </Text>
        </View>
        <Pressable
          onPress={() => setTimePickerOpen({ slotId: slot.id, field, type: 'time' })}
          style={styles.timeBox}
          accessibilityRole="button"
          accessibilityLabel="Open time picker"
        >
          <Text style={[styles.timeValue, !value && { color: colors.gray[400] }]}>{value || (isStart ? '03:45' : '02:15')}</Text>
          <View style={styles.editIcon}>
            <Edit2 size={16} color={colors.gray[500]} />
          </View>
        </Pressable>
        <Pressable onPress={() => setTimePickerOpen({ slotId: slot.id, field, type: 'period' })} style={styles.periodBox}>
          <Text style={styles.periodText}>{period.toUpperCase()}</Text>
          <ChevronDown size={16} color={alpha(colors.gray[900], 0.5)} />
        </Pressable>
      </View>
    );
  };

  return (
    <Screen bg={colors.white} edges={[]} statusBarStyle="dark">
      {/* Header */}
      <View style={styles.header}>
        <StatusBarSpacer color={colors.white} />
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigate('/food/restaurant/outlet-timings')}
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: colors.gray[100] }]}
          >
            <ArrowLeft size={24} color={colors.gray[900]} />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>{dayName}</Text>
            <Text style={styles.headerSub}>{companyName} delivery</Text>
          </View>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>Add or modify your restaurant timings here. You can create maximum up to 3 time slots in a day.</Text>
      </View>

      {/* Main Content - Scrollable */}
      <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: sp(2) }}>
        <View style={{ gap: sp(6) }}>
          {dayData.slots.map((slot, index) => {
            const duration = calculateSlotDuration(slot.start, slot.end, slot.startPeriod, slot.endPeriod);
            return (
              <View key={String(slot.id)} style={styles.slot}>
                {/* Slot Header */}
                <View style={styles.slotHead}>
                  <Text style={styles.slotTitleLine}>
                    <Text style={styles.slotTitle}>Slot-{index + 1}</Text>
                    <Text style={styles.slotDuration}>{`  (${duration})`}</Text>
                  </Text>
                  <Pressable
                    onPress={() => deleteSlot(slot.id)}
                    accessibilityLabel="Delete slot"
                    style={({ pressed }) => [styles.deleteBtn, pressed && { overflow: 'hidden' }]}
                  >
                    {({ pressed }) => (
                      <>
                        {pressed ? (
                          <LinearGradient
                            colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                        ) : null}
                        <Trash2 size={16} color={colors.red[400]} />
                      </>
                    )}
                  </Pressable>
                </View>

                {renderTimeRow(slot, 'start')}
                {renderTimeRow(slot, 'end')}
              </View>
            );
          })}
        </View>

        {/* Add Time Slot Button */}
        {dayData.slots.length < 3 ? (
          <Pressable onPress={addSlot} style={styles.addBtn}>
            {({ pressed }) => <Text style={[styles.addText, pressed && { color: colors.blue[700] }]}>+ Add time slot</Text>}
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Sticky Bottom Controls */}
      <View style={[styles.bottom, { paddingBottom: sp(4) + insets.bottom }]}>
        <View style={styles.copyRow}>
          <Checkbox
            checked={copyToAllDays}
            onCheckedChange={setCopyToAllDays}
            style={styles.checkbox}
            checkedStyle={styles.checkboxOn}
            iconColor={colors.white}
          />
          <Pressable onPress={() => setCopyToAllDays((v) => !v)}>
            <Text style={styles.copyText}>Copy above timings to all days</Text>
          </Pressable>
        </View>

        <Text style={styles.totalText}>Total: {calculateTotalDuration()}</Text>

        <Pressable onPress={handleSave} style={({ pressed }) => [styles.saveBtn, pressed && { overflow: 'hidden' }]}>
          {({ pressed }) => (
            <>
              {pressed ? (
                <LinearGradient
                  colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <Text style={styles.saveText}>Save</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Time Picker / Period Picker Modal */}
      {renderPicker()}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent style={styles.dialog} showCloseButton>
          <DialogHeader>
            <View style={styles.dialogTitleRow}>
              <View style={styles.dialogIcon}>
                <AlertTriangle size={24} color={restaurantTheme.brand} />
              </View>
              <DialogTitle style={{ textAlign: 'left' }}>Delete Time Slot</DialogTitle>
            </View>
            <DialogDescription style={{ textAlign: 'left', color: colors.gray[600], paddingTop: sp(2) }}>
              Are you sure you want to delete this time slot? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ marginTop: sp(4) }}>
            <Pressable
              onPress={() => {
                setDeleteDialogOpen(false);
                setSlotToDelete(null);
              }}
              style={({ pressed }) => [styles.outlineBtn, pressed && { backgroundColor: colors.gray[100] }]}
            >
              <Text style={styles.outlineBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={confirmDelete} style={({ pressed }) => [styles.gradBtn, pressed && { opacity: 0.9 }]}>
              <LinearGradient
                colors={[restaurantTheme.brand, restaurantTheme.brandDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.gradBtnText}>Delete</Text>
            </Pressable>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[200], zIndex: 50 },
  headerRow: { paddingHorizontal: sp(4), paddingVertical: sp(3), flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  backBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  headerSub: { fontSize: 14, lineHeight: 20, color: colors.gray[500] },
  infoBox: { backgroundColor: colors.gray[50], padding: sp(2) },
  infoText: { fontSize: 14, lineHeight: 20, color: colors.gray[700] },
  slot: { backgroundColor: colors.white, padding: sp(4), gap: sp(3), borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  slotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotTitleLine: { flexShrink: 1 },
  slotTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.gray[900] },
  slotDuration: { fontSize: 14, lineHeight: 20, color: colors.gray[600] },
  deleteBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.pink[100], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  timeRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: sp(3) },
  timeLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: sp(2), flexShrink: 0 },
  timeLabel: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[700] },
  timeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 2,
    backgroundColor: colors.gray[50],
  },
  timeValue: { width: 80, paddingHorizontal: sp(2), paddingVertical: sp(2), fontSize: 15, lineHeight: 22, fontWeight: '700', color: colors.gray[900] },
  editIcon: { marginRight: sp(2), padding: 4, borderRadius: 4 },
  periodBox: {
    width: 70,
    height: 36,
    paddingHorizontal: sp(3),
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: 2,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  periodText: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: colors.gray[900] },
  addBtn: { width: '100%', paddingVertical: sp(3), alignItems: 'center' },
  addText: { color: restaurantTheme.brand, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  bottom: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingHorizontal: sp(4),
    paddingTop: sp(4),
    gap: sp(4),
    ...shadow.lg,
  },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  checkbox: { width: 20, height: 20, borderWidth: 2, borderColor: colors.gray[300], borderRadius: 4 },
  checkboxOn: { backgroundColor: colors.green[600], borderColor: colors.green[600] },
  copyText: { fontSize: 14, lineHeight: 20, color: colors.gray[700] },
  totalText: { fontSize: 14, lineHeight: 20, color: colors.gray[700] },
  saveBtn: { width: '100%', backgroundColor: colors.gray[800], paddingVertical: sp(3), borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  saveText: { color: colors.white, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  // delete dialog (shadcn DialogContent sm:max-w-[425px] p-4)
  dialog: { maxWidth: 425, padding: sp(4) },
  dialogTitleRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), marginBottom: sp(2) },
  dialogIcon: { width: 48, height: 48, backgroundColor: colors.red[100], borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  outlineBtn: {
    width: '100%',
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.xs,
  },
  outlineBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.gray[900] },
  gradBtn: { width: '100%', height: 36, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  gradBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.white },
  // wheel popup
  wheelCard: { maxWidth: 320, borderRadius: 8, backgroundColor: colors.white, ...shadow['2xl'] },
  wheelBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: sp(8), paddingHorizontal: sp(4) },
  wheelCol: { flex: 1, alignItems: 'center' },
  wheel: { width: '100%', height: WHEEL_H },
  wheelItem: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  wheelText: { fontSize: 16, lineHeight: 24, fontWeight: '400', color: colors.gray[400] },
  wheelTextSel: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.gray[900] },
  colon: { paddingHorizontal: sp(2) },
  colonText: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.gray[900] },
  wheelLines: {
    position: 'absolute',
    left: sp(4),
    right: sp(4),
    top: sp(8) + WHEEL_PAD,
    height: ITEM_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.gray[300],
  },
  okRow: { borderTopWidth: 1, borderTopColor: colors.gray[200], paddingHorizontal: sp(4), paddingVertical: sp(4), alignItems: 'center' },
  okText: { color: restaurantTheme.brand, fontSize: 16, lineHeight: 24, fontWeight: '500' },
});
