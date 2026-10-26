import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";
import { Dialog, Text } from "@/native/ui";
import { colors } from "@/theme";

// date-fns addDays / startOfWeek / endOfWeek (date-fns is not in the app; same results)
const addDays = (date, amount) => {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
};
const startOfWeek = (date, { weekStartsOn = 0 } = {}) => {
  const d = new Date(date);
  const diff = (d.getDay() < weekStartsOn ? 7 : 0) + d.getDay() - weekStartsOn;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfWeek = (date, { weekStartsOn = 0 } = {}) => {
  const d = new Date(date);
  const diff = (d.getDay() < weekStartsOn ? -7 : 0) + 6 - (d.getDay() - weekStartsOn);
  d.setDate(d.getDate() + diff);
  d.setHours(23, 59, 59, 999);
  return d;
};

const PRIMARY = "#15498b";
const FROM_YEAR = 2020;
const TO_YEAR = 2030;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * WeekSelector (JSX version)
 * - Pills: This week, Last week, Select week ?
 * - Centered date range with hairlines (like screenshot)
 * - shadcn/ui + Tailwind (native: the shadcn Popover + Calendar is a dialog with a month calendar)
 */
export default function WeekSelector({ weekStartsOn = 0, onChange, className, style }) {
  void className;
  const [open, setOpen] = React.useState(false);
  const [anchorDate, setAnchorDate] = React.useState(new Date());

  const computeRange = React.useCallback(
    (date) => ({
      start: startOfWeek(date, { weekStartsOn }),
      end: endOfWeek(date, { weekStartsOn }),
    }),
    [weekStartsOn]
  );

  // current range shown
  const [range, setRange] = React.useState(() => computeRange(new Date()));

  const setThisWeek = () => {
    const r = computeRange(new Date());
    setRange(r);
    setAnchorDate(new Date());
    if (onChange) onChange(r);
  };

  const setLastWeek = () => {
    const lastWeekDate = addDays(new Date(), -7);
    const r = computeRange(lastWeekDate);
    setRange(r);
    setAnchorDate(lastWeekDate);
    if (onChange) onChange(r);
  };

  const onSelectDate = (date) => {
    if (!date) return;
    const r = computeRange(date);
    setRange(r);
    setAnchorDate(date);
    setOpen(false);
    if (onChange) onChange(r);
  };

  const fmt = (d) =>
    new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" })
      .format(d)
      .replace(" ", " ");

  const thisWeekActive = isSameRange(range, computeRange(new Date()));

  return (
    <View style={[{ width: "100%" }, style]}>
      {/* Pills */}
      <View style={styles.pills}>
        <Pressable
          onPress={setThisWeek}
          style={({ pressed }) => [styles.pill, thisWeekActive && styles.pillActive, pressed && styles.pillPressed]}
        >
          <Text style={[styles.pillText, thisWeekActive && { color: colors.emerald[900] }]} numberOfLines={1}>This week</Text>
        </Pressable>

        <Pressable onPress={setLastWeek} style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}>
          <Text style={styles.pillText} numberOfLines={1}>Last week</Text>
        </Pressable>

        <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}>
          <Text style={styles.pillText} numberOfLines={1}>Select day</Text>
          <ChevronDown size={16} color={colors.gray[900]} style={{ marginLeft: 8 }} />
        </Pressable>
      </View>

      {/* Divider + Date Range */}
      <View style={styles.rangeRow}>
        <View style={styles.hairline} />
        <Text style={styles.rangeText}>{`${fmt(range.start)} - ${fmt(range.end)}`}</Text>
        <View style={styles.hairline} />
      </View>

      <Dialog open={open} onClose={() => setOpen(false)} style={styles.popover}>
        {/* Using single-date selection; we compute its week. */}
        <MonthCalendar selected={anchorDate} onSelect={onSelectDate} />
      </Dialog>
    </View>
  );
}

// shadcn Calendar (react-day-picker, mode="single", captionLayout="dropdown-buttons", fromYear 2020, toYear 2030)
function MonthCalendar({ selected, onSelect }) {
  const [month, setMonth] = React.useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = new Date();

  const canPrev = month.getFullYear() > FROM_YEAR || month.getMonth() > 0;
  const canNext = month.getFullYear() < TO_YEAR || month.getMonth() < 11;
  const shift = (n) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  const weeks = React.useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const count = Math.ceil((first.getDay() + last.getDate()) / 7);
    return [...Array(count)].map((_, w) => [...Array(7)].map((__, d) => addDays(gridStart, w * 7 + d)));
  }, [month]);

  const caption = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <View style={styles.calendar}>
      <View style={styles.caption}>
        <Pressable
          onPress={() => canPrev && shift(-1)}
          disabled={!canPrev}
          style={({ pressed }) => [styles.navBtn, !canPrev && { opacity: 0.5 }, pressed && styles.pillPressed]}
          accessibilityLabel="Go to previous month"
        >
          <ChevronLeft size={16} color={colors.gray[900]} />
        </Pressable>
        <Text style={styles.captionText}>{caption}</Text>
        <Pressable
          onPress={() => canNext && shift(1)}
          disabled={!canNext}
          style={({ pressed }) => [styles.navBtn, !canNext && { opacity: 0.5 }, pressed && styles.pillPressed]}
          accessibilityLabel="Go to next month"
        >
          <ChevronRight size={16} color={colors.gray[900]} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={styles.cell}>
            <Text style={styles.weekday}>{w}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day) => {
            const outside = day.getMonth() !== month.getMonth();
            const isSelected = day.toDateString() === selected.toDateString();
            const isToday = day.toDateString() === today.toDateString();
            return (
              <View key={day.toDateString()} style={styles.cell}>
                <Pressable
                  onPress={() => onSelect(day)}
                  style={({ pressed }) => [
                    styles.day,
                    isToday && !isSelected && { backgroundColor: colors.gray[100] },
                    isSelected && { backgroundColor: PRIMARY },
                    pressed && !isSelected && { backgroundColor: colors.gray[100] },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      outside && { color: colors.gray[400], opacity: 0.5 },
                      isSelected && { color: colors.white, opacity: 1 },
                    ]}
                  >
                    {String(day.getDate())}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function isSameRange(a, b) {
  return (
    a.start.toDateString() === b.start.toDateString() &&
    a.end.toDateString() === b.end.toDateString()
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "nowrap", alignItems: "center", justifyContent: "center", gap: 6 },
  pill: {
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: "#E7EFFA", borderColor: "#C3D0E1" },
  pillPressed: { backgroundColor: colors.gray[100] },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: colors.gray[900] },
  rangeRow: { marginTop: 24, flexDirection: "row", alignItems: "center", gap: 16 },
  hairline: { height: 1, flex: 1, backgroundColor: colors.gray[200] },
  rangeText: { fontSize: 18, lineHeight: 28, fontWeight: "600", color: PRIMARY },
  popover: { width: "auto", alignSelf: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.gray[200] },
  calendar: { padding: 12, backgroundColor: colors.white },
  caption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, marginBottom: 16 },
  captionText: { fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.gray[900] },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.8,
  },
  weekRow: { flexDirection: "row", marginTop: 8 },
  cell: { width: 36, alignItems: "center", justifyContent: "center" },
  weekday: { fontSize: 12.8, lineHeight: 18, color: colors.gray[500], fontWeight: "400" },
  day: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 14, lineHeight: 20, color: colors.gray[900], fontWeight: "400" },
});
