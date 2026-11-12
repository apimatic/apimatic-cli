import { Buffer } from 'node:buffer';
import { JsonValue } from '../json/json-value.js';
import { writeJson } from '../json/json-writer.js';
import { compareIgnoringAsciiCase, equalsIgnoringAsciiCase } from '../text/ascii.js';

/** The one substitution the format offers: a header value may say {{origin}} for the scheme, host and port the request arrived on. */
const ORIGIN_PLACEHOLDER = '{{origin}}';

export const DEFAULT_CHUNK_DELAY_MS = 20;

export interface Header {
  readonly name: string;
  readonly value: string;
}

/** A body of one media type and a fixed byte sequence, which is also what a part of a multipart response carries. */
export type ContentResponse =
  | { readonly kind: 'json'; readonly json: JsonValue }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bytes'; readonly bytes: Uint8Array };

/**
 * A body flushed chunk by chunk with a pause between, so a client that buffers the whole body is
 * told apart from one that streams.
 */
export type StreamedResponse =
  | { readonly kind: 'sse'; readonly events: readonly SseEvent[]; readonly chunkDelayMs: number }
  | { readonly kind: 'ndjson'; readonly lines: readonly string[]; readonly chunkDelayMs: number };

/** `multipart/form-data` (RFC 7578), one part per name in the stub's order, under a boundary that is fixed rather than drawn. */
export interface MultipartResponse {
  readonly kind: 'multipart';
  readonly boundary: string;
  readonly parts: readonly ResponsePart[];
}

/** A filename makes a file part, which tells a client to keep the bytes as a file rather than read them as a field. */
export interface ResponsePart {
  readonly name: string;
  readonly fileName?: string;
  readonly contentType: string;
  readonly content: ContentResponse;
}

export type ResponseBody = { readonly kind: 'empty' } | ContentResponse | StreamedResponse | MultipartResponse;

export interface SseEvent {
  readonly id?: string;
  readonly event?: string;
  readonly retry?: number;
  readonly data: string;
}

export interface StubResponse {
  readonly status: number;
  /** As the stub states them, sorted by name in any letter case; `effectiveHeaders` adds what the body implies. */
  readonly headers: readonly Header[];
  readonly body: ResponseBody;
}

export function mediaTypeOf(content: ContentResponse): string {
  switch (content.kind) {
    case 'json':
      return 'application/json';
    case 'text':
      return 'text/plain; charset=utf-8';
    case 'bytes':
      return 'application/octet-stream';
  }
}

/** A JSON body is served as written, so an int64 beyond 2^53 or a decimal string reaches the client unchanged. */
export function contentBytes(content: ContentResponse): Uint8Array {
  switch (content.kind) {
    case 'json':
      return Buffer.from(writeJson(content.json), 'utf8');
    case 'text':
      return Buffer.from(content.text, 'utf8');
    case 'bytes':
      return content.bytes;
  }
}

/** The stated headers plus the ones the body kind implies, a stated one winning: what goes on the wire. */
export function effectiveHeaders(response: StubResponse): Header[] {
  const stated = (name: string) => response.headers.some((header) => equalsIgnoringAsciiCase(header.name, name));
  const implied = impliedHeaders(response.body).filter((header) => !stated(header.name));
  return [...response.headers, ...implied].sort((first, second) => compareIgnoringAsciiCase(first.name, second.name));
}

export function withOrigin(response: StubResponse, origin: string): StubResponse {
  const headers = response.headers.map(({ name, value }) => ({
    name,
    value: value.replaceAll(ORIGIN_PLACEHOLDER, origin)
  }));
  return { ...response, headers };
}

/** The wire form of each chunk, in order: one per SSE event, one per ndjson line. */
export function chunksOf(body: StreamedResponse): string[] {
  return body.kind === 'sse' ? body.events.map(renderSseEvent) : body.lines.map((line) => `${line}\n`);
}

/**
 * The wire form of an event, with the blank line that ends it. SSE ends a line at CRLF, a lone CR
 * or LF, so data is split at each: a CR left inside a `data:` line would end it there for the client.
 */
export function renderSseEvent(event: SseEvent): string {
  const lines = [
    ...(event.id === undefined ? [] : [`id: ${event.id}`]),
    ...(event.event === undefined ? [] : [`event: ${event.event}`]),
    ...(event.retry === undefined ? [] : [`retry: ${event.retry}`]),
    ...event.data
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .split('\n')
      .map((line) => `data: ${line}`)
  ];
  return `${lines.map((line) => `${line}\n`).join('')}\n`;
}

/** What the body kind implies when the stub names none: its Content-Type, and for a stream the directive that keeps caches out of the way. */
function impliedHeaders(body: ResponseBody): Header[] {
  switch (body.kind) {
    case 'empty':
      return [];
    case 'json':
    case 'text':
    case 'bytes':
      return [{ name: 'Content-Type', value: mediaTypeOf(body) }];
    case 'sse':
      return [
        { name: 'Content-Type', value: 'text/event-stream' },
        { name: 'Cache-Control', value: 'no-cache' }
      ];
    case 'ndjson':
      return [
        { name: 'Content-Type', value: 'application/x-ndjson' },
        { name: 'Cache-Control', value: 'no-cache' }
      ];
    case 'multipart':
      return [{ name: 'Content-Type', value: `multipart/form-data; boundary=${body.boundary}` }];
  }
}
