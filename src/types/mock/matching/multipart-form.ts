import { Buffer } from 'node:buffer';
import { compareOrdinal, equalsIgnoringAsciiCase } from '../text/ascii.js';
import { parseMediaType, parseParameterizedValue } from '../text/media-type.js';
import { percentDecode } from '../text/percent.js';

/** One part of a multipart form. File name and content type are lists of none or one, so they check like header values. */
export interface FormPart {
  readonly name: string;
  readonly fileName: readonly string[];
  readonly contentType: readonly string[];
  readonly content: Uint8Array;
}

/** A `multipart/form-data` body read part by part, or the reason it could not be, in the two sides of a report. */
export type MultipartForm =
  | { readonly kind: 'parts'; readonly byName: ReadonlyMap<string, readonly FormPart[]> }
  | { readonly kind: 'unreadable'; readonly expected: string; readonly actual: string };

const MAX_BOUNDARY_LENGTH = 70;
const CRLF = '\r\n';
const NOT_A_FORM = 'multipart/form-data with a boundary';
const MALFORMED = 'a well-formed multipart body';

class Malformed extends Error {}

/**
 * Another media type is not a form, however it is framed, and a boundary is 1 to 70 characters
 * (RFC 2046 section 5.1.1). Every form-data section is kept, grouped by name in wire order: a file
 * input that takes several files sends them all under one name.
 */
export function parseMultipartForm(contentType: string, body: Uint8Array): MultipartForm {
  const mediaType = parseMediaType(contentType);
  const boundary = mediaType?.parameters.get('boundary') ?? '';
  if (mediaType?.essence !== 'multipart/form-data' || boundary.length < 1 || boundary.length > MAX_BOUNDARY_LENGTH) {
    return { kind: 'unreadable', expected: NOT_A_FORM, actual: contentType.length === 0 ? 'absent' : contentType };
  }
  try {
    const parts = sections(Buffer.from(body), `--${boundary}`).map(partOf);
    const names = [...new Set(parts.map((part) => part.name))].sort(compareOrdinal);
    return { kind: 'parts', byName: new Map(names.map((name) => [name, parts.filter((part) => part.name === name)])) };
  } catch (fault) {
    if (fault instanceof Malformed) {
      return { kind: 'unreadable', expected: MALFORMED, actual: fault.message };
    }
    throw fault;
  }
}

/** What lies between one delimiter line and the next, for each part up to the closing delimiter; a preamble before the first is skipped. */
function sections(body: Buffer, delimiter: string): Buffer[] {
  const parts: Buffer[] = [];
  const afterPreamble = body.indexOf(CRLF + delimiter);
  if (body.indexOf(delimiter) !== 0 && afterPreamble < 0) {
    throw new Malformed(`a body without its ${delimiter} delimiter`);
  }
  let line = body.indexOf(delimiter) === 0 ? 0 : afterPreamble + CRLF.length;
  while (body.toString('latin1', line + delimiter.length, line + delimiter.length + 2) !== '--') {
    const lineEnd = body.indexOf(CRLF, line);
    const next = lineEnd < 0 ? -1 : body.indexOf(CRLF + delimiter, lineEnd);
    if (next < 0) {
      throw new Malformed(`a body that ends before its closing ${delimiter}-- delimiter`);
    }
    parts.push(body.subarray(lineEnd + CRLF.length, Math.max(next, lineEnd + CRLF.length)));
    line = next + CRLF.length;
  }
  return parts;
}

/**
 * RFC 7578 section 4.2 gives every section of a form a form-data disposition, so any other section
 * makes the body unreadable instead of passing unseen. `filename*` (RFC 5987) wins over `filename`.
 */
function partOf(section: Buffer): FormPart {
  const withoutHeaders = section.indexOf(CRLF) === 0;
  const blank = withoutHeaders ? 0 : section.indexOf(CRLF + CRLF);
  if (blank < 0) {
    throw new Malformed('a part whose headers never end in a blank line');
  }
  const headers = section.toString('utf8', 0, blank).split(CRLF);
  const header = (name: string) => {
    const found = headers.find((each) =>
      equalsIgnoringAsciiCase(each.slice(0, Math.max(each.indexOf(':'), 0)).trim(), name)
    );
    return found?.slice(found.indexOf(':') + 1).trim() ?? '';
  };
  const sent = header('Content-Disposition');
  const disposition = parseParameterizedValue(sent);
  if (disposition === undefined || !equalsIgnoringAsciiCase(disposition.value, 'form-data')) {
    throw new Malformed(`a section that is not form-data (Content-Disposition: ${sent.length > 0 ? sent : 'absent'})`);
  }
  const fileName =
    extendedValue(disposition.parameters.get('filename*')) ?? disposition.parameters.get('filename') ?? '';
  const contentType = header('Content-Type');
  return {
    name: disposition.parameters.get('name') ?? '',
    fileName: fileName.length === 0 ? [] : [fileName],
    contentType: contentType.length === 0 ? [] : [contentType],
    content: section.subarray(withoutHeaders ? CRLF.length : blank + CRLF.length * 2)
  };
}

/** RFC 5987: `UTF-8''r%C3%A9sum%C3%A9.pdf`, a charset, a language and the percent-encoded text. Only UTF-8 is read. */
function extendedValue(value: string | undefined): string | undefined {
  const [charset, , ...encoded] = (value ?? '').split("'");
  return encoded.length > 0 && equalsIgnoringAsciiCase(charset, 'utf-8') ? percentDecode(encoded.join("'")) : undefined;
}
