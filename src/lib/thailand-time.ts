export const THAILAND_TIME_ZONE = 'Asia/Bangkok';

const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;

export function formatThaiDate(value: Date | number | string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'long',
    timeZone: THAILAND_TIME_ZONE,
    year: 'numeric',
    ...options,
  }).format(new Date(value));
}

export function formatThaiTime(value: Date | number | string) {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    timeZone: THAILAND_TIME_ZONE,
  }).format(new Date(value));
}

export function formatThaiDateTime(value: Date | number | string) {
  return `${formatThaiDate(value)} ${formatThaiTime(value)} น.`;
}

function thailandParts(value: Date) {
  const shifted = new Date(value.getTime() + THAILAND_OFFSET_MS);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    weekday: shifted.getUTCDay(),
    year: shifted.getUTCFullYear(),
  };
}

function thailandMidnightUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day) - THAILAND_OFFSET_MS);
}

export function thailandRange(period: 'day' | 'month' | 'week', value = new Date()) {
  const parts = thailandParts(value);
  if (period === 'month') {
    return {
      from: thailandMidnightUtc(parts.year, parts.month, 1),
      to: new Date(thailandMidnightUtc(parts.year, parts.month + 1, 1).getTime() - 1),
    };
  }
  const mondayOffset = (parts.weekday + 6) % 7;
  const startDay = period === 'week' ? parts.day - mondayOffset : parts.day;
  const durationDays = period === 'week' ? 7 : 1;
  const from = thailandMidnightUtc(parts.year, parts.month, startDay);
  return {from, to: new Date(from.getTime() + durationDays * 24 * 60 * 60 * 1000 - 1)};
}

/** Calendar fields of `value` as they read on a clock in Bangkok. */
export function thailandCalendarParts(value: Date | number | string = new Date()) {
  const shifted = new Date(new Date(value).getTime() + THAILAND_OFFSET_MS);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
  };
}

/** `YYYY-MM` for the Bangkok month containing `value`. */
export function thailandMonthKey(value: Date | number | string = new Date()) {
  const {month, year} = thailandCalendarParts(value);
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` for the Bangkok day containing `value`. */
export function thailandDateKey(value: Date | number | string = new Date()) {
  const {day, month, year} = thailandCalendarParts(value);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Steps a `YYYY-MM` key by whole months. Accepts and returns Bangkok month keys. */
export function shiftMonthKey(monthKey: string, months: number) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Number of days in the Bangkok month containing `value`. */
export function thailandDaysInMonth(value: Date | number | string = new Date()) {
  const {month, year} = thailandCalendarParts(value);
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
