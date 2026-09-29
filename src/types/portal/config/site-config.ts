import { err, ok, Result } from 'neverthrow';
import { allOf, namespace, nonEmptyString, optional, Parsed, unknownKeys } from './fields.js';
import { SiteAddress } from './site-address.js';

/** What a specification says about itself, which is what a portal is called until the block says otherwise. */
export interface SuggestedSite {
  name: string;
  description: string | null;
}

export const PLACEHOLDER_SITE: Readonly<SuggestedSite> = Object.freeze({ name: 'My API', description: null });

const KNOWN = ['name', 'url', 'description'];

export class SiteConfig {
  private constructor(
    private readonly name: string,
    private readonly url: SiteAddress | null,
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
          optional(data.url, (url) => SiteAddress.parse(url, `${path}.url`)),
          SiteConfig.validDescription(data.description, `${path}.description`, suggested)
        ])
      ).map(([name, url, description]) => new SiteConfig(name, url, description))
    );
  }

  public static suggested(site: SuggestedSite): SiteConfig {
    return new SiteConfig(site.name, null, site.description);
  }

  public siteName(): string {
    return this.name;
  }

  public siteDescription(): string | null {
    return this.description;
  }

  public address(): SiteAddress | null {
    return this.url;
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
}
