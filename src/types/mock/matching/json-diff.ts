import { sameNumber } from '../json/json-number.js';
import { pointerSegment } from '../json/json-pointer.js';
import { JsonValue } from '../json/json-value.js';
import { writeJson } from '../json/json-writer.js';
import { describeJsonRule, jsonRuleAccepts, readJsonRule } from '../stub-format/json-rule.js';
import { Difference, Where } from './difference.js';

/**
 * An object or array is written out once: a miss compares the request's one document with every
 * stub that expects JSON, and what it reports of the actual side is the same node each time.
 */
const rendered = new WeakMap<JsonValue, string>();

/**
 * Structural comparison of two JSON documents: same keys in any order, same values, same types.
 * Numbers compare by exact value, so `1.0` equals `1`, while `9007199254740993` stays apart from
 * `…992`; a string never equals a number, which is how a Money sent as `250.00` instead of
 * `"250.00"` is caught. A one-property `$` object on the expected side is a rule and decides for
 * itself. Differences carry a JSON pointer into the expected document; the root is the empty
 * pointer, since `/` would be the key `""`.
 */
export function compareJson(expected: JsonValue, actual: JsonValue, where: Where = 'body', pointer = ''): Difference[] {
  const reading = expected.kind === 'object' ? readJsonRule(expected.members) : undefined;
  if (reading?.kind === 'found') {
    return jsonRuleAccepts(reading.rule, actual)
      ? []
      : [new Difference(where, pointer, describeJsonRule(reading.rule), render(actual))];
  }
  if (expected.kind === 'object' && actual.kind === 'object') {
    const at = (name: string) => `${pointer}/${pointerSegment(name)}`;
    const missing = [...expected.members].filter(([name]) => !actual.members.has(name));
    const unexpected = [...actual.members].filter(([name]) => !expected.members.has(name));
    const shared = [...expected.members].filter(([name]) => actual.members.has(name));
    return [
      ...missing.map(([name, value]) => new Difference(where, at(name), describe(value), 'absent')),
      ...unexpected.map(([name, value]) => new Difference(where, at(name), 'absent', render(value))),
      ...shared.flatMap(([name, value]) => compareJson(value, actual.members.get(name) ?? value, where, at(name)))
    ];
  }
  if (expected.kind === 'array' && actual.kind === 'array') {
    return expected.items.length === actual.items.length
      ? expected.items.flatMap((item, index) => compareJson(item, actual.items[index], where, `${pointer}/${index}`))
      : [new Difference(where, pointer, `${expected.items.length} item(s)`, `${actual.items.length} item(s)`)];
  }
  return sameValue(expected, actual) ? [] : [new Difference(where, pointer, render(expected), render(actual))];
}

function sameValue(expected: JsonValue, actual: JsonValue): boolean {
  switch (expected.kind) {
    case 'null':
      return actual.kind === 'null';
    case 'boolean':
      return actual.kind === 'boolean' && actual.value === expected.value;
    case 'string':
      return actual.kind === 'string' && actual.value === expected.value;
    case 'number':
      return actual.kind === 'number' && sameNumber(expected.text, actual.text);
    default:
      return false;
  }
}

/** The expected side of a report: a rule in its own words, any other value as written. */
function describe(expected: JsonValue): string {
  const reading = expected.kind === 'object' ? readJsonRule(expected.members) : undefined;
  return reading?.kind === 'found' ? describeJsonRule(reading.rule) : render(expected);
}

function render(value: JsonValue): string {
  if (value.kind !== 'object' && value.kind !== 'array') {
    return writeJson(value);
  }
  const written = rendered.get(value) ?? writeJson(value);
  rendered.set(value, written);
  return written;
}
