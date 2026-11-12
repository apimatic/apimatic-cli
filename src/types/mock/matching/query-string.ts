import { percentDecode } from '../text/percent.js';

/**
 * Reads a query string into name and value pairs in the order sent, decoded the way form encoders
 * write them: `+` is a space and `%2B` a plus, and `filter%5Bstatus%5D=active` is
 * `filter[status]=active`. A key sent twice yields two pairs; a key without `=` has an empty value.
 */
export function parseQuery(query: string): [string, string][] {
  return parseForm(query.startsWith('?') ? query.slice(1) : query);
}

/**
 * A form body as sent: a `?` at its start belongs to the first name, as a strict server reads it,
 * so `?grant_type=…` sends no `grant_type`.
 */
export function parseForm(encoded: string): [string, string][] {
  return encoded
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair): [string, string] => {
      const equals = pair.indexOf('=');
      return equals < 0
        ? [formDecode(pair), '']
        : [formDecode(pair.slice(0, equals)), formDecode(pair.slice(equals + 1))];
    });
}

/** One form-encoded component: `+` becomes a space before the percent-escapes are decoded, so `%2B` stays a plus. */
export function formDecode(component: string): string {
  return percentDecode(component.replaceAll('+', ' '));
}
