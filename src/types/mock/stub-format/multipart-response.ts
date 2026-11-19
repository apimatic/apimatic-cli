import { Buffer } from 'node:buffer';
import { isAsciiDigit, isAsciiLetter } from '../text/characters.js';
import { contentBytes, MultipartResponse, ResponsePart } from './stub-response.js';

export const DEFAULT_BOUNDARY = 'mockserver-boundary';

/**
 * The punctuation RFC 2046 section 5.1.1 allows that is also an RFC 9110 token character, so the
 * boundary goes out unquoted in the Content-Type parameter. The rest of its set would need quotes,
 * and a strict parser reads no media type without them.
 */
export const BOUNDARY_PUNCTUATION = "'+_-.";

const MAX_BOUNDARY_LENGTH = 70;
const CRLF = '\r\n';

export function isValidBoundary(boundary: string): boolean {
  return (
    boundary.length >= 1 &&
    boundary.length <= MAX_BOUNDARY_LENGTH &&
    Array.from(boundary).every(
      (character) => isAsciiLetter(character) || isAsciiDigit(character) || BOUNDARY_PUNCTUATION.includes(character)
    )
  );
}

/** The wire form: each part under a delimiter line with its two headers, a blank line and its bytes, then the close delimiter. */
export function renderMultipart(body: MultipartResponse): Uint8Array {
  const delimiter = `--${body.boundary}`;
  const parts = body.parts.flatMap((part) => [
    Buffer.from(`${delimiter}${CRLF}Content-Disposition: ${dispositionOf(part)}${CRLF}`, 'utf8'),
    Buffer.from(`Content-Type: ${part.contentType}${CRLF}${CRLF}`, 'utf8'),
    contentBytes(part.content),
    Buffer.from(CRLF, 'utf8')
  ]);
  return Buffer.concat([...parts, Buffer.from(`${delimiter}--${CRLF}`, 'utf8')]);
}

/** The parts a reader would cut short, because their bytes hold the start of a delimiter line. */
export function partsContainingTheDelimiter(body: MultipartResponse): ResponsePart[] {
  return body.parts.filter((part) => Buffer.from(contentBytes(part.content)).includes(`--${body.boundary}`, 0, 'utf8'));
}

/** The Content-Disposition value as RFC 7578 section 4.2 writes it, the names quoted. */
export function dispositionOf(part: ResponsePart): string {
  const fileName = part.fileName === undefined ? '' : `; filename="${part.fileName}"`;
  return `form-data; name="${part.name}"${fileName}`;
}
