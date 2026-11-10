import { Buffer } from 'node:buffer';
import { isAsciiDigit, isAsciiLetter } from './characters.js';

const WHITESPACE = ' \t\r\n';

/**
 * Strict where `Buffer.from` is not: it drops any character it does not know and never fails, so
 * a typo in a stub's bytes or in a Basic credential would decode to something nobody wrote.
 * Whitespace between characters is allowed, as a wrapped value has it.
 */
export function decodeBase64(text: string): Uint8Array | undefined {
  const compact = Array.from(text)
    .filter((character) => !WHITESPACE.includes(character))
    .join('');
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  const digits = compact.slice(0, compact.length - padding);
  return compact.length % 4 === 0 && Array.from(digits).every((character) => isBase64Digit(character, '+/'))
    ? Buffer.from(compact, 'base64')
    : undefined;
}

/** Unpadded, as `encodeBase64Url` writes it: anything else is not a value this server made. */
export function decodeBase64Url(text: string): Uint8Array | undefined {
  return text.length % 4 !== 1 && Array.from(text).every((character) => isBase64Digit(character, '-_'))
    ? Buffer.from(text, 'base64url')
    : undefined;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function isBase64Digit(character: string, marks: string): boolean {
  return isAsciiLetter(character) || isAsciiDigit(character) || marks.includes(character);
}
