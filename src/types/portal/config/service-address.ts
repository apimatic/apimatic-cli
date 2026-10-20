import { err, ok } from 'neverthrow';
import { isWebAddress, Parsed } from './fields.js';

const APIMATIC_DOMAIN = 'apimatic.io';

// Only names that never leave the machine: a `*.localhost` name is resolved through DNS on some systems, Windows' Node among them.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Where the Ask AI service is: APIMatic's own, over HTTPS, or one on this machine while developing it. `sync`
 * sends the APIMatic login there, so no other service is accepted. It is an origin alone: the CLI and the chat
 * add the service's own paths, such as `/v1/chat`.
 */
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
    // Checked as written too: the URL parser drops an empty query or fragment.
    if (url.username !== '' || url.password !== '' || url.pathname !== '/' || /[?#]/.test(text)) {
      return err([
        `'${path}' must be the service's address alone, without a path, query or credentials, ` +
          `for example 'https://ask.apimatic.io'.`
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
  return (
    url.protocol === 'https:' && (url.hostname === APIMATIC_DOMAIN || url.hostname.endsWith(`.${APIMATIC_DOMAIN}`))
  );
}

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname);
}
