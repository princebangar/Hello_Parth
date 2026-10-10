// Set Price > Surge Pricing: per weekday time slots ("18:00" - "21:00", +20 %). A ride whose pickup time (now, or the
// scheduled time) falls in a slot of that weekday costs that much more. Times are Indian time; a slot whose end is
// before its start runs past midnight (22:00 - 02:00).
export const SURGE_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toMinutes = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
};

const indiaClock = (date) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return { day: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
};

// Slots as saved: [{ day, slots: [{ start_time, end_time, surge_price }] }]
export const normalizeSurgePrices = (value) => {
  const list = Array.isArray(value) ? value : [];
  return SURGE_DAYS.map((day) => {
    const entry = list.find((item) => String(item?.day || '').toLowerCase() === day.toLowerCase());
    const slots = (Array.isArray(entry?.slots) ? entry.slots : [])
      .map((slot) => ({
        start_time: String(slot?.start_time || '').slice(0, 5),
        end_time: String(slot?.end_time || '').slice(0, 5),
        surge_price: Math.min(500, Math.max(0, Number(slot?.surge_price) || 0)),
      }))
      .filter((slot) => toMinutes(slot.start_time) !== null && toMinutes(slot.end_time) !== null && slot.surge_price > 0);
    return { day, slots };
  }).filter((entry) => entry.slots.length > 0);
};

/** Surge % that applies at `when` (Date) for a Set Price rule; 0 when no slot matches. */
export const getActiveSurgePercent = (pricingRule, when = new Date()) => {
  const surgeDays = normalizeSurgePrices(pricingRule?.surge_prices);
  if (!surgeDays.length) return 0;

  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return 0;
  const { day, minutes } = indiaClock(at);
  const previousDay = SURGE_DAYS[(SURGE_DAYS.indexOf(day) + 6) % 7];

  let percent = 0;
  for (const entry of surgeDays) {
    for (const slot of entry.slots) {
      const start = toMinutes(slot.start_time);
      const end = toMinutes(slot.end_time);
      const overnight = end <= start;
      const matches = entry.day === day
        ? (overnight ? minutes >= start : minutes >= start && minutes < end)
        : entry.day === previousDay && overnight && minutes < end;
      if (matches) percent = Math.max(percent, slot.surge_price);
    }
  }
  return percent;
};
