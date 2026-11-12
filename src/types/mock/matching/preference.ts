import { equalsIgnoringAsciiCase } from '../text/ascii.js';
import { wholeNumber } from '../text/whole-number.js';

/**
 * What a request asks for with the Prefer header: `code=NNN` selects a status (the Prism and Scalar
 * convention for declared errors) and `example=name` selects a named example.
 */
export interface Preference {
  readonly code?: number;
  readonly example?: string;
}

/**
 * The first token of each kind counts, even when it asks for nothing (`code=abc`, an empty
 * `example=`), rather than handing over to a later one; other tokens (`respond-async`) are ignored.
 * Tokens are read as RFC 7240 section 2 spells them, so `code = 404` and `code="404"` ask for 404 too.
 */
export function parsePreference(preferValues: readonly string[]): Preference {
  const pairs = preferValues
    .flatMap((value) => value.split(',').flatMap((part) => part.split(';')))
    .filter((token) => token.includes('='))
    .map((token) => [token.slice(0, token.indexOf('=')).trim(), unquoted(token.slice(token.indexOf('=') + 1).trim())]);
  const first = (name: string) => pairs.find(([key]) => equalsIgnoringAsciiCase(key, name))?.[1];
  const code = wholeNumber(first('code') ?? '');
  const example = first('example') ?? '';
  return { ...(code === undefined ? {} : { code }), ...(example.length === 0 ? {} : { example }) };
}

const unquoted = (value: string): string =>
  value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
