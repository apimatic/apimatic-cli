import { Buffer } from 'node:buffer';

// Git's own test: a NUL in the first 8000 bytes makes a file binary, and a binary file is never merged line by line.
export const isBinary = (content: Uint8Array): boolean => content.subarray(0, 8000).includes(0);

/** A file whose line endings are never changed: a binary one, or one that already carries a CR. */
export const keepsLineEndings = (content: Uint8Array): boolean => content.includes(0x0d) || isBinary(content);

// One byte is one character and back, whatever the file's encoding, so only the lines touched can change.
export const asText = (content: Uint8Array): string => Buffer.from(content).toString('latin1');
export const asBytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'));

/** `content` written the way `sample` ends its lines: CRLF where the sample uses it, else as it is. */
export function lineEndingFor(content: Uint8Array, sample: Uint8Array | undefined): Uint8Array {
  if (sample === undefined || keepsLineEndings(content) || !asText(sample).includes('\r\n')) {
    return content;
  }
  return asBytes(asText(content).replace(/\n/g, '\r\n'));
}
