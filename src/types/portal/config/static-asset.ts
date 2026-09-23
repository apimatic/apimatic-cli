import { err, ok } from 'neverthrow';
import { Parsed } from './fields.js';

const STATIC_PREFIX = 'static/';

/** A file the block names inside `src/static/`, which the build copies to the root of the site. */
export class StaticAsset {
  private constructor(
    /** As written, so the block serialises back to what the user typed. */
    private readonly written: string,
    private readonly relativePath: string,
    /** The setting that names the file, which is what a report of it being missing points at. */
    private readonly setting: string
  ) {}

  public static parse(value: unknown, path: string): Parsed<StaticAsset> {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return err([`'${path}' must be a non-empty string.`]);
    }
    const normalized = StaticAsset.normalize(value.trim());
    if (!StaticAsset.isInsideStatic(normalized)) {
      return err([
        `'${path}' must be a path relative to 'src' inside the 'static' directory, for example '${STATIC_PREFIX}images/logo.png'.`
      ]);
    }
    return ok(new StaticAsset(value, normalized, path));
  }

  /** Relative to `src/`, with forward slashes. */
  public sourcePath(): string {
    return this.relativePath;
  }

  public settingPath(): string {
    return this.setting;
  }

  /** Where the file is served from: the `static/` prefix is the site root. */
  public siteUrl(): string {
    return `/${this.relativePath.slice(STATIC_PREFIX.length)}`;
  }

  public isEqual(other: StaticAsset): boolean {
    return this.relativePath === other.relativePath;
  }

  public toJSON(): string {
    return this.written;
  }

  private static normalize(relativePath: string): string {
    return relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  }

  private static isInsideStatic(normalized: string): boolean {
    if (!normalized.startsWith(STATIC_PREFIX) || normalized.length === STATIC_PREFIX.length) {
      return false;
    }
    return !normalized.split('/').includes('..');
  }
}
