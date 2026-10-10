// Bus times are saved as 24 h "HH:mm" ("05:00", "21:30"); riders read them as "5:00 AM" / "9:30 PM".
export const formatBusTime = (value, fallback = '--:--') => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text || fallback;
  if (/\b(am|pm)\b/i.test(text)) return text;
  const hours = Number(match[1]);
  if (hours > 23) return text;
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
};
