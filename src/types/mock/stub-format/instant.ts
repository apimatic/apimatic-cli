import { asciiUpperCase } from '../text/ascii.js';
import { isAllDigits } from '../text/characters.js';

const SECONDS_PER_DAY = 86_400;
const MIN_UNIX_SECONDS = -62_135_596_800;
const MAX_UNIX_SECONDS = 253_402_300_799;
const MAX_OFFSET_MINUTES = 14 * 60;
/** Hundred-nanosecond steps: what the reference keeps, and one digit more than any SDK's clock writes reliably. */
const FRACTION_DIGITS = 7;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS_FROM_THURSDAY = ['THU', 'FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED'];

interface Moment {
  readonly seconds: number;
  readonly fraction: number;
}

/**
 * One point in time, read from any spelling SDKs put on the wire: RFC 3339 with `Z` or a `±hh:mm`
 * offset and any number of fraction digits, RFC 1123, or Unix seconds, negative before 1970. A
 * stub writes the instant once and the comparison is on the instant, so a generator never has to
 * know how each language's serializer spells a date-time. A bare date is no instant: every
 * language spells one the same way, so an exact value serves it.
 */
export class Instant {
  private readonly seconds: number;
  private readonly fraction: number;

  private constructor(moment: Moment) {
    this.seconds = moment.seconds;
    this.fraction = moment.fraction;
  }

  public static parse(text: string): Instant | undefined {
    const trimmed = text.trim();
    const moment = isUnixSeconds(trimmed) ? unixSeconds(trimmed) : spelled(asciiUpperCase(trimmed));
    return moment === undefined || moment.seconds < MIN_UNIX_SECONDS || moment.seconds > MAX_UNIX_SECONDS
      ? undefined
      : new Instant(moment);
  }

  /** Why a stub's text is refused, naming the spellings `parse` reads. */
  public static notADateTime(text: string): string {
    return `'${text}' is not a date-time; write RFC 3339 (2025-12-09T14:30:00Z or with an offset), RFC 1123 or Unix seconds.`;
  }

  public isEqual(other: Instant): boolean {
    return this.seconds === other.seconds && this.fraction === other.fraction;
  }

  /** The one spelling a report prints: UTC, `Z`, and the fraction only when there is one. */
  public toString(): string {
    const days = Math.floor(this.seconds / SECONDS_PER_DAY);
    const secondOfDay = this.seconds - days * SECONDS_PER_DAY;
    const { year, month, day } = civilFromDays(days);
    const date = `${padded(year, 4)}-${padded(month, 2)}-${padded(day, 2)}`;
    const time = [Math.floor(secondOfDay / 3600), Math.floor(secondOfDay / 60) % 60, secondOfDay % 60]
      .map((part) => padded(part, 2))
      .join(':');
    const fraction = this.fraction === 0 ? '' : `.${withoutTrailingZeros(padded(this.fraction, FRACTION_DIGITS))}`;
    return `${date}T${time}${fraction}Z`;
  }
}

/** Digits, with a minus before them for an instant before 1970; a plus is written by no serializer. */
function isUnixSeconds(text: string): boolean {
  return isAllDigits(text.startsWith('-') ? text.slice(1) : text);
}

function unixSeconds(text: string): Moment | undefined {
  const seconds = BigInt(text);
  return seconds >= BigInt(MIN_UNIX_SECONDS) && seconds <= BigInt(MAX_UNIX_SECONDS)
    ? { seconds: Number(seconds), fraction: 0 }
    : undefined;
}

function spelled(text: string): Moment | undefined {
  return text.endsWith(' GMT') ? rfc1123(text) : rfc3339(text);
}

