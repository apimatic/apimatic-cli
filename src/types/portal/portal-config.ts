import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../file/urlPath.js';

export interface PortalConfigData {
  title: string;
  description?: string;
  logo?: string;
  siteUrl?: string;
}

const STATIC_PREFIX = 'static/';

// Immutable wrapper around the parsed `src/portal.json`. Construct trusted values with
// `create`; user input goes through `parse`, which names every invalid field.
export class PortalConfig {
  private constructor(
    public readonly title: string,
    public readonly description: string | null,
    private readonly logo: string | null,
    private readonly siteUrl: UrlPath | null
  ) {}

  public static create(
    title: string,
    description: string | null = null,
    logo: string | null = null,
    siteUrl: UrlPath | null = null
  ): PortalConfig {
    return new PortalConfig(title, description, logo, siteUrl);
  }

  public static parse(json: string): Result<PortalConfig, string[]> {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return err(['portal.json is not valid JSON.']);
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return err(['portal.json must contain a JSON object.']);
    }

    const errors: string[] = [];
    const { title, description, logo, siteUrl } = data as Record<string, unknown>;

    if (typeof title !== 'string' || title.trim().length === 0) {
      errors.push("'title' is required and must be a non-empty string.");
    }
    if (description !== undefined && typeof description !== 'string') {
      errors.push("'description' must be a string.");
    }
    if (logo !== undefined) {
      if (typeof logo !== 'string' || logo.trim().length === 0) {
        errors.push("'logo' must be a non-empty string.");
      } else if (!PortalConfig.isInsideStatic(logo)) {
        errors.push(
          `'logo' must be a path relative to 'src' inside the 'static' directory, for example '${STATIC_PREFIX}images/logo.png'.`
        );
      }
    }

    let parsedSiteUrl: UrlPath | null = null;
    if (siteUrl !== undefined) {
      parsedSiteUrl = typeof siteUrl === 'string' ? PortalConfig.parseOrigin(siteUrl) : null;
      if (parsedSiteUrl === null) {
        errors.push(
          "'siteUrl' must be the address the portal is hosted at, without a path, for example 'https://docs.example.com'."
        );
      }
    }

    if (errors.length > 0) {
      return err(errors);
    }
    return ok(
      new PortalConfig(
        (title as string).trim(),
        (description as string | undefined) ?? null,
        (logo as string | undefined) ?? null,
        parsedSiteUrl
      )
    );
  }

  /** Path of the logo relative to `src/` with forward slashes, or null when none is configured. */
  public logoPath(): string | null {
    return this.logo === null ? null : PortalConfig.normalize(this.logo);
  }

  /** URL of the logo on the generated site (the `static/` prefix is the site root). */
  public logoSiteUrl(): string | null {
    const logoPath = this.logoPath();
    return logoPath === null ? null : logoPath.substring(STATIC_PREFIX.length - 1);
  }

  /** Address the portal is hosted at, used for canonical links and the sitemap. */
  public siteOrigin(): UrlPath | null {
    return this.siteUrl;
  }

  public toJSON(): PortalConfigData {
    return {
      title: this.title,
      ...(this.description !== null ? { description: this.description } : {}),
      ...(this.logo !== null ? { logo: this.logo } : {}),
      ...(this.siteUrl !== null ? { siteUrl: this.siteUrl.toString() } : {})
    };
  }

  private static normalize(relativePath: string): string {
    return relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  }

  private static isInsideStatic(relativePath: string): boolean {
    const normalized = PortalConfig.normalize(relativePath);
    if (!normalized.startsWith(STATIC_PREFIX) || normalized.length === STATIC_PREFIX.length) {
      return false;
    }
    return !normalized.split('/').includes('..');
  }

  // Only the origin is accepted: the portal is hosted at the root of its host, so a path,
  // query or fragment would produce canonical links that do not resolve.
  private static parseOrigin(value: string): UrlPath | null {
    const url = UrlPath.create(value.trim());
    if (url === undefined) {
      return null;
    }
    const parsed = new URL(value.trim());
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
      return null;
    }
    return new UrlPath(parsed.origin);
  }
}
