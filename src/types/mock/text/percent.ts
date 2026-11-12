import { TextEncoder } from 'node:util';
import { isAsciiDigit, isAsciiLetter, isHexDigit } from './characters.js';
import { decodeUtf8 } from './utf8.js';

const UNRESERVED_MARKS = '-._~';

/**
 * Lenient, as a server reads a URL: an escape that is no `%XX`, and bytes that are no UTF-8, stay
 * as written rather than failing the whole request.
 */
export function percentDecode(text: string): string {
  let decoded = '';
  let position = 0;
  while (position < text.length) {
    const bytes = escapedBytesAt(text, position);
    if (bytes.length === 0) {
      decoded += text[position];
      position += 1;
    } else {
      decoded += decodeEscapes(bytes, text.slice(position, position + bytes.length * 3));
      position += bytes.length * 3;
    }
  }
  return decoded;
}

/** RFC 3986: everything but letters, digits and `-._~` is escaped, so the result is safe in any part of a URL. */
export function percentEncode(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) => {
    const character = String.fromCharCode(byte);
    return isAsciiLetter(character) || isAsciiDigit(character) || UNRESERVED_MARKS.includes(character)
      ? character
      : escapeOf(byte);
  }).join('');
}

export function escapeOf(byte: number): string {
  return `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
}

function escapedBytesAt(text: string, start: number): number[] {
  const bytes: number[] = [];
  for (
    let at = start;
    text[at] === '%' && isHexDigit(text.charAt(at + 1)) && isHexDigit(text.charAt(at + 2));
    at += 3
  ) {
    bytes.push(Number.parseInt(text.slice(at + 1, at + 3), 16));
  }
  return bytes;
}

function decodeEscapes(bytes: number[], written: string): string {
  let decoded = '';
  let index = 0;
  while (index < bytes.length) {
    const length = sequenceLength(bytes[index]);
    const character = decodeUtf8(Uint8Array.from(bytes.slice(index, index + length)));
    if (character === undefined) {
      decoded += written.slice(index * 3, index * 3 + 3);
      index += 1;
    } else {
      decoded += character;
      index += length;
    }
  }
  return decoded;
}

function sequenceLength(leadByte: number): number {
  if (leadByte >= 0xf0) return 4;
  if (leadByte >= 0xe0) return 3;
  if (leadByte >= 0xc0) return 2;
  return 1;
}
