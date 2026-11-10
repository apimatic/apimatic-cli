import { Instant } from './instant.js';

/**
 * How one named value on the wire (a query parameter, header, cookie, form field or credential)
 * must look. A text rule expects the name to be sent exactly once, `each` as many times as it has
 * rules, `absent` not at all; `any`, which no stub file can spell, accepts whatever is sent.
 * Comparisons are by code unit, and there are no patterns, so a generator never escapes anything.
 */
export type ValueRule =
  | { readonly kind: 'exact'; readonly value: string }
  | { readonly kind: 'each'; readonly rules: readonly ValueRule[] }
  | { readonly kind: 'startsWith'; readonly prefix: string }
  | { readonly kind: 'endsWith'; readonly suffix: string }
  | { readonly kind: 'contains'; readonly fragment: string }
  | { readonly kind: 'dateTime'; readonly instant: Instant }
  | { readonly kind: 'absent' }
  | { readonly kind: 'any' };

export const ABSENT: ValueRule = { kind: 'absent' };
export const ANY_VALUE: ValueRule = { kind: 'any' };

/** Whether the values sent under the name satisfy the rule, their number included. */
export function accepts(rule: ValueRule, actual: readonly string[]): boolean {
  const [only] = actual;
  switch (rule.kind) {
    case 'exact':
      return actual.length === 1 && only === rule.value;
    case 'each':
      return actual.length === rule.rules.length && rule.rules.every((each, index) => accepts(each, [actual[index]]));
    case 'startsWith':
      return actual.length === 1 && only.startsWith(rule.prefix);
    case 'endsWith':
      return actual.length === 1 && only.endsWith(rule.suffix);
    case 'contains':
      return actual.length === 1 && only.includes(rule.fragment);
    case 'dateTime':
      return actual.length === 1 && Instant.parse(only)?.isEqual(rule.instant) === true;
    case 'absent':
      return actual.length === 0;
    case 'any':
      return true;
  }
}

/** The rule in the words a report uses for the expected side. */
export function describeRule(rule: ValueRule): string {
  switch (rule.kind) {
    case 'exact':
      return rule.value;
    case 'each':
      return rule.rules.map(describeRule).join(' & ');
    case 'startsWith':
      return `starting with '${rule.prefix}'`;
    case 'endsWith':
      return `ending with '${rule.suffix}'`;
    case 'contains':
      return `containing '${rule.fragment}'`;
    case 'dateTime':
      return `a date-time equal to ${rule.instant}`;
    case 'absent':
      return 'absent';
    case 'any':
      return 'any value';
  }
}

/** The text the rule fixes at the start of a value, where an Authorization scheme stands; only an exact value and a prefix fix one. */
export function openingOf(rule: ValueRule): string {
  return rule.kind === 'exact' ? rule.value : rule.kind === 'startsWith' ? rule.prefix : '';
}
