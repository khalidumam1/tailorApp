import { HttpError } from '../errors.js';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function localPartsAsUtc(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
}

function localDateTimeToUtc(year: number, month: number, day: number, timezone: string): Date {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let candidate = target;
  for (let i = 0; i < 4; i += 1) {
    candidate += target - localPartsAsUtc(new Date(candidate), timezone);
  }
  return new Date(candidate);
}

function parseDateOnly(value: string, timezone: string): Date {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new HttpError(400, 'Report dates must use YYYY-MM-DD format', 'INVALID_REPORT_DATE');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) {
    throw new HttpError(400, 'Report date is not a valid calendar date', 'INVALID_REPORT_DATE');
  }
  try {
    return localDateTimeToUtc(year, month, day, timezone);
  } catch {
    throw new HttpError(400, 'Business timezone is invalid', 'INVALID_TIMEZONE');
  }
}

function localDateParts(instant: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

/**
 * Start (inclusive) and end (exclusive) of the business-local calendar day
 * containing `instant`, in the business's own timezone. Day boundaries must
 * come from here — never from a hardcoded zone — so tenants outside
 * Asia/Karachi see their own "today".
 */
export function businessDayRange(timezone: string, instant = new Date()): { start: Date; end: Date } {
  try {
    const { year, month, day } = localDateParts(instant, timezone);
    const start = localDateTimeToUtc(year, month, day, timezone);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    const end = localDateTimeToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timezone);
    return { start, end };
  } catch {
    throw new HttpError(400, 'Business timezone is invalid', 'INVALID_TIMEZONE');
  }
}

/** Local calendar date (YYYY-MM-DD) of `instant` in the business timezone. */
export function businessLocalDateString(timezone: string, instant = new Date()): string {
  try {
    const { year, month, day } = localDateParts(instant, timezone);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
  } catch {
    throw new HttpError(400, 'Business timezone is invalid', 'INVALID_TIMEZONE');
  }
}

/** Start of the business-local calendar month containing `instant`. */
export function businessMonthStart(timezone: string, instant = new Date()): Date {
  try {
    const { year, month } = localDateParts(instant, timezone);
    return localDateTimeToUtc(year, month, 1, timezone);
  } catch {
    throw new HttpError(400, 'Business timezone is invalid', 'INVALID_TIMEZONE');
  }
}

export function businessDateBounds(input: { from?: string; to?: string; timezone: string }): { gte?: Date; lte?: Date } {
  const result: { gte?: Date; lte?: Date } = {};
  if (input.from) result.gte = parseDateOnly(input.from, input.timezone);
  if (input.to) {
    const match = DATE_ONLY.exec(input.to);
    if (!match) throw new HttpError(400, 'Report dates must use YYYY-MM-DD format', 'INVALID_REPORT_DATE');
    parseDateOnly(input.to, input.timezone);
    const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
    result.lte = new Date(parseDateOnly(next.toISOString().slice(0, 10), input.timezone).getTime() - 1);
  }
  if (result.gte && result.lte && result.gte > result.lte) {
    throw new HttpError(400, 'Report start date must not be after the end date', 'INVALID_REPORT_DATE_RANGE');
  }
  return result;
}
