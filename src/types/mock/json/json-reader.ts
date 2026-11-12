import { err, ok, Result } from 'neverthrow';
import { isAsciiDigit, isHexDigit, isWellFormed } from '../text/characters.js';
import { JsonValue } from './json-value.js';

export const MAX_JSON_DEPTH = 64;

const WHITESPACE = ' \t\n\r';
const NUMBER_CHARACTERS = '0123456789+-.eE';
const SHOWN_TOKEN_LENGTH = 40;
const ESCAPES: ReadonlyMap<string, string> = new Map([
  ['"', '"'],
  ['\\', '\\'],
  ['/', '/'],
  ['b', '\b'],
  ['f', '\f'],
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t']
]);

interface Cursor {
  readonly text: string;
  /** Comments and trailing commas, which a hand-written stub file may carry and a request never does. */
  readonly handWritten: boolean;
  position: number;
}

class JsonFault extends Error {}

/**
 * RFC 8259 and no more. `JSON.parse` keeps the last of two equal keys, rounds a number to a
 * double and lets a lone surrogate through; a strict server refuses the first and the last, and
 * the second would change what a stub serves.
 */
export function readJson(text: string): Result<JsonValue, string> {
  return read({ text, handWritten: false, position: 0 });
}

export function readHandWrittenJson(text: string): Result<JsonValue, string> {
  return read({ text, handWritten: true, position: 0 });
}

function read(cursor: Cursor): Result<JsonValue, string> {
  try {
    const value = valueAt(cursor, 1);
    skipBlank(cursor);
    if (cursor.position < cursor.text.length) {
      throw faultAt(cursor, `${found(cursor)} follows the end of the JSON value`);
    }
    return ok(value);
  } catch (fault) {
    if (fault instanceof JsonFault) {
      return err(fault.message);
    }
    throw fault;
  }
}

function valueAt(cursor: Cursor, depth: number): JsonValue {
  skipBlank(cursor);
  const character = cursor.text.charAt(cursor.position);
  if (character === '{' || character === '[') {
    if (depth > MAX_JSON_DEPTH) {
      throw faultAt(cursor, `The JSON nests deeper than ${MAX_JSON_DEPTH} levels`);
    }
    cursor.position += 1;
    return character === '{' ? objectAt(cursor, depth) : arrayAt(cursor, depth);
  }
  if (character === '"') {
    return { kind: 'string', value: stringAt(cursor) };
  }
  if (character === '-' || isAsciiDigit(character)) {
    return { kind: 'number', text: numberAt(cursor) };
  }
  if (literalAt(cursor, 'true')) return { kind: 'boolean', value: true };
  if (literalAt(cursor, 'false')) return { kind: 'boolean', value: false };
  if (literalAt(cursor, 'null')) return { kind: 'null' };
  throw faultAt(cursor, `${found(cursor)} is not the start of a JSON value`);
}

function objectAt(cursor: Cursor, depth: number): JsonValue {
  const members = new Map<string, JsonValue>();
  let more = !closesAt(cursor, '}');
  while (more) {
    const name = propertyNameAt(cursor, members);
    members.set(name, valueAt(cursor, depth + 1));
    more = continuesAt(cursor, '}');
  }
  return { kind: 'object', members };
}

function arrayAt(cursor: Cursor, depth: number): JsonValue {
  const items: JsonValue[] = [];
  let more = !closesAt(cursor, ']');
  while (more) {
    items.push(valueAt(cursor, depth + 1));
    more = continuesAt(cursor, ']');
  }
  return { kind: 'array', items };
}

function propertyNameAt(cursor: Cursor, members: ReadonlyMap<string, JsonValue>): string {
  skipBlank(cursor);
  if (cursor.text[cursor.position] !== '"') {
    throw faultAt(cursor, `Expected a property name in quotes, found ${found(cursor)}`);
  }
  const start = cursor.position;
  const name = stringAt(cursor);
  if (members.has(name)) {
    cursor.position = start;
    throw faultAt(cursor, `Duplicate property '${name}'`);
  }
  skipBlank(cursor);
  if (cursor.text[cursor.position] !== ':') {
    throw faultAt(cursor, `Expected ':' after the property name, found ${found(cursor)}`);
  }
  cursor.position += 1;
  return name;
}

function closesAt(cursor: Cursor, bracket: string): boolean {
  skipBlank(cursor);
  if (cursor.text[cursor.position] !== bracket) {
    return false;
  }
  cursor.position += 1;
  return true;
}

/** After an item: whether another follows its comma, or the bracket has closed. */
function continuesAt(cursor: Cursor, bracket: string): boolean {
  if (closesAt(cursor, bracket)) {
    return false;
  }
  if (cursor.text[cursor.position] !== ',') {
    throw faultAt(cursor, `Expected ',' or '${bracket}', found ${found(cursor)}`);
  }
  cursor.position += 1;
  return !(cursor.handWritten && closesAt(cursor, bracket));
}

