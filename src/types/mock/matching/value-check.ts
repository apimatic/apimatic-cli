import { accepts, describeRule, ValueRule } from '../stub-format/value-rule.js';
import { Difference, Where } from './difference.js';

/**
 * Checks the values a request sent under one name against the stub's rule for that name: no
 * difference, or one. The rule decides and describes itself; this says where the difference is and
 * what was sent instead.
 */
export function checkValue(where: Where, name: string, rule: ValueRule, actual: readonly string[]): Difference[] {
  return accepts(rule, actual) ? [] : [new Difference(where, name, describeRule(rule), describeValues(actual))];
}

/** The values sent under a name, as the report's actual side reads them. */
export function describeValues(values: readonly string[]): string {
  return values.length === 0 ? 'absent' : values.join(' & ');
}
