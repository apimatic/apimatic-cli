import { isAllDigits } from './characters.js';

const MAX_VALUE = 2_147_483_647;

/**
 * Digits alone, up to the largest 32-bit integer: `parseInt` would read `404abc` as 404 and
 * `+404` as a number, and a status or a lifetime is neither.
 */
export function wholeNumber(text: string): number | undefined {
  const value = isAllDigits(text) ? Number(text) : Number.NaN;
  return value <= MAX_VALUE ? value : undefined;
}