function stringAt(cursor: Cursor): string {
  const { text } = cursor;
  const start = cursor.position;
  let value = '';
  let unread = start + 1;
  let at = unread;
  while (text[at] !== '"') {
    const character = text.charAt(at);
    if (character === '') {
      cursor.position = start;
      throw faultAt(cursor, 'A string is never closed');
    }
    if (character < ' ') {
      cursor.position = at;
      throw faultAt(cursor, `A string holds ${shown(character)} unescaped`);
    }
    if (character === '\\') {
      cursor.position = at;
      const escape = escapeAt(cursor);
      value += text.slice(unread, at) + escape.character;
      at += escape.length;
      unread = at;
    } else {
      at += 1;
    }
  }
  value += text.slice(unread, at);
  if (!isWellFormed(value)) {
    cursor.position = start;
    throw faultAt(cursor, 'A string holds a lone surrogate, which is half a character');
  }
  cursor.position = at + 1;
  return value;
}

function escapeAt(cursor: Cursor): { character: string; length: number } {
  const { text, position } = cursor;
  const simple = ESCAPES.get(text.charAt(position + 1));
  if (simple !== undefined) {
    return { character: simple, length: 2 };
  }
  const hex = text.slice(position + 2, position + 6);
  if (text[position + 1] === 'u' && hex.length === 4 && Array.from(hex).every(isHexDigit)) {
    return { character: String.fromCharCode(Number.parseInt(hex, 16)), length: 6 };
  }
  throw faultAt(cursor, `'${text.slice(position, position + 2)}' is not a JSON escape`);
}

function numberAt(cursor: Cursor): string {
  const { text } = cursor;
  const start = cursor.position;
  let at = text[start] === '-' ? start + 1 : start;
  const whole = digitsAt(text, at);
  let valid = whole === 1 || (whole > 1 && text[at] !== '0');
  at += whole;
  if (valid && text[at] === '.') {
    const fraction = digitsAt(text, at + 1);
    valid = fraction > 0;
    at += 1 + fraction;
  }
  if (valid && (text[at] === 'e' || text[at] === 'E')) {
    const signed = text[at + 1] === '+' || text[at + 1] === '-' ? at + 2 : at + 1;
    const exponent = digitsAt(text, signed);
    valid = exponent > 0;
    at = signed + exponent;
  }
  if (!valid) {
    throw faultAt(cursor, `'${numberLikeAt(text, start)}' is not a JSON number`);
  }
  cursor.position = at;
  return text.slice(start, at);
}

function digitsAt(text: string, start: number): number {
  let end = start;
  while (isAsciiDigit(text.charAt(end))) {
    end += 1;
  }
  return end - start;
}

function numberLikeAt(text: string, start: number): string {
  let end = start;
  while (end < text.length && end - start < SHOWN_TOKEN_LENGTH && NUMBER_CHARACTERS.includes(text[end])) {
    end += 1;
  }
  return text.slice(start, end);
}

function literalAt(cursor: Cursor, literal: string): boolean {
  if (!cursor.text.startsWith(literal, cursor.position)) {
    return false;
  }
  cursor.position += literal.length;
  return true;
}

function skipBlank(cursor: Cursor): void {
  const { text } = cursor;
  let skipping = true;
  while (skipping) {
    if (cursor.position < text.length && WHITESPACE.includes(text[cursor.position])) {
      cursor.position += 1;
    } else if (cursor.handWritten && text.startsWith('//', cursor.position)) {
      const lineEnd = text.indexOf('\n', cursor.position);
      cursor.position = lineEnd < 0 ? text.length : lineEnd;
    } else if (cursor.handWritten && text.startsWith('/*', cursor.position)) {
      const close = text.indexOf('*/', cursor.position + 2);
      if (close < 0) {
        throw faultAt(cursor, 'A comment is never closed');
      }
      cursor.position = close + 2;
    } else {
      skipping = false;
    }
  }
}

function found(cursor: Cursor): string {
  const codePoint = cursor.text.codePointAt(cursor.position);
  return codePoint === undefined ? 'the end of the text' : shown(String.fromCodePoint(codePoint));
}

/** A character a terminal would not show, such as a line break or a byte-order mark, is named by its code point. */
function shown(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0;
  const invisible = codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint === 0xfeff;
  return invisible ? `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}` : `'${character}'`;
}

function faultAt(cursor: Cursor, message: string): JsonFault {
  const before = cursor.text.slice(0, cursor.position);
  const line = before.split('\n').length;
  const column = cursor.position - before.lastIndexOf('\n');
  return new JsonFault(`${message} at line ${line}, column ${column}.`);
}
