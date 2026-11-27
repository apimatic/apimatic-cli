import { isHighSurrogate } from '../text/characters.js';

export type Where = 'method' | 'path' | 'query' | 'header' | 'cookie' | 'auth' | 'body' | 'part' | 'form';

/**
 * How much of one value a report quotes. A value can hold a whole request body, and a miss keeps a
 * difference for every stub until the closest is found, so each is cut where it is made.
 */
export const ECHO_LIMIT = 10_000;

/** One way a request differs from a stub, in the words a mismatch report prints. */
export class Difference {
  public readonly where: Where;
  /** The query key, header, cookie, security scheme, form field, part name or JSON pointer; empty for the method, the path, a whole body or the root of a JSON body. */
  public readonly name: string;
  public readonly expected: string;
  public readonly actual: string;

  public constructor(where: Where, name: string, expected: string, actual: string) {
    this.where = where;
    this.name = echoed(name);
    this.expected = echoed(expected);
    this.actual = echoed(actual);
  }

  public toString(): string {
    const place = this.name.length === 0 ? this.where : `${this.where} ${this.name}`;
    return `${place}: expected ${shown(this.expected)}, got ${shown(this.actual)}`;
  }
}

function echoed(text: string): string {
  if (text.length <= ECHO_LIMIT) {
    return text;
  }
  const splitsPair = isHighSurrogate(text.charCodeAt(ECHO_LIMIT - 1));
  return `${text.slice(0, splitsPair ? ECHO_LIMIT - 1 : ECHO_LIMIT)}... (${text.length} characters)`;
}

/** An empty value is written as two quotes, so a line never ends in "got" with nothing after it. */
const shown = (text: string): string => (text.length === 0 ? '""' : text);
