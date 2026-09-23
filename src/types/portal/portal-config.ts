import { err, ok, Result } from 'neverthrow';
import { UrlPath } from '../file/urlPath.js';
import { unknownFieldErrors } from './unknown-fields.js';

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

// Near misses, each mapped to the setting it means.
const RENAMED_FIELDS = new Map<string, string>([
  ['url', 'siteUrl'],
  ['site', 'siteUrl']
]);

/** The block as a message names it: every field error is prefixed with it. */
const BLOCK = 'portal';

// Immutable wrapper around the `portal` block of `src/apimatic.json`. Construct trusted values
// with `create`; user input goes through `fromBlock`, which names every invalid field.
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

  /**
   * The `portal` block as the document parser hands it over, which is whatever the file holds
   * under that key. The file-level checks are the document's; this one says what is wrong
   * inside the block, or that there is no block to read.
   */
  public static fromBlock(block: unknown): Result<PortalConfig, string[]> {
    if (block === undefined) {
      return err([`'${BLOCK}' is required.`]);
    }
    if (typeof block !== 'object' || block === null || Array.isArray(block)) {
      return err([`'${BLOCK}' must be a JSON object.`]);
    }

    const data = block as Record<string, unknown>;

    // Every field is reported at once rather than stopping at the first, so one edit fixes
    // the file. Each validator hands back the typed value it accepted, so the constructor
    // below is fed only what validation proved.
    const unknownFields = unknownFieldErrors(
      data,
      KNOWN_FIELDS,
      (field, intended) =>
        intended !== undefined
          ? `'${field}' is not a '${BLOCK}' setting; did you mean '${intended}'?`
          : `'${field}' is not a '${BLOCK}' setting.`,
      RENAMED_FIELDS
    );
    const fields = Result.combineWithAllErrors([
      PortalConfig.validTitle(data.title),
      PortalConfig.validDescription(data.description),
      PortalConfig.validLogo(data.logo),
      PortalConfig.validSiteUrl(data.siteUrl),
      PortalConfig.validAiPageActions(data.aiPageActions)
    ]);
    if (fields.isErr()) {
      return err([...unknownFields, ...fields.error]);
    }
    if (unknownFields.length > 0) {
      return err(unknownFields);
    }

    return ok(new PortalConfig(...fields.value));
  }

  private static validTitle(title: unknown): Result<string, string> {
    return typeof title === 'string' && title.trim().length > 0
      ? ok(title.trim())
      : err(`'${BLOCK}.title' is required and must be a non-empty string.`);
  }

  // A blank description is the same as none; without this it shipped as the site
  // description and as the og:description of every page.
  private static validDescription(description: unknown): Result<string | null, string> {
    if (description === undefined) {
      return ok(null);
    }
    if (typeof description !== 'string') {
      return err(`'${BLOCK}.description' must be a string.`);
    }
    const trimmed = description.trim();
    return ok(trimmed.length > 0 ? trimmed : null);
  }

  private static validLogo(logo: unknown): Result<string | null, string> {
    if (logo === undefined) {
      return ok(null);
    }
    if (typeof logo !== 'string' || logo.trim().length === 0) {
      return err(`'${BLOCK}.logo' must be a non-empty string.`);
    }
    if (!PortalConfig.isInsideStatic(logo)) {
      return err(
        `'${BLOCK}.logo' must be a path relative to 'src' inside the 'static' directory, for example '${STATIC_PREFIX}images/logo.png'.`
      );
    }
    return ok(logo);
  }

  private static validAiPageActions(aiPageActions: unknown): Result<boolean, string> {
    if (aiPageActions === undefined) {
      return ok(true);
    }
    return typeof aiPageActions === 'boolean'
      ? ok(aiPageActions)
      : err(`'${BLOCK}.aiPageActions' must be true or false.`);
  }

  private static validSiteUrl(siteUrl: unknown): Result<UrlPath | null, string> {
    if (siteUrl === undefined) {
      return ok(null);
    }
    const parsed = typeof siteUrl === 'string' ? PortalConfig.parseOrigin(siteUrl) : null;
    return parsed === null
      ? err(
          `'${BLOCK}.siteUrl' must be the address the portal is hosted at, without a path, for example 'https://docs.example.com'.`
        )
      : ok(parsed);
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
    return logoPath === null ? null : `/${logoPath.slice(STATIC_PREFIX.length)}`;
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
      // Only when it differs from the default, so a scaffolded file stays minimal.
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
