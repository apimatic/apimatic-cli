import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../file/urlPath.js';
import { stripByteOrderMark } from '../../utils/string-utils.js';

export interface PortalConfigData {
  title: string;
  description?: string;
  logo?: string;
  siteUrl?: string;
  aiPageActions?: boolean;
}

const STATIC_PREFIX = 'static/';

const KNOWN_FIELDS = new Set(['title', 'description', 'logo', 'siteUrl', 'aiPageActions']);

// Pre-2.0 names and near misses. A mistyped setting is the one mistake that otherwise
// produces a portal that builds and is quietly wrong, and `logoUrl` is both the v1 name the
// migration hint puts in front of the user and the likeliest slip.
const RENAMED_FIELDS: Record<string, string> = {
  logoUrl: 'logo',
  pageTitle: 'title',
  url: 'siteUrl',
  site: 'siteUrl'
};

// Immutable wrapper around the parsed `src/portal.json`. Construct trusted values with
// `create`; user input goes through `parse`, which names every invalid field.
export class PortalConfig {
  private constructor(
    private readonly title: string,
    private readonly description: string | null,
    private readonly logo: string | null,
    private readonly siteUrl: UrlPath | null,
    private readonly aiPageActions: boolean
  ) {}

  public static create(
    title: string,
    description: string | null = null,
    logo: string | null = null,
    siteUrl: UrlPath | null = null,
    aiPageActions = true
  ): PortalConfig {
    return new PortalConfig(title, description, logo, siteUrl, aiPageActions);
  }

  public static parse(json: string): Result<PortalConfig, string[]> {
    let data: unknown;
    try {
      data = JSON.parse(stripByteOrderMark(json));
    } catch {
      return err(['portal.json is not valid JSON.']);
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return err(['portal.json must contain a JSON object.']);
    }

    const errors: string[] = [];
    const { title, description, logo, siteUrl, aiPageActions } = data as Record<string, unknown>;

    for (const field of Object.keys(data as Record<string, unknown>)) {
      if (KNOWN_FIELDS.has(field)) {
        continue;
      }
      const intended = RENAMED_FIELDS[field];
      errors.push(
        intended
          ? `'${field}' is not a portal.json setting; did you mean '${intended}'?`
          : `'${field}' is not a portal.json setting.`
      );
    }

    if (typeof title !== 'string' || title.trim().length === 0) {
      errors.push("'title' is required and must be a non-empty string.");
    }
    if (description !== undefined && typeof description !== 'string') {
      errors.push("'description' must be a string.");
    }
    // A blank one is the same as none; without this it shipped as the site description and
    // as the og:description of every page.
    const trimmedDescription = typeof description === 'string' ? description.trim() : null;
    if (logo !== undefined) {
      if (typeof logo !== 'string' || logo.trim().length === 0) {
        errors.push("'logo' must be a non-empty string.");
      } else if (!PortalConfig.isInsideStatic(logo)) {
        errors.push(
          `'logo' must be a path relative to 'src' inside the 'static' directory, for example '${STATIC_PREFIX}images/logo.png'.`
        );
      }
    }

    if (aiPageActions !== undefined && typeof aiPageActions !== 'boolean') {
      errors.push("'aiPageActions' must be true or false.");
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
        trimmedDescription !== null && trimmedDescription.length > 0 ? trimmedDescription : null,
        (logo as string | undefined) ?? null,
        parsedSiteUrl,
        (aiPageActions as boolean | undefined) ?? true
      )
    );
  }

  /**
   * Whether a value would survive `parse` as `logo`. The migration hint carries a pre-2.0
   * `logoUrl` over only when it does, so the `portal.json` it prints is never one the next
   * command rejects.
   */
  public static isValidLogo(value: string): boolean {
    return value.trim().length > 0 && PortalConfig.isInsideStatic(value);
  }

  /** What the portal calls itself: the site name, the page titles and the nav bar. */
  public siteTitle(): string {
    return this.title;
  }

  /** One line about the portal, or null when it has none. */
  public siteDescription(): string | null {
    return this.description;
  }

  /** Whether each page offers to open itself in an external AI assistant. */
  public offersAiPageActions(): boolean {
    return this.aiPageActions;
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
      ...(this.siteUrl !== null ? { siteUrl: this.siteUrl.toString() } : {}),
      // Only when it differs from the default, so the migration hint stays minimal.
      ...(this.aiPageActions ? {} : { aiPageActions: false })
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
