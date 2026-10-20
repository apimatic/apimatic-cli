import { err, ok } from 'neverthrow';
import { isWebAddress, Parsed } from './fields.js';

const APIMATIC_DOMAIN = 'apimatic.io';

// Only names that never leave the machine: a `*.localhost` name is resolved through DNS on some systems, Windows' Node among them.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** APIMatic's own Ask AI service, or one on this machine, since `sync` sends the APIMatic login there. */
export class ServiceAddress {
  private constructor(private readonly origin: string) {}

  public static parse(value: unknown, path: string): Parsed<ServiceAddress> {
    const text = typeof value === 'string' ? value : '';
    const url = isWebAddress(text) ? new URL(text) : null;
    if (url === null || !(isApimatic(url) || isLoopback(url))) {
      return err([
        `'${path}' must be the address of APIMatic's Ask AI service, starting with 'https://' and ending in ` +
          `'${APIMATIC_DOMAIN}', or of one on this machine, such as 'http://localhost:8787'.`
      ]);
    }
    // As written, so the schema can say the same: the URL parser would rewrite `127.1`, `%2e` or an empty port.
    if (writtenOrigin(text) !== url.origin) {
      return err([
        `'${path}' must be the service's address alone, written in full, without a path, query or ` +
          `credentials, for example 'https://ask.apimatic.io'.`
      ]);
    }
    return ok(new ServiceAddress(url.origin));
  }

  /** The service's origin, such as `https://ask.apimatic.io`. */
  public toString(): string {
    return this.origin;
  }
}

function isApimatic(url: URL): boolean {
  const labels = url.hostname.split('.');
  return url.protocol === 'https:' && labels.slice(-2).join('.') === APIMATIC_DOMAIN && !labels.includes('');
}

/** The text as an origin reads: in lower case, without one trailing slash or the scheme's default port. */
function writtenOrigin(text: string): string {
  return text
    .toLowerCase()
    .replace(/\/$/, '')
    .replace(/^(https:\/\/[^/]+):443$/, '$1')
    .replace(/^(http:\/\/[^/]+):80$/, '$1');
}

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname);
}