/** `yyyy-MM-ddTHH:mm:ss`, an optional fraction, then `Z` or `±hh:mm`; never the basic `+0100` or a one-digit hour. */
function rfc3339(text: string): Moment | undefined {
  const local = localSeconds(numbers(text.slice(0, 19), [4, '-', 2, '-', 2, 'T', 2, ':', 2, ':', 2]));
  const hasFraction = text[19] === '.';
  const fractionDigits = hasFraction ? digitRunAt(text, 20) : '';
  const zone = text.slice(hasFraction ? 20 + fractionDigits.length : 19);
  const offsetMinutes = zone === 'Z' ? 0 : offset(zone);
  if (local === undefined || offsetMinutes === undefined || (hasFraction && fractionDigits.length === 0)) {
    return undefined;
  }
  return {
    seconds: local - offsetMinutes * 60,
    fraction: Number(fractionDigits.slice(0, FRACTION_DIGITS).padEnd(FRACTION_DIGITS, '0'))
  };
}

function offset(zone: string): number | undefined {
  const parts = numbers(zone.slice(1), [2, ':', 2]);
  if (parts === undefined || (zone[0] !== '+' && zone[0] !== '-')) {
    return undefined;
  }
  const [hours, minutes] = parts;
  const total = hours * 60 + minutes;
  if (minutes > 59 || total > MAX_OFFSET_MINUTES) {
    return undefined;
  }
  return zone[0] === '-' ? -total : total;
}

/** `ddd, dd MMM yyyy HH:mm:ss GMT`, with the weekday the date falls on. */
function rfc1123(text: string): Moment | undefined {
  const [day] = numbers(text.slice(5, 7), [2]) ?? [];
  const month = MONTHS.indexOf(text.slice(8, 11)) + 1;
  const [year, hour, minute, second] = numbers(text.slice(12, 25), [4, ' ', 2, ':', 2, ':', 2]) ?? [];
  const seconds = localSeconds([year, month, day, hour, minute, second]);
  const punctuated = text.length === 29 && text.slice(3, 5) === ', ' && text[7] === ' ' && text[11] === ' ';
  if (seconds === undefined || !punctuated) {
    return undefined;
  }
  const weekday = WEEKDAYS_FROM_THURSDAY[modulo(Math.floor(seconds / SECONDS_PER_DAY), 7)];
  return text.startsWith(weekday) ? { seconds, fraction: 0 } : undefined;
}

/**
 * Seconds since 1970 of a date and a time read as UTC, or nothing for a value no calendar or clock
 * has: a 13th month, 29 February 2025, 24:00, a 60th second.
 */
function localSeconds(parts: readonly (number | undefined)[] | undefined): number | undefined {
  const [year, month, day, hour, minute, second] = parts ?? [];
  if (year === undefined || month === undefined || day === undefined) return undefined;
  if (hour === undefined || minute === undefined || second === undefined) return undefined;
  const onCalendar = year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
  const onClock = hour <= 23 && minute <= 59 && second <= 59;
  return onCalendar && onClock
    ? daysFromCivil(year, month, day) * SECONDS_PER_DAY + hour * 3600 + minute * 60 + second
    : undefined;
}

/** The numbers in text that is exactly this shape: a count stands for that many digits, a string for itself. */
function numbers(text: string, shape: readonly (number | string)[]): number[] | undefined {
  const found: number[] = [];
  let position = 0;
  for (const piece of shape) {
    const length = typeof piece === 'number' ? piece : piece.length;
    const part = text.slice(position, position + length);
    if (typeof piece === 'number' ? part.length !== length || !isAllDigits(part) : part !== piece) {
      return undefined;
    }
    if (typeof piece === 'number') {
      found.push(Number(part));
    }
    position += length;
  }
  return position === text.length ? found : undefined;
}

function digitRunAt(text: string, start: number): string {
  let end = start;
  while (end < text.length && isAllDigits(text[end])) {
    end += 1;
  }
  return text.slice(start, end);
}

function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** Days since 1970-01-01 in the proleptic Gregorian calendar; `Date` reads a year below 100 as 19xx. */
function daysFromCivil(year: number, month: number, day: number): number {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const shifted = days + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153);
  const month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  return {
    year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0),
    month,
    day: dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1
  };
}

const modulo = (value: number, divisor: number): number => ((value % divisor) + divisor) % divisor;

const padded = (value: number, width: number): string => String(value).padStart(width, '0');

function withoutTrailingZeros(digits: string): string {
  let end = digits.length;
  while (end > 0 && digits[end - 1] === '0') {
    end -= 1;
  }
  return digits.slice(0, end);
}
