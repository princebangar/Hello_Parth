// Same rule as the server (Backend .../taxi/services/surgeService.js): Set Price > Surge Pricing slots per weekday.
// The pickup time (now, or the scheduled time) inside a slot raises the price by that % before tax. The phone's clock
// is Indian time for every rider of this app; a slot whose end is before its start runs past midnight.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toMinutes = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
};

export const getActiveSurgePercent = (pricingRule, when = new Date()) => {
  const surgeDays = Array.isArray(pricingRule?.surge_prices) ? pricingRule.surge_prices : [];
  if (!surgeDays.length) return 0;

  const at = new Date(when);
  if (Number.isNaN(at.getTime())) return 0;
  const day = DAYS[at.getDay()];
  const previousDay = DAYS[(at.getDay() + 6) % 7];
  const minutes = at.getHours() * 60 + at.getMinutes();

  let percent = 0;
  surgeDays.forEach((entry) => {
    (Array.isArray(entry?.slots) ? entry.slots : []).forEach((slot) => {
      const start = toMinutes(slot?.start_time);
      const end = toMinutes(slot?.end_time);
      const value = Math.max(0, Number(slot?.surge_price) || 0);
      if (start === null || end === null || !value) return;
      const overnight = end <= start;
      const matches = entry.day === day
        ? (overnight ? minutes >= start : minutes >= start && minutes < end)
        : entry.day === previousDay && overnight && minutes < end;
      if (matches) percent = Math.max(percent, value);
    });
  });
  return percent;
};
