import { err, ok } from 'neverthrow';
import { DirectoryPath } from '../../file/directoryPath.js';
import { FileName } from '../../file/fileName.js';
import { FilePath } from '../../file/filePath.js';
import { Parsed } from './fields.js';

const STATIC_PREFIX = 'static/';

/** The image types a browser takes for an icon, by extension, for the `type` its link carries. */
const IMAGE_TYPES: Record<string, string> = {
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif'
};

/** A file the block names inside `src/static/`, which the build copies to the root of the site. */
export class StaticAsset {
  private constructor(
    /** As written, so the block serialises back to what the user typed. */
    private readonly written: string,
    private readonly relativePath: string,
    /** The setting that names the file, for the report when it is missing. */
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

  public resolveIn(buildDirectory: DirectoryPath): FilePath {
    const names = this.relativePath.split('/');
    const fileName = new FileName(names.pop() ?? '');
    return new FilePath(
      names.reduce((directory, name) => directory.join(name), buildDirectory),
      fileName
    );
  }

  public settingPath(): string {
    return this.setting;
  }

  /**
   * The `static/` prefix is the site root. Each name is escaped, since a `#`, `?` or `%` in it
   * would otherwise end or alter the path.
   */
  public siteUrl(): string {
    return `/${this.relativePath.slice(STATIC_PREFIX.length).split('/').map(encodeURIComponent).join('/')}`;
  }

  public imageType(): string | null {
    const name = this.relativePath.slice(this.relativePath.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return dot <= 0 ? null : IMAGE_TYPES[name.slice(dot).toLowerCase()] ?? null;
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

  // Every name after `static` must be there: `static//logo.png` finds the file on disk, and is
  // then served as `//logo.png`, which a browser fetches from a host called `logo.png`.
  private static isInsideStatic(normalized: string): boolean {
    const [first, ...names] = normalized.split('/');
    return (
      `${first}/` === STATIC_PREFIX &&
      names.length > 0 &&
      names.every((name) => name.trim().length > 0 && name !== '.' && name !== '..')
    );
  }
}
