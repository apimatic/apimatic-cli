import { err, ok } from 'neverthrow';
import { envInfo } from '../../../infrastructure/env-info.js';
import { isWebAddress, Parsed } from './fields.js';

/** APIMatic's Ask AI service, which every portal uses unless `APIMATIC_COPILOT_URL` names another. */
const ASK_AI_SERVICE = 'https://ask.apimatic.io';

/** Names a development or local Ask AI service, for the CLI and the portals it builds. */
export const COPILOT_URL_VARIABLE = 'APIMATIC_COPILOT_URL';

// Only names that never leave the machine: a `*.localhost` name is resolved through DNS on some systems, Windows' Node among them.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Where the Ask AI service is: over HTTPS, or on this machine, since the APIMatic login is sent there. */
export class ServiceAddress {
  private constructor(private readonly origin: string) {}

  /** APIMatic's own service. */
  public static apimatic(): ServiceAddress {
    return new ServiceAddress(ASK_AI_SERVICE);
  }

  /** The service this run uses: the one `APIMATIC_COPILOT_URL` names, else APIMatic's own. */
  public static current(): Parsed<ServiceAddress> {
    const named = envInfo.getCopilotUrl();
    return named === undefined ? ok(ServiceAddress.apimatic()) : ServiceAddress.parse(named, COPILOT_URL_VARIABLE);
  }

  public static parse(value: unknown, path: string): Parsed<ServiceAddress> {
    const text = typeof value === 'string' ? value : '';
    const url = isWebAddress(text) ? new URL(text) : null;
    if (url === null || !(url.protocol === 'https:' || isLoopback(url))) {
      return err([
        `'${path}' must be the address of an Ask AI service, starting with 'https://', or of one on this machine, ` +
          `such as 'http://localhost:8787'.`
      ]);
    }
    // As written: the URL parser would rewrite `127.1`, `%2e` or an empty port into an address nobody wrote.
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
