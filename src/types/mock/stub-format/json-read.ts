import { wholeNumberText } from '../json/json-number.js';
import { JsonValue } from '../json/json-value.js';
import { Site } from './site.js';

const MAX_INT32 = 2_147_483_647;

/**
 * Reads over a schema-valid tree. The lenient readers answer nothing or an empty list for a
 * missing or differently typed node, so the parser states what it expects without a check at every
 * step; the required ones demand what the schema guarantees, so a drift between the schema and the
 * parser fails loudly instead of producing an empty name or path.
 */
export function member(node: JsonValue | undefined, name: string): JsonValue | undefined {
  return node?.kind === 'object' ? node.members.get(name) : undefined;
}

/** The member when it is there and not JSON null, which a stub writes for "nothing here" as often as it leaves the member out. */
export function given(node: JsonValue | undefined, name: string): JsonValue | undefined {
  const value = member(node, name);
  return value?.kind === 'null' ? undefined : value;
}

export function has(node: JsonValue | undefined, name: string): boolean {
  return member(node, name) !== undefined;
}

export function membersOf(node: JsonValue | undefined): [string, JsonValue][] {
  return node?.kind === 'object' ? [...node.members] : [];
}

export function itemsOf(node: JsonValue | undefined): readonly JsonValue[] {
  return node?.kind === 'array' ? node.items : [];
}

export function textOf(node: JsonValue | undefined): string | undefined {
  return node?.kind === 'string' ? node.value : undefined;
}

/** JSON Schema counts any number with a zero fraction as an integer, so `200.0` and `2e2` are read as 200. */
export function integerOf(node: JsonValue | undefined): number | undefined {
  const digits = node?.kind === 'number' ? wholeNumberText(node.text) : undefined;
  return digits === undefined || Math.abs(Number(digits)) > MAX_INT32 ? undefined : Number(digits);
}

export function requiredText(node: JsonValue | undefined, site: Site): string {
  return textOf(node) ?? disagreement(site, 'a string');
}

export function requiredInteger(node: JsonValue | undefined, site: Site): number {
  return integerOf(node) ?? disagreement(site, 'an integer');
}

/** The file passed the schema, so a value the schema requires that the parser cannot read is a fault of one of them, not of the stub. */
export function disagreement(site: Site, expected: string): never {
  throw new Error(
    `The schema guarantees ${expected} at ${site.pointer}, but the parser found none; ` +
      'mock-stubs.schema.json and the stub parser disagree.'
  );
}
