import { asciiLowerCase } from '../text/ascii.js';
import { isAllDigits, isAsciiDigit, isAsciiLetter, isHexDigit } from '../text/characters.js';

const DEFAULT_PORT = 80;
const MAX_PORT = 65_535;
const NAME_MARKS = '-._';
const IPV6_MARKS = ':.';

/**
 * The origin a request arrived on, read from its Host header, for `{{origin}}` in a stub's headers:
 * the request's own origin, not the one the mock listens on, because behind a container's published
 * port the two differ. The default port is dropped, so a client whose base URL names no port gets
 * its own base URL back and a string comparison with it holds. Nothing when the header is missing,
 * sent twice, or names no host and port.
 */
export function requestOrigin(hostHeaders: readonly string[]): string | undefined {
  if (hostHeaders.length !== 1) {
    return undefined;
  }
  const [host, port] = hostAndPort(hostHeaders[0]);
  if (!isHost(host) || port === undefined) {
    return undefined;
  }
  return port === DEFAULT_PORT ? `http://${asciiLowerCase(host)}` : `http://${asciiLowerCase(host)}:${port}`;
}

export function unreadableHost(hostHeaders: readonly string[]): string {
  return `The request's Host header ('${hostHeaders.join(
    ', '
  )}') names no host and port the mock can read its URL from.`;
}

/** An IPv6 literal holds colons of its own, so the port is looked for after its closing bracket. */
function hostAndPort(written: string): [string, number | undefined] {
  const mark = written.lastIndexOf(':');
  if (mark < 0 || mark < written.lastIndexOf(']')) {
    return [written, DEFAULT_PORT];
  }
  const digits = written.slice(mark + 1);
  const port = isAllDigits(digits) && digits.length <= 5 ? Number(digits) : Number.NaN;
  return [written.slice(0, mark), port <= MAX_PORT ? port : undefined];
}

function isHost(host: string): boolean {
  if (host.startsWith('[')) {
    const address = host.slice(1, -1);
    return host.endsWith(']') && address.length > 0 && madeOf(address, isHexDigit, IPV6_MARKS);
  }
  return (
    host.length > 0 && madeOf(host, (character) => isAsciiLetter(character) || isAsciiDigit(character), NAME_MARKS)
  );
}

function madeOf(text: string, accepts: (character: string) => boolean, marks: string): boolean {
  return Array.from(text).every((character) => accepts(character) || marks.includes(character));
}
