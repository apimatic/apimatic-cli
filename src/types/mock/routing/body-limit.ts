import { isAllDigits } from '../text/characters.js';

/**
 * The largest request body the mock reads. A mock has no use for a larger one, and a body is kept
 * as bytes, in the request log and quoted in a 418, so one without a bound would cost its size
 * several times over.
 */
export const MAX_BODY_BYTES = 30_000_000;

const GROUP = 3;

/** Why a body that declares its length is refused before it is read, or nothing when it fits. */
export function declaredTooLong(contentLength: string | undefined): string | undefined {
  if (contentLength === undefined || !isAllDigits(contentLength) || BigInt(contentLength) <= BigInt(MAX_BODY_BYTES)) {
    return undefined;
  }
  return `${limitText()}; this one declares ${grouped(String(BigInt(contentLength)))}.`;
}

/** Why a body sent without a length is cut off where it passes the limit. */
export function undeclaredTooLong(): string {
  return `${limitText()}; this one declares no length and is longer.`;
}

function limitText(): string {
  return `The mock accepts a request body of at most ${grouped(String(MAX_BODY_BYTES))} bytes`;
}

/** Digits in groups of three, as people write a byte count. */
function grouped(digits: string): string {
  const head = digits.length % GROUP || GROUP;
  const groups = [digits.slice(0, head)];
  for (let at = head; at < digits.length; at += GROUP) {
    groups.push(digits.slice(at, at + GROUP));
  }
  return groups.join(',');
}
