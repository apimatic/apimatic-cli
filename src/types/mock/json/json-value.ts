/**
 * A JSON document as it was written: a number keeps its text, so `9007199254740993` and `250.00`
 * are compared and served unchanged, and an object keeps its members in order under any name.
 */
export type JsonValue =
  | { readonly kind: 'null' }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'number'; readonly text: string }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'array'; readonly items: readonly JsonValue[] }
  | { readonly kind: 'object'; readonly members: ReadonlyMap<string, JsonValue> };

export const JSON_NULL: JsonValue = { kind: 'null' };

export const jsonText = (value: string): JsonValue => ({ kind: 'string', value });

export const jsonWhole = (value: number): JsonValue => ({ kind: 'number', text: String(value) });

export const jsonArray = (items: readonly JsonValue[]): JsonValue => ({ kind: 'array', items });

/** The members in the order given, which is the order they are written in. */
export const jsonObject = (members: readonly (readonly [string, JsonValue])[]): JsonValue => ({
  kind: 'object',
  members: new Map(members)
});
