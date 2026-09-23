import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../../file/urlPath.js';
import { allOf, isJsonObject, nonEmptyString, Parsed, unknownKeys } from './fields.js';

const KNOWN = ['label', 'url'];

/** A labelled link in the portal's chrome: a header link, or the home page's call to action. */
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

  /** Whether the link leaves the portal, which is what marks it as external. */
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
    if (text.startsWith('/') && !text.startsWith('//')) {
      return ok({ url: text, external: false });
    }
    if (UrlPath.create(text) !== undefined) {
      return ok({ url: text, external: true });
    }
    return err([
      `'${path}' must be a page of the portal starting with '/', or an address starting with 'https://' or 'http://'.`
    ]);
  }
}
