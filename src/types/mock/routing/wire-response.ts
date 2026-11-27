import { Buffer } from 'node:buffer';
import { writeIndentedJson } from '../json/json-writer.js';
import {
  MISMATCH_CONTENT_TYPE,
  MISMATCH_HEADER,
  MISMATCH_STATUS,
  mismatchHeaderValue,
  mismatchReport
} from '../matching/mismatch-report.js';
import { RequestModel } from '../matching/request-model.js';
import { Miss } from '../matching/verdict.js';
import { renderMultipart } from '../stub-format/multipart-response.js';
import { chunksOf, contentBytes, effectiveHeaders, Header, StubResponse } from '../stub-format/stub-response.js';
import { equalsIgnoringAsciiCase } from '../text/ascii.js';

const CONTENT_LENGTH = 'Content-Length';
const NO_BYTES = new Uint8Array();

/** A body sent whole with its length stated, or a stream sent chunk by chunk with a pause between. */
export type WireBody =
  | { readonly kind: 'whole'; readonly bytes: Uint8Array }
  | { readonly kind: 'paced'; readonly chunks: readonly string[]; readonly delayMs: number };

/** What the host writes, decided here in full: the status, every header line and the bytes. */
export interface WireResponse {
  readonly status: number;
  readonly headers: readonly Header[];
  readonly body: WireBody;
}

export function wireResponseOf(response: StubResponse, method: string): WireResponse {
  const headers = effectiveHeaders(response);
  const { status, body } = response;
  switch (body.kind) {
    case 'empty':
      return whole(status, headers, NO_BYTES, method);
    case 'json':
    case 'text':
    case 'bytes':
      return whole(status, headers, contentBytes(body), method);
    case 'multipart':
      return whole(status, headers, renderMultipart(body), method);
    case 'sse':
    case 'ndjson':
      return isHead(method)
        ? { status, headers, body: { kind: 'whole', bytes: NO_BYTES } }
        : { status, headers, body: { kind: 'paced', chunks: chunksOf(body), delayMs: body.chunkDelayMs } };
  }
}

/** The 418 report goes out as any stub's body does, indented because people read it in a test failure. */
export function wireMismatch(request: RequestModel, miss: Miss): WireResponse {
  const headers = [
    { name: 'Content-Type', value: MISMATCH_CONTENT_TYPE },
    { name: MISMATCH_HEADER, value: mismatchHeaderValue(miss) }
  ];
  const report = Buffer.from(writeIndentedJson(mismatchReport(request, miss)), 'utf8');
  return whole(MISMATCH_STATUS, headers, report, request.method);
}

/** An answer of the host's own, where a request never reached the stubs. */
export function wireRefusal(status: number, reason: string, headers: readonly Header[] = []): WireResponse {
  return whole(
    status,
    [{ name: 'Content-Type', value: 'text/plain; charset=utf-8' }, ...headers],
    Buffer.from(reason, 'utf8'),
    ''
  );
}

/**
 * The length is stated from the bytes, so no body goes out chunked and a client reads the size of
 * a download from Content-Length. A HEAD answer states the length of the body it leaves out (RFC
 * 9110 section 9.3.2); a status that ends at its headers states none, and a length the stub states
 * itself, which the loader allows on a HEAD or a 304 alone, goes out as written.
 */
function whole(status: number, headers: readonly Header[], bytes: Uint8Array, method: string): WireResponse {
  const stated = headers.some((header) => equalsIgnoringAsciiCase(header.name, CONTENT_LENGTH));
  const lengthless = stated || endsAtItsHeaders(status) || (isHead(method) && bytes.length === 0);
  return {
    status,
    headers: lengthless ? headers : [...headers, { name: CONTENT_LENGTH, value: String(bytes.length) }],
    body: { kind: 'whole', bytes: isHead(method) ? NO_BYTES : bytes }
  };
}

function endsAtItsHeaders(status: number): boolean {
  return status === 204 || status === 304;
}

function isHead(method: string): boolean {
  return method === 'HEAD';
}
