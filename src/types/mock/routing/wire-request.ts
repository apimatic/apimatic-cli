import { parseQuery } from '../matching/query-string.js';
import { RequestModel } from '../matching/request-model.js';
import { equalsIgnoringAsciiCase } from '../text/ascii.js';
import { percentDecode } from '../text/percent.js';

const AUTHORITY_MARK = '://';

/**
 * A request as it came off the wire, turned into the matcher's: the method as sent, the path
 * percent-decoded once, the query decoded as a form encoder writes it, each header line on its own
 * so a header sent twice is seen twice, and the body's bytes as sent, never inflated.
 */
export function requestModelOf(
  method: string,
  target: string,
  headerLines: readonly (readonly [string, string])[],
  body: Uint8Array
): RequestModel {
  const [path, query] = pathAndQuery(target);
  return new RequestModel(method, percentDecode(path), parseQuery(query), headerLines, body);
}

export function headerValues(headerLines: readonly (readonly [string, string])[], name: string): string[] {
  return headerLines.filter(([sent]) => equalsIgnoringAsciiCase(sent, name)).map(([, value]) => value);
}

/** A proxy's client sends the whole URL as the target (RFC 9112 section 3.2.2); its path and query are what the stubs describe. */
function pathAndQuery(target: string): [string, string] {
  const local = target.startsWith('/') ? target : withoutAuthority(target);
  const mark = local.indexOf('?');
  return mark < 0 ? [local, ''] : [local.slice(0, mark), local.slice(mark + 1)];
}

function withoutAuthority(target: string): string {
  const mark = target.indexOf(AUTHORITY_MARK);
  if (mark < 0) {
    return target;
  }
  const afterScheme = target.slice(mark + AUTHORITY_MARK.length);
  const ends = ['/', '?'].map((delimiter) => afterScheme.indexOf(delimiter)).filter((index) => index >= 0);
  if (ends.length === 0) {
    return '/';
  }
  const local = afterScheme.slice(Math.min(...ends));
  return local.startsWith('/') ? local : `/${local}`;
}
