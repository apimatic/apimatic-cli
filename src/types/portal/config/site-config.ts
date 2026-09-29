import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../../file/urlPath.js';
import { BasePath } from './base-path.js';
import { allOf, isWebAddress, namespace, nonEmptyString, Parsed, unknownKeys } from './fields.js';

/** What a specification says about itself, which is what a portal is called until the block says otherwise. */
export interface SuggestedSite {
  name: string;
  description: string | null;
}

export const PLACEHOLDER_SITE: Readonly<SuggestedSite> = Object.freeze({ name: 'My API', description: null });

const KNOWN = ['name', 'url', 'description'];

/** An address the portal answers at, split into the two halves its consumers need. */
interface SiteAddress {
  url: UrlPath;
  base: BasePath;
}

export class SiteConfig {
  private constructor(
    private readonly name: string,
    private readonly url: UrlPath | null,
    private readonly base: BasePath,
    private readonly description: string | null
  ) {}

  /**
   * `suggested` fills what the block leaves out. It is the only specification's own, or null
   * when there are several, since no one of them speaks for the portal.
   */
  public static parse(value: unknown, path: string, suggested: SuggestedSite | null): Parsed<SiteConfig> {
    return namespace(value, path).andThen((data) =>
      allOf(
        unknownKeys(data, KNOWN, path),
        Result.combineWithAllErrors([
          SiteConfig.validName(data.name, `${path}.name`, suggested),
          SiteConfig.validUrl(data.url, `${path}.url`),
          SiteConfig.validDescription(data.description, `${path}.description`, suggested)
        ])
      ).map(
        ([name, address, description]) =>
          new SiteConfig(name, address?.url ?? null, address?.base ?? BasePath.root, description)
      )
    );
  }

  public static suggested(site: SuggestedSite): SiteConfig {
    return new SiteConfig(site.name, null, BasePath.root, site.description);
  }

  public siteName(): string {
    return this.name;
  }

  public siteDescription(): string | null {
    return this.description;
  }

  public address(): UrlPath | null {
    return this.url;
  }

  public basePath(): BasePath {
    return this.base;
  }

  public toJSON(): { name: string; url?: string; description?: string } {
    return {
      name: this.name,
      ...(this.url === null ? {} : { url: this.url.toString() }),
      ...(this.description === null ? {} : { description: this.description })
    };
  }

  private static validName(name: unknown, path: string, suggested: SuggestedSite | null): Parsed<string> {
    if (name !== undefined) {
      return nonEmptyString(name, path);
    }
    return suggested === null
      ? err([`'${path}' is required when 'spec' holds more than one specification.`])
      : ok(suggested.name);
  }

  // A blank description counts as none, so no page carries an empty og:description.
  private static validDescription(
    description: unknown,
    path: string,
    suggested: SuggestedSite | null
  ): Parsed<string | null> {
    if (description === undefined) {
      return ok(suggested?.description ?? null);
    }
    if (typeof description !== 'string') {
      return err([`'${path}' must be a string.`]);
    }
    const trimmed = description.trim();
    return ok(trimmed.length > 0 ? trimmed : null);
  }

  // A query or fragment is refused: both are prefixed onto every canonical link and asset
  // address, and neither survives that with a URL a browser resolves.
  private static validUrl(url: unknown, path: string): Parsed<SiteAddress | null> {
    if (url === undefined) {
      return ok(null);
    }
    const address = typeof url === 'string' ? SiteConfig.parseAddress(url.trim()) : null;
    return address === null
      ? err([
          `'${path}' must be the address the portal is hosted at, with no query or fragment, for example 'https://docs.example.com' or 'https://example.com/docs'.`
        ])
      : ok(address);
  }

  private static parseAddress(value: string): SiteAddress | null {
    if (!isWebAddress(value)) {
      return null;
    }
    const parsed = new URL(value);
    if (parsed.search !== '' || parsed.hash !== '') {
      return null;
    }
    const mountedAt = parsed.pathname.replace(/\/+$/, '');
    return { url: new UrlPath(`${parsed.origin}${mountedAt}`), base: BasePath.of(mountedAt) };
  }
}
