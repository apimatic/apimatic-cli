import { Buffer } from 'node:buffer';
import { jsonArray, jsonObject, jsonText, JsonValue, jsonWhole } from '../json/json-value.js';
import { MISMATCH_STATUS, mismatchSummary } from '../matching/mismatch-report.js';
import { NamedValues, RequestModel } from '../matching/request-model.js';
import { Verdict } from '../matching/verdict.js';
import { asciiLowerCase } from '../text/ascii.js';
import { decodeUtf8 } from '../text/utf8.js';

/**
 * How many requests the log keeps, oldest dropped first: enough for a retry test to count its
 * attempts, bounded so a long-lived mock does not grow without limit. The bound is a count, not
 * bytes: an entry holds its request's body once, up to the body limit, so a long-lived mock that
 * receives large bodies is cleared with DELETE /__admin/requests between suites.
 */
export const REQUEST_LOG_CAPACITY = 10_000;

/** What came of a request: the stub that answered, an answer the OAuth2 server composed, or the summary of the 418 report. */
export type Outcome =
  | { readonly kind: 'stub'; readonly name: string }
  | { readonly kind: 'served' }
  | { readonly kind: 'miss'; readonly summary: string };

/** One request that reached the router, as decoded for matching, with the status it was answered with. */
export interface LoggedRequest {
  readonly method: string;
  readonly path: string;
  readonly query: readonly NamedValues[];
  readonly headers: readonly NamedValues[];
  readonly body: Uint8Array;
  readonly status: number;
  readonly outcome: Outcome;
}

/**
 * The mock is stateless, so a retry test cannot get "429, then 200". It counts its attempts here
 * instead, by a marker of its own in a header, since other tests share the log.
 */
export class RequestLog {
  private readonly capacity: number;
  private readonly kept: LoggedRequest[] = [];

  public constructor(capacity: number = REQUEST_LOG_CAPACITY) {
    this.capacity = capacity;
  }

  public add(request: LoggedRequest): void {
    this.kept.push(request);
    if (this.kept.length > this.capacity) {
      this.kept.shift();
    }
  }

  /** Oldest first. */
  public requests(): readonly LoggedRequest[] {
    return [...this.kept];
  }

  public clear(): void {
    this.kept.length = 0;
  }
}

/** The fields are copied out of the model, which also holds its body read as JSON or as a form: the log keeps a body once. */
export function loggedRequest(request: RequestModel, verdict: Verdict): LoggedRequest {
  const { method, path, query, headers, body } = request;
  return { method, path, query, headers, body, ...answerOf(verdict) };
}

/**
 * The log as GET /__admin/requests serves it. Header names are in lower case, so a harness in any
 * language finds `headers.prefer` whatever the client's spelling. A `mismatch` member is what
 * tells a miss from a 418 a stub declares.
 */
export function requestLogJson(requests: readonly LoggedRequest[]): JsonValue {
  return jsonArray(
    requests.map((logged) =>
      jsonObject([
        [
          'request',
          jsonObject([
            ['method', jsonText(logged.method)],
            ['path', jsonText(logged.path)],
            ['query', namedJson(logged.query, (name) => name)],
            ['headers', namedJson(logged.headers, asciiLowerCase)],
            ...bodyJson(logged.body)
          ])
        ],
        ['response', jsonObject([['status', jsonWhole(logged.status)], ...outcomeJson(logged.outcome)])]
      ])
    )
  );
}

function answerOf(verdict: Verdict): Pick<LoggedRequest, 'status' | 'outcome'> {
  switch (verdict.kind) {
    case 'matched':
      return { status: verdict.stub.response.status, outcome: { kind: 'stub', name: verdict.stub.name } };
    case 'served':
      return { status: verdict.response.status, outcome: { kind: 'served' } };
    case 'mismatch':
    case 'noStubs':
    case 'rejected':
      return { status: MISMATCH_STATUS, outcome: { kind: 'miss', summary: mismatchSummary(verdict) } };
  }
}

function namedJson(named: readonly NamedValues[], spelled: (name: string) => string): JsonValue {
  return jsonObject(named.map(({ name, values }) => [spelled(name), jsonArray(values.map(jsonText))]));
}

/** Text when the bytes are UTF-8, which a harness reads at a glance; base64 otherwise, so no byte is lost. */
function bodyJson(body: Uint8Array): [string, JsonValue][] {
  if (body.length === 0) {
    return [];
  }
  const text = decodeUtf8(body);
  return text === undefined
    ? [['bodyBase64', jsonText(Buffer.from(body).toString('base64'))]]
    : [['body', jsonText(text)]];
}

function outcomeJson(outcome: Outcome): [string, JsonValue][] {
  switch (outcome.kind) {
    case 'stub':
      return [['stub', jsonText(outcome.name)]];
    case 'served':
      return [];
    case 'miss':
      return [['mismatch', jsonText(outcome.summary)]];
  }
}
