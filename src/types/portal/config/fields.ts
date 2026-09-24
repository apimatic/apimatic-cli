import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../../file/urlPath.js';
import { unknownFieldErrors } from '../unknown-fields.js';

/** What every field and namespace parser of the `portal` block answers with. */
export type Parsed<T> = Result<T, string[]>;

/**
 * An `http:` or `https:` address written out in full. The URL parser also takes
 * `https:example.com`, which a browser reads on an https site as a path of that site.
 */
export function isWebAddress(text: string): boolean {
  return /^https?:\/\//i.test(text) && UrlPath.create(text) !== undefined;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A namespace of the block. Absent reads as empty, so every default in it applies; anything
 * but an object is refused, since nothing inside it could be read.
 */
export function namespace(value: unknown, path: string): Parsed<Record<string, unknown>> {
  if (value === undefined) {
    return ok({});
  }
  return isJsonObject(value) ? ok(value) : err([`'${path}' must be a JSON object.`]);
}

/** The keys of a namespace that the block does not define, each named by its dotted path. */
export function unknownKeys(data: Record<string, unknown>, known: readonly string[], path: string): string[] {
  return unknownFieldErrors(data, new Set(known), (key) => `'${path}.${key}' is not a 'portal' setting.`);
}

/**
 * Every field's answer at once, after the namespace's unknown keys, so one edit fixes the
 * file. `fields` is what `Result.combineWithAllErrors` makes of the field parsers.
 */
export function allOf<T>(unknown: string[], fields: Result<T, string[][]>): Parsed<T> {
  if (fields.isErr()) {
    return err([...unknown, ...fields.error.flat()]);
  }
  return unknown.length > 0 ? err(unknown) : ok(fields.value);
}

/** One value per colour mode. */
export interface LightDark<T> {
  light: T;
  dark: T;
  /** Written once for both modes, which is how it serialises back. */
  single: boolean;
}

/** A setting written once for both modes, or as `{ light, dark }` with both named. */
export function lightDark<T>(
  value: unknown,
  path: string,
  parse: (present: unknown, path: string) => Parsed<T>
): Parsed<LightDark<T>> {
  if (typeof value === 'string') {
    return parse(value, path).map((both) => ({ light: both, dark: both, single: true }));
  }
  if (!isJsonObject(value)) {
    return err([`'${path}' must be a string, or an object with 'light' and 'dark'.`]);
  }
  const mode = (name: 'light' | 'dark'): Parsed<T> =>
    value[name] === undefined ? err([`'${path}.${name}' is required.`]) : parse(value[name], `${path}.${name}`);
  return allOf(
    unknownKeys(value, ['light', 'dark'], path),
    Result.combineWithAllErrors([mode('light'), mode('dark')])
  ).map(([light, dark]) => ({ light, dark, single: false }));
}

/** A setting with no default: absent is null rather than an error. */
export function optional<T>(value: unknown, parse: (present: unknown) => Parsed<T>): Parsed<T | null> {
  return value === undefined ? ok(null) : parse(value);
}

export function optionalBoolean(value: unknown, path: string, fallback: boolean): Parsed<boolean> {
  if (value === undefined) {
    return ok(fallback);
  }
  return typeof value === 'boolean' ? ok(value) : err([`'${path}' must be true or false.`]);
}

export function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[], fallback: T): Parsed<T> {
  if (value === undefined) {
    return ok(fallback);
  }
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return ok(value as T);
  }
  return err([`'${path}' must be one of ${quotedList(allowed)}.`]);
}

export function quotedList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

export function nonEmptyString(value: unknown, path: string): Parsed<string> {
  return typeof value === 'string' && value.trim().length > 0
    ? ok(value.trim())
    : err([`'${path}' must be a non-empty string.`]);
}
