import { Buffer } from 'node:buffer';
import { Result } from 'neverthrow';
import { JsonValue } from '../json/json-value.js';
import { compareIgnoringAsciiCase, compareOrdinal, equalsIgnoringAsciiCase } from '../text/ascii.js';
import { escapeOf } from '../text/percent.js';
import { parseCookies } from './cookie-header.js';
import { parseForm } from './query-string.js';
import { readSentJson } from './sent-json.js';

/** Every value sent under one name, in the order sent. */
export interface NamedValues {
  readonly name: string;
  readonly values: readonly string[];
}

/** The escape character and what ends a key or a value: a value `a&b` would otherwise read as a key `b` that was never sent. */
const QUERY_DELIMITERS = '%&=#';
/** The escape character and what ends a path: a decoded `%3F` would otherwise read as the start of a query string. */
const PATH_DELIMITERS = '%?#';

/**
 * An incoming request as the matcher sees it: free of the HTTP server and already decoded, so the
 * same comparison serves the host, the mismatch report and the tests. Names are kept sorted, so
 * reports read the same on every run.
 */
export class RequestModel {
  public readonly method: string;
  /** The path only, percent-decoded, without the query string. */
  public readonly path: string;
  /** By key, decoded (`filter[min_amount]`) and compared exactly. */
  public readonly query: readonly NamedValues[];
  /** By name, in any letter case. */
  public readonly headers: readonly NamedValues[];
  public readonly body: Uint8Array;
  private jsonReading?: Result<JsonValue, string>;
  private formReading?: readonly NamedValues[];

  /** Repeated names are merged into one list of values each. */
  public constructor(
    method: string,
    path: string,
    query: readonly (readonly [string, string])[],
    headers: readonly (readonly [string, string])[],
    body: Uint8Array
  ) {
    this.method = method;
    this.path = path;
    this.query = merged(query, compareOrdinal);
    this.headers = merged(headers, compareIgnoringAsciiCase);
    this.body = body;
  }

  public header(name: string): readonly string[] {
    return this.headers.find((header) => equalsIgnoringAsciiCase(header.name, name))?.values ?? [];
  }

  public queryValues(key: string): readonly string[] {
    return valuesOf(this.query, key);
  }

  /** Every value sent under the cookie's name, so cookies check like headers and a cookie sent twice is seen twice. */
  public cookie(name: string): readonly string[] {
    return parseCookies(this.header('Cookie')).get(name) ?? [];
  }

  public hasBody(): boolean {
    return this.body.length > 0;
  }

  /**
   * The body read as JSON, once per request: a miss compares it with every stub that expects JSON,
   * and a body of several MB read again for each of them would make the report late.
   */
  public json(): Result<JsonValue, string> {
    this.jsonReading ??= readSentJson(this.body);
    return this.jsonReading;
  }

  /** The body read as an application/x-www-form-urlencoded form, once per request, as `json` is. */
  public form(): readonly NamedValues[] {
    this.formReading ??= merged(parseForm(Buffer.from(this.body).toString('utf8')), compareOrdinal);
    return this.formReading;
  }

  /** The first Content-Type value, or empty when none was sent. */
  public contentType(): string {
    return this.header('Content-Type')[0] ?? '';
  }

  /**
   * `GET /v1/accounts?limit=2`, as mismatch reports quote the request. The path, keys and values are
   * shown decoded, with only the delimiters of their part of the URL escaped, so brackets and
   * accents read as written.
   */
  public line(): string {
    const pairs = this.query.flatMap(({ name, values }) =>
      values.map((value) => `${escaped(name, QUERY_DELIMITERS)}=${escaped(value, QUERY_DELIMITERS)}`)
    );
    const path = escaped(this.path, PATH_DELIMITERS);
    return pairs.length === 0 ? `${this.method} ${path}` : `${this.method} ${path}?${pairs.join('&')}`;
  }
}

export function valuesOf(named: readonly NamedValues[], name: string): readonly string[] {
  return named.find((each) => each.name === name)?.values ?? [];
}

function merged(
  pairs: readonly (readonly [string, string])[],
  compare: (first: string, second: string) => number
): NamedValues[] {
  const groups: { name: string; values: string[] }[] = [];
  for (const [name, value] of pairs) {
    const group = groups.find((each) => compare(each.name, name) === 0);
    if (group === undefined) {
      groups.push({ name, values: [value] });
    } else {
      group.values.push(value);
    }
  }
  return groups.sort((first, second) => compare(first.name, second.name));
}

function escaped(text: string, delimiters: string): string {
  return Array.from(text, (character) =>
    delimiters.includes(character) ? escapeOf(character.charCodeAt(0)) : character
  ).join('');
}
