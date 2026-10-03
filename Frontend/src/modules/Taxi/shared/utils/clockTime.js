// One display format for clock times typed as "18:30", "6:30 pm" or "06:30 PM" -> "06:30 PM".
// Anything that does not look like a time is returned as-is (or the fallback when empty).
export const formatClockTime = (value, fallback = '--:--') => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!match) return raw;
  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3] ? match[3].replace(/\./g, '').toLowerCase() : '';
  if (hours > 23 || Number(minutes) > 59) return raw;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(twelve).padStart(2, '0')}:${minutes} ${suffix}`;
};
