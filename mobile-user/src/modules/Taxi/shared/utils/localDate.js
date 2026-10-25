// Calendar date / time in the phone's own timezone. `new Date().toISOString().split('T')[0]` is the UTC date: between
// midnight and 5:30 am in India it is still "yesterday", so booking screens opened with a past date (and the date
// picker allowed times that had already passed).

const pad = (value) => String(value).padStart(2, '0');

/** YYYY-MM-DD of the local day, `offsetDays` days from today. */
export const localDateKey = (offsetDays = 0, from = new Date()) => {
  const date = new Date(from.getTime());
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** YYYY-MM-DDTHH:mm of now in local time (the value format of <input type="datetime-local"> and its `min`). */
export const localDateTimeMin = (from = new Date()) =>
  `${localDateKey(0, from)}T${pad(from.getHours())}:${pad(from.getMinutes())}`;
