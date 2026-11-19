import { TextDecoder } from 'node:util';

// The byte-order mark is kept as U+FEFF, so three bytes of content are never dropped unseen.
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The text, or nothing for bytes that are not UTF-8: read leniently they would become U+FFFD, which nobody sent. */
export function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return STRICT_UTF8.decode(bytes);
  } catch {
    return undefined;
  }
}

const UTF8_MARK = [0xef, 0xbb, 0xbf];
const UTF16_MARKS: [number[], string][] = [
  [[0xff, 0xfe], 'utf-16le'],
  [[0xfe, 0xff], 'utf-16be']
];

/**
 * The text of a file as an editor saved it: UTF-8 with or without a byte-order mark, or UTF-16
 * behind its own, which Windows tools still write. Nothing for bytes that are neither.
 */
export function decodeFileText(bytes: Uint8Array): string | undefined {
  const startsWith = (mark: number[]) => mark.every((byte, index) => bytes[index] === byte);
  if (startsWith(UTF8_MARK)) {
    return decodeUtf8(bytes.subarray(UTF8_MARK.length));
  }
  const utf16 = UTF16_MARKS.find(([mark]) => startsWith(mark));
  if (utf16 === undefined) {
    return decodeUtf8(bytes);
  }
  try {
    return new TextDecoder(utf16[1], { fatal: true }).decode(bytes.subarray(utf16[0].length));
  } catch {
    return undefined;
  }
}
