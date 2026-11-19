import { wholeNumberText } from '../json/json-number.js';
import { JsonValue } from '../json/json-value.js';
import { Instant } from './instant.js';
import { accepts, describeRule, ValueRule } from './value-rule.js';

/**
 * A rule standing in for one value inside a JSON body: a one-property object whose name starts
 * with `$`, written on the expected side only. A request never carries one, so such an object on
 * the actual side is an ordinary object.
 */
export type JsonRule =
  | { readonly kind: 'text'; readonly rule: ValueRule }
  | { readonly kind: 'instant'; readonly instant: Instant }
  | { readonly kind: 'any' };

/** What a one-property object of an expected document is: a rule, an ordinary object, or a rule spelled wrong. */
export type JsonRuleReading =
  | { readonly kind: 'found'; readonly rule: JsonRule }
  | { readonly kind: 'none' }
  | { readonly kind: 'malformed'; readonly name: string; readonly message: string };

export function readJsonRule(members: ReadonlyMap<string, JsonValue>): JsonRuleReading {
  const [only] = members;
  if (members.size !== 1 || !only[0].startsWith('$')) {
    return { kind: 'none' };
  }
  const [name, value] = only;
  const text = value.kind === 'string' ? value.value : undefined;
  switch (name) {
    case '$any':
      return value.kind === 'boolean' && value.value
        ? { kind: 'found', rule: { kind: 'any' } }
        : { kind: 'malformed', name, message: '$any takes true.' };
    case '$startsWith':
      return textRule(name, text, (prefix) => ({ kind: 'startsWith', prefix }));
    case '$endsWith':
      return textRule(name, text, (suffix) => ({ kind: 'endsWith', suffix }));
    case '$contains':
      return textRule(name, text, (fragment) => ({ kind: 'contains', fragment }));
    case '$dateTime':
      return dateTimeRule(name, text);
    default:
      return {
        kind: 'malformed',
        name,
        message: `'${name}' is not a rule; the rules are $any, $contains, $dateTime, $endsWith and $startsWith.`
      };
  }
}

export function jsonRuleAccepts(rule: JsonRule, actual: JsonValue): boolean {
  switch (rule.kind) {
    case 'text':
      return actual.kind === 'string' && accepts(rule.rule, [actual.value]);
    case 'instant':
      return spelledInstant(actual)?.isEqual(rule.instant) === true;
    case 'any':
      return true;
  }
}

/** The rule in the words a report uses for the expected side. */
export function describeJsonRule(rule: JsonRule): string {
  switch (rule.kind) {
    case 'text':
      return `a string ${describeRule(rule.rule)}`;
    case 'instant':
      return describeRule({ kind: 'dateTime', instant: rule.instant });
    case 'any':
      return 'any value';
  }
}

function textRule(name: string, text: string | undefined, rule: (text: string) => ValueRule): JsonRuleReading {
  return text === undefined || text.length === 0
    ? { kind: 'malformed', name, message: `${name} takes a non-empty string.` }
    : { kind: 'found', rule: { kind: 'text', rule: rule(text) } };
}

function dateTimeRule(name: string, text: string | undefined): JsonRuleReading {
  if (text === undefined) {
    return { kind: 'malformed', name, message: '$dateTime takes a string.' };
  }
  const instant = Instant.parse(text);
  return instant === undefined
    ? { kind: 'malformed', name, message: Instant.notADateTime(text) }
    : { kind: 'found', rule: { kind: 'instant', instant } };
}

/**
 * An instant as a string in any spelling, or as a number of Unix seconds, which is how some
 * serializers write a date-time. A number is read for its value, so `1772355600.0` and
 * `1.7723556e9` are one second; one with a fraction of a second is none.
 */
function spelledInstant(actual: JsonValue): Instant | undefined {
  if (actual.kind === 'string') {
    return Instant.parse(actual.value);
  }
  const seconds = actual.kind === 'number' ? wholeNumberText(actual.text) : undefined;
  return seconds === undefined ? undefined : Instant.parse(seconds);
}
