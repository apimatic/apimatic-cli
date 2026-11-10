/**
 * RFC 6901, `~` before `/`: a key holding either then names itself rather than a deeper location,
 * and the pointer agrees with the one the schema reports for the same key.
 */
export function pointerSegment(key: string): string {
  return key.replaceAll('~', '~0').replaceAll('/', '~1');
}
