import { JsonValue } from './json-value.js';

const INDENT = '  ';

/**
 * The compact wire form. A number is written as it was read, and a string as `JSON.stringify`
 * writes it: accents, apostrophes and ampersands stay as they are, since people read these bodies
 * in test failures.
 */
export function writeJson(value: JsonValue): string {
  switch (value.kind) {
    case 'null':
      return 'null';
    case 'boolean':
      return String(value.value);
    case 'number':
      return value.text;
    case 'string':
      return JSON.stringify(value.value);
    case 'array':
      return `[${value.items.map(writeJson).join(',')}]`;
    case 'object':
      return `{${Array.from(value.members, ([name, member]) => `${JSON.stringify(name)}:${writeJson(member)}`).join(
        ','
      )}}`;
  }
}

/** Two spaces a level and LF on every platform, for a document a person reads whole. */
export function writeIndentedJson(value: JsonValue, indent = ''): string {
  const inner = indent + INDENT;
  if (value.kind === 'array' && value.items.length > 0) {
    const items = value.items.map((item) => inner + writeIndentedJson(item, inner));
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  if (value.kind === 'object' && value.members.size > 0) {
    const members = Array.from(
      value.members,
      ([name, member]) => `${inner}${JSON.stringify(name)}: ${writeIndentedJson(member, inner)}`
    );
    return `{\n${members.join(',\n')}\n${indent}}`;
  }
  return writeJson(value);
}
