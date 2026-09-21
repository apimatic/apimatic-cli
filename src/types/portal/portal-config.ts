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

/**
 * What the browser bundle is told about the portal. Nothing here may address the machine the
 * portal was built on; `portal-template/src/lib/portal.ts` declares the same fields.
 */
export interface PortalIdentity {
  title: string;
  description: string | null;
  /** Site-relative, and inside the static directory. */
  logoUrl: string | null;
  /** Origin only, with no trailing slash. */
  siteUrl: string | null;
  aiPageActions: boolean;
}

const STATIC_PREFIX = 'static/';

const KNOWN_FIELDS = new Set(['title', 'description', 'logo', 'siteUrl', 'aiPageActions']);

// Pre-2.0 names and near misses. A mistyped setting is the one mistake that otherwise
// produces a portal that builds and is quietly wrong.
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

  /** What a portal is called until something names it: a specification, or the user. */
  public static readonly placeholder = new PortalConfig('My API', null, null, null, true);

  public static parse(json: string): Result<PortalConfig, string[]> {
    const document = PortalConfig.parseObject(json);
    if (document.isErr()) {
      return err(document.error);
    }

    const data = document.value;
    const { title, description, logo, siteUrl, aiPageActions } = data;
    const parsedSiteUrl = typeof siteUrl === 'string' ? PortalConfig.parseOrigin(siteUrl) : null;

    // Every field is reported at once rather than stopping at the first, so one edit fixes
    // the file.
    const errors = [
      ...PortalConfig.unknownFieldErrors(data),
      ...PortalConfig.titleErrors(title),
      ...PortalConfig.descriptionErrors(description),
      ...PortalConfig.logoErrors(logo),
      ...PortalConfig.aiPageActionsErrors(aiPageActions),
      ...PortalConfig.siteUrlErrors(siteUrl, parsedSiteUrl)
    ];
    if (errors.length > 0) {
      return err(errors);
    }

    // A blank description is the same as none; without this it shipped as the site
    // description and as the og:description of every page.
    const trimmedDescription = typeof description === 'string' ? description.trim() : '';
    return ok(
      new PortalConfig(
        (title as string).trim(),
        trimmedDescription.length > 0 ? trimmedDescription : null,
        (logo as string | undefined) ?? null,
        parsedSiteUrl,
        (aiPageActions as boolean | undefined) ?? true
      )
    );
  }

  private static parseObject(json: string): Result<Record<string, unknown>, string[]> {
    let data: unknown;
    try {
      data = JSON.parse(stripByteOrderMark(json));
    } catch {
      return err(['portal.json is not valid JSON.']);
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return err(['portal.json must contain a JSON object.']);
    }
    return ok(data as Record<string, unknown>);
  }

  private static unknownFieldErrors(data: Record<string, unknown>): string[] {
    return Object.keys(data)
      .filter((field) => !KNOWN_FIELDS.has(field))
      .map((field) => {
        const intended = RENAMED_FIELDS[field];
        return intended
          ? `'${field}' is not a portal.json setting; did you mean '${intended}'?`
          : `'${field}' is not a portal.json setting.`;
      });
  }

  private static titleErrors(title: unknown): string[] {
    return typeof title === 'string' && title.trim().length > 0
      ? []
      : ["'title' is required and must be a non-empty string."];
  }

  private static descriptionErrors(description: unknown): string[] {
    return description === undefined || typeof description === 'string' ? [] : ["'description' must be a string."];
  }

  private static logoErrors(logo: unknown): string[] {
    if (logo === undefined) {
      return [];
    }
    if (typeof logo !== 'string' || logo.trim().length === 0) {
      return ["'logo' must be a non-empty string."];
    }
    if (!PortalConfig.isInsideStatic(logo)) {
      return [
        `'logo' must be a path relative to 'src' inside the 'static' directory, for example '${STATIC_PREFIX}images/logo.png'.`
      ];
    }
    return [];
  }

  private static aiPageActionsErrors(aiPageActions: unknown): string[] {
    return aiPageActions === undefined || typeof aiPageActions === 'boolean'
      ? []
      : ["'aiPageActions' must be true or false."];
  }

  /** `parsed` is null both for a value that is not a string and for one that is not an origin. */
  private static siteUrlErrors(siteUrl: unknown, parsed: UrlPath | null): string[] {
    return siteUrl === undefined || parsed !== null
      ? []
      : [
          "'siteUrl' must be the address the portal is hosted at, without a path, for example 'https://docs.example.com'."
        ];
  }

  /**
   * Whether a value would survive `parse` as `logo`, so the `portal.json` the migration hint
   * prints is never one the next command rejects.
   */
  public static isValidLogo(value: string): boolean {
    return value.trim().length > 0 && PortalConfig.isInsideStatic(value);
  }

  public siteTitle(): string {
    return this.title;
  }

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

  public siteOrigin(): UrlPath | null {
    return this.siteUrl;
  }

  public identity(): PortalIdentity {
    return {
      title: this.title,
      description: this.description,
      logoUrl: this.logoSiteUrl(),
      siteUrl: this.siteUrl === null ? null : this.siteUrl.toString(),
      aiPageActions: this.aiPageActions
    };
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

  // Not `replaceAll`, which Sonar asks for: the root tsconfig compiles `src` against
  // `lib: es2018`, where the method does not exist.
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
