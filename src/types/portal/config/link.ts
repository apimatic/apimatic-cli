import { err, ok, Result } from 'neverthrow';
import { isJsonObject } from '../../../utils/json-utils.js';
import { allOf, isWebAddress, nonEmptyString, Parsed, unknownKeys } from './fields.js';

const KNOWN = ['label', 'url'];

/** Stands in for the portal's own address, which is not known here; `.invalid` never resolves (RFC 6761). */
const PORTAL_ORIGIN = 'https://portal.invalid';

/** A labelled link in the portal's header. */
export class Link {
  private constructor(
    private readonly label: string,
    private readonly url: string,
    private readonly external: boolean
  ) {}

  public static parse(value: unknown, path: string): Parsed<Link> {
    if (!isJsonObject(value)) {
      return err([`'${path}' must be a JSON object with 'label' and 'url'.`]);
    }
    return allOf(
      unknownKeys(value, KNOWN, path),
      Result.combineWithAllErrors([
        nonEmptyString(value.label, `${path}.label`),
        Link.validUrl(value.url, `${path}.url`)
      ])
    ).map(([label, url]) => new Link(label, url.url, url.external));
  }

  public text(): string {
    return this.label;
  }

  public href(): string {
    return this.url;
  }

  public isExternal(): boolean {
    return this.external;
  }

  public toJSON(): { label: string; url: string } {
    return { label: this.label, url: this.url };
  }

  // A page of the portal by its path, or another site by its full address. Anything else
  // renders as a link that goes nowhere useful: `docs/x` resolves against whichever page it
  // sits on, and a `mailto:` or `javascript:` address is not somewhere a header link belongs.
  private static validUrl(url: unknown, path: string): Parsed<{ url: string; external: boolean }> {
    const text = typeof url === 'string' ? url.trim() : '';
    const page = text.startsWith('/') ? Link.pageOfThePortal(text) : undefined;
    if (page !== undefined) {
      return ok({ url: page, external: false });
    }
    if (isWebAddress(text)) {
      return ok({ url: text, external: true });
    }
    return err([
      `'${path}' must be a page of the portal starting with '/', or an address starting with 'https://' or 'http://'.`
    ]);
  }

  private static pageOfThePortal(text: string): string | undefined {
    // An empty segment as a browser reads it leads to another site: `//host`, `/\host`, and `/.//host` once resolved.
    const path = text
      .replace(/[\t\n\r]/g, '')
      .replaceAll('\\', '/')
      .split(/[?#]/)[0];
    if (path.includes('//')) {
      return undefined;
    }
    try {
      const resolved = new URL(text, PORTAL_ORIGIN);
      return resolved.origin === PORTAL_ORIGIN ? `${resolved.pathname}${resolved.search}${resolved.hash}` : undefined;
    } catch {
      return undefined;
    }
  }
}
